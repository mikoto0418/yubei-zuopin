import React, { useCallback, useEffect, useState } from "react";
import {
  Badge, Button, Card, Group, Modal, Rating, Stack, Text, Textarea, TextInput, Chip,
} from "@mantine/core";
import { IconSearch, IconCalendarPlus, IconChevronRight } from "@tabler/icons-react";
import { api } from "../api/client";
import { PageLoading, ErrorState, EmptyState, ForbiddenState, NotFoundState } from "../components/States.jsx";

const PAGE_SIZE = 6;

/** 咨询师列表 + 预约（选时段 → 提交 pending） */
export default function Counselors({ onGoAppointments }) {
  const [state, setState] = useState({ loading: true, error: null, forbidden: false });
  const [items, setItems] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [spec, setSpec] = useState("");
  const [detail, setDetail] = useState(null);      // 当前打开的咨询师
  const [detailLoading, setDetailLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async (nextPage = 1, opts = {}) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.counselors({ page: nextPage, size: PAGE_SIZE, q: opts.q ?? q, specialty: opts.spec ?? spec });
      setItems((prev) => (nextPage === 1 ? data.counselors : [...prev, ...data.counselors]));
      setSpecialties(data.specialties || []);
      setTotal(data.total);
      setPage(nextPage);
      setState({ loading: false, error: null, forbidden: false });
    } catch (e) {
      if (e.status === 403) setState({ loading: false, error: null, forbidden: true });
      else setState({ loading: false, error: e, forbidden: false });
    }
  }, [q, spec]);

  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);

  async function openDetail(c) {
    setDetail({ ...c, taken_slots: [] });
    setDetailLoading(true);
    setNotFound(false);
    try {
      const data = await api.counselor(c.id);
      setDetail(data.counselor);
    } catch (e) {
      if (e.status === 404) setNotFound(true);
      else setState((s) => ({ ...s, error: e }));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  if (state.forbidden) return <ForbiddenState desc="当前账号无法访问咨询师资源。" />;
  if (state.loading && items.length === 0) return <PageLoading rows={3} />;
  if (state.error && items.length === 0) return <ErrorState error={state.error} onRetry={() => load(1)} />;

  return (
    <div className="mc-flow">
      <div>
        <h1 className="page-title">咨询师</h1>
        <Text size="sm" c="dimmed" mt={6}>选一位合适的咨询师，预约一次谈话。</Text>
      </div>

      <TextInput
        placeholder="搜索姓名、擅长领域或简介"
        leftSection={<IconSearch size={16} />}
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === "Enter") load(1, { q: e.currentTarget.value }); }}
        radius="md"
      />

      {specialties.length > 0 && (
        <Group gap={6} wrap="wrap">
          <Chip
            size="sm" radius="sm" variant={spec === "" ? "filled" : "outline"}
            checked={spec === ""} onChange={() => { setSpec(""); load(1, { spec: "" }); }}
          >
            全部
          </Chip>
          {specialties.slice(0, 8).map((s) => (
            <Chip
              key={s} size="sm" radius="sm"
              variant={spec === s ? "filled" : "outline"}
              checked={spec === s}
              onChange={() => { const next = spec === s ? "" : s; setSpec(next); load(1, { spec: next }); }}
            >
              {s}
            </Chip>
          ))}
        </Group>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon="🧑‍⚕️" title="没有匹配的咨询师"
          desc="试试换个关键词，或清空筛选条件。"
          action={<Button variant="light" radius="md" onClick={() => { setQ(""); setSpec(""); load(1, { q: "", spec: "" }); }}>重置筛选</Button>}
        />
      ) : (
        <Stack gap="md">
          {items.map((c) => (
            <Card key={c.id} className="mc-glass" padding="lg" radius="lg" onClick={() => openDetail(c)} style={{ cursor: "pointer" }}>
              <Group align="flex-start" wrap="nowrap" gap="md">
                <div style={{ fontSize: 34, lineHeight: 1 }} aria-hidden="true">{c.avatar || "🧑‍⚕️"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={600} className="apple-headline">{c.name}</Text>
                    <Rating value={c.rating} fractions={2} readOnly size="xs" />
                    <Text size="xs" c="dimmed">{c.rating?.toFixed(1)}（{c.rating_count}）</Text>
                  </Group>
                  <Text size="sm" c="dimmed" mt={2}>{c.title}</Text>
                  <Group gap={6} mt="sm" wrap="wrap">
                    {c.specialties.slice(0, 3).map((s) => (
                      <span className="apple-tag" key={s}>{s}</span>
                    ))}
                  </Group>
                  <Text size="sm" mt="sm" lineClamp={2} c="dimmed">{c.intro}</Text>
                  <Group justify="space-between" mt="sm">
                    <Text size="xs" c="dimmed">可预约 {c.slots?.length || 0} 个时段 · ¥{c.price}/次</Text>
                    <IconChevronRight size={16} color="var(--label-tertiary)" />
                  </Group>
                </div>
              </Group>
            </Card>
          ))}
          {items.length < total && (
            <Button variant="light" radius="md" loading={state.loading} onClick={() => load(page + 1)}>
              加载更多（{items.length}/{total}）
            </Button>
          )}
        </Stack>
      )}

      <BookModal
        counselor={detail}
        loading={detailLoading}
        notFound={notFound}
        onClose={() => setDetail(null)}
        onDone={() => { setDetail(null); onGoAppointments?.(); }}
      />
    </div>
  );
}

