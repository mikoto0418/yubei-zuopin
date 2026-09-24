import { reactive } from 'vue';
import api from './api.js';

// 全局用户状态（reactive，组件可直接 import）
const state = reactive({
  user: JSON.parse(localStorage.getItem('hm_user') || 'null'),
});

function setAuth({ token, user }) {
  localStorage.setItem('hm_token', token);
  localStorage.setItem('hm_user', JSON.stringify(user));
  state.user = user;
}

async function refreshMe() {
  try {
    const { user } = await api.get('/auth/me');
    state.user = user;
    localStorage.setItem('hm_user', JSON.stringify(user));
    return user;
  } catch (e) {
    logout();
    return null;
  }
}

function logout() {
  localStorage.removeItem('hm_token');
  localStorage.removeItem('hm_user');
  state.user = null;
}

export const store = { state, setAuth, refreshMe, logout };
export default store;