// 统一请求封装：自动携带 token、统一解包 {code,data,message}、401 自动登出。
const TOKEN_KEY = 'sf_token'
const USER_KEY = 'sf_user'

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
    window.dispatchEvent(new CustomEvent('sf:unauthorized'))
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

  // 通用实体
  list: (table, params) => request(`/${table}`, { params }),
  one: (table, id) => request(`/${table}/${id}`),
  create: (table, body) => request(`/${table}`, { method: 'POST', body }),
  update: (table, id, body) => request(`/${table}/${id}`, { method: 'PUT', body }),
  remove: (table, id) => request(`/${table}/${id}`, { method: 'DELETE' }),

  // 作品结构
  projectFull: (id) => request(`/projects/${id}/full`),
  setProjectStatus: (id, status) => request(`/projects/${id}/status`, { method: 'PATCH', body: { status } }),
  setSceneStatus: (id, status) => request(`/scenes/${id}/status`, { method: 'PATCH', body: { status } }),

  // 角色关系
  relationGraph: (projectId) => request('/characters/relations', { params: { project_id: projectId } }),
  createRelation: (body) => request('/characters/relations', { method: 'POST', body }),
  removeRelation: (id) => request(`/characters/relations/${id}`, { method: 'DELETE' }),

  // 故事线
  storylines: (params) => request('/storylines', { params }),
  linkScene: (id, sceneId, note) => request(`/storylines/${id}/scenes`, { method: 'POST', body: { scene_id: sceneId, note } }),
  unlinkScene: (id, sceneId) => request(`/storylines/${id}/scenes/${sceneId}`, { method: 'DELETE' }),

  // 版本快照
  revisions: (sceneId) => request(`/scenes/${sceneId}/revisions`),
  snapshot: (sceneId, summary) => request(`/scenes/${sceneId}/revisions`, { method: 'POST', body: { summary } }),
  compare: (sceneId, a, b) => request(`/scenes/${sceneId}/revisions/compare`, { params: { a, b } }),
  rollback: (sceneId, version) => request(`/scenes/${sceneId}/revisions/${version}/rollback`, { method: 'POST' }),

  // 审阅台
  reviewQueue: (params) => request('/review/queue', { params }),
  reviewDecision: (id, decision, comment) => request(`/review/${id}/decision`, { method: 'POST', body: { decision, comment } }),

  // Admin
  overview: () => request('/admin/overview'),
  users: () => request('/admin/users'),

  // AI
  aiCharacterGen: (project_id, hint) => request('/ai/character-gen', { method: 'POST', body: { project_id, hint } }),
  aiPolishDialogue: (body) => request('/ai/polish-dialogue', { method: 'POST', body }),
  aiPlotSuggest: (project_id) => request('/ai/plot-suggest', { method: 'POST', body: { project_id } }),
  aiLogicCheck: (project_id) => request('/ai/logic-check', { method: 'POST', body: { project_id } }),
}
