// 统一 API 封装：自动携带 token、统一解包 {code,data,message}、401 自动登出。
const TOKEN_KEY = 'kf_token';
const USER_KEY = 'kf_user';
const BASE = '/api';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* 隐私模式忽略 */ }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setStoredUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* 忽略 */ }
}

export function clearAuth() {
  setToken('');
  setStoredUser(null);
}

// 401 时广播登出事件，由 AuthContext 统一跳转登录页。
function broadcastLogout() {
  clearAuth();
  window.dispatchEvent(new CustomEvent('kf:unauthorized'));
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message || '请求失败');
    this.name = 'ApiError';
    this.status = status;
  }
}

// 底层请求：拼 query、带 token、解析统一响应体。
async function request(method, path, { body, params } = {}) {
  const url = new URL(BASE + path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url.pathname + url.search, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, '网络连接失败，请检查后端服务是否已启动');
  }

  let json = null;
  try { json = await res.json(); } catch { /* 非 JSON 响应 */ }

  if (res.status === 401) {
    broadcastLogout();
    throw new ApiError(401, (json && json.message) || '登录已过期，请重新登录');
  }
  if (!res.ok || (json && json.code !== 0)) {
    throw new ApiError(res.status, (json && json.message) || `请求失败（${res.status}）`);
  }
  return json ? json.data : null;
}

const get = (p, params) => request('GET', p, { params });
const post = (p, body) => request('POST', p, { body });
const put = (p, body) => request('PUT', p, { body });
const patch = (p, body) => request('PATCH', p, { body });
const del = (p) => request('DELETE', p);

// ---------- 领域接口 ----------
export const api = {
  // 认证
  login: (username, password) => post('/auth/login', { username, password }),
  register: (payload) => post('/auth/register', payload),
  me: () => get('/auth/me'),
  updateMe: (payload) => put('/auth/me', payload),

  // 概览
  overview: () => get('/admin/overview'),
  staff: () => get('/staff'),

  // 通用实体（分页 + 搜索 + 筛选）
  list: (entity, params) => get(`/entities/${entity}`, params),
  one: (entity, id) => get(`/entities/${entity}/${id}`),
  create: (entity, body) => post(`/entities/${entity}`, body),
  update: (entity, id, body) => put(`/entities/${entity}/${id}`, body),
  remove: (entity, id) => del(`/entities/${entity}/${id}`),

  // 订单专属
  orders: (params) => get('/orders', params),
  order: (id) => get(`/orders/${id}`),
  createOrder: (body) => post('/orders', body),
  setOrderStatus: (id, status, extra) => patch(`/orders/${id}/status`, { status, ...extra }),
  updateTask: (taskId, status) => patch(`/orders/tasks/${taskId}`, { status }),
  board: () => get('/orders/board'),

  // AI
  forecastDemand: () => post('/ai/forecast-demand', {}),
  prepList: () => post('/ai/prep-list', {}),
  detectAnomaly: () => post('/ai/detect-anomaly', {}),
};
