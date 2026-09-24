// 统一请求封装：自动携带 token、统一解包 {code,data,message}、401 自动登出。
const TOKEN_KEY = 'cl_token'
const USER_KEY = 'cl_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setAuth(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function setUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function isAdmin() {
  return getUser()?.role === 'admin'
}

function buildQuery(params) {
  if (!params) return ''
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    usp.append(k, v)
  })
  const s = usp.toString()
  return s ? `?${s}` : ''
}

async function request(path, { method = 'GET', body, params } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(`/api${path}${buildQuery(params)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    const err = new Error('网络连接失败，请检查后端服务是否已启动')
    err.status = 0
    throw err
  }

  let payload = null
  try {
    payload = await res.json()
  } catch {
    payload = null
  }

  if (res.status === 401) {
    clearAuth()
    window.dispatchEvent(new CustomEvent('cl:unauthorized'))
    const err = new Error(payload?.message || '登录已过期，请重新登录')
    err.status = 401
    throw err
  }

  if (!res.ok || !payload || payload.code !== 0) {
    const err = new Error(payload?.message || `请求失败（${res.status}）`)
    err.status = res.status
    throw err
  }

  return payload.data
}

export const api = {
  get: (p, params) => request(p, { params }),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  del: (p) => request(p, { method: 'DELETE' }),

  // 认证
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  me: () => request('/auth/me'),
  updateMe: (body) => request('/auth/me', { method: 'PUT', body }),

  // 实体
  list: (table, params) => request(`/entities/${table}`, { params }),
  one: (table, id) => request(`/entities/${table}/${id}`),
  create: (table, body) => request(`/entities/${table}`, { method: 'POST', body }),
  update: (table, id, body) => request(`/entities/${table}/${id}`, { method: 'PUT', body }),
  remove: (table, id) => request(`/entities/${table}/${id}`, { method: 'DELETE' }),

  // 工单（专属路由，含状态机）
  workOrders: (params) => request('/work-orders', { params }),
  workOrder: (id) => request(`/work-orders/${id}`),
  createWorkOrder: (body) => request('/work-orders', { method: 'POST', body }),
  transitionWorkOrder: (id, body) => request(`/work-orders/${id}/status`, { method: 'PATCH', body }),

  // 通知
  notifications: () => request('/notifications'),
  readNotification: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),

  // Admin
  overview: () => request('/admin/overview'),
  users: () => request('/admin/users'),

  // AI
  diagnoseFault: (id) => request(`/faults/${id}/diagnose`, { method: 'POST', body: {} }),
  aiDispatch: (body) => request('/ai/dispatch', { method: 'POST', body }),
  diagnose: (description, severity) => request('/ai/diagnose', { method: 'POST', body: { description, severity } }),
  planRoute: (facilities) => request('/ai/plan-route', { method: 'POST', body: { facilities } }),
}
