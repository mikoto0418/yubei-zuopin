require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = require('./db');
const { sign, auth, adminOnly } = require('./middleware');
const { polish, generateWeeklyReport, polishResume } = require('./ai');
const { ok, fail, parsePage } = require('./http');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 请求日志
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ============ 通用工具 ============
// 活动流：记录关键操作，绝不因日志失败影响主流程
function logActivity(userId, type, targetType, targetId, summary, meta = {}) {
  try {
    db.prepare(
      'INSERT INTO activities (user_id, type, target_type, target_id, summary, meta) VALUES (?,?,?,?,?,?)'
    ).run(userId, type, targetType || '', targetId == null ? null : targetId, summary || '', JSON.stringify(meta || {}));
  } catch (e) {
    console.warn('[activity] 写入失败：' + e.message);
  }
}

function parseJson(text, fallback) {
  try {
    const v = JSON.parse(text || 'null');
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

// 标签：写 notes.tags 字符串（保持搜索兼容）+ 维护 tags / note_tags 多对多
function syncNoteTags(userId, noteId, tagNames) {
  const names = [...new Set((Array.isArray(tagNames) ? tagNames : []).map((t) => String(t).trim()).filter(Boolean))].slice(0, 20);
  const upsertTag = db.prepare('INSERT OR IGNORE INTO tags (user_id, name) VALUES (?,?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE user_id=? AND name=?');
  const link = db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?,?)');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM note_tags WHERE note_id=?').run(noteId);
    for (const name of names) {
      upsertTag.run(userId, name);
      const t = findTag.get(userId, name);
      if (t) link.run(noteId, t.id);
    }
  });
  tx();
  db.prepare('UPDATE notes SET tags=? WHERE id=?').run(names.join(','), noteId);
  return names;
}

// 标签云：附上使用次数
function tagsWithCount(userId) {
  return db
    .prepare(
      `SELECT t.id, t.name, t.color,
              (SELECT COUNT(*) FROM note_tags nt JOIN notes n ON n.id = nt.note_id
                WHERE nt.tag_id = t.id AND n.user_id = t.user_id) AS count
         FROM tags t WHERE t.user_id=? ORDER BY count DESC, t.name ASC`
    )
    .all(userId);
}

// 笔记版本快照：每次保存生成一版，仅保留最近 20 版
const MAX_VERSIONS = 20;
function snapshotNote(noteId, userId, changeNote = '') {
  const n = db.prepare('SELECT * FROM notes WHERE id=?').get(noteId);
  if (!n) return null;
  const last = db.prepare('SELECT MAX(version) v FROM note_versions WHERE note_id=?').get(noteId);
  const version = (last && last.v ? last.v : 0) + 1;
  db.prepare(
    'INSERT INTO note_versions (note_id, user_id, version, title, content, tags, change_note) VALUES (?,?,?,?,?,?,?)'
  ).run(noteId, userId, version, n.title || '', n.content || '', n.tags || '', changeNote);
  // 修剪：只保留最近 20 版
  db.prepare(
    `DELETE FROM note_versions WHERE note_id=? AND id NOT IN (
       SELECT id FROM note_versions WHERE note_id=? ORDER BY version DESC LIMIT ?
     )`
  ).run(noteId, noteId, MAX_VERSIONS);
  return version;
}

function noteWithTags(row) {
  if (!row) return row;
  row.tags = (row.tags || '').split(',').filter(Boolean);
  row.favorite = !!row.favorite;
  return row;
}

// 简易行级 diff（LCS），用于版本对比
function diffLines(aText, bText) {
  const a = String(aText || '').split('\n');
  const b = String(bText || '').split('\n');
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i++; }
    else { out.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < n) { out.push({ type: 'del', text: a[i++] }); }
  while (j < m) { out.push({ type: 'add', text: b[j++] }); }
  return out;
}

// ============ 简历状态机 ============
// draft（草稿）→ polished（已润色）→ final（已定稿，锁定编辑）
const RESUME_STATUS = ['draft', 'polished', 'final'];
const RESUME_TRANSITIONS = {
  draft: ['polished'],
  polished: ['draft', 'final'],
  final: ['polished'], // 定稿后允许回退解锁，回退即解除编辑锁定
};
const STATUS_LABEL = { draft: '草稿', polished: '已润色', final: '已定稿' };

function normalizeStatus(s) {
  // 兼容旧数据 'ready'
  return s === 'ready' ? 'polished' : s;
}

function resumeExperiences(resumeId) {
  const rows = db
    .prepare('SELECT * FROM resume_experiences WHERE resume_id=? ORDER BY sort_order ASC, id ASC')
    .all(resumeId);
  return rows.map((r) => ({ ...r, highlights: parseJson(r.highlights, []) }));
}

function resumeOut(r, withExperiences = true) {
  if (!r) return r;
  const out = {
    ...r,
    skills: parseJson(r.skills, []),
    status: normalizeStatus(r.status),
    status_label: STATUS_LABEL[normalizeStatus(r.status)] || '草稿',
  };
  if (withExperiences) {
    const exps = resumeExperiences(r.id);
    // 若结构化表为空，回退到旧 JSON 列，保证老数据仍可读
    out.experiences = exps.length ? exps : parseJson(r.experiences, []);
  } else {
    delete out.experiences;
  }
  return out;
}

function assertResumeEditable(r) {
  if (normalizeStatus(r.status) === 'final') {
    return '简历已定稿并锁定，如需修改请先回退为「已润色」';
  }
  return null;
}

// ============ 健康检查 ============
app.get('/api/health', (_req, res) => ok(res, { service: 'scholarboard', time: new Date().toISOString() }));

// ============ 认证 ============
const USERNAME_RE = /^[\w一-龥]{2,24}$/;

