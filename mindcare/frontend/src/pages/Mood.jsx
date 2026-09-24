import React, { useEffect, useState } from "react";
import {
  Card, Button, TextInput, Textarea, Slider, SegmentedControl, Badge, Text, Group,
  Stack, Box, RingProgress, Title, Divider, Center, Collapse,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconPlus, IconTrash, IconPencil, IconCheck, IconX, IconMoodSmile, IconTag,
  IconHistory, IconChartPie, IconChevronDown,
} from "@tabler/icons-react";
import { api } from "../api/client";
import { KIND, SWATCHES, SEGMENT_COLORS, DEFAULT_EMOJI } from "../theme";
import Reveal from "../components/Reveal";
import { PageLoading, ErrorState } from "../components/States.jsx";

// 常用情绪词，一键速加
const COMMON = ["安心", "激动", "委屈", "无聊", "自豪", "感恩", "生气", "想哭", "平静的", "开心!"];

export default function Mood() {
  const [score, setScore] = useState(5);
  const [emotion, setEmotion] = useState("");
  const [note, setNote] = useState("");
  const [moods, setMoods] = useState([]);
  const [tags, setTags] = useState([]); // 全量标签（含内置+自定义+隐藏）

  // 折叠面板：标签管理 / 情绪分布
  const [openTags, setOpenTags] = useState(false);
  const [openDist, setOpenDist] = useState(false);
  const [state, setState] = useState({ loading: true, error: null });

  // 新增标签
  const [newTag, setNewTag] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newKind, setNewKind] = useState("neutral");

  // 编辑标签
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const visibleTags = tags.filter((t) => !t.hidden);

  function metaOf(name) {
    return tags.find((t) => t.tag === name);
  }
  function colorOf(name) {
    const m = metaOf(name);
    if (m && m.color) return m.color;
    if (m && KIND[m.kind]) return KIND[m.kind].color;
    const i = tags.findIndex((t) => t.tag === name);
    return SEGMENT_COLORS[Math.max(0, i) % SEGMENT_COLORS.length];
  }
  function emojiOf(name) {
    const m = metaOf(name);
    return (m && m.emoji) || DEFAULT_EMOJI;
  }

  const dist = React.useMemo(() => {
    const map = {};
    moods.forEach((m) => { const e = m.emotion || "平静"; map[e] = (map[e] || 0) + 1; });
    const arr = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const total = arr.reduce((s, [, c]) => s + c, 0) || 1;
    return { arr: arr.slice(0, 8), total };
  }, [moods]);
  const topEmotion = dist.arr[0]?.[0] || "—";

  async function load() {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const d = await api.listMoods();
      setMoods(d.moods);
      setState({ loading: false, error: null });
    } catch (ex) {
      setState({ loading: false, error: ex });
    }
  }
  async function loadTags() {
    try {
      const d = await api.moodTags();
      setTags(d.tags);
      if (!emotion && d.tags.length) {
        const calm = d.tags.find((t) => t.tag === "平静" && !t.hidden) || d.tags.find((t) => !t.hidden);
        if (calm) setEmotion(calm.tag);
      }
    } catch {}
  }
  useEffect(() => {
    load();
    loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toast(message, color = "mindcare") {
    notifications.show({ message, color, radius: "lg", autoClose: 2200 });
  }

  async function removeMood(id) {
    if (!window.confirm("确定删除这条情绪记录吗？")) return;
    try { await api.deleteMood(id); load(); toast("已删除该条记录", "gray"); }
    catch (ex) { toast(ex.message, "red"); }
  }

  async function addTag(tagName) {
    const t = (tagName ?? newTag).trim();
    if (!t) return;
    try {
      await api.addMoodTag({
        tag: t,
        emoji: newEmoji.trim() || undefined,
        kind: newKind,
        color: undefined,
      });
      setNewTag(""); setNewEmoji("");
      await loadTags();
      setEmotion(t);
    } catch (ex) { toast(ex.message, "red"); }
  }

  async function addCommon(word) {
    if (tags.some((x) => x.tag === word)) { setEmotion(word); return; }
    try {
      await api.addMoodTag({ tag: word, emoji: DEFAULT_EMOJI, kind: "neutral", color: undefined });
      await loadTags();
      setEmotion(word);
    } catch (ex) { toast(ex.message, "red"); }
  }

  async function removeTag(tagRow) {
    if (!window.confirm(tagRow.is_builtin ? "隐藏该标签（历史记录保留）？" : "删除该标签？")) return;
    try {
      if (tagRow.is_builtin) {
        await api.updateMoodTag(tagRow.id, { hidden: true });
      } else {
        await api.deleteMoodTag(tagRow.id);
      }
      if (emotion === tagRow.tag) setEmotion("");
      await loadTags();
    } catch (ex) { toast(ex.message, "red"); }
  }

  async function beginEdit(tagRow) {
    setEditingId(tagRow.id);
    setEditForm({ tag: tagRow.tag, emoji: tagRow.emoji || "", kind: tagRow.kind || "neutral", color: tagRow.color || "" });
  }
  async function saveEdit(tagRow) {
    try {
      await api.updateMoodTag(tagRow.id, {
        tag: editForm.tag.trim() || tagRow.tag,
        emoji: editForm.emoji.trim() || undefined,
        kind: editForm.kind,
        color: editForm.color || undefined,
      });
      setEditingId(null);
      setEmotion(editForm.tag.trim() || tagRow.tag);
      await loadTags();
      toast("标签已更新");
    } catch (ex) { toast(ex.message, "red"); }
  }

  async function save() {
    if (!emotion) return toast("请选择一个情绪标签", "red");
    try {
      await api.moodToday({ mood_score: score, emotion, note });
      setNote("");
      toast("已记录今天的情绪 ✔");
      load();
    } catch (ex) { toast(ex.message, "red"); }
  }

  function groupTags(k) {
    return visibleTags.filter((t) => (t.kind || "neutral") === k);
  }

  const topPct = dist.arr.length ? (dist.arr[0][1] / dist.total) * 100 : 0;

  return (
    <div className="mc-flow">
      <Reveal>
        <Box pt={6}>
          <Text className="mc-section-title">情绪日记</Text>
          <h1 className="page-title" style={{ marginTop: 6 }}>此刻感觉如何？</h1>
        </Box>
      </Reveal>
      {state.loading ? (
        <PageLoading rows={2} />
      ) : state.error ? (
        <ErrorState error={state.error} onRetry={load} />
      ) : (
      <>

      {/* ---- 记录此刻心情（主卡） ---- */}
      <Reveal delay={60} depth={30}>
        <Card radius="lg" padding="lg" className="mc-glass">
          <Stack gap="xs">
            <Text size="sm" fw={600}>情绪标签</Text>
            {(["positive", "neutral", "negative"]).map((k) =>
              groupTags(k).length > 0 && (
                <Box key={k}>
                  <Text size="xs" fw={700} c={KIND[k].color} mb={4}>
                    {KIND[k].emoji} {KIND[k].label}
                  </Text>
                  <Group gap={8}>
                    {groupTags(k).map((e) => {
                      const on = emotion === e.tag;
                      const c = e.color || KIND[k].color;
                      return (
                        <Badge
                          key={e.id}
                          size="lg"
                          radius="lg"
                          variant={on ? "filled" : "light"}
                          color="gray"
                          style={{
                            cursor: "pointer",
                            textTransform: "none",
                            border: `1px solid ${on ? c : "rgba(255,45,85,.18)"}`,
                            background: on ? c + "33" : undefined,
                            color: "var(--label)",
                            fontWeight: on ? 700 : 500,
                          }}
                          onClick={() => setEmotion(e.tag)}
                        >
                          {e.emoji && <span style={{ marginRight: 3 }}>{e.emoji}</span>}
                          {e.tag}
                        </Badge>
                      );
                    })}
                  </Group>
                </Box>
              )
            )}
          </Stack>

          <Group gap={6} mt="sm">
            <Text size="xs" c="dimmed">常用词：</Text>
            {COMMON.map((c) => (
              <Badge
                key={c}
                variant="outline"
                color="mindcare"
                radius="lg"
                style={{ cursor: "pointer", textTransform: "none" }}
                onClick={() => addCommon(c)}
              >
                {c}
              </Badge>
            ))}
          </Group>

          <Divider my="md" />

          <Text size="sm" fw={600} mb={6}>心情评分（1 很低 · 10 很好）</Text>
          <Group gap="md" wrap="nowrap">
            <Title order={1} c="mindcare" w={54} ta="center">{score}</Title>
            <Slider
              style={{ flex: 1 }}
              min={1}
              max={10}
              step={1}
              value={score}
              onChange={setScore}
              color="mindcare"
              marks={[{ value: 1, label: "1" }, { value: 5, label: "5" }, { value: 10, label: "10" }]}
            />
          </Group>

          <Textarea
            mt="md"
            label="想说的（可选）"
            placeholder="今天发生了什么？"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autosize
            minRows={2}
            radius="md"
          />

          <Button mt="md" fullWidth radius="lg" color="mindcare" onClick={save} leftSection={<IconMoodSmile size={16} />}>
            保存今天的记录
          </Button>
        </Card>
      </Reveal>

      {/* ---- 情绪时间轴（替代原表格列表） ---- */}
      <Reveal delay={40} depth={26}>
        <Card radius="lg" padding="lg" className="mc-glass">
          <Group gap={8} mb="lg">
            <IconHistory size={17} color="#FF2D55" />
            <Text fw={700}>心情时间轴</Text>
            <Badge size="sm" radius="lg" variant="light" color="mindcare" ml="auto">
              {moods.length} 条
            </Badge>
          </Group>

          {moods.length ? (
            <div className="mc-timeline">
              {moods.map((m, i) => (
                <div className="mc-tl-item" key={m.id}>
                  <span
                    className="mc-tl-dot"
                    style={{ background: m.emotion ? colorOf(m.emotion) : "#94a3b8" }}
                  />
                  <div className="mc-tl-card">
                    <Box p="md">
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Group gap={8} wrap="nowrap">
                            <Text size="sm" fw={700}>
                              {m.emotion ? `${emojiOf(m.emotion)} ${m.emotion}` : "未标注"}
                            </Text>
                            <Badge size="sm" radius="lg" variant="light" color="mindcare">
                              {m.mood_score} / 10
                            </Badge>
                          </Group>
                          <Text size="xs" c="dimmed" mt={4}>{m.created_at}</Text>
                          {m.note && (
                            <Text size="sm" mt={8} style={{ lineHeight: 1.7 }}>{m.note}</Text>
                          )}
                        </Box>
                        <Button
                          size="compact-xs"
                          radius="md"
                          variant="subtle"
                          color="red"
                          aria-label="删除"
                          onClick={() => removeMood(m.id)}
                        >
                          <IconTrash size={13} />
                        </Button>
                      </Group>
                    </Box>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Center py="xl">
              <Stack align="center" gap={4}>
                <IconMoodSmile size={30} opacity={0.35} />
                <Text c="dimmed" size="sm">还没有记录，先写下第一条心情吧</Text>
              </Stack>
            </Center>
          )}
        </Card>
      </Reveal>

      {/* ---- 情绪分布（折叠） ---- */}
      <Reveal delay={40} depth={22}>
        <Card radius="lg" padding="lg" className="mc-glass">
          <Group
            justify="space-between"
            wrap="nowrap"
            style={{ cursor: "pointer" }}
            onClick={() => setOpenDist(!openDist)}
          >
            <Group gap={8} wrap="nowrap">
              <IconChartPie size={17} color="#FF2D55" />
              <Text fw={700}>情绪分布</Text>
            </Group>
            <IconChevronDown
              size={18}
              color="#8E8E93"
              style={{ transform: openDist ? "rotate(180deg)" : "none", transition: "transform .2s ease" }}
            />
          </Group>

          <Collapse in={openDist}>
            <Box pt="md">
              {dist.arr.length ? (
                <>
                  <Center>
                    <RingProgress
                      size={168}
                      thickness={16}
                      roundCaps
                      sections={dist.arr.map(([e, c]) => ({
                        value: (c / dist.total) * 100,
                        color: colorOf(e),
                        tooltip: `${emojiOf(e)} ${e}`,
                      }))}
                      label={
                        <Center>
                          <Stack gap={0} align="center">
                            <Text size="xs" c="dimmed">主力情绪</Text>
                            <Text fw={700} size="lg" c={colorOf(topEmotion)}>
                              {emojiOf(topEmotion)} {topEmotion}
                            </Text>
                            <Text size="xs" c="dimmed">{topPct.toFixed(0)}% · 共 {dist.total} 条</Text>
                          </Stack>
                        </Center>
                      }
                    />
                  </Center>

                  <Stack gap={6} mt="md">
                    {dist.arr.map(([e, c]) => (
                      <Group key={e} justify="space-between" wrap="nowrap">
                        <Group gap={8} wrap="nowrap">
                          <Box w={10} h={10} style={{ borderRadius: 999, background: colorOf(e) }} />
                          <Text size="sm">{emojiOf(e)} {e}</Text>
                        </Group>
                        <Text size="sm" fw={700} c="dimmed">{((c / dist.total) * 100).toFixed(0)}%</Text>
                      </Group>
                    ))}
                  </Stack>
                </>
              ) : (
                <Center py="xl">
                  <Text c="dimmed" size="sm">暂无记录</Text>
                </Center>
              )}
            </Box>
          </Collapse>
        </Card>
      </Reveal>

      {/* ---- 我的情绪标签（折叠） ---- */}
      <Reveal delay={40} depth={22}>
        <Card radius="lg" padding="lg" className="mc-glass">
          <Group
            justify="space-between"
            wrap="nowrap"
            style={{ cursor: "pointer" }}
            onClick={() => setOpenTags(!openTags)}
          >
            <Group gap={8} wrap="nowrap">
              <IconTag size={17} color="#FF2D55" />
              <Text fw={700}>我的情绪标签</Text>
              <Badge size="sm" radius="lg" variant="light" color="gray">{tags.length}</Badge>
            </Group>
            <IconChevronDown
              size={18}
              color="#8E8E93"
              style={{ transform: openTags ? "rotate(180deg)" : "none", transition: "transform .2s ease" }}
            />
          </Group>

          <Collapse in={openTags}>
            <Box pt="md">
              <Group gap={8} align="flex-end" mb="md">
                <TextInput
                  placeholder="新增自定义标签"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTag()}
                  maxLength={12}
                  radius="md"
                  style={{ flex: 1 }}
                />
                <TextInput
                  placeholder="emoji"
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  maxLength={4}
                  radius="md"
                  w={72}
                />
                <Button radius="md" color="mindcare" leftSection={<IconPlus size={15} />} onClick={() => addTag()}>
                  添加
                </Button>
              </Group>

              {tags.length ? (
                <Stack gap={8}>
                  {tags.map((t) => (
                    <Box key={t.id} className="mc-tagrow" p="xs">
                      {editingId === t.id ? (
                        <Stack gap={8}>
                          <Group gap={8}>
                            <TextInput size="xs" radius="md" value={editForm.tag} onChange={(e) => setEditForm({ ...editForm, tag: e.target.value })} maxLength={12} style={{ flex: 1 }} />
                            <TextInput size="xs" radius="md" value={editForm.emoji} onChange={(e) => setEditForm({ ...editForm, emoji: e.target.value })} placeholder="emoji" maxLength={4} w={72} />
                          </Group>
                          <SegmentedControl
                            size="xs"
                            radius="md"
                            fullWidth
                            value={editForm.kind}
                            onChange={(v) => setEditForm({ ...editForm, kind: v })}
                            color="mindcare"
                            data={Object.entries(KIND).map(([k, v]) => ({ label: v.label, value: k }))}
                          />
                          <Group gap={6}>
                            {SWATCHES.map((c) => (
                              <Box
                                key={c}
                                onClick={() => setEditForm({ ...editForm, color: c })}
                                w={20}
                                h={20}
                                style={{
                                  borderRadius: 999,
                                  background: c,
                                  cursor: "pointer",
                                  outline: editForm.color === c ? "2px solid #FF2D55" : "none",
                                  outlineOffset: 2,
                                }}
                              />
                            ))}
                            <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setEditForm({ ...editForm, color: "" })}>
                              自动
                            </Button>
                          </Group>
                          <Group gap={6}>
                            <Button size="compact-xs" radius="md" color="mindcare" leftSection={<IconCheck size={13} />} onClick={() => saveEdit(t)}>保存</Button>
                            <Button size="compact-xs" radius="md" variant="default" leftSection={<IconX size={13} />} onClick={() => setEditingId(null)}>取消</Button>
                          </Group>
                        </Stack>
                      ) : (
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap={8} wrap="nowrap">
                            <Box
                              w={10}
                              h={10}
                              style={{
                                borderRadius: 999,
                                background: t.color || KIND[t.kind].color,
                                opacity: t.hidden ? 0.3 : 1,
                              }}
                            />
                            <Text size="sm">
                              {t.emoji && <span>{t.emoji}</span>} {t.tag}
                              <Text span size="xs" c={KIND[t.kind].color} ml={6}>{KIND[t.kind].label}</Text>
                              {t.is_builtin === 1 && <Badge size="xs" ml={6} variant="light" color="gray">内置</Badge>}
                              {t.hidden === 1 && <Badge size="xs" ml={6} variant="light" color="gray">已隐藏</Badge>}
                            </Text>
                          </Group>
                          <Group gap={4} wrap="nowrap">
                            <Button size="compact-xs" radius="md" variant="light" color="mindcare" leftSection={<IconPencil size={12} />} onClick={() => beginEdit(t)}>编辑</Button>
                            <Button size="compact-xs" radius="md" variant="light" color="red" leftSection={<IconTrash size={12} />} onClick={() => removeTag(t)}>
                              {t.is_builtin ? "隐藏" : "删除"}
                            </Button>
                          </Group>
                        </Group>
                      )}
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Center py="xl">
                  <Stack align="center" gap={4}>
                    <IconTag size={30} opacity={0.35} />
                    <Text c="dimmed" size="sm">暂无标签</Text>
                  </Stack>
                </Center>
              )}
            </Box>
          </Collapse>
        </Card>
      </Reveal>
      </>
      )}
    </div>
  );
}
