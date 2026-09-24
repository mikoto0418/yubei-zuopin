import { useState } from 'react';
import {
  Avatar, Box, Divider, Drawer, IconButton, Menu, MenuItem, Stack, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const NAV_ITEMS = [
  { to: '/', label: '面试对话', icon: '💬' },
  { to: '/positions', label: '岗位库', icon: '🎯' },
  { to: '/questions', label: '题库', icon: '📚' },
  { to: '/plans', label: '练习计划', icon: '🗂' },
  { to: '/radar', label: '技能雷达', icon: '📊' },
  { to: '/history', label: '会话历史', icon: '🕘' },
];

/** 应用外壳：毛玻璃顶栏（唯一允许的悬浮层材质）+ 抽屉导航 */
export default function AppShell({ title, subtitle, actions, children, maxWidth = 1080, bare = false }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(null);

  const handleLogout = () => {
    setUserMenu(null);
    logout();
    navigate('/login', { replace: true });
  };

  const nav = (
    <Box sx={{ width: 268, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" spacing={1.2} sx={{ px: 2.5, py: 2.4 }}>
        <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 14 }}>IG</Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 17, lineHeight: 1.2 }}>InterviewGo</Typography>
          <Typography variant="caption" color="text.secondary">AI 模拟面试与能力评估</Typography>
        </Box>
      </Stack>
      <Divider />
      <Stack spacing={0.5} sx={{ p: 1.5 }}>
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.to;
          return (
            <Stack
              key={item.to}
              component={RouterLink}
              to={item.to}
              direction="row"
              spacing={1.4}
              alignItems="center"
              onClick={() => setNavOpen(false)}
              sx={{
                px: 1.6,
                height: 44,
                borderRadius: 3,
                textDecoration: 'none',
                bgcolor: active ? 'action.selected' : 'transparent',
                color: active ? 'primary.main' : 'text.primary',
                transition: 'background-color var(--dur-fast) var(--ease-standard)',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box component="span" sx={{ fontSize: 17, width: 20, textAlign: 'center' }}>{item.icon}</Box>
              <Typography sx={{ fontWeight: active ? 600 : 400, fontSize: 15 }}>{item.label}</Typography>
            </Stack>
          );
        })}
      </Stack>
      <Box sx={{ flex: 1 }} />
      {user && user.role === 'admin' ? (
        <>
          <Divider />
          <Stack
            component={RouterLink}
            to="/admin"
            direction="row"
            spacing={1.4}
            alignItems="center"
            onClick={() => setNavOpen(false)}
            sx={{ px: 3.1, height: 44, textDecoration: 'none', color: 'text.primary', '&:hover': { bgcolor: 'action.hover' } }}
          >
            <DashboardRoundedIcon sx={{ fontSize: 18 }} />
            <Typography sx={{ fontSize: 15 }}>管理概览</Typography>
          </Stack>
        </>
      ) : null}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {!isMobile ? (
        <Box
          sx={{
            width: 268,
            flexShrink: 0,
            borderRight: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            position: 'sticky',
            top: 0,
            height: '100vh',
          }}
        >
          {nav}
        </Box>
      ) : (
        <Drawer open={navOpen} onClose={() => setNavOpen(false)}>{nav}</Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!bare ? (
          <Box className="apple-glass" sx={{ position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" alignItems="center" spacing={1.4} sx={{ px: { xs: 2, md: 3 }, py: 1.6 }}>
              {isMobile ? (
                <IconButton edge="start" onClick={() => setNavOpen(true)}>
                  <MenuRoundedIcon />
                </IconButton>
              ) : null}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.3 }} noWrap>
                  {title}
                </Typography>
                {subtitle ? (
                  <Typography variant="caption" color="text.secondary" noWrap>{subtitle}</Typography>
                ) : null}
              </Box>
              {actions}
              <Tooltip title={user ? `${user.nickname || user.username}（${user.role === 'admin' ? '管理员' : '用户'}）` : '账户'}>
                <IconButton onClick={(e) => setUserMenu(e.currentTarget)}>
                  <Avatar sx={{ width: 30, height: 30, bgcolor: 'primary.main', fontSize: 13 }}>
                    {(user && (user.nickname || user.username || 'U').slice(0, 1)) || 'U'}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu anchorEl={userMenu} open={Boolean(userMenu)} onClose={() => setUserMenu(null)}>
                <MenuItem disabled sx={{ opacity: '1 !important' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{user ? user.nickname || user.username : '未登录'}</Typography>
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                  <LogoutRoundedIcon fontSize="small" sx={{ mr: 1 }} /> 退出登录
                </MenuItem>
              </Menu>
            </Stack>
          </Box>
        ) : null}

        <Box
          className="ig-page"
          sx={{
            flex: 1,
            minHeight: 0,
            px: bare ? 0 : { xs: 2, md: 3 },
            py: bare ? 0 : 3,
            maxWidth: bare ? 'none' : maxWidth,
            width: '100%',
            mx: bare ? 0 : 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
