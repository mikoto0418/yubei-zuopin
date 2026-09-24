import React, { useEffect, useState } from "react";
import {
  Card, Button, Text, Group, Stack, SimpleGrid, Title, Badge, ThemeIcon, Table, Box,
} from "@mantine/core";
import {
  IconLogout, IconUsers, IconClipboardHeart, IconAlertTriangle, IconChartLine,
  IconChartPie, IconActivity, IconCircleCheck, IconCalendarEvent, IconBooks,
} from "@tabler/icons-react";
import { api } from "../api/client";
import EChart from "../components/EChart";
import { PageLoading, ErrorState, EmptyState } from "../components/States.jsx";
import { BRAND } from "../theme.js";

const ACCENT = BRAND;
const AXIS = "var(--label-secondary)";

function levelColor(level) {
  if (level === "正常") return "teal";
  if (level === "轻度抑郁") return "yellow";
  if (level === "中度抑郁") return "orange";
  return "red";
}

const APPT_LABEL = { pending: "待确认", confirmed: "已确认", completed: "已完成", cancelled: "已取消" };

export default function Admin({ onLogout }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState({ loading: true, error: null });

  async function load() {
    setState({ loading: true, error: null });
    try {
      const d = await api.adminOverview();
      setData(d);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: e });
    }
  }

  useEffect(() => { load(); }, []);

  if (state.loading) return <PageLoading rows={3} />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  if (!data) return <EmptyState title="暂无数据" desc="后台数据尚未就绪。" />;

  const trendOption = {
    tooltip: { trigger: "axis" },
    grid: { left: 36, right: 16, top: 26, bottom: 24 },
    xAxis: { type: "category", data: data.mood_trend.map((r) => r.d), axisLabel: { color: AXIS } },
    yAxis: { type: "value", axisLabel: { color: AXIS } },
    series: [{ type: "line", smooth: true, data: data.mood_trend.map((r) => +(r.a || 0).toFixed(1)), lineStyle: { color: ACCENT, width: 2 }, itemStyle: { color: ACCENT }, areaStyle: { color: "rgba(255,45,85,.10)" } }],
  };
  const distOption = {
    tooltip: { trigger: "item" },
    legend: { bottom: 0, textStyle: { color: AXIS } },
    series: [{ type: "pie", radius: ["40%", "68%"], center: ["50%", "44%"], itemStyle: { borderRadius: 8, borderColor: "var(--bg-surface)", borderWidth: 2 }, data: data.emotion_dist.map((r) => ({ name: r.label, value: r.c })) }],
  };
  const levelOption = {
    tooltip: { trigger: "item" },
    legend: { bottom: 0, textStyle: { color: AXIS } },
    series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "44%"], itemStyle: { borderRadius: 8, borderColor: "var(--bg-surface)", borderWidth: 2 }, data: data.assessment_levels.map((r) => ({ name: r.level, value: r.c })) }],
  };
  const activeOption = {
    tooltip: { trigger: "axis" },
    grid: { left: 32, right: 16, top: 26, bottom: 24 },
    xAxis: { type: "category", data: data.active_users.map((r) => r.d), axisLabel: { color: AXIS } },
    yAxis: { type: "value", axisLabel: { color: AXIS } },
    series: [{ type: "bar", data: data.active_users.map((r) => r.c), itemStyle: { color: ACCENT, borderRadius: [6, 6, 0, 0] } }],
  };

  const emotionTotal = data.emotion_dist.reduce((s, r) => s + r.c, 0);
  const crisis = data.crisis_stats || {};
  const appt = data.appointment_stats || {};

  return (
    <div className="mc-flow">
      <Group justify="space-between" wrap="nowrap">
        <h1 className="page-title">管理后台</h1>
        <Button variant="light" color="gray" radius="lg" leftSection={<IconLogout size={15} />} onClick={onLogout}>
          退出
        </Button>
      </Group>
      <Text c="dimmed" size="sm">情绪趋势、危机预警、预约与资源运营数据。</Text>

      {/* ---- 顶部指标 ---- */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <StatCard icon={<IconUsers size={26} />} color="pink" label="注册用户" value={data.user_count} hint={`含管理员共 ${data.total_users}`} />
        <StatCard icon={<IconClipboardHeart size={26} />} color="blush" label="测评总次数" value={data.assessment_count} hint={`近 30 天情绪标签 ${emotionTotal} 条`} />
        <StatCard icon={<IconAlertTriangle size={26} />} color="red" label="待处理预警" value={crisis.open ?? 0} hint={`累计预警 ${(crisis.open || 0) + (crisis.handled || 0) + (crisis.dismissed || 0)} 条`} danger />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <StatCard icon={<IconCalendarEvent size={26} />} color="pink" label="预约总数" value={(appt.pending || 0) + (appt.confirmed || 0) + (appt.completed || 0) + (appt.cancelled || 0)} hint={`待确认 ${appt.pending || 0} · 已完成 ${appt.completed || 0}`} />
        <StatCard icon={<IconActivity size={26} />} color="blush" label="进行中的预约" value={(appt.pending || 0) + (appt.confirmed || 0)} hint={`已取消 ${appt.cancelled || 0} 条`} />
        <StatCard icon={<IconBooks size={26} />} color="pink" label="资源库内容" value={data.resource_count ?? 0} hint="含科普文章与用户私人周报" />
      </SimpleGrid>

      {/* ---- 图表 ---- */}
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <Card radius="lg" padding="lg" className="mc-glass" style={{ gridColumn: "span 2" }}>
          <Group gap={6} mb="md">
            <IconChartLine size={17} color={ACCENT} />
            <Text fw={600}>情绪均值走势（近 14 天）</Text>
          </Group>
          <EChart option={trendOption} />
        </Card>

        <Card radius="lg" padding="lg" className="mc-glass">
          <Group gap={6} mb="md">
            <IconChartPie size={17} color={ACCENT} />
            <Text fw={600}>近 30 天情绪标签分布</Text>
          </Group>
          <EChart option={distOption} height={260} />
        </Card>

        <Card radius="lg" padding="lg" className="mc-glass">
          <Group gap={6} mb="md">
            <IconChartPie size={17} color={ACCENT} />
            <Text fw={600}>测评水平分布</Text>
          </Group>
          <EChart option={levelOption} />
        </Card>

        <Card radius="lg" padding="lg" className="mc-glass" style={{ gridColumn: "span 2" }}>
          <Group gap={6} mb="md">
            <IconActivity size={17} color={ACCENT} />
            <Text fw={600}>每日活跃写情绪人数（近 7 天）</Text>
          </Group>
          <EChart option={activeOption} />
        </Card>
      </SimpleGrid>

      {/* ---- 最新预警 ---- */}
      <Card radius="lg" padding="lg" className="mc-glass">
        <Text fw={600} mb="md">最新待处理预警</Text>
        {data.open_alerts?.length ? (
          <Stack gap="sm">
            {data.open_alerts.map((a) => (
              <Group key={a.id} justify="space-between" wrap="nowrap">
                <Box style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500}>{a.nickname} · {a.detail}</Text>
                  <Text size="xs" c="dimmed">{a.created_at?.slice(0, 16)}</Text>
                </Box>
                <Badge color={a.level === "high" ? "red" : a.level === "medium" ? "orange" : "yellow"} variant="light" radius="sm">
                  {a.level === "high" ? "高危" : a.level === "medium" ? "中度" : "轻度"}
                </Badge>
              </Group>
            ))}
          </Stack>
        ) : (
          <Group gap={6}>
            <IconCircleCheck size={18} opacity={0.5} />
            <Text c="dimmed" size="sm">暂无待处理预警</Text>
          </Group>
        )}
      </Card>

      {/* ---- 最新预约 ---- */}
      <Card radius="lg" padding="lg" className="mc-glass">
        <Text fw={600} mb="md">最新预约</Text>
        {data.recent_appointments?.length ? (
          <Stack gap="sm">
            {data.recent_appointments.map((a) => (
              <Group key={a.id} justify="space-between" wrap="nowrap">
                <Box style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500} lineClamp={1}>{a.topic || "（未填写主题）"}</Text>
                  <Text size="xs" c="dimmed">{a.nickname} → {a.counselor_name} · {a.slot}</Text>
                </Box>
                <Badge variant="light" radius="sm" color={a.status === "completed" ? "green" : a.status === "cancelled" ? "gray" : a.status === "confirmed" ? "blue" : "yellow"}>
                  {APPT_LABEL[a.status] || a.status}
                </Badge>
              </Group>
            ))}
          </Stack>
        ) : (
          <Text c="dimmed" size="sm">暂无预约记录</Text>
        )}
      </Card>

      {/* ---- 咨询师排行 ---- */}
      <Card radius="lg" padding="lg" className="mc-glass">
        <Text fw={600} mb="md">评分最高的咨询师</Text>
        {data.top_counselors?.length ? (
          <Stack gap="sm">
            {data.top_counselors.map((c) => (
              <Group key={c.id} justify="space-between" wrap="nowrap">
                <Text size="sm">{c.avatar} {c.name}</Text>
                <Text size="sm" c="dimmed">{c.rating?.toFixed(1)} · {c.rating_count} 次咨询</Text>
              </Group>
            ))}
          </Stack>
        ) : (
          <Text c="dimmed" size="sm">暂无咨询师数据</Text>
        )}
      </Card>

      {/* ---- 风险名单 ---- */}
      <Card radius="lg" padding="lg" className="mc-glass">
        <Text fw={600} mb="md">风险预警名单（最近一次测评 ≥ 轻度）</Text>
        {data.risk_users.length ? (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>用户名</Table.Th>
                  <Table.Th>昵称</Table.Th>
                  <Table.Th>得分</Table.Th>
                  <Table.Th>水平</Table.Th>
                  <Table.Th>测评时间</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.risk_users.map((u) => (
                  <Table.Tr key={u.id}>
                    <Table.Td><Text size="sm" fw={600}>{u.username}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{u.nickname || "—"}</Text></Table.Td>
                    <Table.Td><Text size="sm" fw={700}>{u.total_score}</Text></Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={levelColor(u.level)} radius="sm">{u.level}</Badge>
                    </Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{u.created_at}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Group gap={6}>
            <IconCircleCheck size={18} opacity={0.5} />
            <Text c="dimmed" size="sm">暂无预警用户</Text>
          </Group>
        )}
      </Card>
    </div>
  );
}

function StatCard({ icon, color, label, value, hint, danger }) {
  return (
    <Card radius="lg" padding="lg" className="mc-glass">
      <Group wrap="nowrap" gap="md">
        <ThemeIcon size={48} radius="xl" variant="light" color={color}>
          {icon}
        </ThemeIcon>
        <Box>
          <Text size="xs" c="dimmed">{label}</Text>
          <Text fw={700} size="28px" lh={1.1} c={danger && value > 0 ? "red" : undefined}>{value}</Text>
          <Text size="xs" c="dimmed" mt={2}>{hint}</Text>
        </Box>
      </Group>
    </Card>
  );
}
