import React, { useEffect, useState } from "react";
import { Menu, UnstyledButton, Avatar, Text, Badge, Stack, Box } from "@mantine/core";
import {
  IconLayoutDashboard,
  IconMoodSmile,
  IconClipboardHeart,
  IconYoga,
  IconMessageChatbot,
  IconShieldLock,
  IconHeart,
  IconLogout,
  IconUsers,
  IconCalendarEvent,
  IconAlertTriangle,
  IconBooks,
  IconReportAnalytics,
} from "@tabler/icons-react";

import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Mood from "./pages/Mood.jsx";
import Assessment from "./pages/Assessment.jsx";
import Meditation from "./pages/Meditation.jsx";
import Chat from "./pages/Chat.jsx";
import Admin from "./pages/Admin.jsx";
import Counselors from "./pages/Counselors.jsx";
import Appointments from "./pages/Appointments.jsx";
import CrisisAlerts from "./pages/CrisisAlerts.jsx";
import Resources from "./pages/Resources.jsx";
import WeeklyReport from "./pages/WeeklyReport.jsx";
import NotFound from "./pages/NotFound.jsx";
import { getUser, clearSession } from "./api/client";

// 路由 key 保持不变：#/dashboard 等；新增页面用新 key
const MENU = [
  { key: "dashboard", label: "首页", icon: IconLayoutDashboard },
  { key: "mood", label: "心情", icon: IconMoodSmile },
  { key: "assessment", label: "测评", icon: IconClipboardHeart },
  { key: "meditation", label: "冥想", icon: IconYoga },
  { key: "chat", label: "陪护", icon: IconMessageChatbot },
  { key: "counselors", label: "咨询师", icon: IconUsers },
  { key: "appointments", label: "预约", icon: IconCalendarEvent },
  { key: "resources", label: "资源", icon: IconBooks },
  { key: "weekly", label: "周报", icon: IconReportAnalytics },
];

const STAFF_MENU = [
  { key: "crisis", label: "预警", icon: IconAlertTriangle },
];

const ROUTES = [
  "dashboard", "mood", "assessment", "meditation", "chat",
  "counselors", "appointments", "resources", "weekly",
  "admin", "crisis",
];

function getRoute() {
  const r = window.location.hash.replace(/^#\/?/, "");
  return r || "dashboard";
}

export default function App() {
  const [user, setUser] = useState(getUser());
  const [route, setRoute] = useState(getRoute());
  // 沉浸模式：冥想页开启后隐藏底部导航与悬浮头像
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (route !== "meditation") setImmersive(false);
  }, [route]);

  if (!user || !user.username) {
    return (
      <div className="app">
        <div className="guest-backdrop">
          <div className="guest-placeholder">
            <div className="brand-halo"><span className="logo">❤</span></div>
            <h2>MindCare</h2>
            <p>记录点滴心情，让每一次情绪都被温柔看见。</p>
          </div>
          <Login onLogin={(u) => { setUser(u); window.location.hash = "#/dashboard"; }} />
        </div>
      </div>
    );
  }

  const role = user.role || "user";
  const isAdmin = role === "admin";
  const isStaff = role === "counselor" || isAdmin;

  // 底部 Tab 栏：核心入口常驻，其余按角色追加
  let menu = [...MENU];
  if (isStaff) menu = [...menu, ...STAFF_MENU];
  if (isAdmin) menu = [...menu, { key: "admin", label: "后台", icon: IconShieldLock }];

  function logout() {
    clearSession();
    setUser(null);
    window.location.hash = "#/";
  }

  function go(key) {
    window.location.hash = "#/" + key;
  }

  return (
    <div className="app">
      <div className={"mc-stage" + (immersive ? " is-immersive" : "")}>
        {/* 悬浮头像（替代原侧边栏底部的用户信息区） */}
        <Box className="mc-avatar-fab">
          <Menu shadow="md" width={230} radius="lg" position="bottom-end" withinPortal>
            <Menu.Target>
              <UnstyledButton className="mc-avatar-btn" aria-label="账户菜单">
                <Avatar color="mindcare" radius="xl" size={42}>
                  <IconHeart size={20} />
                </Avatar>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>
                <Stack gap={6}>
                  <Text fw={700} size="sm" lineClamp={1}>
                    {user.nickname || user.username}
                  </Text>
                  <Badge
                    size="sm"
                    radius="lg"
                    variant="light"
                    color={isAdmin ? "blush" : "mindcare"}
                    w="fit-content"
                  >
                    {user.role_label || (isAdmin ? "管理员" : isStaff ? "咨询师" : "普通用户")}
                  </Badge>
                </Stack>
              </Menu.Label>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconLogout size={15} />}
                onClick={logout}
              >
                退出登录
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Box>

        <main className="mc-main">
          {route === "mood" && <Mood />}
          {route === "assessment" && <Assessment />}
          {route === "meditation" && <Meditation onImmersive={setImmersive} />}
          {route === "chat" && <Chat />}
          {route === "counselors" && <Counselors onGoAppointments={() => go("appointments")} />}
          {route === "appointments" && <Appointments />}
          {route === "resources" && <Resources />}
          {route === "weekly" && <WeeklyReport onGoResources={() => go("resources")} />}
          {route === "crisis" && isStaff && <CrisisAlerts />}
          {route === "admin" && isAdmin && <Admin onLogout={logout} />}
          {route === "dashboard" && <Dashboard user={user} />}
          {!ROUTES.includes(route) && <NotFound />}
        </main>

        {/* 底部悬浮胶囊导航 */}
        <nav className="mc-dock" aria-label="主导航">
          {menu.map((m) => {
            const Icon = m.icon;
            const active = route === m.key;
            return (
              <button
                key={m.key}
                type="button"
                className={"mc-dock-item" + (active ? " is-active" : "")}
                aria-current={active ? "page" : undefined}
                onClick={() => go(m.key)}
              >
                <span className="mc-dock-icon"><Icon size={20} stroke={1.7} /></span>
                <span className="mc-dock-label">{m.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
