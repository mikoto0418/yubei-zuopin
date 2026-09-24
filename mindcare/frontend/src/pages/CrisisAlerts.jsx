import React, { useCallback, useEffect, useState } from "react";
import {
  Badge, Button, Card, Group, Modal, SegmentedControl, Stack, Text, Textarea, TextInput,
} from "@mantine/core";
import { IconSearch, IconAlertTriangle } from "@tabler/icons-react";
import { api, getUser } from "../api/client";
import { PageLoading, ErrorState, EmptyState, ForbiddenState } from "../components/States.jsx";
import { ALERT_LEVEL, ALERT_STATUS, ALERT_ACTION } from "../theme.js";

const PAGE_SIZE = 10;

/** 危机预警：咨询师 / admin 可见，可处理（联系 / 转介 / 解除） */
export default function CrisisAlerts() {
  const user = getUser();
  const role = user.role || "user";
  const allowed = role === "counselor" || role === "admin";

  const [state, setState] = useState({ loading: true, error: null });
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("open");
  const [level, setLevel] = useState("");
  const [q, setQ] = useState("");
  const [handling, setHandling] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async (nextPage = 1, opts = {}) => {
    setState({ loading: true, error: null });
    try {
      const data = await api.crisisAlerts({
        page: nextPage, size: PAGE_SIZE,
        status: opts.status ?? status, level: opts.level ?? level, q: opts.q ?? q,
      });
      setItems((prev) => (nextPage === 1 ? data.alerts : [...prev, ...data.alerts]));
      setStats(data.stats || {});
      setTotal(data.total);
      setPage(nextPage);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: e });
    }
  }, [status, level, q]);

  useEffect(() => { if (allowed) load(1); /* eslint-disable-next-line */ }, [allowed]);

  // 无权限：普通用户
  if (!allowed) {
    return <ForbiddenState desc="危机预警仅对咨询师与管理员开放。如果你需要帮助，请前往「咨询师」页面预约，或查看「资源库」中的求助指引。" />;
  }
  if (state.loading && items.length === 0) return <PageLoading rows={3} />;
  if (state.error && items.length === 0) return <ErrorState error={state.error} onRetry={() => load(1)} />;

  return (
    <div className="mc-flow">
      <div>
        <h1 className="page-title">危机预警</h1>
        <Text size="sm" c="dimmed" mt={6}>
          测评达到中度及以上，或情绪连续 3 天低于 3 分，系统会自动生成预警。
        </Text>
      </div>

      <Group gap="sm" wrap="wrap">
        <StatChip label="待处理" value={stats.open ?? 0} tone="red" />
        <StatChip label="已处理" value={stats.handled ?? 0} tone="green" />
        <StatChip label="已解除" value={stats.dismissed ?? 0} tone="gray" />
      </Group>

      <SegmentedControl
        fullWidth radius="md"
        value={status}
        onChange={(v) => { setStatus(v); load(1, { status: v }); }}
        data={[
          { label: "待处理", value: "open" },
          { label: "已处理", value: "handled" },
          { label: "已解除", value: "dismissed" },
          { label: "全部", value: "" },
        ]}
      />

      <Group gap="sm" grow>
        <TextInput
          placeholder="搜索用户或详情"
          leftSection={<IconSearch size={16} />}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") load(1, { q: e.currentTarget.value }); }}
          radius="md"
        />
        <SegmentedControl
          radius="md"
          value={level}
          onChange={(v) => { setLevel(v); load(1, { level: v }); }}
          data={[
            { label: "全部等级", value: "" },
            { label: "高危", value: "high" },
            { label: "中度", value: "medium" },
            { label: "轻度", value: "low" },
          ]}
        />
      </Group>

      {toast && <Text size="sm" c="teal" role="status">{toast}</Text>}

      {items.length === 0 ? (
        <EmptyState
          icon="🛡️" title="当前没有预警"
          desc="在这个筛选条件下没有需要关注的记录。"
        />
      ) : (
        <Stack gap="md">
          {items.map((a) => (
            <AlertCard key={a.id} alert={a} onHandle={() => setHandling(a)} />
          ))}
          {items.length < total && (
            <Button variant="light" radius="md" loading={state.loading} onClick={() => load(page + 1)}>
              加载更多（{items.length}/{total}）
            </Button>
          )}
        </Stack>
      )}

      <HandleModal
        alert={handling}
        onClose={() => setHandling(null)}
        onDone={(updated) => {
          setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
          setHandling(null);
          setToast(`预警 #${updated.id} 已${ALERT_ACTION[updated.handle_action] || "处理"}`);
          load(1, { status: status || "" });
        }}
      />
    </div>
  );
}

