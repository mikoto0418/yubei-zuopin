// AI 三接口。每个都遵循同一模式：
//   1) 组装上下文（真实业务数据）
//   2) ai.generate()：有 LLM_API_KEY 走大模型，否则本地规则降级，响应带 source
//   3) **把结果写回业务表**，并在后续流程中被消费
//
// 落库点：
//   /ai/eta            → waybills.estimated_delivery（前端运单详情/列表展示）
//   /ai/detect-stale   → exceptions 记录（异常页可见、可处理，形成闭环）
//   /ai/optimize-route → 返回派送顺序（不落库，但基于真实司机当日任务计算）
'use strict';
const express = require('express');
const { ok, fail, toNumber } = require('../http');
const ai = require('../ai');
const domain = require('../domain');

module.exports = (db) => {
  const router = express.Router();

  // ---------- 1. 时效预测：预测送达时间并写入 waybills.estimated_delivery ----------
  router.post('/eta', async (req, res) => {
    const b = req.body || {};
    const waybillId = toNumber(b.waybill_id, 0);
    const wb = waybillId ? db.prepare('SELECT * FROM waybills WHERE id = ?').get(waybillId) : null;
    if (waybillId && !wb) return fail(res, 404, '运单不存在');

    // 历史基线：同类城市线路 + 相似重量区间的平均时效
    const stats = wb ? historicalStats(db, wb) : null;
    const input = wb
      ? {
        waybill_no: wb.waybill_no,
        route: `${wb.origin_city} → ${wb.dest_city}`,
        weight: wb.weight,
        volume: wb.volume,
        goods_type: wb.goods_type,
        current_status: wb.status,
        created_at: wb.created_at,
        scan_count: db.prepare('SELECT COUNT(*) AS c FROM scan_records WHERE waybill_id = ?').get(wb.id).c,
        hours_elapsed: domain.durationHours(wb.created_at, null),
        history_avg_hours: stats?.avg_hours ?? null,
        history_samples: stats?.samples ?? 0,
      }
      : b;

    const fallbackHours = localEtaHours(input, stats);
    const buildLocal = () => {
      const eta = addHours(new Date(), fallbackHours);
      return JSON.stringify({
        estimated_hours: Number(fallbackHours.toFixed(1)),
        estimated_delivery: fmt(eta),
        confidence: stats?.samples >= 3 ? 0.82 : 0.66,
        basis: stats?.samples
          ? `参考 ${stats.samples} 条同线路历史运单，平均时效 ${stats.avg_hours} 小时`
          : '无同线路历史数据，按基础时效 48h + 重量/体积系数估算',
        factors: etaFactors(input),
      });
    };

    try {
      const result = await ai.generate(
        [
          { role: 'system', content: '你是物流时效预测专家。根据运单信息与历史基线预测送达时间。只输出 JSON：{"estimated_hours":数字,"estimated_delivery":"YYYY-MM-DD HH:MM:SS","confidence":0~1,"basis":"依据说明","factors":["影响因素"]}。不要输出其他文字。' },
          { role: 'user', content: JSON.stringify(input) },
        ],
        buildLocal,
        { temperature: 0.3, maxTokens: 400 },
      );

      const parsed = safeParse(result.text) || safeParse(buildLocal());
      const estimatedDelivery = parsed?.estimated_delivery || fmt(addHours(new Date(), fallbackHours));
      const hours = Number(parsed?.estimated_hours) || fallbackHours;

      // ★ 落库：写入 waybills.estimated_delivery，前端运单列表与详情直接展示
      let updated = null;
      if (wb) {
        db.prepare("UPDATE waybills SET estimated_delivery = ?, updated_at = datetime('now','localtime') WHERE id = ?")
          .run(estimatedDelivery, wb.id);
        db.prepare(`INSERT INTO notifications (user_id, waybill_id, title, body, ntype) VALUES (?,?,?,?,?)`)
          .run(wb.user_id, wb.id, `${wb.waybill_no} 时效预测已更新`, `预计 ${estimatedDelivery} 送达`, 'status');
        updated = db.prepare('SELECT * FROM waybills WHERE id = ?').get(wb.id);
      }

      return ok(res, {
        waybill_id: wb?.id || 0,
        waybill_no: wb?.waybill_no || '',
        estimated_hours: Number(hours.toFixed(1)),
        estimated_delivery: estimatedDelivery,
        confidence: parsed?.confidence ?? 0.7,
        basis: parsed?.basis || '',
        factors: parsed?.factors || etaFactors(input),
        history_avg_hours: stats?.avg_hours ?? null,
        history_samples: stats?.samples ?? 0,
        persisted: Boolean(updated),
        waybill: updated,
        source: result.source,
      });
    } catch (e) {
      return fail(res, 500, 'AI 服务异常：' + e.message);
    }
  });

  // ---------- 2. 异常识别：找出长时间无扫描的运单并创建 exceptions ----------
  router.post('/detect-stale', async (req, res) => {
    const b = req.body || {};
    // 阈值：默认 24 小时无扫描即视为滞留
    const hours = Math.max(1, toNumber(b.hours, 24));
    const limit = Math.min(50, Math.max(1, toNumber(b.limit, 20)));
    const dryRun = b.dry_run === true;

    // 未完结的运单才纳入扫描（已签收/已退回的不会再滞留）
    const OPEN = ['created', 'picked_up', 'in_transit', 'arrived_hub', 'out_for_delivery'];
    const rows = db.prepare(`
      SELECT w.*,
             (SELECT MAX(s.scanned_at) FROM scan_records s WHERE s.waybill_id = w.id) AS last_scan,
             (SELECT COUNT(*) FROM scan_records s WHERE s.waybill_id = w.id) AS scan_count,
             (SELECT COUNT(*) FROM exceptions e WHERE e.waybill_id = w.id AND e.ex_status IN ('open','processing')) AS open_ex
      FROM waybills w
      WHERE w.status IN (${OPEN.map(() => '?').join(',')})
      ORDER BY w.created_at ASC
    `).all(...OPEN);

    const now = Date.now();
    const stale = [];
    rows.forEach((r) => {
      const anchor = r.last_scan || r.updated_at || r.created_at;
      const h = hoursSince(anchor, now);
      if (h >= hours) {
        stale.push({
          waybill_id: r.id,
          waybill_no: r.waybill_no,
          status: r.status,
          status_label: domain.STATUS_LABEL[r.status],
          route: `${r.origin_city} → ${r.dest_city}`,
          hours_stale: Number(h.toFixed(1)),
          last_scan: r.last_scan || '',
          anchor,
          scan_count: r.scan_count,
          has_open_exception: r.open_ex > 0,
          receiver_name: r.receiver_name,
          receiver_phone: r.receiver_phone,
        });
      }
    });
    stale.sort((a, c) => c.hours_stale - a.hours_stale);
    const top = stale.slice(0, limit);

    const buildLocal = () => {
      if (!top.length) {
        return JSON.stringify({ summary: `近 ${hours} 小时内没有发现滞留运单，全网运转正常。`, items: [], risk_level: 'low' });
      }
      const worst = top[0];
      const summary = `发现 ${stale.length} 张运单超过 ${hours} 小时无扫描记录，其中 ${worst.waybill_no}（${worst.route}）已滞留 ${worst.hours_stale} 小时，建议优先介入。`;
      return JSON.stringify({
        summary,
        risk_level: stale.length >= 5 ? 'high' : stale.length >= 2 ? 'medium' : 'low',
        items: top.map((s) => ({
          waybill_id: s.waybill_id,
          waybill_no: s.waybill_no,
          severity: s.hours_stale >= hours * 2 ? '严重' : '一般',
          ex_type: s.status === 'out_for_delivery' ? '超时' : '超时',
          description: `运单 ${s.waybill_no}（${s.route}）已 ${s.hours_stale} 小时无扫描记录，当前状态「${s.status_label}」，最近扫描：${s.last_scan || '无'}`,
        })),
      });
    };

    try {
      const result = await ai.generate(
        [
          { role: 'system', content: '你是物流异常监控专家。分析滞留运单清单，判断风险等级并给出处理建议。只输出 JSON：{"summary":"总体判断","risk_level":"low|medium|high","items":[{"waybill_id":数字,"waybill_no":"单号","severity":"严重|一般","ex_type":"超时|拒收|破损|地址错误","description":"异常描述"}]}。不要输出其他文字。' },
          { role: 'user', content: JSON.stringify({ hours_threshold: hours, stale_count: stale.length, waybills: top }) },
        ],
        buildLocal,
        { temperature: 0.3, maxTokens: 900 },
      );

      const parsed = safeParse(result.text) || safeParse(buildLocal());
      const items = Array.isArray(parsed?.items) ? parsed.items : [];

      // ★ 落库：为每条识别结果创建 exceptions 记录（已存在未关闭异常的运单跳过，避免刷屏）
      const created = [];
      if (!dryRun) {
        const run = db.transaction(() => {
          items.forEach((it) => {
            const wid = toNumber(it.waybill_id, 0);
            const target = top.find((s) => s.waybill_id === wid);
            if (!target || target.has_open_exception) return;
            const info = db.prepare(`INSERT INTO exceptions (user_id, waybill_id, waybill_no, ex_type, description, severity, ex_status, source)
              VALUES (?,?,?,?,?,?,?,?)`).run(
              db.prepare('SELECT user_id FROM waybills WHERE id = ?').get(wid)?.user_id || 1,
              wid, target.waybill_no, it.ex_type || '超时',
              it.description || `超过 ${hours} 小时无扫描记录`,
              it.severity || '一般', 'open', 'ai',
            );
            // 运单标记异常，列表页可高亮
            db.prepare('UPDATE waybills SET exception_flag = 1 WHERE id = ?').run(wid);
            domain.pushNotification(db, db.prepare('SELECT user_id FROM waybills WHERE id = ?').get(wid)?.user_id || 1, {
              waybill_id: wid,
              title: `AI 识别到滞留：${target.waybill_no}`,
              body: it.description || `超过 ${hours} 小时无扫描记录`,
              ntype: 'alert',
            });
            created.push({ id: info.lastInsertRowid, waybill_id: wid, waybill_no: target.waybill_no, severity: it.severity || '一般' });
          });
        });
        run();
      }

      return ok(res, {
        summary: parsed?.summary || '',
        risk_level: parsed?.risk_level || 'low',
        threshold_hours: hours,
        stale_total: stale.length,
        detected: top.length,
        created_exceptions: created.length,
        exceptions: created,
        items: top,
        persisted: !dryRun && created.length > 0,
        source: result.source,
      });
    } catch (e) {
      return fail(res, 500, 'AI 服务异常：' + e.message);
    }
  });

  // ---------- 3. 派送顺序优化：给定司机/网点，输出当日最优派送顺序 ----------
  router.post('/optimize-route', async (req, res) => {
    const b = req.body || {};
    const driverId = toNumber(b.driver_id, 0);
    const warehouseId = toNumber(b.warehouse_id, 0);

    // 待派送运单：派送中 / 到达分拨 + 未签收
    const clauses = ["w.status IN ('arrived_hub','out_for_delivery')"];
    const params = [];
    if (driverId) { clauses.push('w.driver_id = ?'); params.push(driverId); }
    if (warehouseId) { clauses.push('(w.dest_warehouse_id = ? OR w.current_warehouse_id = ?)'); params.push(warehouseId, warehouseId); }
    if (Array.isArray(b.waybill_ids) && b.waybill_ids.length) {
      clauses.push(`w.id IN (${b.waybill_ids.map(() => '?').join(',')})`);
      b.waybill_ids.forEach((id) => params.push(toNumber(id, 0)));
    }

    const stops = db.prepare(`
      SELECT w.id, w.waybill_no, w.receiver_name, w.receiver_phone, w.receiver_address,
             w.receiver_lat, w.receiver_lng, w.weight, w.volume, w.insured, w.status,
             w.estimated_delivery, w.dest_city
      FROM waybills w WHERE ${clauses.join(' AND ')} ORDER BY w.estimated_delivery ASC LIMIT 60
    `).all(...params);

    if (!stops.length) {
      return ok(res, {
        plan: [], total_stops: 0, total_distance_km: 0, estimated_minutes: 0,
        algorithm: 'none', summary: '当前没有待派送运单，无需规划。', source: 'local',
      });
    }

    // 起点：司机所属网点（或第一个收件点）
    const driver = driverId ? db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId) : null;
    const startWh = driver?.warehouse_id
      ? db.prepare('SELECT * FROM warehouses WHERE id = ?').get(driver.warehouse_id)
      : (warehouseId ? db.prepare('SELECT * FROM warehouses WHERE id = ?').get(warehouseId) : null);
    const start = startWh
      ? { lat: Number(startWh.lat), lng: Number(startWh.lng), name: startWh.name }
      : { lat: Number(stops[0].receiver_lat), lng: Number(stops[0].receiver_lng), name: stops[0].dest_city || '起点' };

    // 本地算法：最近邻（Nearest Neighbor）贪心，带"重货优先"权重微调
    // 这是经典的 TSP 近似解，n≤60 时毫秒级完成，且结果稳定可解释。
    const nn = nearestNeighbor(start, stops);
    const localPlan = nn.plan;
    const localDistance = nn.distance;

    const buildLocal = () => {
      const lines = localPlan.map((s, i) => `${i + 1}. ${s.waybill_no} → ${s.receiver_name}（${s.receiver_address}）${s.leg_km}km`);
      return [
        `## 建议派送顺序（共 ${localPlan.length} 站，全程约 ${localDistance.toFixed(1)} km）`,
        ...lines,
        '',
        `起点：${start.name}`,
        `预计总耗时：${estimateMinutes(localPlan.length, localDistance)} 分钟（含每站 5 分钟作业）`,
        '说明：按最近邻贪心算法排序，优先处理预计送达时间更早的运单。',
      ].join('\n');
    };

    try {
      const result = await ai.generate(
        [
          { role: 'system', content: '你是末端派送调度专家。根据待派送运单清单与起点坐标，给出最优派送顺序，考虑地理就近、时效优先级、重货优先。中文分点输出，先给顺序清单再给总里程与总耗时。' },
          { role: 'user', content: JSON.stringify({ start, stops: localPlan, baseline_distance_km: localDistance }) },
        ],
        buildLocal,
        { temperature: 0.4, maxTokens: 900 },
      );

      return ok(res, {
        plan: localPlan.map((s, i) => ({ ...s, seq: i + 1 })),
        start,
        total_stops: localPlan.length,
        total_distance_km: Number(localDistance.toFixed(2)),
        estimated_minutes: estimateMinutes(localPlan.length, localDistance),
        algorithm: 'nearest-neighbor',
        baseline_distance_km: Number(localDistance.toFixed(2)),
        advice: result.text,
        source: result.source,
      });
    } catch (e) {
      return fail(res, 500, 'AI 服务异常：' + e.message);
    }
  });

  return router;
};