app.post('/api/auth/register', (req, res) => {
  const { username, password, nickname = '' } = req.body || {};
  if (!username || !String(username).trim()) return fail(res, 400, '用户名不能为空');
  if (!USERNAME_RE.test(username)) return fail(res, 400, '用户名需为 2-24 位字母、数字、下划线或中文');
  if (!password) return fail(res, 400, '密码不能为空');
  if (String(password).length < 6) return fail(res, 400, '密码至少 6 位');
  if (String(password).length > 64) return fail(res, 400, '密码最长 64 位');
  if (nickname && String(nickname).length > 24) return fail(res, 400, '昵称最长 24 个字符');

  const exists = db.prepare('SELECT id FROM users WHERE username=?').get(username);
  if (exists) return fail(res, 409, '用户名已存在');

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (username, password, role, nickname) VALUES (?,?,?,?)')
    .run(username, hash, 'user', nickname || username);
  const user = db.prepare('SELECT id,username,role,nickname,avatar FROM users WHERE id=?').get(info.lastInsertRowid);
  const token = sign({ id: user.id, username: user.username, role: user.role });
  logActivity(user.id, 'register', 'user', user.id, `注册了账号 ${user.username}`);
  return ok(res, { token, user }, '注册成功', 201);
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return fail(res, 400, '请输入用户名和密码');
  const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return fail(res, 401, '用户名或密码错误');
  }
  const token = sign({ id: user.id, username: user.username, role: user.role });
  return ok(res, {
    token,
    user: { id: user.id, username: user.username, role: user.role, nickname: user.nickname, avatar: user.avatar },
  });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db
    .prepare('SELECT id,username,role,nickname,avatar,created_at FROM users WHERE id=?')
    .get(req.user.id);
  if (!user) return fail(res, 404, '用户不存在');
  return ok(res, { user });
});

app.post('/api/auth/logout', auth, (_req, res) => ok(res, { ok: true }));

app.put('/api/auth/me', auth, (req, res) => {
  const { nickname, avatar } = req.body || {};
  const fields = [];
  const vals = [];
  if (nickname !== undefined) {
    if (String(nickname).length > 24) return fail(res, 400, '昵称最长 24 个字符');
    fields.push('nickname=?');
    vals.push(String(nickname).trim());
  }
  if (avatar !== undefined) {
    if (String(avatar).length > 8) return fail(res, 400, '头像字符最长 8 个字符');
    fields.push('avatar=?');
    vals.push(String(avatar).trim());
  }
  if (fields.length === 0) return fail(res, 400, '没有需要更新的字段');
  vals.push(req.user.id);
  db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).run(...vals);
  const user = db.prepare('SELECT id,username,role,nickname,avatar FROM users WHERE id=?').get(req.user.id);
  logActivity(req.user.id, 'update', 'user', req.user.id, '更新了个人资料');
  return ok(res, { user });
});