function StatChip({ label, value, tone }) {
  return (
    <div className="apple-card" style={{ padding: "10px 14px", minWidth: 96 }}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={700} size="xl" c={tone === "red" ? "red" : tone === "green" ? "teal" : "dimmed"}>
        {value}
      </Text>
    </div>
  );
}

function AlertCard({ alert, onHandle }) {
  const lv = ALERT_LEVEL[alert.level] || { label: alert.level, color: "gray" };
  const st = ALERT_STATUS[alert.status] || { label: alert.status, color: "gray" };
  return (
    <Card className="mc-glass" padding="lg" radius="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <IconAlertTriangle size={17} color={alert.level === "high" ? "var(--red)" : "var(--orange)"} />
            <Text fw={600} className="apple-headline">
              {alert.user_nickname || `用户 #${alert.user_id}`}
            </Text>
            <Badge color={lv.color} variant="light" radius="sm" size="sm">{lv.label}</Badge>
          </Group>
          <Text size="sm" mt={6}>{alert.detail}</Text>
          <Group gap="xs" mt="sm" wrap="wrap">
            <span className="apple-tag">
              {alert.trigger_type === "assessment" ? "测评触发" : "情绪触发"}
            </span>
            <span className="apple-tag">{alert.created_at?.slice(0, 16)}</span>
          </Group>
        </div>
        <Badge color={st.color} variant="light" radius="sm">{st.label}</Badge>
      </Group>

      {alert.handle_note && (
        <div style={{ marginTop: 12, padding: 12, background: "var(--fill-secondary)", borderRadius: "var(--radius-md)" }}>
          <Text size="xs" c="dimmed" mb={4}>
            处理记录 · {ALERT_ACTION[alert.handle_action] || alert.handle_action}
            {alert.handler_nickname ? ` · ${alert.handler_nickname}` : ""}
          </Text>
          <Text size="sm">{alert.handle_note}</Text>
        </div>
      )}

      {alert.status === "open" && (
        <Group mt="md">
          <Button size="xs" radius="md" onClick={onHandle}>处理这条预警</Button>
        </Group>
      )}
    </Card>
  );
}

function HandleModal({ alert, onClose, onDone }) {
  const [action, setAction] = useState("contact");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setAction("contact"); setNote(""); setError(null); }, [alert?.id]);

  async function submit() {
    if (action !== "dismiss" && !note.trim()) { setError("请填写处理记录"); return; }
    setSubmitting(true); setError(null);
    try {
      const data = await api.handleCrisisAlert(alert.id, { action, note });
      onDone(data.alert);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal opened={!!alert} onClose={onClose} centered title="处理预警" radius="lg">
      {alert && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">{alert.user_nickname} · {alert.detail}</Text>
          <SegmentedControl
            fullWidth radius="md"
            value={action}
            onChange={setAction}
            data={[
              { label: "联系本人", value: "contact" },
              { label: "转介", value: "refer" },
              { label: "解除预警", value: "dismiss" },
            ]}
          />
          <Textarea
            label={action === "dismiss" ? "解除说明（选填）" : "处理记录"}
            placeholder={action === "dismiss" ? "例如：经核实为误选，状态良好" : "例如：已电话联系，情绪平稳，约定面谈"}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            maxLength={500}
            minRows={3}
            radius="md"
          />
          {error && <Text size="sm" c="red">{error}</Text>}
          <Group justify="flex-end">
            <Button variant="subtle" radius="md" onClick={onClose}>取消</Button>
            <Button radius="md" loading={submitting} onClick={submit}>提交处理</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
