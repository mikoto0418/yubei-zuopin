import React, { useState } from "react";
import {
  Modal, TextInput, PasswordInput, Button, SegmentedControl, Text, Alert, Stack, Box,
} from "@mantine/core";
import { IconAlertCircle, IconHeart } from "@tabler/icons-react";
import { api, setSession } from "../api/client";

// 登录/注册：以弹窗形式悬浮于未登录客页之上
export default function Login({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ username: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const u = form.username.trim();
    if (tab === "register") {
      if (u.length < 3) return setErr("用户名至少 3 位");
      if (form.password.length < 6) return setErr("密码至少 6 位");
    }
    setBusy(true);
    try {
      const res =
        tab === "login"
          ? await api.login({ ...form, username: u })
          : await api.register({ ...form, username: u });
      setSession(res.token, res.user);
      onLogin(res.user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      opened
      onClose={() => {}}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      size={420}
      radius="lg"
      title={
        <Text fw={700} size="lg">
          {tab === "login" ? "欢迎回来，登录 MindCare" : "创建 MindCare 账号"}
        </Text>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            AI 心理健康陪护 · 记录情绪 · 温柔陪护
          </Text>

          <SegmentedControl
            fullWidth
            value={tab}
            onChange={(v) => { setTab(v); setErr(""); }}
            color="mindcare"
            data={[
              { label: "登录", value: "login" },
              { label: "注册", value: "register" },
            ]}
          />

          {err && (
            <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} radius="md">
              {err}
            </Alert>
          )}

          <TextInput
            label="用户名"
            placeholder="至少 3 位"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
            radius="md"
          />
          <PasswordInput
            label="密码"
            placeholder="至少 6 位"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            radius="md"
          />

          <Button
            type="submit"
            fullWidth
            loading={busy}
            radius="lg"
            color="mindcare"
            leftSection={<IconHeart size={16} />}
          >
            {busy ? "处理中…" : tab === "login" ? "进入" : "创建账号"}
          </Button>

          <Box ta="center">
            <Text size="xs" c="dimmed">
              {tab === "login"
                ? "演示账号：xiaolan / xiaolan123 · 咨询师 counselor1 / counselor123"
                : "管理员由系统内置（admin / admin123）"}
            </Text>
          </Box>
        </Stack>
      </form>
    </Modal>
  );
}
