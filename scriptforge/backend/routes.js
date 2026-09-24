// ScriptForge 路由装配：通用 CRUD + 领域专属接口。
'use strict';
const express = require('express');
const { authRoutes, adminRoutes, requireAuth } = require('./kernel');
const { ok, fail, parsePage, pageResult, requireFields, toNumber } = require('./kernel').http;
const scopedCrud = require('./crud');
const { canRead, canWrite, canReview, canReadAll, ownerScope } = require('./access');
const { db, PROJECT_FLOW, SCENE_FLOW, canTransition } = require('./db');

const PROJECT_STATUS = Object.keys(PROJECT_FLOW);
const SCENE_STATUS = Object.keys(SCENE_FLOW);

function mountRoutes(app, api) {
  // —— 认证 ——
  app.use(`${api}/auth`, authRoutes({ db, extraColumns: ['bio'] }));

  // —— Admin 概览 ——
  app.use(`${api}/admin`, adminRoutes({ db, buildOverview: require('./overview')(db) }));

  // —— 通用 CRUD（权限：admin/editor 可读全部，写只能写自己的）——
  const own = { canReadRow: canRead, canWriteRow: canWrite };
  // admin 与 editor 在列表里能看全部作品；writer 只看自己。
  const seeAll = (_, u) => canReadAll(u);

  app.use(`${api}/projects`, requireAuth, scopedCrud({
    db, table: 'projects',
    fields: ['title', 'type', 'genre', 'logline', 'synopsis', 'cover', 'status'],
    required: ['title'],
    searchable: ['title', 'genre', 'logline', 'synopsis'],
    filterable: ['type', 'genre', 'status'],
    orderBy: 'updated_at DESC, id DESC',
    scopeAll: seeAll,
    validate: (b) => (b.status && !PROJECT_STATUS.includes(b.status) ? `非法的作品状态：${b.status}` : null),
    ...own,
  }));

  app.use(`${api}/episodes`, requireAuth, scopedCrud({
    db, table: 'episodes',
    fields: ['project_id', 'title', 'seq', 'summary'],
    required: ['project_id', 'title'],
    searchable: ['title', 'summary'],
    filterable: ['project_id'],
    orderBy: 'seq ASC, id ASC',
    numberFields: ['project_id', 'seq'],
    scopeAll: seeAll,
    ...own,
  }));

  app.use(`${api}/scenes`, requireAuth, scopedCrud({
    db, table: 'scenes',
    fields: ['project_id', 'episode_id', 'title', 'seq', 'location', 'time_of_day', 'content', 'status'],
    required: ['episode_id', 'title'],
    searchable: ['title', 'location', 'content'],
    filterable: ['project_id', 'episode_id', 'status'],
    orderBy: 'seq ASC, id ASC',
    numberFields: ['project_id', 'episode_id', 'seq'],
    scopeAll: seeAll,
    validate: (b) => (b.status && !SCENE_STATUS.includes(b.status) ? `非法的场景状态：${b.status}` : null),
    // 场景挂在分集下，project_id 由分集推导（前端只需传 episode_id）。
    derive: (b) => {
      if (b.project_id !== undefined && b.project_id !== null && b.project_id !== '') return null;
      const ep = db.prepare('SELECT project_id FROM episodes WHERE id = ?').get(toNumber(b.episode_id));
      if (!ep) return { error: '分集不存在，无法确定所属作品' };
      return { project_id: ep.project_id };
    },
    afterWrite: (row) => {
      if (!row) return;
      const wc = String(row.content || '').replace(/\s/g, '').length;
      db.prepare("UPDATE scenes SET word_count = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(wc, row.id);
      if (row.project_id) db.prepare("UPDATE projects SET updated_at = datetime('now','localtime') WHERE id = ?").run(row.project_id);
    },
    ...own,
  }));

  app.use(`${api}/dialogues`, requireAuth, scopedCrud({
    db, table: 'dialogues',
    fields: ['scene_id', 'character_id', 'seq', 'line', 'emotion', 'parenthetical'],
    required: ['scene_id', 'line'],
    searchable: ['line', 'emotion'],
    filterable: ['scene_id', 'character_id'],
    orderBy: 'seq ASC, id ASC',
    numberFields: ['scene_id', 'character_id', 'seq'],
    scopeAll: seeAll,
    ...own,
  }));

  app.use(`${api}/notes`, requireAuth, scopedCrud({
    db, table: 'notes',
    fields: ['project_id', 'scene_id', 'title', 'content', 'kind', 'status', 'source'],
    required: ['title'],
    searchable: ['title', 'content'],
    filterable: ['project_id', 'kind', 'status', 'source'],
    orderBy: 'id DESC',
    numberFields: ['project_id', 'scene_id'],
    scopeAll: seeAll,
    ...own,
  }));

  // ============================================================
  // 领域专属接口
  // 注意：domain 必须先于 characters / storylines 的通用 CRUD 挂载，
  // 否则 GET /api/characters/relations 会被 CRUD 的 /:id 抢先匹配而返回 404。
  // ============================================================
  const domain = express.Router();

  const getProject = (id) => db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  const getScene = (id) => db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);

  // —— 作品完整结构：分集 → 场景 → 对白 ——
  domain.get('/projects/:id/full', requireAuth, (req, res) => {
    const project = getProject(toNumber(req.params.id));
    if (!project) return fail(res, 404, '作品不存在');
    if (!canRead(project, req.user)) return fail(res, 403, '无权访问该作品');

    const episodes = db.prepare('SELECT * FROM episodes WHERE project_id = ? ORDER BY seq ASC, id ASC').all(project.id);
    const scenes = db.prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY seq ASC, id ASC').all(project.id);
    const dialogues = db.prepare(`
      SELECT d.*, c.name AS character_name
      FROM dialogues d LEFT JOIN characters c ON c.id = d.character_id
      WHERE d.scene_id IN (SELECT id FROM scenes WHERE project_id = ?)
      ORDER BY d.scene_id ASC, d.seq ASC, d.id ASC
    `).all(project.id);
    const cast = db.prepare(`
      SELECT sc.scene_id, ch.id, ch.name, ch.identity
      FROM scene_characters sc JOIN characters ch ON ch.id = sc.character_id
      WHERE sc.scene_id IN (SELECT id FROM scenes WHERE project_id = ?)
    `).all(project.id);

    const byScene = (rows, key) => rows.reduce((m, r) => ((m[r[key]] = m[r[key]] || []).push(r), m), {});
    const dlgMap = byScene(dialogues, 'scene_id');
    const castMap = byScene(cast, 'scene_id');

    const scenesWithChildren = scenes.map((s) => ({
      ...s,
      dialogues: dlgMap[s.id] || [],
      characters: castMap[s.id] || [],
    }));
    const epMap = byScene(scenesWithChildren, 'episode_id');

    return ok(res, {
      project,
      episodes: episodes.map((e) => ({ ...e, scenes: epMap[e.id] || [] })),
      characters: db.prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY id ASC').all(project.id),
      storylines: db.prepare('SELECT * FROM storylines WHERE project_id = ? ORDER BY code ASC').all(project.id),
      stats: {
        episodes: episodes.length,
        scenes: scenes.length,
        dialogues: dialogues.length,
        characters: db.prepare('SELECT COUNT(*) AS c FROM characters WHERE project_id = ?').get(project.id).c,
        words: scenes.reduce((n, s) => n + (s.word_count || 0), 0),
      },
    });
  });

  // —— 作品状态流转（状态机，非法流转 400）——
  domain.patch('/projects/:id/status', requireAuth, (req, res) => {
    const project = getProject(toNumber(req.params.id));
    if (!project) return fail(res, 404, '作品不存在');
    const to = String((req.body || {}).status || '').trim();
    if (!to) return fail(res, 400, '缺少 status');
    if (!PROJECT_STATUS.includes(to)) return fail(res, 400, `非法的作品状态：${to}`);

    // 「过审 / 返修」是责编（editor）与管理员专属；「送审」是编剧自己的动作。
    const isReviewAction = ['approved', 'revising'].includes(to);
    if (isReviewAction && !canReview(req.user)) return fail(res, 403, '仅责编或管理员可执行审阅动作');
    if (!isReviewAction && !canWrite(project, req.user)) return fail(res, 403, '无权修改该作品');

    if (!canTransition(PROJECT_FLOW, project.status, to)) {
      return fail(res, 400, `非法状态流转：${project.status} → ${to}`);
    }
    db.prepare("UPDATE projects SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(to, project.id);
    return ok(res, getProject(project.id), `作品已流转为 ${to}`);
  });

  // —— 场景状态流转 ——
  domain.patch('/scenes/:id/status', requireAuth, (req, res) => {
    const scene = getScene(toNumber(req.params.id));
    if (!scene) return fail(res, 404, '场景不存在');
    if (!canWrite(scene, req.user)) return fail(res, 403, '无权修改该场景');
    const to = String((req.body || {}).status || '').trim();
    if (!to) return fail(res, 400, '缺少 status');
    if (!SCENE_STATUS.includes(to)) return fail(res, 400, `非法的场景状态：${to}`);
    if (!canTransition(SCENE_FLOW, scene.status, to)) {
      return fail(res, 400, `非法状态流转：${scene.status} → ${to}`);
    }
    db.prepare("UPDATE scenes SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(to, scene.id);
    return ok(res, getScene(scene.id), `场景已流转为 ${to}`);
  });

  // —— 角色：列表含关系（admin/editor 可读全部用于审阅）——
  domain.get('/characters', requireAuth, (req, res) => {
    const { page, pageSize } = parsePage(req, 20);
    const clauses = [];
    const params = [];
    const scope = ownerScope(req.user);
    if (scope !== null) { clauses.push('user_id = ?'); params.push(scope); }
    if (req.query.project_id) { clauses.push('project_id = ?'); params.push(toNumber(req.query.project_id)); }
    const q = (req.query.q || '').trim();
    if (q) { clauses.push('(name LIKE ? OR identity LIKE ? OR personality LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = db.prepare(`SELECT * FROM characters ${where} ORDER BY id ASC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM characters ${where}`).get(...params);

    const ids = rows.map((r) => r.id);
    const rels = ids.length
      ? db.prepare(`
          SELECT r.*, cf.name AS from_name, ct.name AS to_name
          FROM character_relations r
          JOIN characters cf ON cf.id = r.from_id
          JOIN characters ct ON ct.id = r.to_id
          WHERE r.from_id IN (${ids.map(() => '?').join(',')}) OR r.to_id IN (${ids.map(() => '?').join(',')})
        `).all(...ids, ...ids)
      : [];
    const relMap = rels.reduce((m, r) => {
      (m[r.from_id] = m[r.from_id] || []).push(r);
      (m[r.to_id] = m[r.to_id] || []).push(r);
      return m;
    }, {});
    return ok(res, pageResult(rows.map((c) => ({ ...c, relations: relMap[c.id] || [] })), total, page, pageSize));
  });

  // 某作品的关系图数据（前端用 SVG 手绘节点连线）
  domain.get('/characters/relations', requireAuth, (req, res) => {
    const projectId = toNumber(req.query.project_id);
    if (!projectId) return fail(res, 400, '缺少 project_id');
    const project = getProject(projectId);
    if (!project) return fail(res, 404, '作品不存在');
    if (!canRead(project, req.user)) return fail(res, 403, '无权访问该作品');
    const nodes = db.prepare('SELECT id,name,identity,avatar FROM characters WHERE project_id = ? ORDER BY id ASC').all(projectId);
    const edges = db.prepare(`
      SELECT r.id, r.from_id, r.to_id, r.relation, r.note, cf.name AS from_name, ct.name AS to_name
      FROM character_relations r
      JOIN characters cf ON cf.id = r.from_id
      JOIN characters ct ON ct.id = r.to_id
      WHERE r.project_id = ? ORDER BY r.id ASC
    `).all(projectId);
    return ok(res, { nodes, edges });
  });

  // 新建角色关系
  domain.post('/characters/relations', requireAuth, (req, res) => {
    const b = req.body || {};
    const missing = requireFields(b, ['from_id', 'to_id', 'relation']);
    if (missing) return fail(res, 400, missing);
    const from = db.prepare('SELECT * FROM characters WHERE id = ?').get(toNumber(b.from_id));
    const to = db.prepare('SELECT * FROM characters WHERE id = ?').get(toNumber(b.to_id));
    if (!from || !to) return fail(res, 404, '角色不存在');
    if (from.id === to.id) return fail(res, 400, '不能给自己建立关系');
    if (!canWrite(from, req.user)) return fail(res, 403, '无权修改该角色');
    const info = db.prepare('INSERT INTO character_relations (user_id,project_id,from_id,to_id,relation,note) VALUES (?,?,?,?,?,?)')
      .run(req.user.id, from.project_id, from.id, to.id, String(b.relation), b.note || '');
    return ok(res, db.prepare('SELECT * FROM character_relations WHERE id = ?').get(info.lastInsertRowid), '关系已创建', 201);
  });

  // 删除角色关系
  domain.delete('/characters/relations/:id', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM character_relations WHERE id = ?').get(toNumber(req.params.id));
    if (!row) return fail(res, 404, '关系不存在');
    if (!canWrite(row, req.user)) return fail(res, 403, '无权删除该关系');
    db.prepare('DELETE FROM character_relations WHERE id = ?').run(row.id);
    return ok(res, { id: row.id }, '关系已删除');
  });

  // —— 故事线：含关联场景与完整性检查 ——
  domain.get('/storylines', requireAuth, (req, res) => {
    const { page, pageSize } = parsePage(req, 20);
    const clauses = [];
    const params = [];
    const scope = ownerScope(req.user);
    if (scope !== null) { clauses.push('user_id = ?'); params.push(scope); }
    if (req.query.project_id) { clauses.push('project_id = ?'); params.push(toNumber(req.query.project_id)); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM storylines ${where} ORDER BY code ASC, id ASC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM storylines ${where}`).get(...params);

    const ids = rows.map((r) => r.id);
    const links = ids.length
      ? db.prepare(`
          SELECT ls.id, ls.storyline_id, ls.scene_id, ls.note,
                 s.title AS scene_title, s.location, s.time_of_day, s.status AS scene_status, s.seq
          FROM storyline_scenes ls JOIN scenes s ON s.id = ls.scene_id
          WHERE ls.storyline_id IN (${ids.map(() => '?').join(',')})
          ORDER BY s.seq ASC, s.id ASC
        `).all(...ids)
      : [];
    const linkMap = links.reduce((m, l) => ((m[l.storyline_id] = m[l.storyline_id] || []).push(l), m), {});

    // 完整性检查：主线至少 3 场，且必须覆盖作品首场与末场
    const list = rows.map((l) => {
      const scenes = linkMap[l.id] || [];
      const projectScenes = db.prepare('SELECT id FROM scenes WHERE project_id = ? ORDER BY seq ASC, id ASC').all(l.project_id);
      const first = projectScenes[0]?.id;
      const last = projectScenes[projectScenes.length - 1]?.id;
      const sceneIds = scenes.map((s) => s.scene_id);
      const issues = [];
      if (!scenes.length) issues.push('尚未关联任何场景');
      if (l.kind === 'main' && scenes.length && scenes.length < 3) issues.push('主线场景少于 3 场，冲突展开不足');
      if (l.kind === 'main' && scenes.length && first && !sceneIds.includes(first)) issues.push('主线未覆盖作品首场，缺少开场钩子');
      if (l.kind === 'main' && scenes.length && last && !sceneIds.includes(last)) issues.push('主线未覆盖作品末场，缺少收束');
      return { ...l, scenes, scene_count: scenes.length, complete: issues.length === 0, issues };
    });
    return ok(res, pageResult(list, total, page, pageSize));
  });

  // 关联场景到故事线
  domain.post('/storylines/:id/scenes', requireAuth, (req, res) => {
    const line = db.prepare('SELECT * FROM storylines WHERE id = ?').get(toNumber(req.params.id));
    if (!line) return fail(res, 404, '故事线不存在');
    if (!canWrite(line, req.user)) return fail(res, 403, '无权修改该故事线');
    const sceneId = toNumber((req.body || {}).scene_id);
    const scene = getScene(sceneId);
    if (!scene) return fail(res, 404, '场景不存在');
    if (scene.project_id !== line.project_id) return fail(res, 400, '场景与故事线不属于同一部作品');
    db.prepare('INSERT OR IGNORE INTO storyline_scenes (storyline_id, scene_id, note) VALUES (?,?,?)')
      .run(line.id, sceneId, (req.body || {}).note || '');
    return ok(res, { storyline_id: line.id, scene_id: sceneId }, '已关联', 201);
  });

  // 取消关联
  domain.delete('/storylines/:id/scenes/:sceneId', requireAuth, (req, res) => {
    const line = db.prepare('SELECT * FROM storylines WHERE id = ?').get(toNumber(req.params.id));
    if (!line) return fail(res, 404, '故事线不存在');
    if (!canWrite(line, req.user)) return fail(res, 403, '无权修改该故事线');
    db.prepare('DELETE FROM storyline_scenes WHERE storyline_id = ? AND scene_id = ?')
      .run(line.id, toNumber(req.params.sceneId));
    return ok(res, { storyline_id: line.id, scene_id: toNumber(req.params.sceneId) }, '已取消关联');
  });

  // —— 版本快照 ——
  const captureScene = (scene, userId, summary) => {
    const { v } = db.prepare('SELECT COALESCE(MAX(version),0) AS v FROM revisions WHERE scene_id = ?').get(scene.id);
    const version = v + 1;
    const info = db.prepare('INSERT INTO revisions (user_id,scene_id,version,summary,snapshot) VALUES (?,?,?,?,?)')
      .run(userId, scene.id, version, summary || `v${version} 快照`, JSON.stringify(scene));
    return db.prepare('SELECT * FROM revisions WHERE id = ?').get(info.lastInsertRowid);
  };

  domain.post('/scenes/:id/revisions', requireAuth, (req, res) => {
    const scene = getScene(toNumber(req.params.id));
    if (!scene) return fail(res, 404, '场景不存在');
    if (!canWrite(scene, req.user)) return fail(res, 403, '无权为该场景创建快照');
    const rev = captureScene(scene, req.user.id, (req.body || {}).summary);
    return ok(res, { ...rev, snapshot: JSON.parse(rev.snapshot) }, '快照已创建', 201);
  });

  domain.get('/scenes/:id/revisions', requireAuth, (req, res) => {
    const scene = getScene(toNumber(req.params.id));
    if (!scene) return fail(res, 404, '场景不存在');
    if (!canRead(scene, req.user)) return fail(res, 403, '无权访问该场景');
    const rows = db.prepare('SELECT * FROM revisions WHERE scene_id = ? ORDER BY version DESC').all(scene.id)
      .map((r) => ({ ...r, snapshot: JSON.parse(r.snapshot) }));
    return ok(res, { scene, revisions: rows });
  });

  // 对比两个版本：逐字段 diff
  domain.get('/scenes/:id/revisions/compare', requireAuth, (req, res) => {
    const scene = getScene(toNumber(req.params.id));
    if (!scene) return fail(res, 404, '场景不存在');
    if (!canRead(scene, req.user)) return fail(res, 403, '无权访问该场景');
    const a = toNumber(req.query.a);
    const b = toNumber(req.query.b);
    const ra = db.prepare('SELECT * FROM revisions WHERE scene_id = ? AND version = ?').get(scene.id, a);
    const rb = db.prepare('SELECT * FROM revisions WHERE scene_id = ? AND version = ?').get(scene.id, b);
    if (!ra || !rb) return fail(res, 404, '指定的版本不存在');
    const sa = JSON.parse(ra.snapshot);
    const sb = JSON.parse(rb.snapshot);
    const keys = ['title', 'location', 'time_of_day', 'status', 'content'];
    const fields = keys.map((k) => ({
      field: k,
      from: sa[k] ?? '',
      to: sb[k] ?? '',
      changed: String(sa[k] ?? '') !== String(sb[k] ?? ''),
    }));
    return ok(res, {
      left: { version: ra.version, summary: ra.summary, created_at: ra.created_at, snapshot: sa },
      right: { version: rb.version, summary: rb.summary, created_at: rb.created_at, snapshot: sb },
      fields,
      changed_count: fields.filter((f) => f.changed).length,
    });
  });

  // 回滚到指定版本（回滚前先留一个自动快照，可再回滚回来）
  domain.post('/scenes/:id/revisions/:version/rollback', requireAuth, (req, res) => {
    const scene = getScene(toNumber(req.params.id));
    if (!scene) return fail(res, 404, '场景不存在');
    if (!canWrite(scene, req.user)) return fail(res, 403, '无权回滚该场景');
    const rev = db.prepare('SELECT * FROM revisions WHERE scene_id = ? AND version = ?')
      .get(scene.id, toNumber(req.params.version));
    if (!rev) return fail(res, 404, '指定的版本不存在');
    captureScene(scene, req.user.id, `回滚前自动快照（回滚至 v${rev.version}）`);
    const snap = JSON.parse(rev.snapshot);
    db.prepare(`UPDATE scenes SET title=?, location=?, time_of_day=?, content=?, status=?, word_count=?,
                updated_at = datetime('now','localtime') WHERE id = ?`)
      .run(snap.title, snap.location, snap.time_of_day, snap.content, snap.status,
        String(snap.content || '').replace(/\s/g, '').length, scene.id);
    return ok(res, { ...getScene(scene.id), rolled_back_to: rev.version }, `已回滚到 v${rev.version}`);
  });

  // —— 审阅台：待审队列 ——
  domain.get('/review/queue', requireAuth, (req, res) => {
    if (!canReview(req.user)) return fail(res, 403, '仅责编或管理员可访问审阅台');
    const { page, pageSize } = parsePage(req);
    const status = req.query.status || 'reviewing';
    if (!PROJECT_STATUS.includes(status)) return fail(res, 400, `非法的作品状态：${status}`);
    const q = (req.query.q || '').trim();
    const clauses = ['p.status = ?'];
    const params = [status];
    if (q) { clauses.push('(p.title LIKE ? OR p.genre LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const rows = db.prepare(`
      SELECT p.*, u.nickname AS author_name, u.username AS author_username
      FROM projects p JOIN users u ON u.id = p.user_id
      ${where} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, (page - 1) * pageSize);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM projects p ${where}`).get(...params);
    const list = rows.map((p) => ({
      ...p,
      stats: {
        episodes: db.prepare('SELECT COUNT(*) AS c FROM episodes WHERE project_id = ?').get(p.id).c,
        scenes: db.prepare('SELECT COUNT(*) AS c FROM scenes WHERE project_id = ?').get(p.id).c,
        words: db.prepare('SELECT COALESCE(SUM(word_count),0) AS c FROM scenes WHERE project_id = ?').get(p.id).c,
      },
    }));
    return ok(res, pageResult(list, total, page, pageSize));
  });

  // 审阅动作：通过 / 返修（意见写入 notes，编剧端可见）
  domain.post('/review/:id/decision', requireAuth, (req, res) => {
    if (!canReview(req.user)) return fail(res, 403, '仅责编或管理员可执行审阅');
    const project = getProject(toNumber(req.params.id));
    if (!project) return fail(res, 404, '作品不存在');
    const { decision, comment } = req.body || {};
    const to = decision === 'approve' ? 'approved' : decision === 'revise' ? 'revising' : null;
    if (!to) return fail(res, 400, 'decision 必须是 approve 或 revise');
    if (!canTransition(PROJECT_FLOW, project.status, to)) {
      return fail(res, 400, `非法状态流转：${project.status} → ${to}`);
    }
    db.prepare("UPDATE projects SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(to, project.id);
    const info = db.prepare(`INSERT INTO notes (user_id,project_id,title,content,kind,status,source)
      VALUES (?,?,?,?,?,?,?)`).run(
      req.user.id, project.id,
      decision === 'approve' ? '审阅通过' : '审阅返修意见',
      comment || (decision === 'approve' ? '责编已通过本作品。' : '责编要求返修，请根据意见修改后重新送审。'),
      decision === 'approve' ? 'idea' : 'todo', 'open', 'manual'
    );
    return ok(res, { project: getProject(project.id), note_id: info.lastInsertRowid },
      decision === 'approve' ? '已通过' : '已退回返修');
  });

  // ============================================================
  // AI 路由（未配置 Key 自动降级本地规则，响应带 source）
  // ============================================================
  const ai = require('./kernel').ai;

  // 1) 角色设定生成 —— 结果写入 characters 表
  domain.post('/ai/character-gen', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const projectId = toNumber(b.project_id);
      const project = getProject(projectId);
      if (!project) return fail(res, 404, '作品不存在');
      if (!canWrite(project, req.user)) return fail(res, 403, '无权在该作品下创建角色');

      const hint = String(b.hint || b.identity || '一个推动主线的人物');
      const existing = db.prepare('SELECT name FROM characters WHERE project_id = ?').all(projectId).map((c) => c.name);

      const buildLocal = () => {
        const base = hint.replace(/[，。；、\s]+/g, '·').slice(0, 12) || '新角色';
        return JSON.stringify({
          name: b.name || `${base}${existing.length + 1}`,
          age: String(28 + (existing.length * 3) % 25),
          identity: hint,
          personality: '外表克制，内里有不肯让步的部分；对亲近的人尤其笨拙。',
          goal: `在《${project.title}》里争取一次不被安排的选择。`,
          arc: '从被动接受处境，到主动承担一次代价。',
          bio: `与主线冲突直接相关：${hint}。第一次出场应当带着一个未说出口的请求。`,
        });
      };

      const out = await ai.generate(
        [
          { role: 'system', content: '你是影视编剧。根据用户给出的身份/设定提示，生成一张中文角色卡，输出严格 JSON，字段：name, age, identity, personality, goal, arc, bio。不要输出 JSON 以外的任何内容。' },
          { role: 'user', content: JSON.stringify({ project: project.title, genre: project.genre, hint, existing }) },
        ],
        buildLocal,
        { temperature: 0.8 }
      );

      let card;
      try {
        card = JSON.parse(String(out.text).replace(/^```(?:json)?|```$/g, '').trim());
      } catch {
        card = JSON.parse(buildLocal());
      }

      const info = db.prepare(`INSERT INTO characters
        (user_id,project_id,name,age,identity,personality,goal,arc,bio) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, projectId,
          String(card.name || '新角色'), String(card.age || ''), String(card.identity || hint),
          String(card.personality || ''), String(card.goal || ''), String(card.arc || ''), String(card.bio || ''));

      const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(info.lastInsertRowid);
      return ok(res, { character, source: out.source, text: out.text }, '角色卡已生成并写入角色表');
    } catch (e) {
      return fail(res, 500, 'AI 服务异常：' + e.message);
    }
  });

  // 2) 对白润色（返回建议，由前端决定是否应用）
  domain.post('/ai/polish-dialogue', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const line = String(b.line || '').trim();
      if (!line) return fail(res, 400, '缺少 line');
      const character = b.character_name || '角色';
      const emotion = b.emotion || '';

      const buildLocal = () => {
        const trimmed = line.replace(/[。！？]+$/, '');
        const context = b.context ? `（${String(b.context).slice(0, 8)}）` : '';
        return [
          `【${character}】${trimmed}${context}`,
          emotion ? `情绪提示：${emotion}（保留原语气，不做拔高）` : '情绪提示：克制，留白',
          '润色要点：删掉解释性副词，把动作留给表演；句尾收短，避免播音腔。',
        ].join('\n');
      };

      const out = await ai.generate(
        [
          { role: 'system', content: '你是影视剧本的对白润色师。保持角色的语气与身份，让台词更短、更像说出来的话。中文，分点输出：润色后台词、情绪提示、润色要点。' },
          { role: 'user', content: JSON.stringify({ character, line, emotion, context: b.context || '' }) },
        ],
        buildLocal,
        { temperature: 0.75 }
      );
      return ok(res, { text: out.text, source: out.source });
    } catch (e) {
      return fail(res, 500, 'AI 服务异常：' + e.message);
    }
  });

  // 3) 情节建议
  domain.post('/ai/plot-suggest', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const projectId = toNumber(b.project_id);
      const project = projectId ? getProject(projectId) : null;
      const scenes = project
        ? db.prepare('SELECT title,location,status FROM scenes WHERE project_id = ? ORDER BY seq ASC LIMIT 12').all(projectId)
        : [];
      const lines = project
        ? db.prepare('SELECT code,title,kind,summary FROM storylines WHERE project_id = ? ORDER BY code ASC').all(projectId)
        : [];

      const buildLocal = () => [
        '## 情节建议',
        `- 当前结构：共 ${scenes.length} 场，其中定稿 ${scenes.filter((s) => s.status === 'final').length} 场`,
        lines.length ? `- 已建故事线：${lines.map((l) => `${l.code} 线《${l.title}》`).join('、')}` : '- 尚未建立故事线，建议先立 A 线',
        '',
        '### 冲突升级',
        '1. 让主角在第二幕中段失去一个他以为稳固的东西（身份、信任或退路），而不是失去一个物件。',
        '2. 反派的动机要让观众能理解，但手段不能原谅。',
        '',
        '### 转折点',
        '3. 在倒数第二场安排一次「以为解决了」的假胜利，最后一场再推翻它。',
        '4. 结尾不要给和解，给一个具体动作（递出/转身/关上灯）。',
      ].join('\n');

      const out = await ai.generate(
        [
          { role: 'system', content: '你是资深剧本策划。根据作品信息与已有场景/故事线，给出冲突升级与转折点的具体建议。中文，分点输出，每条要能直接落到某一场戏。' },
          { role: 'user', content: JSON.stringify({ project: project ? { title: project.title, type: project.type, genre: project.genre, synopsis: project.synopsis } : {}, scenes, storylines: lines }) },
        ],
        buildLocal,
        { temperature: 0.8 }
      );
      return ok(res, { text: out.text, source: out.source });
    } catch (e) {
      return fail(res, 500, 'AI 服务异常：' + e.message);
    }
  });

  // 4) 逻辑检查 —— 结果写入 notes 表作为待办
  domain.post('/ai/logic-check', requireAuth, async (req, res) => {
    try {
      const b = req.body || {};
      const projectId = toNumber(b.project_id);
      const project = getProject(projectId);
      if (!project) return fail(res, 404, '作品不存在');
      if (!canWrite(project, req.user)) return fail(res, 403, '无权检查该作品');

      const scenes = db.prepare('SELECT id,title,location,time_of_day,seq,status FROM scenes WHERE project_id = ? ORDER BY seq ASC, id ASC').all(projectId);
      const castRows = db.prepare(`
        SELECT sc.scene_id, ch.name, ch.id AS character_id FROM scene_characters sc
        JOIN characters ch ON ch.id = sc.character_id
        WHERE sc.scene_id IN (SELECT id FROM scenes WHERE project_id = ?)
      `).all(projectId);
      const castMap = castRows.reduce((m, r) => ((m[r.scene_id] = m[r.scene_id] || []).push(r.name), m), {});

      // 本地规则引擎：三类检查
      const buildLocal = () => {
        const issues = [];
        // 1) 相邻两场时段标记相同却换了地点 —— 需要交代转场
        for (let i = 1; i < scenes.length; i++) {
          const prev = scenes[i - 1];
          const cur = scenes[i];
          if (prev.time_of_day === cur.time_of_day && prev.location !== cur.location) {
            issues.push({
              scene: cur,
              text: `场景「${cur.title}」与上一场「${prev.title}」时间标记同为「${cur.time_of_day}」，但地点从「${prev.location}」换到了「${cur.location}」，需确认是否交代了转场。`,
            });
          }
        }
        // 2) 角色长时间缺席 —— 中间缺少交代
        const firstSeen = {};
        scenes.forEach((s) => {
          (castMap[s.id] || []).forEach((name) => {
            if (!firstSeen[name]) { firstSeen[name] = s; return; }
            const prev = firstSeen[name];
            if (s.seq - prev.seq > 6) {
              issues.push({
                scene: s,
                text: `角色「${name}」自第 ${prev.seq} 场之后直到第 ${s.seq} 场才再次出场，中间缺少交代，建议补一句去向。`,
              });
            }
            firstSeen[name] = s;
          });
        });
        // 3) 场景没有配置出场角色 —— 对白无法归属说话人
        scenes.forEach((s) => {
          if (!(castMap[s.id] || []).length) {
            issues.push({ scene: s, text: `场景「${s.title}」尚未配置出场角色，正文中的对白将无法归属说话人。` });
          }
        });
        return issues;
      };

      const out = await ai.generate(
        [
          { role: 'system', content: '你是剧本场记/逻辑校对。检查场景之间的时间、地点、角色出场是否矛盾。输出 JSON 数组，每项 {scene_title, issue}。不要输出 JSON 以外的任何内容。' },
          { role: 'user', content: JSON.stringify({ project: project.title, scenes: scenes.map((s) => ({ ...s, cast: castMap[s.id] || [] })) }) },
        ],
        () => JSON.stringify(buildLocal().map((i) => ({ scene_title: i.scene.title, issue: i.text }))),
        { temperature: 0.4 }
      );

      let issues;
      try {
        const parsed = JSON.parse(String(out.text).replace(/^```(?:json)?|```$/g, '').trim());
        issues = Array.isArray(parsed) ? parsed : buildLocal().map((i) => ({ scene_title: i.scene.title, issue: i.text }));
      } catch {
        issues = buildLocal().map((i) => ({ scene_title: i.scene.title, issue: i.text }));
      }

      // 落库：每条问题写一条 notes(kind='todo', source='ai')；
      // 同一场景已有未处理待办时跳过，避免反复检查堆重复项。
      const byTitle = scenes.reduce((m, s) => ((m[s.title] = s), m), {});
      const insNote = db.prepare(`INSERT INTO notes (user_id,project_id,scene_id,title,content,kind,status,source) VALUES (?,?,?,?,?,?,?,?)`);
      const existing = db.prepare("SELECT title FROM notes WHERE project_id = ? AND source = 'ai' AND status = 'open'")
        .all(projectId).map((n) => n.title);
      const createdIds = [];
      issues.slice(0, 20).forEach((it) => {
        const title = `逻辑检查：${it.scene_title || '全局'}`;
        if (existing.includes(title)) return;
        const scene = byTitle[it.scene_title];
        const info = insNote.run(
          req.user.id, projectId, scene ? scene.id : null,
          title, String(it.issue || ''), 'todo', 'open', 'ai'
        );
        createdIds.push(info.lastInsertRowid);
      });

      const notes = createdIds.length
        ? db.prepare(`SELECT * FROM notes WHERE id IN (${createdIds.map(() => '?').join(',')})`).all(...createdIds)
        : [];
      return ok(res, { source: out.source, issues, notes, text: out.text },
        `检查完成，${notes.length} 条问题已写入创作笔记待办`);
    } catch (e) {
      return fail(res, 500, 'AI 服务异常：' + e.message);
    }
  });

  // 领域路由先挂载（含 /characters/relations、/storylines 聚合读、/review/*、/ai/*）
  app.use(api, domain);

  // 角色 / 故事线的通用 CRUD 骨架挂在其后，领域路由已处理的路径不会走到这里
  app.use(`${api}/characters`, requireAuth, scopedCrud({
    db, table: 'characters',
    fields: ['project_id', 'name', 'age', 'identity', 'personality', 'goal', 'arc', 'avatar', 'bio'],
    required: ['project_id', 'name'],
    searchable: ['name', 'identity', 'personality', 'goal'],
    filterable: ['project_id'],
    orderBy: 'id ASC',
    numberFields: ['project_id'],
    scopeAll: seeAll,
    ...own,
  }));

  app.use(`${api}/storylines`, requireAuth, scopedCrud({
    db, table: 'storylines',
    fields: ['project_id', 'code', 'title', 'kind', 'summary'],
    required: ['project_id', 'title'],
    searchable: ['title', 'summary'],
    filterable: ['project_id', 'code', 'kind'],
    orderBy: 'code ASC, id ASC',
    numberFields: ['project_id'],
    scopeAll: seeAll,
    ...own,
  }));
}

module.exports = { mountRoutes };
