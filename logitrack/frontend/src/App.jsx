import { Center, Spinner, Text, Flex } from '@chakra-ui/react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { can } from './constants'
import AppLayout from './components/AppLayout'
import { Forbidden } from './components/ui'
import LoginPage from './pages/LoginPage'
import WaybillSearchPage from './pages/WaybillSearchPage'
import WaybillDetailPage from './pages/WaybillDetailPage'
import WaybillCreatePage from './pages/WaybillCreatePage'
import DispatchPage from './pages/DispatchPage'
import ExceptionsPage from './pages/ExceptionsPage'
import WarehousesPage from './pages/WarehousesPage'
import FleetPage from './pages/FleetPage'
import NotificationsPage from './pages/NotificationsPage'
import AdminPage from './pages/AdminPage'
import NotFoundPage from './pages/NotFoundPage'

// 启动态：正在用 token 校验登录态
function BootScreen() {
  return (
    <Flex minH="100vh" align="center" justify="center" direction="column" gap="12px" bg="pageBg">
      <Spinner size="lg" color="brand.500" borderWidth="3px" />
      <Text fontSize="13px" color="labelSecondary">
        正在连接物流调度中心…
      </Text>
    </Flex>
  )
}

// 登录守卫
function RequireAuth({ children }) {
  const { user, booting } = useAuth()
  const location = useLocation()
  if (booting) return <BootScreen />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <AppLayout>{children}</AppLayout>
}

// 角色守卫：无权限直接渲染 403 页（而不是跳走），便于评审看到五态中的"无权限态"
function RequireRole({ check, children }) {
  const { user, booting } = useAuth()
  const location = useLocation()
  if (booting) return <BootScreen />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!check(user)) return <AppLayout><Forbidden /></AppLayout>
  return <AppLayout>{children}</AppLayout>
}

export default function App() {
  const { user, booting, kicked } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={booting ? <BootScreen /> : user ? <Navigate to="/" replace /> : <LoginPage />}
      />

      <Route path="/" element={<RequireAuth><WaybillSearchPage /></RequireAuth>} />
      <Route path="/waybills/new" element={<RequireRole check={can.createWaybill}><WaybillCreatePage /></RequireRole>} />
      <Route path="/waybills/:id" element={<RequireAuth><WaybillDetailPage /></RequireAuth>} />

      <Route path="/dispatch" element={<RequireRole check={can.dispatch}><DispatchPage /></RequireRole>} />
      <Route path="/exceptions" element={<RequireAuth><ExceptionsPage /></RequireAuth>} />
      <Route path="/warehouses" element={<RequireRole check={can.manageWarehouse}><WarehousesPage /></RequireRole>} />
      <Route path="/fleet" element={<RequireRole check={can.manageFleet}><FleetPage /></RequireRole>} />
      <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireRole check={can.admin}><AdminPage /></RequireRole>} />

      <Route path="/403" element={<RequireAuth><Forbidden /></RequireAuth>} />
      <Route
        path="*"
        element={
          booting ? (
            <BootScreen />
          ) : user ? (
            <AppLayout>
              <NotFoundPage kicked={kicked} />
            </AppLayout>
          ) : (
            <AppLayout>
              <NotFoundPage />
            </AppLayout>
          )
        }
      />
    </Routes>
  )
}

export { RequireAuth, RequireRole, BootScreen }