// ============ 项目分组 ============
// GET /api/projects?page=&pageSize=&q=&archived=0|1|all
app.get('/api/projects', auth, (req, res) => {
  const { page, pageSize, offset } = parsePage(req, 50);
  const q = (req.query.q || '').trim();
  const archived = req.query.archived;

  let where = 'WHERE user_id=?';
  const params = [req.user.id];
  if (archived === '1' || archived === 'true') where += ' AND archived=1';
  else if (archived === '0' || archived === 'false') where += ' AND archived=0';
  if (q) { where += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  const total = db.prepare(`SELECT COUNT(*) c FROM projects ${where}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM notes n WHERE n.project_id = p.id) AS note_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count
         FROM projects p ${where.replace(/user_id/g, 'p.user_id')}
        ORDER BY p.archived ASC, p.updated_at DESC, p.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  rows.forEach((p) => { p.archived = !!p.archived; });
  return ok(res, { projects: rows, total, page, pageSize });
});

app.post('/api/projects', auth, (req, res) => {
  const { name = '', color = 'orange', description = '' } = req.body || {};
  if (!String(name).trim()) return fail(res, 400, '项目名称不能为空');
  if (String(name).length > 40) return fail(res, 400, '项目名称最长 40 个字符');
  const dup = db.prepare('SELECT id FROM projects WHERE user_id=? AND name=?').get(req.user.id, String(name).trim());
  if (dup) return fail(res, 409, '同名项目已存在');
  const info = db
    .prepare('INSERT INTO projects (user_id, name, color, description) VALUES (?,?,?,?)')
    .run(req.user.id, String(name).trim(), color, description);
  const p = db.prepare('SELECT * FROM projects WHERE id=?').get(info.lastInsertRowid);
  logActivity(req.user.id, 'create', 'project', p.id, `创建了项目「${p.name}」`);
  return ok(res, { project: { ...p, archived: !!p.archived, note_count: 0, task_count: 0 } }, '已创建', 201);
});

app.put('/api/projects/:id', auth, (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!p) return fail(res, 404, '项目不存在');
  const { name, color, description, archived } = req.body || {};
  if (name !== undefined && !String(name).trim()) return fail(res, 400, '项目名称不能为空');
  const set = [];
  const vals = [];
  if (name !== undefined) { set.push('name=?'); vals.push(String(name).trim()); }
  if (color !== undefined) { set.push('color=?'); vals.push(color); }
  if (description !== undefined) { set.push('description=?'); vals.push(description); }
  if (archived !== undefined) { set.push('archived=?'); vals.push(archived ? 1 : 0); }
  if (!set.length) return fail(res, 400, '没有需要更新的字段');
  set.push("updated_at=datetime('now','localtime')");
  vals.push(req.params.id, req.user.id);
  db.prepare(`UPDATE projects SET ${set.join(',')} WHERE id=? AND user_id=?`).run(...vals);
  const updated = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  logActivity(req.user.id, 'update', 'project', updated.id, `更新了项目「${updated.name}」`);
  return ok(res, { project: { ...updated, archived: !!updated.archived } }, '已更新');
});

app.delete('/api/projects/:id', auth, (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!p) return fail(res, 404, '项目不存在');
  db.prepare('DELETE FROM projects WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  logActivity(req.user.id, 'delete', 'project', p.id, `删除了项目「${p.name}」`);
  return ok(res, { ok: true }, '已删除');
});

// ============ 笔记 ============
// GET /api/notes?page=&pageSize=&q=&fav=1&project_id=&tag=
app.get('/api/notes', auth, (req, res) => {
  const { page, pageSize, offset } = parsePage(req);
  const q = (req.query.q || '').trim();
  const fav = req.query.fav;
  const projectId = req.query.project_id;
  const tag = (req.query.tag || '').trim();

  let where = 'WHERE n.user_id=?';
  const params = [req.user.id];
  if (fav === '1' || fav === 'true') where += ' AND n.favorite=1';
  if (projectId) { where += ' AND n.project_id=?'; params.push(projectId); }
  if (tag) {
    where += ' AND EXISTS (SELECT 1 FROM note_tags nt JOIN tags tg ON tg.id=nt.tag_id WHERE nt.note_id=n.id AND tg.name=?)';
    params.push(tag);
  }
  if (q) {
    where += ' AND (n.title LIKE ? OR n.content LIKE ? OR n.tags LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const total = db.prepare(`SELECT COUNT(*) c FROM notes n ${where}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT n.*, p.name AS project_name FROM notes n
         LEFT JOIN projects p ON p.id = n.project_id
         ${where} ORDER BY n.favorite DESC, n.updated_at DESC, n.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  rows.forEach(noteWithTags);
  return ok(res, { notes: rows, total, page, pageSize });
});

app.get('/api/notes/:id', auth, (req, res) => {
  const n = db
    .prepare(
      `SELECT n.*, p.name AS project_name FROM notes n
         LEFT JOIN projects p ON p.id = n.project_id
        WHERE n.id=? AND n.user_id=?`
    )
    .get(req.params.id, req.user.id);
  if (!n) return fail(res, 404, '笔记不存在');
  return ok(res, { note: noteWithTags(n), versions: db.prepare('SELECT COUNT(*) c FROM note_versions WHERE note_id=?').get(n.id).c });
});

app.post('/api/notes', auth, (req, res) => {
  const { title = '', content = '', tags = [], project_id = null } = req.body || {};
  if (!String(title).trim()) return fail(res, 400, '笔记标题不能为空');
  if (String(title).length > 80) return fail(res, 400, '标题最长 80 个字符');
  if (String(content).length > 20000) return fail(res, 400, '正文过长');
  if (project_id != null) {
    const p = db.prepare('SELECT id FROM projects WHERE id=? AND user_id=?').get(project_id, req.user.id);
    if (!p) return fail(res, 400, '项目不存在');
  }
  const info = db
    .prepare('INSERT INTO notes (user_id, project_id, title, content) VALUES (?,?,?,?)')
    .run(req.user.id, project_id, String(title).trim(), content);
  const id = info.lastInsertRowid;
  syncNoteTags(req.user.id, id, tags);
  snapshotNote(id, req.user.id, '创建笔记');
  const note = noteWithTags(db.prepare('SELECT * FROM notes WHERE id=?').get(id));
  logActivity(req.user.id, 'create', 'note', id, `新建笔记「${note.title}」`);
  return ok(res, { note }, '已保存', 201);
});

app.put('/api/notes/:id', auth, (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!note) return fail(res, 404, '笔记不存在');
  const { title, content, tags, favorite, project_id, change_note } = req.body || {};
  if (title !== undefined && String(title).trim().length === 0) return fail(res, 400, '笔记标题不能为空');
  if (title !== undefined && String(title).length > 80) return fail(res, 400, '标题最长 80 个字符');
  if (content !== undefined && String(content).length > 20000) return fail(res, 400, '正文过长');
  if (project_id !== undefined && project_id !== null) {
    const p = db.prepare('SELECT id FROM projects WHERE id=? AND user_id=?').get(project_id, req.user.id);
    if (!p) return fail(res, 400, '项目不存在');
  }

  // 内容变化前先留快照
  const contentChanged =
    (title !== undefined && String(title).trim() !== note.title) ||
    (content !== undefined && String(content) !== (note.content || ''));

  const set = [];
  const vals = [];
  if (title !== undefined) { set.push('title=?'); vals.push(String(title).trim()); }
  if (content !== undefined) { set.push('content=?'); vals.push(content); }
  if (favorite !== undefined) { set.push('favorite=?'); vals.push(favorite ? 1 : 0); }
  if (project_id !== undefined) { set.push('project_id=?'); vals.push(project_id); }
  if (!set.length && tags === undefined) return fail(res, 400, '没有需要更新的字段');
  if (set.length) {
    set.push("updated_at=datetime('now','localtime')");
    vals.push(req.params.id, req.user.id);
    db.prepare(`UPDATE notes SET ${set.join(',')} WHERE id=? AND user_id=?`).run(...vals);
  }
  if (tags !== undefined) syncNoteTags(req.user.id, note.id, tags);
  if (contentChanged) {
    snapshotNote(note.id, req.user.id, change_note || '编辑笔记');
    logActivity(req.user.id, 'update', 'note', note.id, `编辑笔记「${String(title || note.title).trim()}」`);
  }

  const updated = noteWithTags(db.prepare('SELECT * FROM notes WHERE id=?').get(req.params.id));
  return ok(res, { note: updated }, '已更新');
});

app.delete('/api/notes/:id', auth, (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!note) return fail(res, 404, '笔记不存在');
  db.prepare('DELETE FROM notes WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  logActivity(req.user.id, 'delete', 'note', note.id, `删除笔记「${note.title}」`);
  return ok(res, { ok: true }, '已删除');
});

// ---- 笔记版本历史 ----
app.get('/api/notes/:id/versions', auth, (req, res) => {
  const note = db.prepare('SELECT id,title FROM notes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!note) return fail(res, 404, '笔记不存在');
  const rows = db
    .prepare('SELECT id, note_id, version, title, change_note, created_at, length(content) AS size FROM note_versions WHERE note_id=? ORDER BY version DESC LIMIT ?')
    .all(req.params.id, MAX_VERSIONS);
  return ok(res, { versions: rows, total: rows.length, max_versions: MAX_VERSIONS });
});

app.get('/api/notes/:id/versions/:vid', auth, (req, res) => {
  const note = db.prepare('SELECT id FROM notes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!note) return fail(res, 404, '笔记不存在');
  const v = db.prepare('SELECT * FROM note_versions WHERE id=? AND note_id=?').get(req.params.vid, req.params.id);
  if (!v) return fail(res, 404, '版本不存在');
  v.tags = (v.tags || '').split(',').filter(Boolean);
  return ok(res, { version: v });
});

// 版本对比：与当前正文比较，或与另一版本比较（?against=<versionId>）
app.get('/api/notes/:id/versions/:vid/diff', auth, (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!note) return fail(res, 404, '笔记不存在');
  const v = db.prepare('SELECT * FROM note_versions WHERE id=? AND note_id=?').get(req.params.vid, req.params.id);
  if (!v) return fail(res, 404, '版本不存在');

  let target = { title: note.title, content: note.content, label: '当前版本' };
  if (req.query.against) {
    const other = db.prepare('SELECT * FROM note_versions WHERE id=? AND note_id=?').get(req.query.against, req.params.id);
    if (!other) return fail(res, 404, '用于对比的版本不存在');
    target = { title: other.title, content: other.content, label: `v${other.version}` };
  }

  return ok(res, {
    from: { id: v.id, version: v.version, title: v.title, label: `v${v.version}` },
    to: { id: req.query.against || null, version: req.query.against ? null : 'current', title: target.title, label: target.label },
    title_changed: v.title !== target.title,
    lines: diffLines(v.content, target.content),
  });
});

// 回滚：先把当前正文存为新快照（回滚本身可撤销），再套用目标版本内容
app.post('/api/notes/:id/versions/:vid/rollback', auth, (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!note) return fail(res, 404, '笔记不存在');
  const v = db.prepare('SELECT * FROM note_versions WHERE id=? AND note_id=?').get(req.params.vid, req.params.id);
  if (!v) return fail(res, 404, '版本不存在');

  const tx = db.transaction(() => {
    snapshotNote(note.id, req.user.id, `回滚前自动备份（v${v.version} 回滚）`);
    db.prepare("UPDATE notes SET title=?, content=?, updated_at=datetime('now','localtime') WHERE id=?")
      .run(v.title || note.title, v.content || '', note.id);
    syncNoteTags(req.user.id, note.id, (v.tags || '').split(',').filter(Boolean));
  });
  tx();

  const updated = noteWithTags(db.prepare('SELECT * FROM notes WHERE id=?').get(note.id));
  logActivity(req.user.id, 'rollback', 'note', note.id, `回滚笔记「${updated.title}」到 v${v.version}`);
  return ok(res, { note: updated, rolled_back_to: v.version }, `已回滚到 v${v.version}`);
});

// ============ 标签 ============
app.get('/api/tags', auth, (req, res) => ok(res, { tags: tagsWithCount(req.user.id) }));

app.post('/api/tags', auth, (req, res) => {
  const { name = '', color = 'orange' } = req.body || {};
  if (!String(name).trim()) return fail(res, 400, '标签名不能为空');
  if (String(name).length > 20) return fail(res, 400, '标签名最长 20 个字符');
  const exists = db.prepare('SELECT id FROM tags WHERE user_id=? AND name=?').get(req.user.id, String(name).trim());
  if (exists) return fail(res, 409, '标签已存在');
  const info = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?,?,?)').run(req.user.id, String(name).trim(), color);
  const t = db.prepare('SELECT * FROM tags WHERE id=?').get(info.lastInsertRowid);
  logActivity(req.user.id, 'create', 'tag', t.id, `新建标签「${t.name}」`);
  return ok(res, { tag: { ...t, count: 0 } }, '已创建', 201);
});

