// 鉴权上下文：持有当前用户、提供登录/注册/登出，并监听 401 自动登出。
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearAuth, getStoredUser, getToken, setStoredUser, setToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [ready, setReady] = useState(false);

  // 启动时若有 token，拉一次 /auth/me 校验有效性。
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getToken()) { setReady(true); return; }
      try {
        const me = await api.me();
        if (alive) { setUser(me); setStoredUser(me); }
      } catch {
        if (alive) { clearAuth(); setUser(null); }
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // 任意请求返回 401 时统一登出。
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('kf:unauthorized', onUnauthorized);
    return () => window.removeEventListener('kf:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    setToken(data.token);
    setStoredUser(data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api.register(payload);
    setToken(data.token);
    setStoredUser(data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    login,
    register,
    logout,
    isAdmin: user?.role === 'admin',
    isChef: user?.role === 'chef',
    isWaiter: user?.role === 'waiter',
  }), [user, ready, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