// ---------- 辅助 ----------

// 同线路历史时效（只统计已签收运单的真实耗时）
function historicalStats(db, wb) {
  const row = db.prepare(`
    SELECT COUNT(*) AS samples,
           AVG((julianday(actual_delivery) - julianday(created_at)) * 24) AS avg_hours
    FROM waybills
    WHERE status = 'delivered' AND actual_delivery != ''
      AND origin_city = ? AND dest_city = ?
  `).get(wb.origin_city, wb.dest_city);
  if (!row || !row.samples) return null;
  return { samples: row.samples, avg_hours: Number(Number(row.avg_hours || 48).toFixed(1)) };
}

// 本地时效规则：基础 48h + 重量 + 体积 + 已耗时修正
function localEtaHours(input, stats) {
  let h = stats?.avg_hours || 48;
  const weight = Number(input.weight) || 0;
  const volume = Number(input.volume) || 0;
  h += Math.min(24, weight * 0.5);
  h += Math.min(12, volume * 20);
  const elapsed = Number(input.hours_elapsed) || 0;
  if (elapsed > h) h = elapsed + 6; // 已超预估则顺延，避免给出过去的时间
  return Math.max(6, h);
}

function etaFactors(input) {
  const f = ['基础时效 48 小时'];
  if (Number(input.weight) > 5) f.push(`重量 ${input.weight}kg 增加转运耗时`);
  if (Number(input.volume) > 0.05) f.push(`体积 ${input.volume}m³ 占用更多装载空间`);
  if (input.route) f.push(`线路 ${input.route}`);
  if (Number(input.scan_count) > 3) f.push('已多次中转，接近目的地');
  return f;
}

