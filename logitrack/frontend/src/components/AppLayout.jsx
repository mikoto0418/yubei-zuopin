import { Avatar, Box, Flex, Text } from '@chakra-ui/react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import { can, ROLE_LABEL } from '../constants'
import {
  BellIcon, ChartIcon, ListIcon, LogoutIcon, SearchIcon, ShieldIcon,
  SlidersIcon, TruckIcon, UsersIcon, WarehouseIcon, RouteIcon, PlusIcon,
} from './Icons'

// 导航项按角色过滤：快递员看不到调度台与网点管理，避免点进去才撞 403。
function navFor(user) {
  const items = [
    { to: '/', label: '运单查询', icon: SearchIcon, end: true },
    { to: '/waybills/new', label: '创建运单', icon: PlusIcon },
  ]
  if (can.dispatch(user)) {
    items.push({ to: '/dispatch', label: '调度台', icon: SlidersIcon })
  }
  items.push({ to: '/exceptions', label: '异常件', icon: TruckIcon })
  if (can.manageWarehouse(user)) {
    items.push({ to: '/warehouses', label: '网点管理', icon: WarehouseIcon })
    items.push({ to: '/fleet', label: '车辆司机', icon: UsersIcon })
  }
  items.push({ to: '/notifications', label: '通知中心', icon: BellIcon })
  if (can.admin(user)) {
    items.push({ to: '/admin', label: '总部概览', icon: ChartIcon })
  }
  return items
}

export default function AppLayout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const nav = user ? navFor(user) : []

  // 未读角标：进入布局时拉一次，页面切换后也会刷新
  useEffect(() => {
    let alive = true
    const load = () => {
      api.unreadCount()
        .then((d) => { if (alive) setUnread(d.unread || 0) })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [user])

  return (
    <Flex direction="column" minH="100vh" bg="pageBg">
      {/* 顶栏：毛玻璃悬浮层（Apple 规范：毛玻璃只用于悬浮层） */}
      <Box
        as="header"
        position="sticky"
        top={0}
        zIndex={100}
        borderBottom="1px solid"
        borderColor="sep"
        bg="var(--glass-bg)"
        style={{ backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)' }}
      >
        <Flex maxW="1360px" mx="auto" px={{ base: '16px', md: '28px' }} py="10px" align="center" gap="14px">
          {/* Logo */}
          <Flex
            align="center"
            gap="9px"
            flexShrink={0}
            cursor="pointer"
            onClick={() => navigate('/')}
          >
            <Flex boxSize="32px" borderRadius="10px" bg="brand.500" color="#fff" align="center" justify="center">
              <RouteIcon size={18} />
            </Flex>
            <Box display={{ base: 'none', sm: 'block' }}>
              <Text fontSize="16px" fontWeight={700} letterSpacing="-0.02em" color="label" lineHeight="1.15">
                LogiTrack
              </Text>
              <Text fontSize="10.5px" color="labelTertiary" lineHeight="1.15">
                物流运单跟踪平台
              </Text>
            </Box>
          </Flex>

          {/* 桌面导航 */}
          <Flex gap="2px" align="center" ml="8px" display={{ base: 'none', lg: 'flex' }} flexWrap="wrap">
            {nav.map((n) => (
              <Box
                key={n.to}
                as={NavLink}
                to={n.to}
                end={n.end}
                px="11px"
                py="6px"
                borderRadius="full"
                fontSize="13.5px"
                fontWeight={500}
                color="labelSecondary"
                display="flex"
                alignItems="center"
                gap="6px"
                textDecoration="none"
                position="relative"
                sx={{
                  '&.active': { bg: 'var(--tint-soft)', color: 'brand.600', fontWeight: 600 },
                }}
                _hover={{ textDecoration: 'none', bg: 'fill' }}
              >
                <n.icon size={14} />
                {n.label}
                {n.to === '/notifications' && unread > 0 ? (
                  <Box
                    as="span"
                    minW="16px"
                    h="16px"
                    px="4px"
                    borderRadius="full"
                    bg="red.500"
                    color="#fff"
                    fontSize="10px"
                    fontWeight={700}
                    display="inline-flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    {unread > 99 ? '99+' : unread}
                  </Box>
                ) : null}
              </Box>
            ))}
          </Flex>

          <Flex align="center" gap="10px" ml="auto">
            {/* 移动端菜单按钮 */}
            <Box
              as="button"
              display={{ base: 'flex', lg: 'none' }}
              onClick={() => setMobileOpen((v) => !v)}
              bg="transparent"
              border="none"
              color="labelSecondary"
              cursor="pointer"
              p="6px"
              borderRadius="md"
              aria-label="菜单"
            >
              <ListIcon size={20} />
            </Box>

            <Flex align="center" gap="8px">
              <Avatar.Root size="xs" bg="brand.100" color="brand.700">
                <Avatar.Fallback name={user?.nickname || user?.username || '?'} />
              </Avatar.Root>
              <Box display={{ base: 'none', md: 'block' }}>
                <Text fontSize="12.5px" fontWeight={600} color="label" lineHeight="1.2">
                  {user?.nickname || user?.username}
                </Text>
                <Text fontSize="10.5px" color="labelTertiary" lineHeight="1.2">
                  {ROLE_LABEL[user?.role] || user?.role}
                </Text>
              </Box>
            </Flex>

            <Box
              as="button"
              onClick={() => { logout(); navigate('/login', { replace: true }) }}
              bg="transparent"
              border="none"
              color="labelSecondary"
              cursor="pointer"
              p="6px"
              borderRadius="md"
              _hover={{ bg: 'fill' }}
              aria-label="退出登录"
              title="退出登录"
            >
              <LogoutIcon size={17} />
            </Box>
          </Flex>
        </Flex>

        {/* 移动端展开的导航 */}
        {mobileOpen ? (
          <Flex
            display={{ base: 'flex', lg: 'none' }}
            px="16px"
            pb="12px"
            gap="6px"
            wrap="wrap"
            borderTop="1px solid"
            borderColor="sep"
            pt="10px"
          >
            {nav.map((n) => (
              <Box
                key={n.to}
                as={NavLink}
                to={n.to}
                end={n.end}
                onClick={() => setMobileOpen(false)}
                px="12px"
                py="7px"
                borderRadius="full"
                fontSize="13.5px"
                color="labelSecondary"
                display="flex"
                alignItems="center"
                gap="6px"
                textDecoration="none"
                sx={{ '&.active': { bg: 'var(--tint-soft)', color: 'brand.600', fontWeight: 600 } }}
              >
                <n.icon size={14} />
                {n.label}
              </Box>
            ))}
          </Flex>
        ) : null}
      </Box>

      <Box flex="1">{children}</Box>

      <Box as="footer" borderTop="1px solid" borderColor="sep" py="18px" mt="32px">
        <Flex maxW="1360px" mx="auto" px={{ base: '16px', md: '28px' }} justify="space-between" gap="12px" wrap="wrap">
          <Text fontSize="12px" color="labelTertiary">
            LogiTrack · 物流运单跟踪平台 · 时间轴 × 地图联动
          </Text>
          <Text fontSize="12px" color="labelTertiary">
            数据仅用于演示
          </Text>
        </Flex>
      </Box>
    </Flex>
  )
}

// 页面容器：统一左右留白与最大宽度
export function Page({ children, maxW = '1360px', py = '24px' }) {
  return (
    <Box w="100%" maxW={maxW} mx="auto" px={{ base: '16px', md: '28px' }} py={py}>
      {children}
    </Box>
  )
}

export { ShieldIcon }
