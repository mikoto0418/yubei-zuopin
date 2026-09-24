import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal, Form, Input, Button, Tabs, Alert, Typography } from "antd";
import { UserOutlined, LockOutlined, IdcardOutlined } from "@ant-design/icons";
import { useAuth } from "../auth.jsx";

// 登录/注册：以弹窗形式悬浮于主页之上
export default function LoginModal() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", password: "", nickname: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      const user = mode === "login"
        ? await login(form.username, form.password)
        : await register(form.username, form.password, form.nickname);
      nav(user?.role === "admin" ? "/dashboard" : "/");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  const tabItems = [
    {
      key: "login",
      label: "登 录",
      children: (
        <Form layout="vertical" onFinish={submit}>
          <Form.Item label="用户名" required>
            <Input
              prefix={<UserOutlined />}
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
              placeholder="至少 3 位"
              size="large"
            />
          </Form.Item>
          <Form.Item label="密码" required>
            <Input.Password
              prefix={<LockOutlined />}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="至少 6 位"
              size="large"
            />
          </Form.Item>
          {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 12 }} />}
          <Button type="primary" htmlType="submit" size="large" block loading={busy}>
            进入系统
          </Button>
        </Form>
      ),
    },
    {
      key: "register",
      label: "注 册",
      children: (
        <Form layout="vertical" onFinish={submit}>
          <Form.Item label="用户名" required>
            <Input
              prefix={<UserOutlined />}
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
              placeholder="至少 3 位"
              size="large"
            />
          </Form.Item>
          <Form.Item label="昵称">
            <Input
              prefix={<IdcardOutlined />}
              value={form.nickname}
              onChange={(e) => set("nickname", e.target.value)}
              placeholder="显示名称"
              size="large"
            />
          </Form.Item>
          <Form.Item label="密码" required>
            <Input.Password
              prefix={<LockOutlined />}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="至少 6 位"
              size="large"
            />
          </Form.Item>
          {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 12 }} />}
          <Button type="primary" htmlType="submit" size="large" block loading={busy}>
            创建账号
          </Button>
        </Form>
      ),
    },
  ];

  return (
    <Modal
      open
      title={mode === "login" ? "登录 EduPulse" : "创建账号"}
      footer={null}
      closable={false}
      mask={{ closable: false }}
      keyboard={false}
      width={420}
      centered
      className="login-modal"
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        AI 学习分析助手 · 数据驾驶舱
      </Typography.Paragraph>
      <Tabs
        activeKey={mode}
        onChange={(k) => { setMode(k); setErr(""); }}
        items={tabItems}
        centered
      />
      <Typography.Paragraph type="secondary" className="hint">
        演示账号：admin / admin123（管理员）· demo / demo123（学员）
      </Typography.Paragraph>
    </Modal>
  );
}
