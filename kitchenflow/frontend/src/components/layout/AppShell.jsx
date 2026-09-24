// 应用外壳：左侧导航（毛玻璃）+ 顶栏 + 内容区。
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ChefHat, Grid3x3, UtensilsCrossed, BookOpen,
  ClipboardList, Wallet, CalendarDays, User, LogOut, DoorOpen,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../StatusBadge.jsx';

// 每个导航项声明允许的角色；未声明的对全部登录用户可见。
const NAV = [
  { to: '/admin', label: '店长概览', icon: LayoutDashboard, roles: ['admin'] },
  { to: '/kitchen', label: '后厨看板', icon: ChefHat, roles: ['admin', 'chef'] },
  { to: '/tables', label: '桌台管理', icon: Grid3x3, roles: ['admin', 'waiter'] },
  { to: '/order/new', label: '点餐', icon: UtensilsCrossed, roles: ['admin', 'waiter'] },
  { to: '/menu', label: '菜单管理', icon: BookOpen },
  { to: '/orders', label: '订单列表', icon: ClipboardList },
  { to: '/checkout', label: '结账', icon: Wallet, roles: ['admin', 'waiter'] },
  { to: '/shifts', label: '班次管理', icon: CalendarDays },
  { to: '/profile', label: '个人中心', icon: User },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user?.role));

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-grouped)' }}>
      {/* 侧边导航 */}
      <aside
        className="apple-glass flex flex-col"
        style={{
          width: 224, flexShrink: 0,
          borderRight: '1px solid var(--separator)',
          padding: '16px 12px',
        }}
      >
        <div className="flex items-center gap-2 mb-5" style={{ padding: '0 8px' }}>
          <div className="flex items-center justify-center" style={{
            width: 32, height: 32, borderRadius: 'var(--radius-sm)',
            background: 'var(--tint)', color: '#fff',
          }}>
            <ChefHat size={18} />
          </div>
          <div>
            <p className="apple-headline" style={{ lineHeight: 1.2 }}>KitchenFlow</p>
            <p className="apple-caption apple-tertiary">后厨订单系统</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1 kf-scroll" style={{ overflowY: 'auto' }}>
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className="kf-nav-item"
              style={({ isActive }) => (isActive ? { background: 'var(--tint-soft)', color: 'var(--tint)', fontWeight: 600 } : undefined)}
            >
              <n.icon size={17} />
              {n.label}
            </NavLink>
          ))}
        </nav>

        {/* 当前用户 */}
        <div className="mt-3" style={{ borderTop: '1px solid var(--separator)', paddingTop: 12 }}>
          <div className="flex items-center gap-2" style={{ padding: '0 8px 8px' }}>
            <div className="flex items-center justify-center apple-footnote" style={{
              width: 30, height: 30, borderRadius: 'var(--radius-full)',
              background: 'var(--fill-primary)', color: 'var(--label)', fontWeight: 600,
            }}>
              {(user?.nickname || user?.username || '?').slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="apple-footnote truncate" style={{ fontWeight: 600 }}>{user?.nickname || user?.username}</p>
              <StatusBadge kind="role" value={user?.role} />
            </div>
          </div>
          <button type="button" className="kf-nav-item w-full" onClick={() => { logout(); navigate('/login'); }}>
            <DoorOpen size={17} /> 退出登录
          </button>
        </div>
      </aside>

      {/* 内容区 */}
      <main className="flex-1 kf-scroll" style={{ overflowY: 'auto', padding: '24px 32px' }}>
        {children}
      </main>
    </div>
  );
}
