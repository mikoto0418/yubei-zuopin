import { useEffect, useMemo, useState } from "react";
import { Card, Row, Col, Table, Tag, Typography, Empty, Alert, Skeleton, Button } from "antd";
import {
  TeamOutlined,
  EditOutlined,
  CheckSquareOutlined,
  BarChartOutlined,
  FieldTimeOutlined,
  PercentageOutlined,
} from "@ant-design/icons";
import { api } from "../api.js";
import EChart, { PALETTE, baseText, baseTooltip, baseAxis, APPLE_COLORS } from "../components/EChart.jsx";

const { Title, Paragraph } = Typography;

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [overview, setOverview] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setErr("");
    Promise.all([api.get("/admin/dashboard"), api.get("/admin/overview")])
      .then(([d, o]) => { setData(d); setOverview(o); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const mastery = data?.mastery || [];
  const masteryRows = useMemo(
    () => [...mastery].sort((a, b) => b.accuracy - a.accuracy).slice(0, 8),
    [mastery]
  );

  const pieOpt = {
    color: PALETTE,
    tooltip: { ...baseTooltip(), formatter: "{b}：{c} 分钟 ({d}%)" },
    legend: { bottom: 0, textStyle: baseText() },
    series: [{
      type: "pie",
      radius: ["42%", "68%"],
      center: ["50%", "44%"],
      itemStyle: { borderColor: "#FFFFFF", borderWidth: 2 },
      label: { color: "rgba(60,60,67,0.60)", fontSize: 11, formatter: "{b}\n{d}%" },
      data: data?.subject_duration?.length ? data.subject_duration : [{ name: "暂无", value: 1 }],
    }],
  };

  const radarOpt = {
    tooltip: baseTooltip(),
    radar: {
      indicator: masteryRows.map((m) => ({ name: m.tag, max: 100 })),
      radius: "62%",
      axisName: { color: "rgba(60,60,67,0.60)", fontSize: 11 },
      splitLine: { lineStyle: { color: "rgba(60,60,67,0.10)" } },
      splitArea: { areaStyle: { color: ["rgba(120,120,128,0.02)", "rgba(120,120,128,0.05)"] } },
      axisLine: { lineStyle: { color: "rgba(60,60,67,0.16)" } },
    },
    series: [{
      type: "radar",
      data: [{
        value: masteryRows.map((m) => m.accuracy),
        name: "掌握度",
        areaStyle: { color: "rgba(90,200,250,0.24)" },
        lineStyle: { color: APPLE_COLORS.teal, width: 2 },
        itemStyle: { color: APPLE_COLORS.teal },
        symbolSize: 5,
      }],
    }],
  };

  const trendOpt = {
    color: [APPLE_COLORS.blue, APPLE_COLORS.purple],
    tooltip: { ...baseTooltip(), trigger: "axis" },
    legend: { textStyle: baseText() },
    grid: { left: 44, right: 16, top: 34, bottom: 24 },
    xAxis: { type: "category", data: data?.accuracy_trend?.map((d) => d.date) || [], ...baseAxis() },
    yAxis: {
      type: "value", max: 100,
      axisLabel: { color: "rgba(60,60,67,0.60)", fontSize: 11, formatter: "{value}%" },
      splitLine: { lineStyle: { color: "rgba(60,60,67,0.08)" } },
    },
    series: [
      {
        name: "正确率(%)", type: "line", smooth: true, symbolSize: 6,
        data: data?.accuracy_trend?.map((d) => d.accuracy ?? null) || [],
        lineStyle: { width: 2.5 },
        itemStyle: { color: APPLE_COLORS.blue },
        areaStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(0,122,255,0.22)" },
              { offset: 1, color: "rgba(0,122,255,0)" },
            ],
          },
        },
      },
      {
        name: "答题数", type: "bar", barWidth: "28%",
        data: data?.accuracy_trend?.map((d) => d.total ?? 0) || [],
        itemStyle: { color: APPLE_COLORS.purple, borderRadius: [4, 4, 0, 0] },
      },
    ],
  };

  const dailyOpt = {
    tooltip: { ...baseTooltip(), trigger: "axis", formatter: "{b}：{c} 分钟" },
    grid: { left: 44, right: 16, top: 24, bottom: 24 },
    xAxis: { type: "category", data: data?.daily_duration?.map((d) => d.date) || [], ...baseAxis() },
    yAxis: {
      type: "value",
      axisLabel: { color: "rgba(60,60,67,0.60)", fontSize: 11 },
      splitLine: { lineStyle: { color: "rgba(60,60,67,0.08)" } },
    },
    series: [{
      type: "bar",
      barWidth: "52%",
      data: data?.daily_duration?.map((d) => d.minutes) || [],
      itemStyle: { color: APPLE_COLORS.teal, borderRadius: [6, 6, 0, 0] },
    }],
  };

  const activeColumns = [
    { title: "#", key: "rank", width: 56,
      render: (_, __, i) => <span className="rank">{i + 1}</span> },
    { title: "用户", key: "user",
      render: (_, u) => (
        <span>{u.nickname || u.username} <Typography.Text type="secondary">(@{u.username})</Typography.Text></span>
      ) },
    { title: "身份", dataIndex: "role", key: "role", width: 100,
      render: (r) => <Tag color={r === "admin" ? "purple" : "blue"}>{r === "admin" ? "管理员" : "学员"}</Tag> },
    { title: "答题数", dataIndex: "records", key: "records", width: 100 },
    { title: "学习时长", dataIndex: "duration", key: "duration", width: 120,
      render: (d) => `${d} 分钟` },
  ];

  const overviewCards = [
    { label: "注册用户", value: overview?.users, icon: <TeamOutlined />, color: APPLE_COLORS.purple },
    { label: "学习笔记", value: overview?.notes, icon: <EditOutlined />, color: APPLE_COLORS.blue },
    { label: "题库题目", value: overview?.quizzes, icon: <CheckSquareOutlined />, color: APPLE_COLORS.orange },
    { label: "答题记录", value: overview?.records, icon: <BarChartOutlined />, color: APPLE_COLORS.green },
    { label: "总学习时长", value: overview ? `${Math.round(overview.total_duration / 60 * 10) / 10} 时` : "–", icon: <FieldTimeOutlined />, color: APPLE_COLORS.teal },
    { label: "总体正确率", value: overview ? `${overview.accuracy}%` : "–", icon: <PercentageOutlined />, color: APPLE_COLORS.pink },
  ];

  if (loading) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <Title level={3} className="page-title">管理仪表盘</Title>
            <Paragraph className="page-sub">平台数据驾驶舱 · 仅管理员可见</Paragraph>
          </div>
        </header>
        <Row gutter={[16, 16]} className="stat-row">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Col key={i} xs={12} md={8} xl={4}>
              <Card className="apple-card"><Skeleton active paragraph={{ rows: 2 }} /></Card>
            </Col>
          ))}
        </Row>
        <Card className="apple-card"><Skeleton active paragraph={{ rows: 10 }} /></Card>
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <Title level={3} className="page-title">管理仪表盘</Title>
          </div>
        </header>
        <Alert
          type="error" showIcon message="加载失败" description={err}
          action={<Button size="small" onClick={load}>重试</Button>}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Title level={3} className="page-title">管理仪表盘</Title>
          <Paragraph className="page-sub">平台数据驾驶舱 · 仅管理员可见</Paragraph>
        </div>
      </header>

      {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 16 }} />}

      {overview && (
        <Row gutter={[16, 16]} className="stat-row">
          {overviewCards.map((s) => (
            <Col key={s.label} xs={12} md={8} xl={4}>
              <Card className="stat-card apple-card" variant="borderless">
                <div className="ant-statistic-title">{s.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ color: s.color, fontSize: 17 }}>{s.icon}</span>
                  <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{s.value}</span>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Row gutter={[16, 16]} className="dash-grid">
        <Col xs={24} lg={12}>
          <Card className="apple-card" title="各科学习时长分布">
            <EChart option={pieOpt} height={300} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card className="apple-card" title="知识点掌握度雷达">
            {masteryRows.length
              ? <EChart option={radarOpt} height={300} />
              : <Empty description="暂无答题数据，无法生成掌握度。" />}
          </Card>
        </Col>
        <Col xs={24}>
          <Card className="apple-card" title="正确率与答题趋势（近 14 天）">
            <EChart option={trendOpt} height={280} />
          </Card>
        </Col>
        <Col xs={24}>
          <Card className="apple-card" title="每日学习时长（近 14 天）">
            <EChart option={dailyOpt} height={260} />
          </Card>
        </Col>
      </Row>

      <Card className="apple-card active-panel" title="用户活跃度排行">
        {data?.active_users?.length ? (
          <Table
            rowKey="username"
            columns={activeColumns}
            dataSource={data.active_users}
            pagination={false}
            size="middle"
          />
        ) : <Empty description="暂无活跃数据。" />}
      </Card>
    </div>
  );
}
