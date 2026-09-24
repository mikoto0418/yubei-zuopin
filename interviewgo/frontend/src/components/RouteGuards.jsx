import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FullScreenLoading } from './States';

/** 需要登录：未登录跳登录页，并记录来源以便登录后返回 */
export function RequireAuth() {
  const { booting, isAuthenticated } = useAuth();
  const location = useLocation();

  if (booting) return <FullScreenLoading label="正在校验登录状态…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** 需要管理员：非管理员渲染 403 页，不静默失败 */
export function RequireAdmin() {
  const { booting, isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  if (booting) return <FullScreenLoading label="正在校验权限…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!isAdmin) return <Navigate to="/403" replace />;
  return <Outlet />;
}
