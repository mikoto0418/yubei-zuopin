// 统一请求封装：自动带 token、统一解包 {code,data,message}、401 清登录态。
const TOKEN_KEY = 'lt_token'
const USER_KEY = 'lt_user'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY) || '',
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },
}

export const userStore = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    } catch {
      return null
    }
  },
  set(u) {
    localStorage.setItem(USER_KEY, JSON.stringify(u))
  },
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

async function request(method, path, { body, query, auth = true } = {}) {
  let url = `/api${path}`
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams()
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v)
    })
    const s = qs.toString()
    if (s) url += `?${s}`
  }

  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const t = tokenStore.get()
    if (t) headers['Authorization'] = `Bearer ${t}`
  }

  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('网络连接失败，请检查后端服务是否已启动', 0)
  }

  let payload = null
  const text = await res.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (res.status === 401) {
    tokenStore.clear()
    if (onUnauthorized) onUnauthorized()
    throw new ApiError(payload?.message || '登录已过期，请重新登录', 401)
  }

  if (!res.ok || (payload && payload.code !== 0)) {
    throw new ApiError(payload?.message || `请求失败（${res.status}）`, res.status)
  }

  return payload ? payload.data : null
}

export const api = {
  get: (p, opts) => request('GET', p, opts),
  post: (p, body, opts) => request('POST', p, { ...opts, body }),
  put: (p, body, opts) => request('PUT', p, { ...opts, body }),
  patch: (p, body, opts) => request('PATCH', p, { ...opts, body }),
  del: (p, opts) => request('DELETE', p, opts),

  // —— 认证 ——
  login: (username, password) =>
    request('POST', '/auth/login', { body: { username, password }, auth: false }),
  register: (payload) => request('POST', '/auth/register', { body: payload, auth: false }),
  me: () => request('GET', '/auth/me'),
  updateMe: (payload) => request('PUT', '/auth/me', { body: payload }),

  // —— 运单 ——
  waybills: (query) => request('GET', '/waybills', { query }),
  waybill: (id) => request('GET', `/waybills/${id}`),
  createWaybill: (body) => request('POST', '/waybills', { body }),
  updateWaybill: (id, body) => request('PUT', `/waybills/${id}`, { body }),
  deleteWaybill: (id) => request('DELETE', `/waybills/${id}`),
  timeline: (id) => request('GET', `/waybills/${id}/timeline`),
  changeStatus: (id, body) => request('PATCH', `/waybills/${id}/status`, { body }),
  scan: (id, body) => request('POST', `/waybills/${id}/scan`, { body }),
  nextStatus: (id) => request('GET', `/waybills/${id}/next`),
  scans: (id, query) => request('GET', `/waybills/${id}/scans`, { query }),

  // —— 异常件 ——
  exceptions: (query) => request('GET', '/exceptions', { query }),
  exception: (id) => request('GET', `/exceptions/${id}`),
  exceptionStats: () => request('GET', '/exceptions/stats'),
  createException: (body) => request('POST', '/exceptions', { body }),
  resolveException: (id, body) => request('POST', `/exceptions/${id}/resolve`, { body }),
  closeException: (id, body) => request('POST', `/exceptions/${id}/close`, { body }),
  exceptionActions: () => request('GET', '/exceptions/meta/actions'),

  // —— 运营 ——
  dispatchPending: (query) => request('GET', '/ops/dispatch/pending', { query }),
  dispatchAssign: (body) => request('POST', '/ops/dispatch/assign', { body }),
  dispatchUnassign: (body) => request('POST', '/ops/dispatch/unassign', { body }),
  dispatchSummary: () => request('GET', '/ops/dispatch/summary'),
  dashboard: (query) => request('GET', '/ops/dashboard', { query }),
  notifications: (query) => request('GET', '/ops/notifications', { query }),
  unreadCount: () => request('GET', '/ops/notifications/unread-count'),
  readNotification: (id) => request('PATCH', `/ops/notifications/${id}/read`),
  readAllNotifications: () => request('POST', '/ops/notifications/read-all'),
  statusMeta: () => request('GET', '/ops/meta/statuses'),
  options: () => request('GET', '/ops/meta/options'),
  fleetTasks: () => request('GET', '/ops/fleet/tasks'),

  // —— AI ——
  aiEta: (body) => request('POST', '/ai/eta', { body }),
  aiDetectStale: (body) => request('POST', '/ai/detect-stale', { body }),
  aiOptimizeRoute: (body) => request('POST', '/ai/optimize-route', { body }),

  // —— 通用实体 CRUD ——
  list: (table, query) => request('GET', `/entities/${table}`, { query }),
  one: (table, id) => request('GET', `/entities/${table}/${id}`),
  create: (table, body) => request('POST', `/entities/${table}`, { body }),
  update: (table, id, body) => request('PUT', `/entities/${table}/${id}`, { body }),
  remove: (table, id) => request('DELETE', `/entities/${table}/${id}`),

  // —— Admin ——
  overview: () => request('GET', '/admin/overview'),
  users: () => request('GET', '/admin/users'),
}
