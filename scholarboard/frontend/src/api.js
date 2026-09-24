// 统一的 fetch 封装：带 token、JSON 序列化、错误处理
// 后端地址：dev 通过 vite 代理 /api -> 4102；生产由后端静态托管同源。

let token = localStorage.getItem('sb_token') || '';
let currentUser = null;

function isAuthed() {
  return !!token;
}

function getToken() {
  return token;
}

function setAuth(t, user) {
  token = t || '';
  currentUser = user || null;
  if (t) localStorage.setItem('sb_token', t);
  else localStorage.removeItem('sb_token');
  localStorage.setItem('sb_user', JSON.stringify(currentUser));
}

function getUser() {
  if (currentUser) return currentUser;
  try {
    return JSON.parse(localStorage.getItem('sb_user') || 'null');
  } catch {
    return null;
  }
}

async function request(method, url, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const init = { method, headers };
  if (body !== undefined && body !== null) init.body = JSON.stringify(body);

  let resp;
  try {
    resp = await fetch(url, init);
  } catch (e) {
    const err = new Error('网络异常，请确认后端已启动');
    err.offline = true;
    throw err;
  }

  let data = null;
  const text = await resp.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!resp.ok) {
    const msg = (data && (data.message || data.error)) ? (data.message || data.error) : '请求失败(' + resp.status + ')';
    if (resp.status === 401) setAuth('', null);
    const err = new Error(msg);
    err.status = resp.status;
    throw err;
  }
  return data && typeof data === 'object' && 'data' in data ? data.data : data;
}

function qs(params = {}) {
  const s = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
  return s ? '?' + s : '';
}

export const api = {
  request,
  token: getToken,
  isAuthed,
  setAuth,
  getUser,
  // 认证
  register: (p) => request('POST', '/api/auth/register', p),
  login: (p) => request('POST', '/api/auth/login', p),
  logout: () => request('POST', '/api/auth/logout'),
  me: () => request('GET', '/api/auth/me'),
  updateMe: (p) => request('PUT', '/api/auth/me', p),
  // 项目分组
  projects: (params) => request('GET', '/api/projects' + qs(params)),
  createProject: (p) => request('POST', '/api/projects', p),
  updateProject: (id, p) => request('PUT', `/api/projects/${id}`, p),
  deleteProject: (id) => request('DELETE', `/api/projects/${id}`),
  // 笔记
  notes: (params) => request('GET', '/api/notes' + qs(params)),
  note: (id) => request('GET', `/api/notes/${id}`),
  createNote: (p) => request('POST', '/api/notes', p),
  updateNote: (id, p) => request('PUT', `/api/notes/${id}`, p),
  deleteNote: (id) => request('DELETE', `/api/notes/${id}`),
  // 笔记版本
  noteVersions: (id) => request('GET', `/api/notes/${id}/versions`),
  noteVersion: (id, vid) => request('GET', `/api/notes/${id}/versions/${vid}`),
  noteVersionDiff: (id, vid, against) => request('GET', `/api/notes/${id}/versions/${vid}/diff` + qs({ against })),
  rollbackNote: (id, vid) => request('POST', `/api/notes/${id}/versions/${vid}/rollback`),
  // 标签
  tags: () => request('GET', '/api/tags'),
  createTag: (p) => request('POST', '/api/tags', p),
  updateTag: (id, p) => request('PUT', `/api/tags/${id}`, p),
  deleteTag: (id) => request('DELETE', `/api/tags/${id}`),
  tagNotes: (id, params) => request('GET', `/api/tags/${id}/notes` + qs(params)),
  // 简历
  resumes: (params) => request('GET', '/api/resumes' + qs(params)),
  resume: (id) => request('GET', `/api/resumes/${id}`),
  createResume: (p) => request('POST', '/api/resumes', p),
  updateResume: (id, p) => request('PUT', `/api/resumes/${id}`, p),
  deleteResume: (id) => request('DELETE', `/api/resumes/${id}`),
  resumePolish: (id) => request('POST', `/api/resumes/${id}/polish`),
  resumeApplyPolish: (id, p) => request('POST', `/api/resumes/${id}/apply-polish`, p || {}),
  // 结构化经历
  createExperience: (rid, p) => request('POST', `/api/resumes/${rid}/experiences`, p),
  updateExperience: (rid, eid, p) => request('PUT', `/api/resumes/${rid}/experiences/${eid}`, p),
  deleteExperience: (rid, eid) => request('DELETE', `/api/resumes/${rid}/experiences/${eid}`),
  reorderExperiences: (rid, order) => request('PUT', `/api/resumes/${rid}/experiences/reorder`, { order }),
  // 任务
  tasks: (params) => request('GET', '/api/tasks' + qs(params)),
  createTask: (p) => request('POST', '/api/tasks', p),
  updateTask: (id, p) => request('PUT', `/api/tasks/${id}`, p),
  deleteTask: (id) => request('DELETE', `/api/tasks/${id}`),
  // 附件
  attachments: (params) => request('GET', '/api/attachments' + qs(params)),
  createAttachment: (p) => request('POST', '/api/attachments', p),
  deleteAttachment: (id) => request('DELETE', `/api/attachments/${id}`),
  // 活动流
  activities: (params) => request('GET', '/api/activities' + qs(params)),
  // AI
  polish: (text) => request('POST', '/api/ai/polish', { text }),
  weeklyReport: (p) => request('POST', '/api/ai/weekly-report', p),
  // Admin
  adminOverview: () => request('GET', '/api/admin/overview'),
  adminUsersGrowth: () => request('GET', '/api/admin/users-growth'),
  adminTaskCompletion: () => request('GET', '/api/admin/task-completion'),
  adminNotesTrend: () => request('GET', '/api/admin/notes-trend'),
  adminResumeStatus: () => request('GET', '/api/admin/resume-status'),
  adminActivityTrend: () => request('GET', '/api/admin/activity-trend'),
  adminTopUsers: () => request('GET', '/api/admin/top-users'),
};

let messageApi = null;
export function bindMessage(m) {
  messageApi = m;
}

export function toast(msg) {
  if (messageApi) {
    messageApi.info(String(msg), { duration: 2200, closable: false });
    return;
  }
  const el = document.createElement('div');
  el.className = 'sb-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