app.put('/api/tags/:id', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM tags WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!t) return fail(res, 404, '标签不存在');
  const { name, color } = req.body || {};
  const set = [];
  const vals = [];
  if (name !== undefined) { if (!String(name).trim()) return fail(res, 400, '标签名不能为空'); set.push('name=?'); vals.push(String(name).trim()); }
  if (color !== undefined) { set.push('color=?'); vals.push(color); }
  if (!set.length) return fail(res, 400, '没有需要更新的字段');
  vals.push(req.params.id, req.user.id);
  db.prepare(`UPDATE tags SET ${set.join(',')} WHERE id=? AND user_id=?`).run(...vals);
  // 同步笔记的冗余 tags 字符串
  const notes = db.prepare('SELECT note_id FROM note_tags WHERE tag_id=?').all(t.id);
  notes.forEach((n) => {
    const names = db
      .prepare('SELECT tg.name FROM note_tags nt JOIN tags tg ON tg.id=nt.tag_id WHERE nt.note_id=?')
      .all(n.note_id)
      .map((r) => r.name);
    db.prepare('UPDATE notes SET tags=? WHERE id=?').run(names.join(','), n.note_id);
  });
  const updated = db.prepare('SELECT * FROM tags WHERE id=?').get(req.params.id);
  return ok(res, { tag: updated }, '已更新');
});

app.delete('/api/tags/:id', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM tags WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!t) return fail(res, 404, '标签不存在');
  const noteIds = db.prepare('SELECT note_id FROM note_tags WHERE tag_id=?').all(t.id).map((r) => r.note_id);
  db.prepare('DELETE FROM tags WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  noteIds.forEach((nid) => {
    const names = db
      .prepare('SELECT tg.name FROM note_tags nt JOIN tags tg ON tg.id=nt.tag_id WHERE nt.note_id=?')
      .all(nid)
      .map((r) => r.name);
    db.prepare('UPDATE notes SET tags=? WHERE id=?').run(names.join(','), nid);
  });
  logActivity(req.user.id, 'delete', 'tag', t.id, `删除标签「${t.name}」`);
  return ok(res, { ok: true }, '已删除');
});

// 按标签筛选笔记
app.get('/api/tags/:id/notes', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM tags WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!t) return fail(res, 404, '标签不存在');
  const { page, pageSize, offset } = parsePage(req);
  const total = db
    .prepare('SELECT COUNT(*) c FROM note_tags nt JOIN notes n ON n.id=nt.note_id WHERE nt.tag_id=? AND n.user_id=?')
    .get(t.id, req.user.id).c;
  const rows = db
    .prepare(
      `SELECT n.* FROM note_tags nt JOIN notes n ON n.id = nt.note_id
        WHERE nt.tag_id=? AND n.user_id=? ORDER BY n.updated_at DESC LIMIT ? OFFSET ?`
    )
    .all(t.id, req.user.id, pageSize, offset);
  rows.forEach(noteWithTags);
  return ok(res, { tag: t, notes: rows, total, page, pageSize });
});

