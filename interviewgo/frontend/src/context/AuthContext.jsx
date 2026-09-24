import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearAuth, getStoredUser, getToken, saveAuth, setUnauthorizedHandler } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getToken());
  const [booting, setBooting] = useState(true);

  const logout = useCallback(() => {
    clearAuth();
    setToken('');
    setUser(null);
  }, []);

  // 401 由 api 层统一回调：清登录态即可，路由守卫会自动跳登录页
  useEffect(() => {
    setUnauthorizedHandler(() => logout());
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // 首屏用 token 校验一次登录态，避免过期 token 直接进主界面
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getToken()) {
        if (alive) setBooting(false);
        return;
      }
      try {
        const me = await api.me();
        if (!alive) return;
        setUser(me);
        saveAuth(getToken(), me);
      } catch {
        if (alive) logout();
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [logout]);

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    saveAuth(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api.register(payload);
    if (data && data.token) {
      saveAuth(data.token, data.user);
      setToken(data.token);
      setUser(data.user);
    }
    return data;
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const me = await api.updateMe(payload);
    saveAuth(getToken(), me);
    setUser(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      booting,
      isAuthenticated: Boolean(token),
      isAdmin: Boolean(user && user.role === 'admin'),
      login,
      register,
      logout,
      updateProfile,
    }),
    [user, token, booting, login, register, logout, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
