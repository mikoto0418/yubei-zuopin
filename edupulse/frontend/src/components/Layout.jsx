import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Avatar, Button, Tooltip, Typography } from "antd";
import {
  DashboardOutlined,
  RobotOutlined,
  EditOutlined,
  CheckSquareOutlined,
  FieldTimeOutlined,
  UserOutlined,
  PoweroffOutlined,
  FundProjectionScreenOutlined,
  ApartmentOutlined,
  BookOutlined,
  AimOutlined,
  TrophyOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import { useAuth } from "../auth.jsx";
import TeacherDock from "./TeacherDock.jsx";

const NAV = [
  { key: "/", label: "总览", icon: <DashboardOutlined /> },
  { key: "/knowledge", label: "掌握度", icon: <ApartmentOutlined /> },
  { key: "/practice", label: "刷题", icon: <CheckSquareOutlined /> },
  { key: "/wrong", label: "错题本", icon: <BookOutlined /> },
  { key: "/goals", label: "目标", icon: <AimOutlined /> },
  { key: "/insights", label: "AI 洞察", icon: <BulbOutlined /> },
  { key: "/achievements", label: "成就", icon: <TrophyOutlined /> },
  { key: "/notes", label: "笔记", icon: <EditOutlined /> },
  { key: "/study", label: "记录", icon: <FieldTimeOutlined /> },
  { key: "/teacher", label: "答疑", icon: <RobotOutlined /> },
  { key: "/profile", label: "我的", icon: <UserOutlined /> },
];

const TITLES = {
  "/": "数据总览",
  "/knowledge": "知识点掌握度",
  "/practice": "题库练习",
  "/wrong": "错题本",
  "/goals": "学习目标",
  "/insights": "AI 洞察",
  "/achievements": "成就墙",
  "/teacher": "AI 数字教师",
  "/notes": "学习笔记",
  "/study": "学习记录",
  "/profile": "个人中心",
  "/dashboard": "管理仪表盘",
};

/**
 * Apple 基底外壳：毛玻璃顶栏 + 分段控件式导航
 * 右下角常驻数字人悬浮舱（TeacherDock）保留。
 */
export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const t = TITLES[location.pathname];
    document.title = t ? `${t} · EduPulse` : "EduPulse · AI 学习分析助手";
  }, [location.pathname]);

  function handleLogout() {
    logout();
    nav("/login");
  }

  const items = [...NAV];
  if (user && user.role === "admin") {
    items.push({
      key: "/dashboard",
      label: "管理台",
      icon: <FundProjectionScreenOutlined />,
    });
  }

  return (
    <div className="app-shell">
      <header className="nav-bar">
        <div className="nav-brand" onClick={() => nav("/")} role="button" tabIndex={0}>
          <span className="brand-mark">EP</span>
          <div className="brand-text">
            <div className="brand-title">EduPulse</div>
            <div className="brand-sub">AI 学习分析</div>
          </div>
        </div>

        <nav className="nav-seg" aria-label="主导航">
          {items.map((it) => {
            const active = location.pathname === it.key;
            return (
              <button
                key={it.key}
                type="button"
                className={"nav-seg-btn" + (active ? " is-active" : "")}
                onClick={() => nav(it.key)}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="nav-user">
          <Avatar
            size={32}
            style={{ background: "var(--tint)", fontWeight: 600 }}
          >
            {user?.nickname?.[0] || "U"}
          </Avatar>
          <Typography.Text className="user-name" ellipsis>
            {user?.nickname}
          </Typography.Text>
          <Tooltip title="退出登录">
            <Button
              type="text"
              size="small"
              icon={<PoweroffOutlined />}
              onClick={handleLogout}
            />
          </Tooltip>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <TeacherDock />
    </div>
  );
}