// ============ 简历 ============
app.get('/api/resumes', auth, (req, res) => {
  const { page, pageSize, offset } = parsePage(req);
  const q = (req.query.q || '').trim();
  const status = normalizeStatus((req.query.status || '').trim());

  let where = 'WHERE user_id=?';
  const params = [req.user.id];
  if (status && RESUME_STATUS.includes(status)) { where += ' AND status=?'; params.push(status); }
  if (q) { where += ' AND (title LIKE ? OR target_job LIKE ?)'; const like = `%${q}%`; params.push(like, like); }

  const total = db.prepare(`SELECT COUNT(*) c FROM resumes ${where}`).get(...params).c;
  const rows = db
    .prepare(`SELECT * FROM resumes ${where} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset)
    .map((r) => resumeOut(r, false));
  return ok(res, { resumes: rows, total, page, pageSize });
});

app.get('/api/resumes/:id', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!r) return fail(res, 404, '简历不存在');
  return ok(res, { resume: resumeOut(r) });
});

app.post('/api/resumes', auth, (req, res) => {
  const { title = '我的简历', target_job = '', skills = [], experiences = [] } = req.body || {};
  if (!String(title).trim()) return fail(res, 400, '简历标题不能为空');
  if (String(title).length > 60) return fail(res, 400, '简历标题最长 60 个字符');
  const info = db
    .prepare('INSERT INTO resumes (user_id, title, target_job, skills, experiences, status) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, String(title).trim(), target_job, JSON.stringify(skills || []), '[]', 'draft');
  const id = info.lastInsertRowid;
  if (Array.isArray(experiences) && experiences.length) {
    const ins = db.prepare(
      'INSERT INTO resume_experiences (resume_id, org, role, start_date, end_date, description, highlights, sort_order) VALUES (?,?,?,?,?,?,?,?)'
    );
    experiences.forEach((e, i) => {
      ins.run(id, e.org || '', e.role || '', e.start_date || e.year || '', e.end_date || '', e.description || e.desc || '', JSON.stringify(e.highlights || []), i);
    });
  }
  const r = db.prepare('SELECT * FROM resumes WHERE id=?').get(id);
  logActivity(req.user.id, 'create', 'resume', id, `新建简历「${r.title}」`);
  return ok(res, { resume: resumeOut(r) }, '已创建', 201);
});

app.put('/api/resumes/:id', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!r) return fail(res, 404, '简历不存在');

  const { title, target_job, skills, polished, status } = req.body || {};
  const cur = normalizeStatus(r.status);

  // 状态机校验
  if (status !== undefined) {
    const next = normalizeStatus(status);
    if (!RESUME_STATUS.includes(next)) return fail(res, 400, '非法状态');
    if (next !== cur) {
      const allowed = RESUME_TRANSITIONS[cur] || [];
      if (!allowed.includes(next)) {
        return fail(res, 400, `非法状态流转：${STATUS_LABEL[cur]} → ${STATUS_LABEL[next] || next}`);
      }
    }
  }

  // 定稿后锁定编辑（仅允许状态回退）
  const editing = title !== undefined || target_job !== undefined || skills !== undefined || polished !== undefined;
  if (cur === 'final' && editing && normalizeStatus(status || cur) === 'final') {
    return fail(res, 400, assertResumeEditable(r));
  }

  if (title !== undefined && !String(title).trim()) return fail(res, 400, '简历标题不能为空');

  const set = [];
  const vals = [];
  if (title !== undefined) { set.push('title=?'); vals.push(String(title).trim()); }
  if (target_job !== undefined) { set.push('target_job=?'); vals.push(target_job); }
  if (skills !== undefined) { set.push('skills=?'); vals.push(JSON.stringify(skills || [])); }
  if (polished !== undefined) { set.push('polished=?'); vals.push(String(polished)); }
  if (status !== undefined) {
    const next = normalizeStatus(status);
    set.push('status=?');
    vals.push(next);
    if (next === 'final') set.push("finalized_at=datetime('now','localtime')");
  }
  if (!set.length) return fail(res, 400, '没有需要更新的字段');
  set.push("updated_at=datetime('now','localtime')");
  vals.push(req.params.id, req.user.id);
  db.prepare(`UPDATE resumes SET ${set.join(',')} WHERE id=? AND user_id=?`).run(...vals);

  const updated = db.prepare('SELECT * FROM resumes WHERE id=?').get(req.params.id);
  if (status !== undefined && normalizeStatus(status) !== cur) {
    logActivity(req.user.id, 'status', 'resume', updated.id, `简历「${updated.title}」状态：${STATUS_LABEL[cur]} → ${STATUS_LABEL[normalizeStatus(status)]}`);
  } else {
    logActivity(req.user.id, 'update', 'resume', updated.id, `更新简历「${updated.title}」`);
  }
  return ok(res, { resume: resumeOut(updated) }, '已更新');
});

app.delete('/api/resumes/:id', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!r) return fail(res, 404, '简历不存在');
  db.prepare('DELETE FROM resumes WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  logActivity(req.user.id, 'delete', 'resume', r.id, `删除简历「${r.title}」`);
  return ok(res, { ok: true }, '已删除');
});

// ---- 结构化经历 ----
function ownResume(req, res) {
  const r = db.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!r) { fail(res, 404, '简历不存在'); return null; }
  return r;
}

app.post('/api/resumes/:id/experiences', auth, (req, res) => {
  const r = ownResume(req, res);
  if (!r) return;
  const locked = assertResumeEditable(r);
  if (locked) return fail(res, 400, locked);
  const { org = '', role = '', start_date = '', end_date = '', description = '', highlights = [] } = req.body || {};
  if (!String(org).trim()) return fail(res, 400, '机构 / 项目不能为空');
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM resume_experiences WHERE resume_id=?').get(r.id).m;
  const info = db
    .prepare('INSERT INTO resume_experiences (resume_id, org, role, start_date, end_date, description, highlights, sort_order) VALUES (?,?,?,?,?,?,?,?)')
    .run(r.id, String(org).trim(), role, start_date, end_date, description, JSON.stringify(highlights || []), max + 1);
  db.prepare("UPDATE resumes SET updated_at=datetime('now','localtime') WHERE id=?").run(r.id);
  const e = db.prepare('SELECT * FROM resume_experiences WHERE id=?').get(info.lastInsertRowid);
  logActivity(req.user.id, 'create', 'experience', e.id, `为「${r.title}」新增经历 ${e.org}`);
  return ok(res, { experience: { ...e, highlights: parseJson(e.highlights, []) } }, '已添加', 201);
});

// 拖拽排序：order 为经历 id 数组。必须注册在 /:eid 之前，否则 'reorder' 会被当作经历 id 匹配。
app.put('/api/resumes/:id/experiences/reorder', auth, (req, res) => {
  const r = ownResume(req, res);
  if (!r) return;
  const locked = assertResumeEditable(r);
  if (locked) return fail(res, 400, locked);
  const { order } = req.body || {};
  if (!Array.isArray(order) || !order.length) return fail(res, 400, '请提供排序后的经历 id 数组');
  const owned = db.prepare('SELECT id FROM resume_experiences WHERE resume_id=?').all(r.id).map((x) => x.id);
  if (order.length !== owned.length || order.some((id) => !owned.includes(Number(id)))) {
    return fail(res, 400, '排序列表与现有经历不匹配');
  }
  const upd = db.prepare('UPDATE resume_experiences SET sort_order=? WHERE id=? AND resume_id=?');
  const tx = db.transaction(() => { order.forEach((id, i) => upd.run(i, Number(id), r.id)); });
  tx();
  db.prepare("UPDATE resumes SET updated_at=datetime('now','localtime') WHERE id=?").run(r.id);
  logActivity(req.user.id, 'update', 'resume', r.id, `调整了「${r.title}」的经历顺序`);
  return ok(res, { experiences: resumeExperiences(r.id) }, '排序已保存');
});

app.put('/api/resumes/:id/experiences/:eid', auth, (req, res) => {
  const r = ownResume(req, res);
  if (!r) return;
  const locked = assertResumeEditable(r);
  if (locked) return fail(res, 400, locked);
  const e = db.prepare('SELECT * FROM resume_experiences WHERE id=? AND resume_id=?').get(req.params.eid, r.id);
  if (!e) return fail(res, 404, '经历不存在');
  const { org, role, start_date, end_date, description, highlights } = req.body || {};
  const set = [];
  const vals = [];
  if (org !== undefined) { if (!String(org).trim()) return fail(res, 400, '机构 / 项目不能为空'); set.push('org=?'); vals.push(String(org).trim()); }
  if (role !== undefined) { set.push('role=?'); vals.push(role); }
  if (start_date !== undefined) { set.push('start_date=?'); vals.push(start_date); }
  if (end_date !== undefined) { set.push('end_date=?'); vals.push(end_date); }
  if (description !== undefined) { set.push('description=?'); vals.push(description); }
  if (highlights !== undefined) { set.push('highlights=?'); vals.push(JSON.stringify(highlights || [])); }
  if (!set.length) return fail(res, 400, '没有需要更新的字段');
  vals.push(req.params.eid, r.id);
  db.prepare(`UPDATE resume_experiences SET ${set.join(',')} WHERE id=? AND resume_id=?`).run(...vals);
  db.prepare("UPDATE resumes SET updated_at=datetime('now','localtime') WHERE id=?").run(r.id);
  const updated = db.prepare('SELECT * FROM resume_experiences WHERE id=?').get(req.params.eid);
  logActivity(req.user.id, 'update', 'experience', updated.id, `更新了「${r.title}」中的经历 ${updated.org}`);
  return ok(res, { experience: { ...updated, highlights: parseJson(updated.highlights, []) } }, '已更新');
});

app.delete('/api/resumes/:id/experiences/:eid', auth, (req, res) => {
  const r = ownResume(req, res);
  if (!r) return;
  const locked = assertResumeEditable(r);
  if (locked) return fail(res, 400, locked);
  const e = db.prepare('SELECT * FROM resume_experiences WHERE id=? AND resume_id=?').get(req.params.eid, r.id);
  if (!e) return fail(res, 404, '经历不存在');
  db.prepare('DELETE FROM resume_experiences WHERE id=? AND resume_id=?').run(req.params.eid, r.id);
  logActivity(req.user.id, 'delete', 'experience', e.id, `删除了「${r.title}」中的经历 ${e.org}`);
  return ok(res, { ok: true }, '已删除');
});

// AI 润色：写入 resumes.polished + 结构化亮点写入 resume_experiences.highlights
app.post('/api/resumes/:id/polish', auth, async (req, res) => {
  const r = db.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!r) return fail(res, 404, '简历不存在');
  const locked = assertResumeEditable(r);
  if (locked) return fail(res, 400, locked);

  const skills = parseJson(r.skills, []);
  const experiences = resumeExperiences(r.id);

  try {
    const result = await polishResume({ target_job: r.target_job, skills, experiences });
    const tx = db.transaction(() => {
      db.prepare("UPDATE resumes SET polished=?, updated_at=datetime('now','localtime') WHERE id=?").run(result.polished, r.id);
      const upd = db.prepare('UPDATE resume_experiences SET highlights=? WHERE id=?');
      (result.highlights || []).forEach((h) => {
        const target = experiences[h.index];
        if (target && Array.isArray(h.points) && h.points.length) upd.run(JSON.stringify(h.points), target.id);
      });
      // 润色成功后进入 polished 状态（仅 draft 可自动流转）
      if (normalizeStatus(r.status) === 'draft') db.prepare('UPDATE resumes SET status=? WHERE id=?').run('polished', r.id);
    });
    tx();
    const updated = db.prepare('SELECT * FROM resumes WHERE id=?').get(r.id);
    logActivity(req.user.id, 'polish', 'resume', r.id, `AI 润色了简历「${updated.title}」`, { source: result.source });
    return ok(
      res,
      { resume: resumeOut(updated), polished: result.polished, source: result.source, downgrade: !!result.downgrade },
      '润色完成，原稿已保留'
    );
  } catch (e) {
    return fail(res, 500, '润色失败：' + e.message);
  }
});

// 一键应用：把润色产生的结构化亮点写回原稿（overwrite=true 时同时覆盖描述）
app.post('/api/resumes/:id/apply-polish', auth, (req, res) => {
  const r = db.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!r) return fail(res, 404, '简历不存在');
  const locked = assertResumeEditable(r);
  if (locked) return fail(res, 400, locked);
  if (!String(r.polished || '').trim()) return fail(res, 400, '尚未生成润色稿，无法应用');

  const { overwrite = false } = req.body || {};
  const exps = resumeExperiences(r.id);
  if (!exps.length) return fail(res, 400, '这份简历还没有经历条目，无法应用润色稿');

  const withHighlights = exps.filter((e) => (e.highlights || []).length);
  if (!withHighlights.length) return fail(res, 400, '润色稿尚未生成结构化亮点，请先执行 AI 润色');

  const upd = db.prepare('UPDATE resume_experiences SET description=?, highlights=? WHERE id=?');
  const tx = db.transaction(() => {
    exps.forEach((e) => {
      const pts = e.highlights || [];
      if (!pts.length) return;
      const desc = overwrite || !String(e.description || '').trim() ? pts.join('') : e.description;
      upd.run(desc, JSON.stringify(pts), e.id);
    });
  });
  tx();

  const updated = db.prepare('SELECT * FROM resumes WHERE id=?').get(r.id);
  logActivity(req.user.id, 'apply', 'resume', r.id, `把润色亮点应用到「${updated.title}」原稿`, { overwrite: !!overwrite });
  return ok(res, { resume: resumeOut(updated), applied: withHighlights.length }, '已应用到原稿');
});

// ============ 任务 ============
app.get('/api/tasks', auth, (req, res) => {
  const { page, pageSize, offset } = parsePage(req, 100);
  const q = (req.query.q || '').trim();
  const project = (req.query.project || '').trim();
  const projectId = req.query.project_id;
  const priority = (req.query.priority || '').trim();
  const done = req.query.done;

  let where = 'WHERE t.user_id=?';
  const params = [req.user.id];
  if (project) { where += ' AND t.project=?'; params.push(project); }
  if (projectId) { where += ' AND t.project_id=?'; params.push(projectId); }
  if (priority === 'high' || priority === 'medium' || priority === 'low') { where += ' AND t.priority=?'; params.push(priority); }
  if (done === '1' || done === 'true') where += ' AND t.done=1';
  if (done === '0' || done === 'false') where += ' AND t.done=0';
  if (q) { where += ' AND t.title LIKE ?'; params.push(`%${q}%`); }

  const total = db.prepare(`SELECT COUNT(*) c FROM tasks t ${where}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT t.*, p.name AS project_name FROM tasks t
         LEFT JOIN projects p ON p.id = t.project_id
         ${where} ORDER BY t.done ASC, t.priority DESC, t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  rows.forEach((t) => { t.done = !!t.done; });
  return ok(res, { tasks: rows, total, page, pageSize });
});

app.post('/api/tasks', auth, (req, res) => {
  const { title = '', project = '默认项目', priority = 'medium', due_date = '', done = false, project_id = null } = req.body || {};
  if (!String(title).trim()) return fail(res, 400, '任务内容不能为空');
  if (String(title).length > 120) return fail(res, 400, '任务内容最长 120 个字符');
  if (!['high', 'medium', 'low'].includes(priority)) return fail(res, 400, '非法优先级');
  if (project_id != null) {
    const p = db.prepare('SELECT id FROM projects WHERE id=? AND user_id=?').get(project_id, req.user.id);
    if (!p) return fail(res, 400, '项目不存在');
  }
  const info = db
    .prepare('INSERT INTO tasks (user_id, project_id, title, project, priority, due_date, done) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.id, project_id, String(title).trim(), project, priority, due_date, done ? 1 : 0);
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(info.lastInsertRowid);
  t.done = !!t.done;
  logActivity(req.user.id, 'create', 'task', t.id, `新建任务「${t.title}」`);
  return ok(res, { task: t }, '已创建', 201);
});

app.put('/api/tasks/:id', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!t) return fail(res, 404, '任务不存在');
  const { title, project, priority, due_date, done, project_id } = req.body || {};
  if (title !== undefined && !String(title).trim()) return fail(res, 400, '任务内容不能为空');
  if (priority !== undefined && !['high', 'medium', 'low'].includes(priority)) return fail(res, 400, '非法优先级');
  const set = [];
  const vals = [];
  if (title !== undefined) { set.push('title=?'); vals.push(String(title).trim()); }
  if (project !== undefined) { set.push('project=?'); vals.push(project); }
  if (priority !== undefined) { set.push('priority=?'); vals.push(priority); }
  if (due_date !== undefined) { set.push('due_date=?'); vals.push(due_date); }
  if (done !== undefined) { set.push('done=?'); vals.push(done ? 1 : 0); }
  if (project_id !== undefined) { set.push('project_id=?'); vals.push(project_id); }
  if (!set.length) return fail(res, 400, '没有需要更新的字段');
  set.push("updated_at=datetime('now','localtime')");
  vals.push(req.params.id, req.user.id);
  db.prepare(`UPDATE tasks SET ${set.join(',')} WHERE id=? AND user_id=?`).run(...vals);
  const updated = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  updated.done = !!updated.done;
  if (done !== undefined && !!t.done !== updated.done) {
    logActivity(req.user.id, updated.done ? 'complete' : 'reopen', 'task', updated.id, `${updated.done ? '完成' : '重新打开'}任务「${updated.title}」`);
  } else {
    logActivity(req.user.id, 'update', 'task', updated.id, `更新任务「${updated.title}」`);
  }
  return ok(res, { task: updated }, '已更新');
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!t) return fail(res, 404, '任务不存在');
  db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  logActivity(req.user.id, 'delete', 'task', t.id, `删除任务「${t.title}」`);
  return ok(res, { ok: true }, '已删除');
});