function BookModal({ counselor, loading, notFound, onClose, onDone }) {
  const [slot, setSlot] = useState("");
  const [topic, setTopic] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  useEffect(() => { setSlot(""); setTopic(""); setNote(""); setError(null); setOk(false); }, [counselor?.id]);

  if (notFound) {
    return (
      <Modal opened onClose={onClose} centered title="咨询师">
        <NotFoundState desc="该咨询师不存在或已下架。" />
      </Modal>
    );
  }

  const taken = new Set(counselor?.taken_slots || []);

  async function submit() {
    if (!slot) { setError("请先选择一个时段"); return; }
    setSubmitting(true); setError(null);
    try {
      await api.createAppointment({ counselor_id: counselor.id, slot, topic, note });
      setOk(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      opened={!!counselor}
      onClose={onClose}
      centered
      size="lg"
      title={counselor ? `${counselor.name} · ${counselor.title || ""}` : ""}
      radius="lg"
    >
      {loading ? (
        <PageLoading rows={1} />
      ) : ok ? (
        <Stack align="center" gap="md" py="lg">
          <div style={{ fontSize: 40 }} aria-hidden="true">✅</div>
          <Text fw={600} className="apple-headline">预约已提交</Text>
          <Text size="sm" c="dimmed" ta="center">
            时段 {slot} 已锁定，等待咨询师确认。你可以在「我的预约」查看进度。
          </Text>
          <Group>
            <Button radius="md" onClick={onDone}>查看我的预约</Button>
            <Button radius="md" variant="light" onClick={onClose}>继续浏览</Button>
          </Group>
        </Stack>
      ) : counselor ? (
        <Stack gap="md">
          <Group gap={6} wrap="wrap">
            {counselor.specialties.map((s) => <span className="apple-tag" key={s}>{s}</span>)}
          </Group>
          <Text size="sm" c="dimmed">{counselor.intro}</Text>

          <div>
            <Text className="mc-section-title" mb={8}>选择时段</Text>
            <Group gap={8} wrap="wrap">
              {counselor.slots.map((s) => {
                const isTaken = taken.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={isTaken}
                    onClick={() => setSlot(s)}
                    className="apple-btn"
                    style={{
                      background: isTaken ? "var(--fill-tertiary)" : (slot === s ? "var(--tint)" : "var(--fill-secondary)"),
                      color: isTaken ? "var(--label-tertiary)" : (slot === s ? "#fff" : "var(--label)"),
                      cursor: isTaken ? "not-allowed" : "pointer",
                    }}
                  >
                    {s}{isTaken ? "（已约）" : ""}
                  </button>
                );
              })}
            </Group>
          </div>

          <TextInput
            label="想聊的主题" placeholder="例如：考试焦虑、睡眠问题"
            value={topic} onChange={(e) => setTopic(e.currentTarget.value)} maxLength={100} radius="md"
          />
          <Textarea
            label="补充说明（选填）" placeholder="想让咨询师提前了解的情况"
            value={note} onChange={(e) => setNote(e.currentTarget.value)} maxLength={500} minRows={2} radius="md"
          />

          {error && <Text size="sm" c="red">{error}</Text>}

          <Group justify="flex-end">
            <Button variant="subtle" radius="md" onClick={onClose}>取消</Button>
            <Button radius="md" loading={submitting} onClick={submit} leftSection={<IconCalendarPlus size={16} />}>
              提交预约
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}
