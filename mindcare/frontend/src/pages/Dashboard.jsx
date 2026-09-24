import React, { useEffect, useState } from "react";
import {
  Card, Button, Textarea, Text, Group, Stack, Badge, Progress, Modal,
  ThemeIcon, Box, RingProgress, UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconSparkles, IconMoodSmile, IconYoga, IconClipboardHeart, IconChartLine,
  IconMessageChatbot, IconArrowRight, IconPlayerPlay, IconCalendarEvent,
  IconReportAnalytics, IconAlertTriangle,
} from "@tabler/icons-react";
import { api } from "../api/client";
import EChart from "../components/EChart";
import Reveal from "../components/Reveal";
import { PageLoading, ErrorState } from "../components/States.jsx";
import { BRAND } from "../theme.js";

const FOCUS_PRESETS = ["考试压力", "睡眠", "和同学的关系", ""];

export default function Dashboard({ user }) {
  const [summary, setSummary] = useState(null);
  const [moods, setMoods] = useState(null);
  const [dash, setDash] = useState(null);
  const [state, setState] = useState({ loading: true, error: null });

  // AI 情绪周洞察
  const [insightOpen, setInsightOpen] = useState(false);
  const [focus, setFocus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [insight, setInsight] = useState(null);
  const [insightSource, setInsightSource] = useState("");
  const [insightErr, setInsightErr] = useState("");

  async function loadAll() {
    setState({ loading: true, error: null });
    try {
      const [s, m, d] = await Promise.all([
        api.summary(), api.listMoods(), api.dashboard(),
      ]);
      setSummary(s);
      setMoods(m.moods);
      setDash(d);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: e });
    }
  }

  useEffect(() => { loadAll(); }, []);

  function go(key) {
    window.location.hash = "#/" + key;
  }

  function openInsight() {
    setFocus("");
    setInsight(null);
    setInsightSource("");
    setInsightErr("");
    setInsightOpen(true);
  }

  async function genInsight() {
    if (generating) return;
    setGenerating(true);
    setInsight(null);
    setInsightSource("");
    setInsightErr("");
    try {
      const d = await api.aiInsight(focus.trim());
      setInsight(d.text || "（没有生成到内容，请重试）");
      setInsightSource(d.source);
    } catch (ex) {
      setInsightErr(ex.message || "生成失败，请稍后重试");
      notifications.show({ message: ex.message || "生成失败", color: "red", radius: "lg" });
    } finally {
      setGenerating(false);
    }
  }

  const axisColor = "var(--label-secondary)";
  const trendOption = moods
    ? {
        tooltip: { trigger: "axis" },
        grid: { left: 32, right: 16, top: 30, bottom: 24 },
        xAxis: {
          type: "category",
          data: moods.map((m) => (m.created_at || "").slice(5, 10)),
          axisLabel: { color: axisColor },
        },
        yAxis: { type: "value", min: 0, max: 10, axisLabel: { color: axisColor } },
        series: [
          {
            name: "情绪评分",
            type: "line",
            smooth: true,
            data: moods.map((m) => m.mood_score),
            lineStyle: { color: BRAND, width: 2 },
            itemStyle: { color: BRAND },
            areaStyle: { color: "rgba(255,45,85,.10)" },
          },
        ],
      }
    : {};

  if (state.loading) return <PageLoading rows={3} />;
  if (state.error) return <ErrorState error={state.error} onRetry={loadAll} />;

  const avg = summary.avg_mood ?? "—";
  const avgPct = summary.avg_mood ? (summary.avg_mood / 10) * 100 : 0;
  const medMin = Math.round((summary.meditation_total_sec || 0) / 60);
  const latest = moods[0];
  const upcoming = dash?.upcoming_appointments || [];
  const report = dash?.weekly_report;

  return (
    <div className="mc-flow">
      {/* ---- 问候 ---- */}
      <Reveal>
        <Box pt={6}>
          <Text className="mc-section-title">今天也要好好照顾自己</Text>
          <h1 className="page-title" style={{ marginTop: 6 }}>
            你好，{user.nickname || user.username}
          </h1>
        </Box>
      </Reveal>

      {/* ---- 危机提示（仅在有未处理预警时出现） ---- */}
      {dash?.open_alerts > 0 && (
        <Reveal>
          <Card className="mc-glass" padding="lg" radius="lg">
            <Group gap={10} wrap="nowrap">
              <ThemeIcon size={36} radius="xl" variant="light" color="red">
                <IconAlertTriangle size={18} />
              </ThemeIcon>
              <Box style={{ flex: 1 }}>
                <Text fw={600} size="sm">有人正在关心你</Text>
                <Text size="xs" c="dimmed" mt={2}>
                  系统记录到近期状态需要关注，咨询师已收到提醒。你也可以主动预约一次谈话。
                </Text>
              </Box>
              <Button size="compact-sm" radius="md" variant="light" onClick={() => go("counselors")}>
                去预约
              </Button>
            </Group>
          </Card>
        </Reveal>
      )}

      {/* ---- 卡片一：今日心情（Hero） ---- */}
      <Reveal>
        <Card className="mc-glass" padding="lg" radius="lg">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Box>
              <Text className="mc-section-title">今日心情</Text>
              <Text fw={600} className="apple-title2" mt={8}>
                {latest ? `${latest.emotion || "平静"}` : "还没有记录"}
              </Text>
              <Text size="xs" c="dimmed" mt={2}>
                {latest ? latest.created_at : "记录一条，让今天有迹可循"}
              </Text>
            </Box>
            <RingProgress
              size={92}
              thickness={8}
              roundCaps
              sections={[{ value: avgPct, color: BRAND }]}
              label={
                <div style={{ textAlign: "center" }}>
                  <Text fw={700} size="lg" c="pink">{avg}</Text>
                </div>
              }
            />
          </Group>

          <Box className="mc-tint" p="md" mt="lg">
            <Group justify="space-between" wrap="nowrap">
              <Box>
                <Text size="xs" c="dimmed">近 7 天平均情绪</Text>
                <Text fw={600} size="sm" mt={2}>{summary.mood_count} 条记录</Text>
              </Box>
              <Progress value={avgPct} color="pink" radius="xl" w={120} size="sm" />
            </Group>
          </Box>

          <Button
            mt="lg" fullWidth radius="lg" color="pink"
            leftSection={<IconMoodSmile size={17} />}
            rightSection={<IconArrowRight size={15} />}
            onClick={() => go("mood")}
          >
            {latest ? "更新今天的心情" : "记录此刻心情"}
          </Button>
        </Card>
      </Reveal>

      {/* ---- 卡片：最新情绪周报（AI 落库 → 首页展示） ---- */}
      <Reveal>
        <Card className="mc-glass" padding="lg" radius="lg">
          <Group justify="space-between" align="flex-start" wrap="nowrap" mb={8}>
            <Group gap={8} wrap="nowrap">
              <ThemeIcon size={34} radius="xl" variant="light" color="pink">
                <IconReportAnalytics size={18} />
              </ThemeIcon>
              <Text fw={600}>情绪周报</Text>
            </Group>
            {report?.source && (
              <Badge color="pink" variant="light" radius="sm" size="sm">
                {report.source === "cloud" ? "云端生成" : "本地生成"}
              </Badge>
            )}
          </Group>

          {report ? (
            <>
              <Text size="sm" fw={500}>{report.title}</Text>
              <Text size="sm" c="dimmed" mt={6} lineClamp={3}>{report.summary}</Text>
              <Button
                mt="md" variant="light" color="pink" radius="lg" fullWidth
                rightSection={<IconArrowRight size={15} />}
                onClick={() => go("weekly")}
              >
                查看完整周报
              </Button>
            </>
          ) : (
            <>
              <Text size="sm" c="dimmed">
                还没有周报。基于你最近 7 天的情绪记录生成一份，它会保存在你的私人报告区。
              </Text>
              <Button
                mt="md" color="pink" radius="lg" fullWidth
                leftSection={<IconSparkles size={16} />}
                onClick={() => go("weekly")}
              >
                生成我的周报
              </Button>
            </>
          )}
        </Card>
      </Reveal>

      {/* ---- 卡片：待办预约 ---- */}
      {upcoming.length > 0 && (
        <Reveal>
          <Card className="mc-glass" padding="lg" radius="lg">
            <Group justify="space-between" mb="sm">
              <Group gap={8} wrap="nowrap">
                <ThemeIcon size={34} radius="xl" variant="light" color="pink">
                  <IconCalendarEvent size={18} />
                </ThemeIcon>
                <Text fw={600}>待进行的预约</Text>
              </Group>
              <Button size="compact-sm" variant="subtle" color="pink" onClick={() => go("appointments")}>
                全部
              </Button>
            </Group>
            <Stack gap="sm">
              {upcoming.map((a) => (
                <Group key={a.id} justify="space-between" wrap="nowrap">
                  <Box style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500} lineClamp={1}>{a.topic || "（未填写主题）"}</Text>
                    <Text size="xs" c="dimmed">
                      {a.counselor_avatar} {a.counselor_name} · {a.slot}
                    </Text>
                  </Box>
                  <Badge
                    color={a.status === "confirmed" ? "blue" : "yellow"}
                    variant="light" radius="sm" size="sm"
                  >
                    {a.status === "confirmed" ? "已确认" : "待确认"}
                  </Badge>
                </Group>
              ))}
            </Stack>
          </Card>
        </Reveal>
      )}

      {/* ---- 卡片二：最近测评 ---- */}
      <Reveal>
        <Card className="mc-glass" padding="lg" radius="lg">
          <Group justify="space-between" wrap="nowrap" mb="sm">
            <Group gap={8} wrap="nowrap">
              <ThemeIcon size={34} radius="xl" variant="light" color="pink">
                <IconClipboardHeart size={18} />
              </ThemeIcon>
              <Text fw={600}>最近测评</Text>
            </Group>
            {summary.last_assessment ? (
              <Badge color="pink" variant="light" radius="sm">{summary.last_assessment.level}</Badge>
            ) : (
              <Badge color="gray" variant="light" radius="sm">未测评</Badge>
            )}
          </Group>

          {summary.last_assessment ? (
            <Group align="baseline" gap={8}>
              <Text className="mc-bignum">{summary.last_assessment.total_score}</Text>
              <Text size="sm" c="dimmed">SDS 标准分</Text>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              用 20 道题了解自己最近的情绪状态，结果仅供自我参考。
            </Text>
          )}

          <Button mt="md" variant="light" color="pink" radius="lg" fullWidth onClick={() => go("assessment")}>
            开始一次测评
          </Button>
        </Card>
      </Reveal>

      {/* ---- 卡片三：冥想推荐 ---- */}
      <Reveal>
        <Card className="mc-glass" padding="lg" radius="lg">
          <Group justify="space-between" wrap="nowrap">
            <Box>
              <Text className="mc-section-title">冥想推荐</Text>
              <Text fw={600} size="lg" mt={6}>5 分钟呼吸放松</Text>
              <Text size="sm" c="dimmed" mt={6} maw={320}>
                跟随引导，把注意力交还给呼吸。
              </Text>
            </Box>
            <ThemeIcon size={54} radius="xl" variant="light" color="pink">
              <IconYoga size={28} />
            </ThemeIcon>
          </Group>

          <Group gap="xl" mt="lg">
            <Box>
              <Text fw={700} size="24px" lh={1}>{medMin}</Text>
              <Text size="xs" c="dimmed" mt={4}>累计分钟</Text>
            </Box>
            <Box>
              <Text fw={700} size="24px" lh={1}>{summary.meditation_count}</Text>
              <Text size="xs" c="dimmed" mt={4}>练习次数</Text>
            </Box>
          </Group>

          <Button
            mt="lg" radius="lg" color="pink"
            leftSection={<IconPlayerPlay size={16} />}
            onClick={() => go("meditation")}
          >
            进入沉浸冥想
          </Button>
        </Card>
      </Reveal>

      {/* ---- 卡片四：陪聊入口 ---- */}
      <Reveal>
        <UnstyledButton w="100%" onClick={() => go("chat")}>
          <Card className="mc-glass" padding="lg" radius="lg">
            <Group justify="space-between" wrap="nowrap">
              <Group gap={12} wrap="nowrap">
                <ThemeIcon size={44} radius="xl" variant="light" color="pink">
                  <IconMessageChatbot size={23} />
                </ThemeIcon>
                <Box>
                  <Text fw={600}>找 AI 聊聊</Text>
                  <Text size="xs" c="dimmed" mt={2}>倾诉不设限，我会一直认真听</Text>
                </Box>
              </Group>
              <IconArrowRight size={18} color="var(--label-tertiary)" />
            </Group>
          </Card>
        </UnstyledButton>
      </Reveal>

      {/* ---- 卡片五：情绪趋势 ---- */}
      <Reveal>
        <Card className="mc-glass" padding="lg" radius="lg">
          <Text className="mc-section-title" mb="md">情绪变化趋势</Text>
          {moods.length ? (
            <EChart option={trendOption} />
          ) : (
            <div className="mc-state" style={{ padding: "32px 16px" }}>
              <IconChartLine size={30} opacity={0.35} />
              <Text c="dimmed" size="sm">还没有情绪记录，先记录第一条吧</Text>
            </div>
          )}
        </Card>
      </Reveal>

      {/* ---- 卡片六：AI 情绪周洞察 ---- */}
      <Reveal>
        <Card className="mc-glass" padding="lg" radius="lg">
          <Group gap={8} mb={6}>
            <IconSparkles size={18} color={BRAND} />
            <Text fw={600}>AI 情绪洞察</Text>
          </Group>
          <Text c="dimmed" size="sm">
            让 AI 结合你近期的心情记录，生成一段温暖的情绪复盘与建议。
          </Text>
          <Button
            mt="md" radius="lg" color="pink" variant="light" fullWidth
            leftSection={<IconSparkles size={16} />}
            onClick={openInsight}
          >
            生成洞察
          </Button>
        </Card>
      </Reveal>

      <Modal
        opened={insightOpen}
        onClose={() => setInsightOpen(false)}
        title="AI 情绪洞察报告"
        size={540}
        radius="lg"
        centered
      >
        <Stack gap="md">
          <Textarea
            label="可选：告诉我这周最想聊的焦点，或一句当下的感受"
            placeholder="例如：这周要交三个大作业，有点扛不住…"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            maxLength={100}
            autosize
            minRows={2}
            radius="md"
          />

          <Group gap={8}>
            {FOCUS_PRESETS.filter(Boolean).map((p) => (
              <Badge
                key={p} variant="light" color="pink" radius="sm" size="lg"
                style={{ cursor: "pointer", textTransform: "none" }}
                onClick={() => setFocus(p)}
              >
                {p}
              </Badge>
            ))}
            <Text size="xs" c="dimmed">不填也没关系，AI 会读你的记录</Text>
          </Group>

          <Button radius="lg" color="pink" onClick={genInsight} loading={generating} leftSection={<IconSparkles size={16} />}>
            {generating ? "生成中…" : "生成洞察"}
          </Button>

          {generating && (
            <Text size="sm" c="dimmed">正在梳理你的情绪记录，请稍候…</Text>
          )}

          {insightErr && <Text c="red" size="sm">{insightErr}</Text>}

          {insight && (
            <Card className="mc-glass" padding="md" radius="lg">
              <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{insight}</Text>
              {insightSource && (
                <Text size="xs" c="dimmed" mt={10}>
                  来源：{insightSource === "cloud" ? "云端大模型" : "本地分析"}
                </Text>
              )}
            </Card>
          )}
        </Stack>
      </Modal>
    </div>
  );
}
