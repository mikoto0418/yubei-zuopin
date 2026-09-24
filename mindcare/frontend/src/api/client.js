const API = "/api";

function getToken() {
  return localStorage.getItem("mc_token") || "";
}

export function setSession(token, user) {
  localStorage.setItem("mc_token", token || "");
  localStorage.setItem("mc_user", JSON.stringify(user || {}));
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem("mc_user") || "{}");
  } catch {
    return {};
  }
}

export function clearSession() {
  localStorage.removeItem("mc_token");
  localStorage.removeItem("mc_user");
}

export async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch(API + path, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = (data && data.error) || "请求失败";
    if (res.status === 401) clearSession();
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

const qs = (params = {}) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") s.set(k, v);
  });
  const str = s.toString();
  return str ? "?" + str : "";
};

export const api = {
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  register: (body) => request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  me: () => request("/auth/me"),

  listMoods: (page = 1, size = 50) => request(`/moods${qs({ page, size })}`),
  addMood: (body) => request("/moods", { method: "POST", body: JSON.stringify(body) }),
  moodToday: (body) => request("/moods/today", { method: "POST", body: JSON.stringify(body) }),
  updateMood: (id, body) => request(`/moods/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteMood: (id) => request(`/moods/${id}`, { method: "DELETE" }),

  assessments: (page = 1, size = 20) => request(`/assessments${qs({ page, size })}`),
  submitAssessment: (body) => request("/assessments", { method: "POST", body: JSON.stringify(body) }),
  assessmentAnswers: (id) => request(`/assessments/${id}/answers`),

  moodTags: () => request("/mood-tags"),
  addMoodTag: (body) => request("/mood-tags", { method: "POST", body: JSON.stringify(body) }),
  updateMoodTag: (id, body) => request(`/mood-tags/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteMoodTag: (id) => request(`/mood-tags/${id}`, { method: "DELETE" }),

  generateQuiz: (body) => request("/ai/generate-quiz", { method: "POST", body: JSON.stringify(body) }),
  aiInsight: (focus) => request("/ai/insight", { method: "POST", body: JSON.stringify({ focus }) }),
  quizzes: () => request("/quizzes"),
  createQuiz: (body) => request("/quizzes", { method: "POST", body: JSON.stringify(body) }),
  deleteQuiz: (id) => request(`/quizzes/${id}`, { method: "DELETE" }),
  quizDetail: (id) => request(`/quizzes/${id}`),
  submitQuiz: (id, answers) => request(`/quizzes/${id}/submit`, { method: "POST", body: JSON.stringify({ answers }) }),
  quizSubmissions: (id) => request(`/quizzes/${id}/submissions`),

  meditation: (body) => request("/meditation", { method: "POST", body: JSON.stringify(body) }),

  chat: (message) => request("/chat", { method: "POST", body: JSON.stringify({ message }) }),
  chatHistory: () => request("/chat/history"),

  summary: () => request("/summary"),
  dashboard: () => request("/dashboard"),
  adminOverview: () => request("/admin/overview"),
  adminUsers: (params) => request(`/admin/users${qs(params)}`),

  // ---- 咨询师与预约 ----
  counselors: (params) => request(`/counselors${qs(params)}`),
  counselor: (id) => request(`/counselors/${id}`),
  appointments: (params) => request(`/appointments${qs(params)}`),
  appointmentStats: () => request("/appointments/stats"),
  createAppointment: (body) => request("/appointments", { method: "POST", body: JSON.stringify(body) }),
  transitionAppointment: (id, to) =>
    request(`/appointments/${id}/transition`, { method: "POST", body: JSON.stringify({ to }) }),
  reviewAppointment: (id, body) =>
    request(`/appointments/${id}/review`, { method: "POST", body: JSON.stringify(body) }),

  // ---- 危机预警 ----
  crisisAlerts: (params) => request(`/crisis-alerts${qs(params)}`),
  crisisAlert: (id) => request(`/crisis-alerts/${id}`),
  handleCrisisAlert: (id, body) =>
    request(`/crisis-alerts/${id}/handle`, { method: "POST", body: JSON.stringify(body) }),
  myCrisisAlerts: () => request("/crisis-alerts/mine"),

  // ---- 资源库 ----
  resources: (params) => request(`/resources${qs(params)}`),
  resource: (id) => request(`/resources/${id}`),
  collectResource: (id) => request(`/resources/${id}/collect`, { method: "POST" }),
  resourceProgress: (id, progress) =>
    request(`/resources/${id}/progress`, { method: "POST", body: JSON.stringify({ progress }) }),
  collectedResources: () => request("/resources/collected"),

  // ---- AI 周报 ----
  weeklyReport: () => request("/ai/weekly-report"),
  generateWeeklyReport: () => request("/ai/weekly-report", { method: "POST" }),
};
