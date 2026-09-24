// 登录态 composable：全局单例，跨组件共享当前用户与角色判定。
import { computed, reactive } from 'vue'
import { api, clearAuth, getToken, getUser, setAuth, setUser } from './api'

const state = reactive({
  user: getUser(),
  ready: false,
})

export function useAuth() {
  const isLoggedIn = computed(() => !!getToken())
  const role = computed(() => state.user?.role || '')
  const isAdmin = computed(() => role.value === 'admin')
  const isEditor = computed(() => role.value === 'editor')
  // 责编与管理员可进审阅台
  const canReview = computed(() => ['admin', 'editor'].includes(role.value))

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

  return { state, isLoggedIn, role, isAdmin, isEditor, canReview, login, register, refresh, logout }
}
