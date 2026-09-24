import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Row, Col, Progress, Tag, Typography, Empty, Button, Select,
  Skeleton, Alert, Segmented, Space, Input, Pagination, Tooltip,
} from "antd";
import { SearchOutlined, ReloadOutlined, PlayCircleOutlined, BulbOutlined } from "@ant-design/icons";
import { api } from "../api.js";
import EChart, { PALETTE, baseTooltip, masteryColor } from "../components/EChart.jsx";

const { Title, Paragraph } = Typography;
const PAGE_SIZE = 12;

/**
 * 知识点掌握度：学科聚合 + 知识点明细 + 掌握度雷达
 */
export default function Knowledge() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [points, setPoints] = useState({ items: [], total: 0 });
  const [subjectId, setSubjectId] = useState(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function loadOverview() {
    try {
      const d = await api.get(`/knowledge/mastery${subjectId ? `?subject_id=${subjectId}` : ""}`);
      setData(d);
    } catch (e) { setErr(e.message); }
  }

  async function loadPoints() {
    try {
      const qp = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
      if (subjectId) qp.set("subject_id", String(subjectId));
      if (search) qp.set("q", search);
      const d = await api.get(`/knowledge/points?${qp.toString()}`);
      setPoints(d);
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    Promise.all([
      api.get(`/knowledge/mastery${subjectId ? `?subject_id=${subjectId}` : ""}`),
      api.get("/knowledge/subjects").catch(() => []),
    ]).then(([m, s]) => {
      if (!alive) return;
      setData(m);
      setSubjects(s || []);
    }).catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [subjectId]);

  useEffect(() => { loadPoints(); }, [page, search, subjectId]);

  const items = data?.items || [];
  const summary = data?.summary;

  const radarOpt = useMemo(() => {
    const top = [...items].slice(0, 6);
    if (!top.length) return null;
    return {
      tooltip: baseTooltip(),
      radar: {
        indicator: top.map((x) => ({ name: x.name, max: 100 })),
        radius: "64%",
        axisName: { color: "rgba(60,60,67,0.60)", fontSize: 11 },
        splitLine: { lineStyle: { color: "rgba(60,60,67,0.10)" } },
        splitArea: { areaStyle: { color: ["rgba(120,120,128,0.02)", "rgba(120,120,128,0.05)"] } },
        axisLine: { lineStyle: { color: "rgba(60,60,67,0.16)" } },
      },
      series: [{
        type: "radar",
        data: [{
          value: top.map((x) => x.accuracy),
          name: "掌握度",
          areaStyle: { color: "rgba(90,200,250,0.24)" },
          lineStyle: { color: "#5AC8FA", width: 2 },
          itemStyle: { color: "#5AC8FA" },
          symbolSize: 5,
        }],
      }],
    };
  }, [items]);

  const subjectBarOpt = useMemo(() => {
    const bs = data?.by_subject || [];
    if (!bs.length) return null;
    return {
      tooltip: { ...baseTooltip(), formatter: "{b}：{c}%" },
      grid: { left: 60, right: 20, top: 16, bottom: 24 },
      xAxis: {
        type: "value", max: 100,
        axisLabel: { color: "rgba(60,60,67,0.60)", fontSize: 11, formatter: "{value}%" },
        splitLine: { lineStyle: { color: "rgba(60,60,67,0.08)" } },
      },
      yAxis: {
        type: "category", data: bs.map((x) => x.subject),
        axisLabel: { color: "rgba(60,60,67,0.60)", fontSize: 12 },
        axisLine: { lineStyle: { color: "rgba(60,60,67,0.16)" } },
      },
      series: [{
        type: "bar", barWidth: 16,
        data: bs.map((x, i) => ({
          value: x.accuracy,
          itemStyle: { color: PALETTE[i % PALETTE.length], borderRadius: [0, 6, 6, 0] },
        })),
      }],
    };
  }, [data]);

  if (loading) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <Title level={3} className="page-title">知识点掌握度</Title>
            <Paragraph className="page-sub">按知识点追踪正确率，定位薄弱环节。</Paragraph>
          </div>
        </header>
        <Row gutter={[16, 16]}>
          {[0, 1, 2, 3].map((i) => (
            <Col key={i} xs={12} md={6}><Card className="apple-card"><Skeleton active paragraph={{ rows: 2 }} /></Card></Col>
          ))}
        </Row>
        <Card className="apple-card" style={{ marginTop: 16 }}><Skeleton active paragraph={{ rows: 8 }} /></Card>
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <Title level={3} className="page-title">知识点掌握度</Title>
          </div>
        </header>
        <Alert
          type="error" showIcon message="加载失败" description={err}
          action={<Button size="small" onClick={() => window.location.reload()}>重试</Button>}
        />
      </div>
    );
  }

  const subjectOptions = [
    { label: "全部学科", value: "" },
    ...subjects.map((s) => ({ label: `${s.name}（${s.knowledge_count}）`, value: s.id })),
  ];

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Title level={3} className="page-title">知识点掌握度</Title>
          <Paragraph className="page-sub">
            按知识点追踪正确率，定位薄弱环节并一键发起专项练习。
          </Paragraph>
        </div>
        <Space wrap>
          <Select
            value={subjectId || ""}
            onChange={(v) => { setSubjectId(v || null); setPage(1); }}
            options={subjectOptions}
            style={{ width: 180 }}
          />
          <Segmented
            value={view}
            onChange={setView}
            options={[{ label: "总览", value: "overview" }, { label: "明细", value: "detail" }]}
          />
        </Space>
      </header>

      {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 16 }} />}

      {summary && (
        <Row gutter={[16, 16]} className="stat-row">
          <Col xs={12} md={6}>
            <Card className="stat-card apple-card" variant="borderless">
              <div className="ant-statistic-title">已练习知识点</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{summary.point_count}</div>
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card className="stat-card apple-card" variant="borderless">
              <div className="ant-statistic-title">平均正确率</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: masteryColor(summary.average) }}>
                {summary.average}%
              </div>
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card className="stat-card apple-card" variant="borderless">
              <div className="ant-statistic-title">累计答题</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{summary.answered}</div>
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card className="stat-card apple-card" variant="borderless">
              <div className="ant-statistic-title">薄弱知识点</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "var(--red)" }}>{summary.weak_count}</div>
            </Card>
          </Col>
        </Row>
      )}

      {view === "overview" ? (
        <>
          {!items.length ? (
            <Card className="apple-card">
              <Empty description="还没有答题记录，先去刷题积累数据吧。">
                <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => nav("/practice")}>
                  去刷题
                </Button>
              </Empty>
            </Card>
          ) : (
            <Row gutter={[16, 16]} className="home-grid">
              <Col xs={24} lg={10}>
                <Card className="apple-card" title="学科掌握度">
                  {subjectBarOpt ? <EChart option={subjectBarOpt} height={Math.max(200, (data.by_subject.length) * 42)} /> : <Empty description="暂无数据" />}
                </Card>
              </Col>
              <Col xs={24} lg={14}>
                <Card className="apple-card" title="薄弱知识点雷达（前 6 项）">
                  {radarOpt ? <EChart option={radarOpt} height={280} /> : <Empty description="暂无数据" />}
                </Card>
              </Col>
              <Col xs={24}>
                <Card className="apple-card" title="知识点明细（按正确率升序）">
                  <div className="kp-list">
                    {items.map((x) => (
                      <div className="kp-row" key={x.knowledge_point_id}>
                        <div className="kp-name">
                          <Typography.Text strong ellipsis>{x.name}</Typography.Text>
                          <Tag style={{ marginInlineEnd: 0 }}>{x.subject_name}</Tag>
                        </div>
                        <div className="kp-bar">
                          <Progress
                            percent={Math.round(x.accuracy)}
                            showInfo={false}
                            strokeColor={masteryColor(x.accuracy)}
                            trailColor="rgba(120,120,128,0.12)"
                            size="small"
                          />
                        </div>
                        <span className="kp-val" style={{ color: masteryColor(x.accuracy) }}>{x.accuracy}%</span>
                        <span className="kp-count">{x.correct}/{x.total} 题</span>
                        <div className="kp-actions">
                          <Tooltip title="针对该知识点专项练习">
                            <Button
                              size="small"
                              type="text"
                              icon={<PlayCircleOutlined />}
                              onClick={() => nav(`/practice?knowledge_point_id=${x.knowledge_point_id}`)}
                            />
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </Col>
            </Row>
          )}
        </>
      ) : (
        <>
          <Card className="apple-card" variant="borderless" style={{ marginBottom: 16 }}>
            <div className="list-toolbar" style={{ marginBottom: 0 }}>
              <Input
                className="search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setSearch(q); setPage(1); } }}
                placeholder="搜索知识点名称…"
                prefix={<SearchOutlined />}
                allowClear
              />
              <Button onClick={() => { setSearch(q); setPage(1); }}>查询</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setQ(""); setSearch(""); setPage(1); }}>重置</Button>
            </div>
          </Card>

          {points.items.length ? (
            <div className="kp-list">
              {points.items.map((kp) => (
                <div className="kp-row" key={kp.id}>
                  <div className="kp-name">
                    <Typography.Text strong ellipsis>{kp.name}</Typography.Text>
                    <Tag style={{ marginInlineEnd: 0 }}>{kp.subject_name}</Tag>
                    <Tag color={kp.difficulty >= 3 ? "red" : kp.difficulty === 2 ? "orange" : "green"}
                         style={{ marginInlineEnd: 0 }}>
                      {"★".repeat(kp.difficulty)}
                    </Tag>
                  </div>
                  <span className="kp-count">{kp.quiz_count} 题</span>
                  <div className="kp-bar">
                    {kp.mastery === null ? (
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>未练习</Typography.Text>
                    ) : (
                      <Progress
                        percent={Math.round(kp.mastery)}
                        showInfo={false}
                        strokeColor={masteryColor(kp.mastery)}
                        trailColor="rgba(120,120,128,0.12)"
                        size="small"
                      />
                    )}
                  </div>
                  <span className="kp-val" style={{ color: kp.mastery === null ? "var(--label-secondary)" : masteryColor(kp.mastery) }}>
                    {kp.mastery === null ? "—" : `${kp.mastery}%`}
                  </span>
                  <div className="kp-actions">
                    <Button
                      size="small"
                      type="text"
                      icon={<PlayCircleOutlined />}
                      onClick={() => nav(`/practice?knowledge_point_id=${kp.id}`)}
                    >
                      练习
                    </Button>
                  </div>
                </div>
              ))}
              <div style={{ textAlign: "center", marginTop: 20 }}>
                <Pagination
                  current={page}
                  pageSize={PAGE_SIZE}
                  total={points.total}
                  showSizeChanger={false}
                  showTotal={(t) => `共 ${t} 个知识点`}
                  onChange={setPage}
                />
              </div>
            </div>
          ) : (
            <Card className="apple-card">
              <Empty description={search ? "没有匹配的知识点。" : "暂无知识点。"} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
