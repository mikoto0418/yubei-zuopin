// 统一请求封装：自动带 token、统一解包 {code,data,message}、401 自动登出。
// localStorage 前缀固定为 ig_（ig_token / ig_user）。
const PREFIX = 'ig';

export const TOKEN_KEY = `${PREFIX}_token`;
export const USER_KEY = `${PREFIX}_user`;

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveAuth(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token || '');
    localStorage.setItem(USER_KEY, JSON.stringify(user || null));
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }
}

export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* 忽略 */
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status || 0;
  }
}

let unauthorizedHandler = null;

/** 注册 401 处理（由 AuthProvider 注入：清登录态 + 跳登录页） */
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

function buildQuery(query) {
  if (!query) return '';
  const sp = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function request(path, options = {}) {
  const { method = 'GET', body, query } = options;
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}${buildQuery(query)}`, init);
  } catch {
    throw new ApiError('网络连接失败，请确认后端服务已在 4203 端口启动', 0);
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (res.status === 401) {
    clearAuth();
    if (unauthorizedHandler) unauthorizedHandler();
    throw new ApiError((payload && payload.message) || '登录已过期，请重新登录', 401);
  }
  if (res.status === 403) {
    throw new ApiError((payload && payload.message) || '无权限访问该资源', 403);
  }
  if (!res.ok || !payload || payload.code !== 0) {
    throw new ApiError((payload && payload.message) || `请求失败（HTTP ${res.status}）`, res.status);
  }
  return payload.data;
}

export const api = {
  // 认证
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: { username, password } }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),
  updateMe: (payload) => request('/auth/me', { method: 'PUT', body: payload }),

  // 实体 CRUD
  list: (table, query) => request(`/entities/${table}`, { query }),
  get: (table, id) => request(`/entities/${table}/${id}`),
  create: (table, body) => request(`/entities/${table}`, { method: 'POST', body }),
  update: (table, id, body) => request(`/entities/${table}/${id}`, { method: 'PUT', body }),
  remove: (table, id) => request(`/entities/${table}/${id}`, { method: 'DELETE' }),

  // 管理端
  adminOverview: () => request('/admin/overview'),
  adminUsers: () => request('/admin/users'),
  adminDomainStats: () => request('/admin/domain-stats'),

  // AI
  aiAsk: (body) => request('/ai/ask', { method: 'POST', body }),
  aiEvaluate: (body) => request('/ai/evaluate', { method: 'POST', body }),
  aiAnalyzeAnswer: (body) => request('/ai/analyze-answer', { method: 'POST', body }),
  aiPracticePlan: (body) => request('/ai/practice-plan', { method: 'POST', body }),

  // 岗位库 / 题库
  positions: (query) => request('/entities/positions', { query }),
  createPosition: (body) => request('/entities/positions', { method: 'POST', body }),
  updatePosition: (id, body) => request(`/entities/positions/${id}`, { method: 'PUT', body }),
  removePosition: (id) => request(`/entities/positions/${id}`, { method: 'DELETE' }),
  categories: (query) => request('/entities/categories', { query }),
  createCategory: (body) => request('/entities/categories', { method: 'POST', body }),
  bank: (query) => request('/bank', { query }),
  bankDetail: (id) => request(`/bank/${id}`),
  createQuestion: (body) => request('/bank', { method: 'POST', body }),
  updateQuestion: (id, body) => request(`/bank/${id}`, { method: 'PUT', body }),
  removeQuestion: (id) => request(`/bank/${id}`, { method: 'DELETE' }),

  // 会话 / 轮次 / 详情
  sessionDetail: (id) => request(`/sessions/${id}/detail`),
  transitionSession: (id, to) => request(`/sessions/${id}/transition`, { method: 'POST', body: { to } }),
  rounds: (query) => request('/entities/rounds', { query }),

  // 技能雷达 / 报告 / 练习计划
  skillRadar: (query) => request('/skill-radar', { query }),
  writeSkills: (sessionId) => request(`/reports/${sessionId}/skills`, { method: 'POST', body: {} }),
  plans: (query) => request('/entities/plans', { query }),
  updatePlanProgress: (id, body) => request(`/plans/${id}/progress`, { method: 'PUT', body }),
  removePlan: (id) => request(`/entities/plans/${id}`, { method: 'DELETE' }),
  analyses: (query) => request('/entities/analyses', { query }),
};

export default api;
