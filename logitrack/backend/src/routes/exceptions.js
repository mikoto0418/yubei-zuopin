// 异常件路由：列表 / 登记 / 处理（改址·退回·理赔）/ 关闭。
// 处理动作会联动运单状态机：退回 → waybills.status = returned（若当前不在 returned）。
'use strict';
const express = require('express');
const { ok, fail, requireFields, toNumber, parsePage, pageResult } = require('../http');
const domain = require('../domain');

// 处理方式 → 说明模板 + 是否联动状态
const RESOLUTIONS = {
  readdress: { label: '改址重投', status: null, note: '已核实新地址，安排重新派送' },
  return: { label: '原路退回', status: 'returned', note: '按寄件人要求原路退回' },
  claim: { label: '理赔结案', status: null, note: '已启动理赔流程，赔付金额待核定' },
  resend: { label: '重新派送', status: 'out_for_delivery', note: '异常已排除，重新安排派送' },
  close: { label: '仅关闭', status: null, note: '异常已确认无影响，直接关闭' },
};

module.exports = (db) => {
  const router = express.Router();

  // 异常列表：支持状态 / 类型 / 严重程度 / 来源 / 关键词
  router.get('/', (req, res) => {
    const { page, pageSize } = parsePage(req, 20);
    const clauses = [];
    const params = [];
    ['ex_status', 'ex_type', 'severity', 'source'].forEach((f) => {
      if (req.query[f]) { clauses.push(`e.${f} = ?`); params.push(req.query[f]); }
    });
    if (req.query.waybill_id) { clauses.push('e.waybill_id = ?'); params.push(toNumber(req.query.waybill_id)); }
    const q = (req.query.q || '').trim();
    if (q) {
      clauses.push('(e.waybill_no LIKE ? OR e.description LIKE ? OR e.handler LIKE ? OR e.resolution LIKE ?)');
      for (let i = 0; i < 4; i += 1) params.push(`%${q}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT e.*, w.status AS waybill_status, w.receiver_name, w.receiver_phone, w.dest_city, w.goods_type
                 FROM exceptions e LEFT JOIN waybills w ON w.id = e.waybill_id ${where} ORDER BY e.id DESC`;
    const list = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM exceptions e LEFT JOIN waybills w ON w.id = e.waybill_id ${where}`).get(...params);

    const shaped = list.map((r) => ({
      ...r,
      ex_status_label: { open: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' }[r.ex_status] || r.ex_status,
      waybill_status_label: domain.STATUS_LABEL[r.waybill_status] || r.waybill_status,
    }));
    return ok(res, pageResult(shaped, total, page, pageSize));
  });

  // 异常统计（前端异常页顶部的分类型计数）
  router.get('/stats', (req, res) => {
    const byStatus = db.prepare('SELECT ex_status AS k, COUNT(*) AS c FROM exceptions GROUP BY ex_status').all();
    const byType = db.prepare('SELECT ex_type AS k, COUNT(*) AS c FROM exceptions GROUP BY ex_type').all();
    const bySeverity = db.prepare('SELECT severity AS k, COUNT(*) AS c FROM exceptions GROUP BY severity').all();
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM exceptions').get();
    return ok(res, {
      total,
      open: byStatus.find((r) => r.k === 'open')?.c || 0,
      resolved: byStatus.find((r) => r.k === 'resolved')?.c || 0,
      by_status: byStatus,
      by_type: byType,
      by_severity: bySeverity,
    });
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM exceptions WHERE id = ?').get(toNumber(req.params.id));
    if (!row) return fail(res, 404, '异常记录不存在');
    const wb = row.waybill_id ? db.prepare('SELECT * FROM waybills WHERE id = ?').get(row.waybill_id) : null;
    return ok(res, { ...row, waybill: wb });
  });

  // 登记异常：可用于人工上报。自动把运单标记为 exception（走状态机，非法则 400）。
  router.post('/', (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['waybill_id', 'ex_type']);
    if (missing) return fail(res, 400, missing);
    const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(toNumber(b.waybill_id));
    if (!wb) return fail(res, 404, '运单不存在');

    try {
      const run = db.transaction(() => {
        // 未处于异常态的运单，先走状态机挂起（已异常则跳过，避免重复流转报错）
        if (wb.status !== 'exception' && wb.status !== 'returned') {
          domain.applyTransition(db, {
            waybillId: wb.id, to: 'exception',
            operator: req.user.nickname || req.user.username,
            note: b.description || `${b.ex_type}：异常登记`, userId: wb.user_id,
          });
        }
        const info = db.prepare(`INSERT INTO exceptions (user_id, waybill_id, waybill_no, ex_type, description, severity, ex_status, source)
          VALUES (?,?,?,?,?,?,?,?)`).run(
          req.user.id, wb.id, wb.waybill_no, b.ex_type, b.description || '', b.severity || '一般', 'open', b.source || 'manual',
        );
        return info.lastInsertRowid;
      });
      const id = run();
      return ok(res, db.prepare('SELECT * FROM exceptions WHERE id = ?').get(id), '异常已登记', 201);
    } catch (e) {
      return fail(res, e.statusCode || 400, e.message);
    }
  });

  // 处理异常：选择处理方式 → 写 resolution → 关闭异常 → 按需联动运单状态
  router.post('/:id/resolve', (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['action']);
    if (missing) return fail(res, 400, missing);
    const action = String(b.action);
    const preset = RESOLUTIONS[action];
    if (!preset) {
      return fail(res, 400, `不支持的处理方式：${action}（可选 ${Object.keys(RESOLUTIONS).join(' / ')}）`);
    }

    const id = toNumber(req.params.id);
    const ex = db.prepare('SELECT * FROM exceptions WHERE id = ?').get(id);
    if (!ex) return fail(res, 404, '异常记录不存在');
    if (ex.ex_status === 'closed') return fail(res, 400, '该异常已关闭，无需重复处理');

    try {
      const run = db.transaction(() => {
        const handler = b.handler || req.user.nickname || req.user.username;
        const resolution = b.resolution || preset.note;

        db.prepare(`UPDATE exceptions SET ex_status = 'resolved', handler = ?, resolution = ?, resolved_at = datetime('now','localtime') WHERE id = ?`)
          .run(handler, resolution, id);

        // 联动运单状态：退回 / 重新派送
        if (preset.status && ex.waybill_id) {
          const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(ex.waybill_id);
          if (wb) {
            const target = preset.status;
            // returned 需从 exception 出发；out_for_delivery 亦需从 exception 出发
            const allowed = domain.canTransition(wb.status, target);
            if (allowed) {
              domain.applyTransition(db, {
                waybillId: wb.id, to: target, operator: handler,
                note: `${preset.label}：${resolution}`, userId: wb.user_id,
              });
            } else if (wb.status !== target) {
              // 状态机不允许时，仅记录处理结果，不强行改状态（保持数据一致）
              domain.logStatus(db, wb.user_id, wb.id, wb.status, target, handler, `异常处理「${preset.label}」但因状态机限制未变更状态`);
            }
          }
        } else if (ex.waybill_id && action === 'close') {
          const wb = db.prepare('SELECT * FROM waybills WHERE id = ?').get(ex.waybill_id);
          if (wb && wb.status === 'exception') {
            db.prepare('UPDATE waybills SET exception_flag = 0 WHERE id = ?').run(wb.id);
          }
        }

        domain.pushNotification(db, ex.user_id, {
          waybill_id: ex.waybill_id,
          title: `异常已处理：${ex.waybill_no}`,
          body: `${preset.label} · ${resolution}`,
          ntype: 'status',
        });

        return db.prepare('SELECT * FROM exceptions WHERE id = ?').get(id);
      });
      const updated = run();
      return ok(res, updated, '异常已处理');
    } catch (e) {
      return fail(res, e.statusCode || 400, e.message);
    }
  });

  // 关闭异常（与 resolve 分开：关闭表示"归档，不再跟踪"）
  router.post('/:id/close', (req, res) => {
    const id = toNumber(req.params.id);
    const ex = db.prepare('SELECT * FROM exceptions WHERE id = ?').get(id);
    if (!ex) return fail(res, 404, '异常记录不存在');
    if (ex.ex_status === 'closed') return fail(res, 400, '该异常已关闭');
    db.prepare("UPDATE exceptions SET ex_status = 'closed', handler = ?, resolved_at = datetime('now','localtime') WHERE id = ?")
      .run(req.body?.handler || req.user.nickname || req.user.username, id);
    return ok(res, db.prepare('SELECT * FROM exceptions WHERE id = ?').get(id), '异常已关闭');
  });

  // 处理方式字典（前端下拉项）
  router.get('/meta/actions', (req, res) => ok(res, Object.entries(RESOLUTIONS).map(([k, v]) => ({ action: k, label: v.label, note: v.note, status: v.status }))));

  return router;
};

module.exports.RESOLUTIONS = RESOLUTIONS;
