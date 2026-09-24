import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore, userStore } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => userStore.get())
  const [booting, setBooting] = useState(() => !!tokenStore.get())
  const [kicked, setKicked] = useState(false)

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  // 401 全局处理：清登录态并标记被踢下线（由路由跳登录）
  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear()
      setUser(null)
      setKicked(true)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  // 启动时用 token 拉一次 /auth/me 校验登录态
  useEffect(() => {
    let alive = true
    if (!tokenStore.get()) {
      setBooting(false)
      return () => { alive = false }
    }
    api.me()
      .then((u) => {
        if (!alive) return
        setUser(u)
        userStore.set(u)
      })
      .catch(() => {
        if (!alive) return
        tokenStore.clear()
        setUser(null)
      })
      .finally(() => { if (alive) setBooting(false) })
    return () => { alive = false }
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password)
    tokenStore.set(data.token)
    userStore.set(data.user)
    setUser(data.user)
    setKicked(false)
    return data.user
  }, [])

  const register = useCallback(async (payload) => {
    const data = await api.register(payload)
    tokenStore.set(data.token)
    userStore.set(data.user)
    setUser(data.user)
    setKicked(false)
    return data.user
  }, [])

  const patchUser = useCallback((u) => {
    setUser(u)
    userStore.set(u)
  }, [])

  const value = useMemo(() => ({
    user,
    booting,
    kicked,
    clearKicked: () => setKicked(false),
    isAdmin: user?.role === 'admin',
    isDispatcher: user?.role === 'admin' || user?.role === 'dispatcher',
    login,
    register,
    logout,
    patchUser,
  }), [user, booting, kicked, login, register, logout, patchUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
