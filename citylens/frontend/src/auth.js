// 登录态 composable：全局单例，跨组件共享当前用户。
import { computed, reactive } from 'vue'
import { api, clearAuth, getToken, getUser, setAuth, setUser } from './api'

const state = reactive({
  user: getUser(),
  ready: false,
})

export function useAuth() {
  const isLoggedIn = computed(() => !!getToken())
  const isAdmin = computed(() => state.user?.role === 'admin')

  async function login(username, password) {
    const data = await api.login(username, password)
    setAuth(data.token, data.user)
    state.user = data.user
    return data.user
  }

  async function register(payload) {
    const data = await api.register(payload)
    setAuth(data.token, data.user)
    state.user = data.user
    return data.user
  }

  // 启动时用 token 换一次最新用户信息，失败则视为未登录
  async function refresh() {
    if (!getToken()) {
      state.ready = true
      return null
    }
    try {
      const user = await api.me()
      state.user = user
      setUser(user)
      return user
    } catch {
      return null
    } finally {
      state.ready = true
    }
  }

  function logout() {
    clearAuth()
    state.user = null
  }

  return { state, isLoggedIn, isAdmin, login, register, refresh, logout }
}
