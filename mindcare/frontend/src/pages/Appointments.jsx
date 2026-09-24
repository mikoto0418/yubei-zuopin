import React, { useCallback, useEffect, useState } from "react";
import {
  Badge, Button, Card, Group, Modal, Rating, SegmentedControl, Stack, Text, Textarea, TextInput,
} from "@mantine/core";
import { IconStar, IconMessageCircle, IconSearch, IconRefresh } from "@tabler/icons-react";
import { api, getUser } from "../api/client";
import { PageLoading, ErrorState, EmptyState, ForbiddenState } from "../components/States.jsx";
import { APPT_STATUS } from "../theme.js";

const PAGE_SIZE = 10;
const FLOW = ["pending", "confirmed", "completed"];

/** 我的预约：状态时间轴 + 状态流转 + 评价 */
export default function Appointments() {
  const user = getUser();
  const role = user.role || "user";
  const isStaff = role === "counselor" || role === "admin";

  const [state, setState] = useState({ loading: true, error: null, forbidden: false });
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);      // 正在流转的预约 id
  const [review, setReview] = useState(null);  // 正在评价的预约
  const [toast, setToast] = useState(null);

  const load = useCallback(async (nextPage = 1, opts = {}) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.appointments({
        page: nextPage, size: PAGE_SIZE,
        status: opts.status ?? status, q: opts.q ?? q,
      });
      setItems((prev) => (nextPage === 1 ? data.appointments : [...prev, ...data.appointments]));
      setTotal(data.total);
      setPage(nextPage);
      setState({ loading: false, error: null, forbidden: false });
    } catch (e) {
      if (e.status === 403) setState({ loading: false, error: null, forbidden: true });
      else setState({ loading: false, error: e, forbidden: false });
    }
  }, [status, q]);

  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);

  async function doTransition(appt, to) {
    setBusy(appt.id); setToast(null);
    try {
      const data = await api.transitionAppointment(appt.id, to);
      setItems((prev) => prev.map((x) => (x.id === appt.id ? data.appointment : x)));
      setToast({ type: "ok", text: `已更新为「${APPT_STATUS[to]?.label || to}」` });
    } catch (e) {
      setToast({ type: "err", text: e.message });
    } finally {
      setBusy(null);
    }
  }

  if (state.forbidden) return <ForbiddenState desc="当前账号无法查看预约列表。" />;
  if (state.loading && items.length === 0) return <PageLoading rows={3} />;
  if (state.error && items.length === 0) return <ErrorState error={state.error} onRetry={() => load(1)} />;

  return (
    <div className="mc-flow">
      <div>
        <h1 className="page-title">我的预约</h1>
        <Text size="sm" c="dimmed" mt={6}>
          {isStaff ? "查看并处理与你相关的预约。" : "查看预约进度，完成后可以评价。"}
        </Text>
      </div>

      <SegmentedControl
        fullWidth radius="md"
        value={status}
        onChange={(v) => { setStatus(v); load(1, { status: v }); }}
        data={[
          { label: "全部", value: "" },
          { label: "待确认", value: "pending" },
          { label: "已确认", value: "confirmed" },
          { label: "已完成", value: "completed" },
          { label: "已取消", value: "cancelled" },
        ]}
      />

      <TextInput
        placeholder="搜索主题或咨询师"
        leftSection={<IconSearch size={16} />}
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === "Enter") load(1, { q: e.currentTarget.value }); }}
        radius="md"
      />

      {toast && (
        <Text size="sm" c={toast.type === "ok" ? "teal" : "red"} role="status">{toast.text}</Text>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon="📅" title="还没有预约"
          desc={status ? "当前筛选条件下没有预约记录。" : "去咨询师页面选一位咨询师，预约一次谈话吧。"}
          action={status ? (
            <Button variant="light" radius="md" onClick={() => { setStatus(""); load(1, { status: "" }); }}>
              查看全部
            </Button>
          ) : null}
        />
      ) : (
        <Stack gap="md">
          {items.map((a) => (
            <ApptCard
              key={a.id}
              appt={a}
              role={role}
              busy={busy === a.id}
              onTransition={doTransition}
              onReview={() => setReview(a)}
            />
          ))}
          {items.length < total && (
            <Button variant="light" radius="md" loading={state.loading} onClick={() => load(page + 1)}>
              加载更多（{items.length}/{total}）
            </Button>
          )}
        </Stack>
      )}

      <ReviewModal
        appt={review}
        onClose={() => setReview(null)}
        onDone={(updated) => {
          setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
          setReview(null);
          setToast({ type: "ok", text: "评价已提交，感谢你的反馈" });
        }}
      />
    </div>
  );
}