// ============ 附件 ============
app.get('/api/attachments', auth, (req, res) => {
  const { page, pageSize, offset } = parsePage(req, 50);
  const noteId = req.query.note_id;
  let where = 'WHERE user_id=?';
  const params = [req.user.id];
  if (noteId) { where += ' AND note_id=?'; params.push(noteId); }
  const total = db.prepare(`SELECT COUNT(*) c FROM attachments ${where}`).get(...params).c;
  const rows = db.prepare(`SELECT * FROM attachments ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  return ok(res, { attachments: rows, total, page, pageSize });
});

app.post('/api/attachments', auth, (req, res) => {
  const { filename = '', mime = 'application/octet-stream', size = 0, note_id = null } = req.body || {};
  if (!String(filename).trim()) return fail(res, 400, '文件名不能为空');
  if (String(filename).length > 120) return fail(res, 400, '文件名最长 120 个字符');
  if (note_id != null) {
    const n = db.prepare('SELECT id FROM notes WHERE id=? AND user_id=?').get(note_id, req.user.id);
    if (!n) return fail(res, 400, '关联笔记不存在');
  }
  const info = db
    .prepare('INSERT INTO attachments (user_id, note_id, filename, mime, size) VALUES (?,?,?,?,?)')
    .run(req.user.id, note_id, String(filename).trim(), mime, Number(size) || 0);
  const a = db.prepare('SELECT * FROM attachments WHERE id=?').get(info.lastInsertRowid);
  logActivity(req.user.id, 'create', 'attachment', a.id, `上传附件「${a.filename}」`);
  return ok(res, { attachment: a }, '已添加', 201);
});

app.delete('/api/attachments/:id', auth, (req, res) => {
  const a = db.prepare('SELECT * FROM attachments WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!a) return fail(res, 404, '附件不存在');
  db.prepare('DELETE FROM attachments WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  logActivity(req.user.id, 'delete', 'attachment', a.id, `删除附件「${a.filename}」`);
  return ok(res, { ok: true }, '已删除');
});

// ============ 活动流 ============
app.get('/api/activities', auth, (req, res) => {
  const { page, pageSize, offset } = parsePage(req, 20);
  const type = (req.query.type || '').trim();
  let where = 'WHERE user_id=?';
  const params = [req.user.id];
  if (type) { where += ' AND type=?'; params.push(type); }
  const total = db.prepare(`SELECT COUNT(*) c FROM activities ${where}`).get(...params).c;
  const rows = db
    .prepare(`SELECT * FROM activities ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  rows.forEach((a) => { a.meta = parseJson(a.meta, {}); });
  return ok(res, { activities: rows, total, page, pageSize });
});

// ============ AI 通用润色（笔记/任意文本） ============
app.post('/api/ai/polish', auth, async (req, res) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) return fail(res, 400, '请提供要润色的文本');
  try {
    const result = await polish(String(text));
    logActivity(req.user.id, 'polish', 'text', null, 'AI 润色了一段文本', { source: result.source });
    return ok(res, result);
  } catch (e) {
    return fail(res, 500, '润色失败：' + e.message);
  }
});

