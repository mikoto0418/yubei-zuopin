// 工单专属路由：列表筛选 + 详情时间轴 + 状态流转（后端强校验）。
// 状态机规则全部来自 src/workflow.js，路由只负责鉴权、落库与写日志。
'use strict';
const express = require('express');
const { ok, fail, parsePage, pageResult, toNumber } = require('../http');
const { canTransition, transitionError, nextStates, STATUS_LABEL, ACTIVE_STATUS } = require('../workflow');

/**
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 */
function workOrderRoutes({ db }) {
  const router = express.Router();

  const selectOne = db.prepare('SELECT * FROM work_orders WHERE id = ?');

  function withRelations(row) {
    if (!row) return null;
    const facility = row.facility_id
      ? db.prepare('SELECT id,name,category,address,lat,lng,district_id FROM facilities WHERE id = ?').get(row.facility_id)
      : null;
    const team = row.team_id
      ? db.prepare('SELECT id,name,leader,phone,capacity,active_jobs FROM maintenance_teams WHERE id = ?').get(row.team_id)
      : null;
    const fault = row.fault_id
      ? db.prepare('SELECT id,title,description,severity,status,diagnosis FROM faults WHERE id = ?').get(row.fault_id)
      : null;
    const creator = row.created_by
      ? db.prepare('SELECT id,username,nickname FROM users WHERE id = ?').get(row.created_by)
      : null;
    return {
      ...row,
      status_label: STATUS_LABEL[row.status] || row.status,
      next_status: nextStates(row.status),
      facility,
      team,
      fault,
      creator,
    };
  }

  // 写一条流转日志。任何状态变更都必须经过这里，保证时间轴完整。
  const insertLog = db.prepare(
    'INSERT INTO work_order_logs (order_id, from_status, to_status, operator_id, remark) VALUES (?,?,?,?,?)'
  );

  // 列表：状态 / 区域 / 班组 筛选 + 关键词 + 分页
  router.get('/', (req, res) => {
    const { page, pageSize } = parsePage(req);
    const clauses = [];
    const params = [];
    for (const f of ['status', 'team_id']) {
      const v = req.query[f];
      if (v !== undefined && v !== '') { clauses.push(`wo.${f} = ?`); params.push(v); }
    }
    if (req.query.priority) { clauses.push('wo.priority = ?'); params.push(req.query.priority); }
    // 区域筛选挂在设施上（工单本身不冗余 district_id）
    if (req.query.district) { clauses.push('f.district_id = ?'); params.push(toNumber(req.query.district)); }
    const q = (req.query.q || '').trim();
    if (q) {
      clauses.push('(wo.code LIKE ? OR wo.description LIKE ? OR f.name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    // 注意：JOIN 必须在 WHERE 之前，区域筛选条件引用的是 facilities 别名 f。
    const baseSql = `FROM work_orders wo
      LEFT JOIN facilities f ON f.id = wo.facility_id
      LEFT JOIN districts d ON d.id = f.district_id
      LEFT JOIN maintenance_teams t ON t.id = wo.team_id
      ${where}`;
    const rows = db.prepare(
      `SELECT wo.*, f.name AS facility_name, f.address AS facility_address, f.district_id AS district_id,
              t.name AS team_name, d.name AS district_name
       ${baseSql}
       ORDER BY wo.id DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`SELECT COUNT(*) AS total ${baseSql}`).get(...params);
    const list = rows.map((r) => ({ ...r, status_label: STATUS_LABEL[r.status] || r.status }));
    return ok(res, pageResult(list, total, page, pageSize));
  });

  // 详情：含日志时间轴（按时间正序，前端直接画时间轴）
  router.get('/:id', (req, res) => {
    const row = selectOne.get(toNumber(req.params.id));
    if (!row) return fail(res, 404, '工单不存在');
    const logs = db.prepare(
      `SELECT l.*, u.username AS operator_name, u.nickname AS operator_nickname
       FROM work_order_logs l LEFT JOIN users u ON u.id = l.operator_id
       WHERE l.order_id = ? ORDER BY l.id ASC`
    ).all(row.id);
    return ok(res, { ...withRelations(row), logs });
  });

  // 状态流转：唯一写入口。非法流转返回 400，并在日志里留下完整轨迹。
  router.patch('/:id/status', (req, res) => {
    const id = toNumber(req.params.id);
    const row = selectOne.get(id);
    if (!row) return fail(res, 404, '工单不存在');

    const target = String((req.body || {}).status || '').trim();
    if (!target) return fail(res, 400, '缺少必填字段：status');
    if (!canTransition(row.status, target)) {
      return fail(res, 400, transitionError(row.status, target));
    }

    const remark = String((req.body || {}).remark || '').trim();
    const teamId = (req.body || {}).team_id;
    const resolution = (req.body || {}).resolution;

    // assigned 必须落到某个班组：允许本次请求带上 team_id，否则用已有的。
    let nextTeam = row.team_id;
    if (target === 'assigned') {
      if (teamId !== undefined && teamId !== null && teamId !== '') nextTeam = toNumber(teamId);
      if (!nextTeam) return fail(res, 400, '派单必须指定班组（team_id）');
      const team = db.prepare('SELECT id FROM maintenance_teams WHERE id = ?').get(nextTeam);
      if (!team) return fail(res, 400, '指定的班组不存在');
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const sets = ['status = ?'];
    const vals = [target];
    if (target === 'assigned') {
      // 首次派单才写 assigned_at；列默认是空串而非 NULL，不能用 COALESCE。
      sets.push('team_id = ?', "assigned_at = CASE WHEN assigned_at IS NULL OR assigned_at = '' THEN ? ELSE assigned_at END");
      vals.push(nextTeam, now);
    }
    if (target === 'resolved') { sets.push('resolved_at = ?'); vals.push(now); }
    if (target === 'verified') { sets.push('verified_at = ?'); vals.push(now); }
    if (target === 'closed') { sets.push('closed_at = ?'); vals.push(now); }
    if (resolution !== undefined) { sets.push('resolution = ?'); vals.push(String(resolution)); }
    vals.push(id);

    // 状态与日志必须同生共死，用事务包起来。
    const tx = db.transaction(() => {
      db.prepare(`UPDATE work_orders SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      insertLog.run(id, row.status, target, req.user.id, remark || `状态变更为 ${STATUS_LABEL[target] || target}`);
      // 班组负载跟着状态走：占用产能的状态加减 active_jobs。
      if (target === 'assigned' && nextTeam) {
        db.prepare('UPDATE maintenance_teams SET active_jobs = active_jobs + 1 WHERE id = ?').run(nextTeam);
      }
      if ((target === 'closed') && nextTeam && ACTIVE_STATUS.includes(row.status)) {
        db.prepare('UPDATE maintenance_teams SET active_jobs = MAX(active_jobs - 1, 0) WHERE id = ?').run(nextTeam);
      }
      // 关键节点给上报人发站内通知，形成闭环反馈。
      if (['assigned', 'resolved', 'closed'].includes(target)) {
        const owner = db.prepare('SELECT user_id FROM faults WHERE id = ?').get(row.fault_id);
        if (owner?.user_id) {
          db.prepare('INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)')
            .run(owner.user_id, 'work_order', `工单 ${row.code} 状态更新`,
              `工单已变更为「${STATUS_LABEL[target] || target}」${remark ? '：' + remark : ''}`);
        }
      }
    });
    tx();

    return ok(res, withRelations(selectOne.get(id)), '状态已更新');
  });

  // 手工建单（诊断自动建单之外的补充入口）
  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.fault_id && !b.facility_id) return fail(res, 400, '至少需要 fault_id 或 facility_id');
    const priority = b.priority || 'normal';
    const code = b.code || `WO${Date.now().toString().slice(-8)}`;
    const info = db.prepare(
      `INSERT INTO work_orders (code, fault_id, facility_id, team_id, status, priority, created_by, description)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(code, b.fault_id ? toNumber(b.fault_id) : null, b.facility_id ? toNumber(b.facility_id) : null,
      b.team_id ? toNumber(b.team_id) : null, 'created', priority, req.user.id, b.description || '');
    insertLog.run(info.lastInsertRowid, null, 'created', req.user.id, '工单创建');
    return ok(res, withRelations(selectOne.get(info.lastInsertRowid)), '工单已创建', 201);
  });

  return router;
}

module.exports = workOrderRoutes;
