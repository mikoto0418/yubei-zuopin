import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Result, Button, Spin } from "antd";
import { useAuth } from "./auth.jsx";
import Layout from "./components/Layout.jsx";
import LoginModal from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import Notes from "./pages/Notes.jsx";
import Practice from "./pages/Practice.jsx";
import StudyLog from "./pages/StudyLog.jsx";
import Teacher from "./pages/Teacher.jsx";
import Profile from "./pages/Profile.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Knowledge from "./pages/Knowledge.jsx";
import WrongBook from "./pages/WrongBook.jsx";
import Goals from "./pages/Goals.jsx";
import Achievements from "./pages/Achievements.jsx";
import Insights from "./pages/Insights.jsx";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="page-loading">
        <Spin size="large" />
      </div>
    );
  }
  if (!user) {
    return (
      <>
        <div className="guest-backdrop">
          <div className="guest-placeholder">
            <div className="brand-mark lg">EP</div>
            <h2>EduPulse</h2>
            <p>AI 学习分析助手</p>
            <span className="muted">登录后开始你的学习之旅…</span>
          </div>
        </div>
        <LoginModal />
      </>
    );
  }
  return children;
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  const nav = useNavigate();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== "admin") {
    return (
      <div className="error-page">
        <Result
          status="403"
          title="403"
          subTitle="没有权限访问：管理仪表盘仅对管理员开放。"
          extra={<Button type="primary" onClick={() => nav("/")}>返回首页</Button>}
        />
      </div>
    );
  }
  return children;
}

function NotFound() {
  const nav = useNavigate();
  return (
    <div className="error-page">
      <Result
        status="404"
        title="404"
        subTitle="你访问的页面已丢失或被移除，回到首页继续学习吧。"
        extra={<Button type="primary" onClick={() => nav("/")}>返回首页</Button>}
      />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="notes" element={<Notes />} />
        <Route path="practice" element={<Practice />} />
        <Route path="wrong" element={<WrongBook />} />
        <Route path="goals" element={<Goals />} />
        <Route path="insights" element={<Insights />} />
        <Route path="achievements" element={<Achievements />} />
        <Route path="study" element={<StudyLog />} />
        <Route path="teacher" element={<Teacher />} />
        <Route path="profile" element={<Profile />} />
        <Route
          path="dashboard"
          element={
            <RequireAdmin>
              <Dashboard />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
