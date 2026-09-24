// 与后端 API 交互的统一封装。开发时走 Vite 代理 /api -> 4104；
// 生产(后端托管 dist 时)同源，也走 /api。
// 后端统一响应 { code, message, data }，这里在成功后直接解包返回 data。
const BASE = '/api';

function getToken() {
  return localStorage.getItem('hm_token') || '';
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body = options.body;
  if (body && typeof body !== 'string') body = JSON.stringify(body);

  const res = await fetch(BASE + path, { ...options, headers, body });
  let data;
  try { data = await res.json(); } catch (e) { data = { message: '响应解析失败' }; }
  if (!res.ok) {
    const err = new Error(data.message || `请求失败(${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data.data;
}

export const api = {
  get: (p) => request(p, { method: 'GET' }),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  delete: (p) => request(p, { method: 'DELETE' }),
};

export { getToken };
export default api;