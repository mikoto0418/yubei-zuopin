import { useEffect, useState } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';

import { buildTheme, prefersDark } from './theme';
import { AuthProvider } from './context/AuthContext';
import { SnackbarProvider } from './context/SnackbarContext';
import { ChatProvider } from './context/ChatContext';
import { RequireAdmin, RequireAuth } from './components/RouteGuards';
import Chat from './pages/Chat';
import Login from './pages/Login';
import History from './pages/History';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';
import Forbidden from './pages/Forbidden';
import Positions from './pages/Positions';
import Questions from './pages/Questions';
import Plans from './pages/Plans';
import Radar from './pages/Radar';
import SessionDetail from './pages/SessionDetail';

export default function App() {
  // 深色模式跟随系统，切换无闪烁（首帧即按偏好生成主题）
  const [dark, setDark] = useState(prefersDark());

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <ThemeProvider theme={buildTheme(dark)}>
      <CssBaseline />
      <SnackbarProvider>
        <AuthProvider>
          <ChatProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/403" element={<Forbidden />} />

              {/* 对话与领域页面（受保护） */}
              <Route element={<RequireAuth />}>
                <Route path="/" element={<Chat />} />
                <Route path="/history" element={<History />} />
                <Route path="/positions" element={<Positions />} />
                <Route path="/questions" element={<Questions />} />
                <Route path="/plans" element={<Plans />} />
                <Route path="/radar" element={<Radar />} />
                <Route path="/sessions/:id" element={<SessionDetail />} />
              </Route>

              {/* 管理端（需 admin 角色） */}
              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<Admin />} />
              </Route>

              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>
          </ChatProvider>
        </AuthProvider>
      </SnackbarProvider>
    </ThemeProvider>
  );
}
