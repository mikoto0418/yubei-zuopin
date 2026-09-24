// 统一的请求封装：
//  - 自动携带 token
//  - 后端统一响应 {code, data, message}，成功时自动解包返回 data
//  - 失败抛出带中文 message 的异常
const TOKEN_KEY = "edupulse_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* 非 JSON 响应 */
  }

  if (!res.ok || (data && data.code !== 0 && data.code !== undefined)) {
    // 失败：优先用后端中文 message
    const msg = (data && (data.message || data.msg)) || `请求失败(${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data && data.code;
    throw err;
  }

  // 成功且为统一结构时解包 data；否则原样返回（兼容非统一结构）
  return data && typeof data === "object" && "code" in data ? data.data : data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: "DELETE" }),
};