// ============ AI 学习周报 ============
app.post('/api/ai/weekly-report', auth, async (req, res) => {
  const { focus } = req.body || {};
  if (focus !== undefined && String(focus).length > 80) return fail(res, 400, '关注焦点最长 80 个字符');
  const tasks = db
    .prepare('SELECT title, project, priority, done FROM tasks WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 20')
    .all(req.user.id);
  const notes = db
    .prepare('SELECT title FROM notes WHERE user_id=? ORDER BY updated_at DESC, id DESC LIMIT 20')
    .all(req.user.id);
  try {
    const result = await generateWeeklyReport({ focus: focus || '', tasks, notes });
    logActivity(req.user.id, 'report', 'text', null, '生成了学习周报', { source: result.source });
    return ok(res, result);
  } catch (e) {
    return fail(res, 500, '生成周报失败：' + e.message);
  }
});

// ============ Admin：数据统计与仪表盘 ============
app.get('/api/admin/overview', auth, adminOnly, (_req, res) => {
  const wrap = (f) => { try { return f(); } catch { return 0; } };
  const stats = {
    totalUsers: wrap(() => db.prepare('SELECT COUNT(*) c FROM users').get().c),
    totalProjects: wrap(() => db.prepare('SELECT COUNT(*) c FROM projects').get().c),
    totalNotes: wrap(() => db.prepare('SELECT COUNT(*) c FROM notes').get().c),
    totalVersions: wrap(() => db.prepare('SELECT COUNT(*) c FROM note_versions').get().c),
    totalTags: wrap(() => db.prepare('SELECT COUNT(*) c FROM tags').get().c),
    totalTasks: wrap(() => db.prepare('SELECT COUNT(*) c FROM tasks').get().c),
    doneTasks: wrap(() => db.prepare('SELECT COUNT(*) c FROM tasks WHERE done=1').get().c),
    totalResumes: wrap(() => db.prepare('SELECT COUNT(*) c FROM resumes').get().c),
    finalResumes: wrap(() => db.prepare("SELECT COUNT(*) c FROM resumes WHERE status='final'").get().c),
    totalExperiences: wrap(() => db.prepare('SELECT COUNT(*) c FROM resume_experiences').get().c),
    totalAttachments: wrap(() => db.prepare('SELECT COUNT(*) c FROM attachments').get().c),
    totalActivities: wrap(() => db.prepare('SELECT COUNT(*) c FROM activities').get().c),
  };
  stats.taskCompletion = stats.totalTasks > 0 ? Math.round((stats.doneTasks / stats.totalTasks) * 100) : 0;
  return ok(res, { stats });
});

