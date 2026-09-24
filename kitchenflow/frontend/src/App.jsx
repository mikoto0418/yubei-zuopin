// 路由表：登录页独立，其余页面挂在应用外壳内。
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { RequireAuth, RequireRole } from './components/RouteGuards.jsx';
import AppShell from './components/layout/AppShell.jsx';

import LoginPage from './pages/LoginPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import KitchenBoardPage from './pages/KitchenBoardPage.jsx';
import TablesPage from './pages/TablesPage.jsx';
import OrderCreatePage from './pages/OrderCreatePage.jsx';
import MenuPage from './pages/MenuPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import ShiftsPage from './pages/ShiftsPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import ForbiddenPage from './pages/ForbiddenPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

function Shell({ children }) {
  return <AppShell>{children}</AppShell>;
}

// 首页按角色分流到各自最常用的页面。
function HomeRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.role === 'chef') return <Navigate to="/kitchen" replace />;
  return <Navigate to="/tables" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route path="/admin" element={
        <RequireAuth><RequireRole roles={['admin']}><Shell><AdminPage /></Shell></RequireRole></RequireAuth>
      } />
      <Route path="/kitchen" element={
        <RequireAuth><RequireRole roles={['admin', 'chef']}><Shell><KitchenBoardPage /></Shell></RequireRole></RequireAuth>
      } />
      <Route path="/tables" element={
        <RequireAuth><RequireRole roles={['admin', 'waiter']}><Shell><TablesPage /></Shell></RequireRole></RequireAuth>
      } />
      <Route path="/order/new" element={
        <RequireAuth><RequireRole roles={['admin', 'waiter']}><Shell><OrderCreatePage /></Shell></RequireRole></RequireAuth>
      } />
      <Route path="/menu" element={
        <RequireAuth><Shell><MenuPage /></Shell></RequireAuth>
      } />
      <Route path="/orders" element={
        <RequireAuth><Shell><OrdersPage /></Shell></RequireAuth>
      } />
      <Route path="/checkout" element={
        <RequireAuth><RequireRole roles={['admin', 'waiter']}><Shell><CheckoutPage /></Shell></RequireRole></RequireAuth>
      } />
      <Route path="/shifts" element={
        <RequireAuth><Shell><ShiftsPage /></Shell></RequireAuth>
      } />
      <Route path="/profile" element={
        <RequireAuth><Shell><ProfilePage /></Shell></RequireAuth>
      } />
      <Route path="/403" element={<RequireAuth><Shell><ForbiddenPage /></Shell></RequireAuth>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
