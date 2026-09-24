import React, { useCallback, useEffect, useState } from "react";
import {
  Badge, Button, Card, Chip, Group, Progress, SegmentedControl, Stack, Text, TextInput,
} from "@mantine/core";
import { IconSearch, IconBookmark, IconBookmarkFilled, IconChevronRight, IconArrowLeft } from "@tabler/icons-react";
import { api } from "../api/client";
import { PageLoading, ErrorState, EmptyState, NotFoundState } from "../components/States.jsx";

const PAGE_SIZE = 8;

/** 资源库：分类文章 + 收藏 + 阅读进度 + 我的 AI 周报 */
export default function Resources() {
  const [tab, setTab] = useState("all");         // all | collected | mine
  const [state, setState] = useState({ loading: true, error: null });
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailState, setDetailState] = useState({ loading: false, error: null, notFound: false });

  const load = useCallback(async (nextPage = 1, opts = {}) => {
    setState({ loading: true, error: null });
    const nextTab = opts.tab ?? tab;
    const nextCat = opts.category ?? category;
    const nextQ = opts.q ?? q;
    try {
      let data;
      if (nextTab === "collected") {
        data = await api.collectedResources();
        data = { ...data, total: data.resources.length, categories: [] };
      } else {
        data = await api.resources({
          page: nextPage, size: PAGE_SIZE, category: nextCat, q: nextQ,
          mine: nextTab === "mine" ? 1 : undefined,
        });
      }
      setItems((prev) => (nextPage === 1 || nextTab === "collected" ? data.resources : [...prev, ...data.resources]));
      setCategories(data.categories || []);
      setTotal(data.total ?? data.resources.length);
      setPage(nextPage);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: e });
    }
  }, [tab, category, q]);

  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);

  async function openDetail(id) {
    setDetailState({ loading: true, error: null, notFound: false });
    setDetail({ id });
    try {
      const data = await api.resource(id);
      setDetail(data.resource);
      setDetailState({ loading: false, error: null, notFound: false });
    } catch (e) {
      if (e.status === 404) setDetailState({ loading: false, error: null, notFound: true });
      else setDetailState({ loading: false, error: e, notFound: false });
    }
  }

  async function toggleCollect(r, e) {
    e?.stopPropagation?.();
    try {
      const data = await api.collectResource(r.id);
      setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, collected: data.collected } : x)));
      if (detail?.id === r.id) setDetail((d) => ({ ...d, collected: data.collected }));
      if (tab === "collected") load(1, { tab: "collected" });
    } catch (err) {
      setState((s) => ({ ...s, error: err }));
    }
  }

  // 详情视图
  if (detail) {
    return (
      <ResourceDetail
        resource={detail}
        state={detailState}
        onBack={() => { setDetail(null); setDetailState({ loading: false, error: null, notFound: false }); }}
        onCollect={(r, e) => toggleCollect(r, e)}
        onProgress={(pct) => {
          api.resourceProgress(detail.id, pct).then(() => {
            setDetail((d) => ({ ...d, progress: pct }));
            setItems((prev) => prev.map((x) => (x.id === detail.id ? { ...x, progress: pct } : x)));
          }).catch(() => {});
        }}
      />
    );
  }

  if (state.loading && items.length === 0) return <PageLoading rows={3} />;
  if (state.error && items.length === 0) return <ErrorState error={state.error} onRetry={() => load(1)} />;

  return (
    <div className="mc-flow">
      <div>
        <h1 className="page-title">资源库</h1>
        <Text size="sm" c="dimmed" mt={6}>心理科普文章，以及属于你的 AI 情绪周报。</Text>
      </div>

      <SegmentedControl
        fullWidth radius="md"
        value={tab}
        onChange={(v) => { setTab(v); setCategory(""); load(1, { tab: v, category: "" }); }}
        data={[
          { label: "全部文章", value: "all" },
          { label: "我的收藏", value: "collected" },
          { label: "我的周报", value: "mine" },
        ]}
      />

      {tab !== "collected" && (
        <TextInput
          placeholder="搜索标题或摘要"
          leftSection={<IconSearch size={16} />}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") load(1, { q: e.currentTarget.value }); }}
          radius="md"
        />
      )}

      {tab === "all" && categories.length > 0 && (
        <Group gap={6} wrap="wrap">
          <Chip size="sm" radius="sm" variant={category === "" ? "filled" : "outline"} checked={category === ""}
            onChange={() => { setCategory(""); load(1, { category: "" }); }}>
            全部
          </Chip>
          {categories.map((c) => (
            <Chip
              key={c.category} size="sm" radius="sm"
              variant={category === c.category ? "filled" : "outline"}
              checked={category === c.category}
              onChange={() => {
                const next = category === c.category ? "" : c.category;
                setCategory(next); load(1, { category: next });
              }}
            >
              {c.category} {c.c}
            </Chip>
          ))}
        </Group>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={tab === "collected" ? "🔖" : tab === "mine" ? "📊" : "📚"}
          title={tab === "collected" ? "还没有收藏" : tab === "mine" ? "还没有周报" : "没有匹配的文章"}
          desc={
            tab === "collected" ? "在文章详情页点右上角的书签，就能收藏到这里。"
              : tab === "mine" ? "去首页生成一份情绪周报，它会出现在这里。"
                : "试试换个关键词，或清空分类筛选。"
          }
        />
      ) : (
        <Stack gap="md">
          {items.map((r) => (
            <Card key={r.id} className="mc-glass" padding="lg" radius="lg" onClick={() => openDetail(r.id)} style={{ cursor: "pointer" }}>
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Group gap="xs" wrap="nowrap">
                    {r.kind === "weekly_report" ? (
                      <Badge color="pink" variant="light" radius="sm" size="sm">AI 周报</Badge>
                    ) : (
                      <span className="apple-tag">{r.category}</span>
                    )}
                    <Text size="xs" c="dimmed">{r.read_minutes} 分钟</Text>
                  </Group>
                  <Text fw={600} className="apple-headline" mt={6} lineClamp={2}>{r.title}</Text>
                  {r.summary && <Text size="sm" c="dimmed" mt={4} lineClamp={2}>{r.summary}</Text>}
                  {r.progress > 0 && (
                    <Group gap="xs" mt="sm" wrap="nowrap">
                      <Progress value={r.progress} size="xs" radius="xl" style={{ flex: 1, maxWidth: 160 }} color="pink" />
                      <Text size="xs" c="dimmed">已读 {r.progress}%</Text>
                    </Group>
                  )}
                </div>
                <Group gap={6} wrap="nowrap">
                  <button
                    type="button"
                    className="apple-btn apple-btn--plain"
                    style={{ padding: 6, height: "auto" }}
                    aria-label={r.collected ? "取消收藏" : "收藏"}
                    onClick={(e) => toggleCollect(r, e)}
                  >
                    {r.collected
                      ? <IconBookmarkFilled size={18} color="var(--tint)" />
                      : <IconBookmark size={18} color="var(--label-tertiary)" />}
                  </button>
                  <IconChevronRight size={16} color="var(--label-tertiary)" />
                </Group>
              </Group>
            </Card>
          ))}
          {tab !== "collected" && items.length < total && (
            <Button variant="light" radius="md" loading={state.loading} onClick={() => load(page + 1)}>
              加载更多（{items.length}/{total}）
            </Button>
          )}
        </Stack>
      )}
    </div>
  );
}