app.get('/api/admin/users-growth', auth, adminOnly, (_req, res) => {
  const rows = db
    .prepare(`SELECT substr(created_at,1,7) AS month, COUNT(*) AS cnt FROM users GROUP BY month ORDER BY month`)
    .all();
  return ok(res, { data: rows });
});

app.get('/api/admin/task-completion', auth, adminOnly, (_req, res) => {
  const rows = db
    .prepare(`SELECT priority, COUNT(*) AS total, SUM(done) AS done FROM tasks GROUP BY priority`)
    .all();
  return ok(res, { data: rows });
});

app.get('/api/admin/notes-trend', auth, adminOnly, (_req, res) => {
  const rows = db
    .prepare(`SELECT substr(created_at,1,7) AS month, COUNT(*) AS cnt FROM notes GROUP BY month ORDER BY month`)
    .all();
  return ok(res, { data: rows });
});

app.get('/api/admin/resume-status', auth, adminOnly, (_req, res) => {
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS cnt FROM resumes GROUP BY status`)
    .all();
  return ok(res, { data: rows });
});

app.get('/api/admin/activity-trend', auth, adminOnly, (_req, res) => {
  const rows = db
    .prepare(`SELECT substr(created_at,1,10) AS day, COUNT(*) AS cnt FROM activities GROUP BY day ORDER BY day`)
    .all();
  return ok(res, { data: rows });
});

app.get('/api/admin/top-users', auth, adminOnly, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.username, u.nickname,
                 (SELECT COUNT(*) FROM notes n WHERE n.user_id=u.id) AS notes,
                 (SELECT COUNT(*) FROM tasks t WHERE t.user_id=u.id) AS tasks,
                 (SELECT COUNT(*) FROM resumes r WHERE r.user_id=u.id) AS resumes,
                 (SELECT COUNT(*) FROM activities a WHERE a.user_id=u.id) AS activities
              FROM users u
              ORDER BY (notes + tasks + resumes) DESC
              LIMIT 8`
    )
    .all();
  return ok(res, { data: rows });
});

// ============ 静态资源服务 ============
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(dist));

app.use('/api', (_req, res) => fail(res, 404, '接口不存在'));

app.get('*', (req, res) => {
  res.sendFile(path.join(dist, 'index.html'), (err) => {
    if (err) res.status(404).json({ code: 404, message: '未找到前端构建产物，请先运行 npm run build（frontend）' });
  });
});

app.use((err, _req, res, _next) => {
  console.error('服务器异常：', err);
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return fail(res, 400, '请求体不是合法的 JSON');
  }
  return fail(res, 500, '服务器内部错误');
});

module.exports = app;