function ApptCard({ appt, role, busy, onTransition, onReview }) {
  const meta = APPT_STATUS[appt.status] || { label: appt.status, color: "gray" };
  const isOwner = role === "user";
  const canConfirm = (role === "counselor" || role === "admin") && appt.status === "pending";
  const canComplete = (role === "counselor" || role === "admin") && appt.status === "confirmed";
  const canCancel = ["pending", "confirmed"].includes(appt.status);

  return (
    <Card className="mc-glass" padding="lg" radius="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <Text fw={600} className="apple-headline" lineClamp={1}>
              {appt.topic || "（未填写主题）"}
            </Text>
          </Group>
          <Text size="sm" c="dimmed" mt={2}>
            {appt.counselor_avatar} {appt.counselor_name}
            {appt.counselor_title ? ` · ${appt.counselor_title}` : ""}
          </Text>
          {!isOwner && <Text size="xs" c="dimmed" mt={2}>来访者：{appt.user_nickname}</Text>}
        </div>
        <Badge color={meta.color} variant="light" radius="sm">{meta.label}</Badge>
      </Group>

      <Group gap="xs" mt="sm" wrap="wrap">
        <span className="apple-tag">🕐 {appt.slot}</span>
        <span className="apple-tag">提交于 {appt.created_at?.slice(0, 10)}</span>
      </Group>

      {appt.note && <Text size="sm" c="dimmed" mt="sm">备注：{appt.note}</Text>}

      {/* 状态时间轴 */}
      <div className="mc-steps" style={{ marginTop: 16 }}>
        {FLOW.map((step) => {
          const idx = FLOW.indexOf(step);
          const curIdx = FLOW.indexOf(appt.status);
          const cancelled = appt.status === "cancelled";
          const done = !cancelled && curIdx >= idx && curIdx >= 0;
          const current = !cancelled && appt.status === step;
          return (
            <div key={step} className={"mc-step" + (done ? " is-done" : "") + (current ? " is-current" : "")}>
              <div className="mc-step-mark">{done ? "✓" : idx + 1}</div>
              <div>
                <Text size="sm" fw={current ? 600 : 400}>{APPT_STATUS[step].label}</Text>
                <Text size="xs" c="dimmed">{APPT_STATUS[step].hint}</Text>
              </div>
            </div>
          );
        })}
        {appt.status === "cancelled" && (
          <div className="mc-step is-current">
            <div className="mc-step-mark">×</div>
            <div>
              <Text size="sm" fw={600}>已取消</Text>
              <Text size="xs" c="dimmed">该预约已取消</Text>
            </div>
          </div>
        )}
      </div>

      {/* 评价展示 */}
      {appt.review_score ? (
        <Group gap="xs" mt="md">
          <Rating value={appt.review_score} readOnly size="sm" />
          <Text size="sm" c="dimmed">{appt.review_text || "（未填写文字评价）"}</Text>
        </Group>
      ) : null}

      <Group gap="sm" mt="md">
        {canConfirm && (
          <Button size="xs" radius="md" loading={busy} onClick={() => onTransition(appt, "confirmed")}>
            确认预约
          </Button>
        )}
        {canComplete && (
          <Button size="xs" radius="md" color="green" loading={busy} onClick={() => onTransition(appt, "completed")}>
            标记完成
          </Button>
        )}
        {isOwner && appt.status === "completed" && !appt.review_score && (
          <Button size="xs" radius="md" leftSection={<IconStar size={14} />} onClick={onReview}>
            去评价
          </Button>
        )}
        {canCancel && (
          <Button size="xs" radius="md" variant="light" color="red" loading={busy} onClick={() => onTransition(appt, "cancelled")}>
            取消预约
          </Button>
        )}
        {!canConfirm && !canComplete && !canCancel && !(isOwner && appt.status === "completed" && !appt.review_score) && (
          <Text size="xs" c="dimmed">
            {appt.status === "completed" ? "咨询已完成" : "该预约已结束，无可执行操作"}
          </Text>
        )}
      </Group>
    </Card>
  );
}

function ReviewModal({ appt, onClose, onDone }) {
  const [score, setScore] = useState(5);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setScore(5); setText(""); setError(null); }, [appt?.id]);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const data = await api.reviewAppointment(appt.id, { score, text });
      onDone(data.appointment);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal opened={!!appt} onClose={onClose} centered title="评价这次咨询" radius="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {appt ? `${appt.counselor_name} · ${appt.slot}` : ""}
        </Text>
        <div>
          <Text size="sm" fw={500} mb={6}>总体评分</Text>
          <Rating value={score} onChange={setScore} size="lg" />
        </div>
        <Textarea
          label="想说的话（选填）"
          placeholder="这次咨询对你有什么帮助？"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          maxLength={300}
          minRows={3}
          radius="md"
        />
        {error && <Text size="sm" c="red">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="subtle" radius="md" onClick={onClose}>取消</Button>
          <Button radius="md" loading={submitting} onClick={submit} leftSection={<IconMessageCircle size={16} />}>
            提交评价
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
