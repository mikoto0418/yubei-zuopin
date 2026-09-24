import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Progress, Tag, Empty, Typography, Button, Tooltip, Skeleton, Space } from "antd";
import {
  FieldTimeOutlined,
  SunOutlined,
  CheckCircleOutlined,
  PercentageOutlined,
  RobotOutlined,
  EditOutlined,
  FundProjectionScreenOutlined,
  ThunderboltOutlined,
  DragOutlined,
  AppstoreOutlined,
  BulbOutlined,
  ApartmentOutlined,
  AimOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import WidgetGrid from "../components/WidgetGrid.jsx";
import { APPLE_COLORS, masteryColor } from "../components/EChart.jsx";

const { Title, Paragraph, Text } = Typography;

/**
 * 首页 = 可拖拽 Widget 驾驶舱（差异化维度保留，布局存 localStorage）
 * 数据来源：/sessions/summary、/quizzes/records、/quizzes/my-summary、
 *          /insights、/goals、/achievements
 */
export default function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [mySum, setMySum] = useState(null);
  const [insights, setInsights] = useState([]);
  const [goals, setGoals] = useState(null);
  const [achv, setAchv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get("/sessions/summary").catch(() => null),
      api.get("/quizzes/records").catch(() => []),
      api.get("/quizzes/my-summary").catch(() => null),
      api.get("/insights?size=4").catch(() => null),
      api.get("/goals?status=active").catch(() => null),
      api.get("/achievements").catch(() => null),
    ]).then(([s, r, m, ins, g, a]) => {
      if (!alive) return;
      setSummary(s);
      setRecords(r || []);
      setMySum(m);
      setInsights(ins?.items || []);
      setGoals(g);
      setAchv(a);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const totalQ = mySum?.total ?? records.length;
  const correctQ = mySum?.correct ?? records.filter((r) => r.is_correct).length;
  const accuracy = totalQ ? Math.round((correctQ / totalQ) * 100) : 0;

  const subjects = summary?.subject_duration || [];
  const maxMinutes = subjects.length ? Math.max(...subjects.map((x) => x.minutes)) : 1;
  const weakPoints = (mySum?.mastery || []).slice(0, 5);
  const activeGoals = goals?.items?.slice(0, 3) || [];

  const items = useMemo(() => {
    const list = [];

    // ---- 4 张统计卡 ----
    const statCards = [
      { id: "stat-duration", label: "累计学习时长", value: summary?.total_duration ?? 0, suffix: "分钟", icon: <FieldTimeOutlined />, color: APPLE_COLORS.blue },
      { id: "stat-days", label: "学习天数", value: summary?.days ?? 0, suffix: "天", icon: <SunOutlined />, color: APPLE_COLORS.orange },
      { id: "stat-quiz", label: "答题数量", value: totalQ, suffix: "题", icon: <CheckCircleOutlined />, color: APPLE_COLORS.purple },
      { id: "stat-acc", label: "正确率", value: accuracy, suffix: "%", icon: <PercentageOutlined />, color: masteryColor(accuracy) },
    ];
    statCards.forEach((s) => {
      list.push({
        id: s.id,
        name: s.label,
        span: 3,
        node: (
          <Card className="stat-card apple-card widget-fill" variant="borderless">
            <div className="ant-statistic-title">{s.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ color: s.color, fontSize: 18 }}>{s.icon}</span>
              <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>{s.value}</span>
              <span className="stat-suffix">{s.suffix}</span>
            </div>
          </Card>
        ),
      });
    });

    // ---- AI 洞察（AI 落库 → 首页展示 → 跳转练习）----
    list.push({
      id: "w-insights",
      name: "AI 洞察",
      span: 6,
      node: (
        <Card
          className="apple-card widget-fill"
          title={<Space size={8}><BulbOutlined style={{ color: "var(--tint)" }} />AI 洞察</Space>}
          extra={<Button size="small" type="link" onClick={() => nav("/insights")}>全部</Button>}
        >
          {insights.length ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {insights.map((ins) => (
                <div
                  key={ins.id}
                  className="qcard"
                  role="button"
                  tabIndex={0}
                  onClick={() => ins.knowledge_point_id
                    ? nav(`/practice?knowledge_point_id=${ins.knowledge_point_id}`)
                    : nav("/insights")}
                >
                  <BulbOutlined className="q-icon" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ins.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ins.suggestion || ins.content}
                    </div>
                  </div>
                  {ins.severity === "high" && <Tag color="error">严重</Tag>}
                  <RightOutlined className="q-chevron" />
                </div>
              ))}
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="还没有 AI 洞察，去生成一份吧。"
            >
              <Button type="primary" size="small" icon={<BulbOutlined />} onClick={() => nav("/insights")}>
                生成洞察
              </Button>
            </Empty>
          )}
        </Card>
      ),
    });

    // ---- 各科学习时长 ----
    list.push({
      id: "w-subjects",
      name: "各科学习时长",
      span: 6,
      node: (
        <Card title="各科学习时长（分钟）" className="apple-card widget-fill">
          {subjects.length ? (
            <ul className="subject-bars">
              {subjects.map((s) => (
                <li key={s.subject}>
                  <span className="bar-label">{s.subject}</span>
                  <Progress
                    percent={Math.round((s.minutes / maxMinutes) * 100)}
                    showInfo={false}
                    strokeColor="var(--tint)"
                    trailColor="rgba(120,120,128,0.12)"
                    size="small"
                  />
                  <span className="bar-val">{s.minutes}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有学习记录，去「记录」录入吧。" />
          )}
        </Card>
      ),
    });

    // ---- 薄弱知识点（掌握度）----
    list.push({
      id: "w-weak",
      name: "薄弱知识点",
      span: 6,
      node: (
        <Card
          title={<Space size={8}><ApartmentOutlined style={{ color: "var(--tint)" }} />薄弱知识点</Space>}
          className="apple-card widget-fill"
          extra={<Button size="small" type="link" onClick={() => nav("/knowledge")}>详情</Button>}
        >
          {weakPoints.length ? (
            <ul className="mastery-list">
              {weakPoints.map((m) => (
                <li key={m.tag}>
                  <span className="m-tag">{m.tag}</span>
                  <Progress
                    percent={Math.round(m.accuracy)}
                    showInfo={false}
                    strokeColor={masteryColor(m.accuracy)}
                    trailColor="rgba(120,120,128,0.12)"
                    size="small"
                  />
                  <span className="m-val">{m.accuracy}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="答几道题后就能看到薄弱点了。" />
          )}
        </Card>
      ),
    });

    // ---- 进行中的目标 ----
    list.push({
      id: "w-goals",
      name: "进行中的目标",
      span: 6,
      node: (
        <Card
          title={<Space size={8}><AimOutlined style={{ color: "var(--tint)" }} />进行中的目标</Space>}
          className="apple-card widget-fill"
          extra={<Button size="small" type="link" onClick={() => nav("/goals")}>管理</Button>}
        >
          {activeGoals.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {activeGoals.map((g) => (
                <div key={g.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.title}
                    </span>
                    <Text type="secondary" style={{ flexShrink: 0, marginLeft: 8 }}>
                      {g.progress}/{g.target}
                    </Text>
                  </div>
                  <Progress
                    percent={g.percent}
                    showInfo={false}
                    strokeColor="var(--tint)"
                    trailColor="rgba(120,120,128,0.12)"
                    size="small"
                  />
                </div>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有进行中的目标。">
              <Button type="primary" size="small" onClick={() => nav("/goals")}>新建目标</Button>
            </Empty>
          )}
        </Card>
      ),
    });

    // ---- 最近答题 ----
    list.push({
      id: "w-recent",
      name: "最近答题",
      span: 6,
      node: (
        <Card
          title="最近答题"
          className="apple-card widget-fill"
          extra={<Button size="small" type="link" onClick={() => nav("/practice")}>去刷题</Button>}
        >
          {records.length ? (
            <ul className="recent-list">
              {records.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <span className={r.is_correct ? "dot ok" : "dot bad"} />
                  <Tag style={{ marginInlineEnd: 0 }}>{r.tag || "未分类"}</Tag>
                  <span className="rec-time">{r.answered_at?.slice(5, 16)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有答过题，去「刷题」试试。" />
          )}
        </Card>
      ),
    });

    // ---- 学习节奏 / 成就 ----
    list.push({
      id: "w-rhythm",
      name: "学习节奏",
      span: 6,
      node: (
        <Card title="学习节奏" className="apple-card widget-fill">
          <div className="pulse-metrics">
            <div className="pm-item">
              <span className="pm-val" style={{ color: APPLE_COLORS.blue }}>{summary?.streak ?? 0}</span>
              <span className="pm-lab">连续打卡</span>
            </div>
            <div className="pm-item">
              <span className="pm-val" style={{ color: APPLE_COLORS.orange }}>
                {summary?.days ? Math.round((summary.total_duration || 0) / summary.days) : 0}
              </span>
              <span className="pm-lab">日均分钟</span>
            </div>
            <div className="pm-item">
              <span className="pm-val" style={{ color: APPLE_COLORS.green }}>
                {achv ? achv.unlocked_count : 0}
              </span>
              <span className="pm-lab">解锁成就</span>
            </div>
          </div>
          <Progress
            percent={accuracy}
            strokeColor={masteryColor(accuracy)}
            trailColor="rgba(120,120,128,0.12)"
            style={{ marginTop: 14 }}
          />
          <div style={{ textAlign: "center", marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>总体正确率 {accuracy}%</Text>
          </div>
        </Card>
      ),
    });

    // ---- 快捷入口 ----
    const quick = [
      { to: "/insights", label: "AI 洞察分析", icon: <BulbOutlined /> },
      { to: "/knowledge", label: "知识点掌握度", icon: <ApartmentOutlined /> },
      { to: "/wrong", label: "错题本", icon: <CheckCircleOutlined /> },
      { to: "/goals", label: "学习目标", icon: <AimOutlined /> },
      { to: "/teacher", label: "AI 数字教师 · 答疑", icon: <RobotOutlined /> },
      { to: "/practice", label: "开始刷题", icon: <ThunderboltOutlined /> },
      { to: "/notes", label: "记笔记并 AI 梳理", icon: <EditOutlined /> },
    ];
    if (user?.role === "admin") {
      quick.push({ to: "/dashboard", label: "管理仪表盘", icon: <FundProjectionScreenOutlined /> });
    }

    list.push({
      id: "w-quick",
      name: "快捷入口",
      span: 12,
      node: (
        <Card title="快捷入口" className="apple-card widget-fill">
          <div className="quick-actions grid-2">
            {quick.map((q) => (
              <button key={q.to} type="button" className="qcard" onClick={() => nav(q.to)}>
                <span className="q-icon">{q.icon}</span>
                <span>{q.label}</span>
                <RightOutlined className="q-chevron" />
              </button>
            ))}
          </div>
        </Card>
      ),
    });

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, records, mySum, insights, goals, achv, user?.role]);

  return (
    <div className="page cockpit-page">
      <header className="page-header">
        <div>
          <Title level={3} className="page-title">数据总览</Title>
          <Paragraph className="page-sub">
            欢迎回来，{user?.nickname}。拖动卡片即可重排你的专属仪表盘。
          </Paragraph>
        </div>
        <div className="cockpit-tools">
          <Tooltip title={editing ? "完成重排，锁定布局" : "开启后可拖动卡片重排"}>
            <Button
              type={editing ? "primary" : "default"}
              icon={editing ? <CheckCircleOutlined /> : <DragOutlined />}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "完成布局" : "编辑布局"}
            </Button>
          </Tooltip>
          {editing && (
            <span className="edit-tip">
              <AppstoreOutlined /> 按住卡片任意处拖动到目标位置
            </span>
          )}
        </div>
      </header>

      {loading ? (
        <Card className="apple-card">
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : (
        <WidgetGrid items={items} editing={editing} />
      )}
    </div>
  );
}