function ResourceDetail({ resource, state, onBack, onCollect, onProgress }) {
  const [pct, setPct] = useState(resource?.progress || 0);

  useEffect(() => { setPct(resource?.progress || 0); }, [resource?.id, resource?.progress]);

  if (state.notFound) {
    return (
      <div className="mc-flow">
        <BackBar onBack={onBack} />
        <NotFoundState desc="这篇文章不存在，或你没有查看权限。" />
      </div>
    );
  }
  if (state.loading) {
    return (
      <div className="mc-flow">
        <BackBar onBack={onBack} />
        <PageLoading rows={2} />
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="mc-flow">
        <BackBar onBack={onBack} />
        <ErrorState error={state.error} />
      </div>
    );
  }

  return (
    <div className="mc-flow">
      <BackBar onBack={onBack} onCollect={() => onCollect(resource)} collected={resource.collected} />

      <div>
        <Group gap="xs" mb={8} wrap="wrap">
          {resource.kind === "weekly_report"
            ? <Badge color="pink" variant="light" radius="sm">AI 周报</Badge>
            : <span className="apple-tag">{resource.category}</span>}
          <Text size="xs" c="dimmed">{resource.read_minutes} 分钟阅读</Text>
          {resource.source === "local" && <Text size="xs" c="dimmed">· 本地生成</Text>}
        </Group>
        <h1 className="page-title" style={{ fontSize: 28 }}>{resource.title}</h1>
        {resource.summary && <Text size="sm" c="dimmed" mt={8}>{resource.summary}</Text>}
      </div>

      <Card className="mc-glass" padding="lg" radius="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" fw={500}>阅读进度</Text>
            <Text size="sm" c="dimmed">{pct}%</Text>
          </Group>
          <Progress value={pct} size="sm" radius="xl" color="pink" />
          <Group gap="sm">
            {[25, 50, 75, 100].map((p) => (
              <Button
                key={p} size="compact-sm" radius="md"
                variant={pct === p ? "filled" : "light"}
                onClick={() => { setPct(p); onProgress(p); }}
              >
                {p}%
              </Button>
            ))}
          </Group>
        </Stack>
      </Card>

      <Card className="mc-glass" padding="lg" radius="lg">
        <div className="md" style={{ whiteSpace: "pre-wrap", fontSize: "var(--fs-body)", lineHeight: "var(--lh-body)" }}>
          {resource.content}
        </div>
      </Card>
    </div>
  );
}

function BackBar({ onBack, onCollect, collected }) {
  return (
    <Group justify="space-between">
      <button type="button" className="apple-btn apple-btn--plain" onClick={onBack} style={{ paddingLeft: 0 }}>
        <IconArrowLeft size={18} /> 返回
      </button>
      {onCollect && (
        <button
          type="button"
          className="apple-btn apple-btn--secondary"
          onClick={onCollect}
          aria-label={collected ? "取消收藏" : "收藏"}
        >
          {collected ? <IconBookmarkFilled size={16} /> : <IconBookmark size={16} />}
          {collected ? "已收藏" : "收藏"}
        </button>
      )}
    </Group>
  );
}