function addHours(d, h) {
  return new Date(d.getTime() + h * 3600000);
}

function fmt(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function hoursSince(tsStr, nowMs) {
  if (!tsStr) return 0;
  const t = new Date(String(tsStr).replace(' ', 'T')).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (nowMs - t) / 3600000);
}

function safeParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // 大模型可能包了 markdown 代码块，剥一层再试
    const m = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) {
      try { return JSON.parse(m[1]); } catch { return null; }
    }
    return null;
  }
}

// 两点球面距离（Haversine），返回公里
function haversine(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 最近邻贪心：每步选"距离最近"的下一个点。
// 权重：重货与保价件略微提前（乘 0.9 折扣，使其更容易被优先选中）。
function nearestNeighbor(start, stops) {
  const remaining = stops.map((s) => ({
    ...s,
    lat: Number(s.receiver_lat) || 0,
    lng: Number(s.receiver_lng) || 0,
    weight: Number(s.weight) || 0,
    insured: Number(s.insured) || 0,
  })).filter((s) => s.lat || s.lng);

  const skipped = stops.length - remaining.length; // 缺坐标的点无法参与排序
  const plan = [];
  let cursor = { lat: start.lat, lng: start.lng };
  let total = 0;

  while (remaining.length) {
    let bestIdx = 0;
    let bestCost = Infinity;
    remaining.forEach((s, i) => {
      const d = haversine(cursor, s);
      // 重货/保价件优先：成本打折后更容易被选中
      const priority = (s.weight > 5 || s.insured) ? 0.9 : 1;
      const cost = d * priority;
      if (cost < bestCost) { bestCost = cost; bestIdx = i; }
    });
    const next = remaining.splice(bestIdx, 1)[0];
    const leg = haversine(cursor, next);
    total += leg;
    plan.push({
      waybill_id: next.id,
      waybill_no: next.waybill_no,
      receiver_name: next.receiver_name,
      receiver_phone: next.receiver_phone,
      receiver_address: next.receiver_address,
      lat: next.lat,
      lng: next.lng,
      weight: next.weight,
      insured: next.insured,
      status: next.status,
      estimated_delivery: next.estimated_delivery,
      leg_km: Number(leg.toFixed(2)),
    });
    cursor = { lat: next.lat, lng: next.lng };
  }

  return { plan, distance: total, skipped };
}

// 末端派送耗时估算：行驶（均速 25km/h）+ 每站 5 分钟作业
function estimateMinutes(stopCount, distanceKm) {
  return Math.round((distanceKm / 25) * 60 + stopCount * 5);
}
