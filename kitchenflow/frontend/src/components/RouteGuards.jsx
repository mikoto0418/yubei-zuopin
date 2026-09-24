// 路由守卫：未登录跳登录页；角色不符渲染无权限页（而不是白屏）。
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ForbiddenState } from './ui/states.jsx';

export function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="apple-skeleton" style={{ width: 160, height: 20 }} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

// 角色白名单：命中的角色可见，其余展示无权限页。
export function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="kf-card" style={{ margin: 24 }}>
        <ForbiddenState message={`「${user.username}」的角色无权访问该页面，请用对应账号登录。`} />
      </div>
    );
  }
  return children;
}
