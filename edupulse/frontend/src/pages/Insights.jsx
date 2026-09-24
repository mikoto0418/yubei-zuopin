import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Button, Typography, Empty, Skeleton, Alert, Row, Col, Tag, Space,
  Segmented, message, Popconfirm, Progress, Tooltip,
} from "antd";
import {
  BulbOutlined, ReloadOutlined, PlayCircleOutlined, CheckOutlined,
  DeleteOutlined, ExperimentOutlined,
} from "@ant-design/icons";
import { api } from "../api.js";

const { Title, Paragraph, Text } = Typography;

const SEVERITY = {
  high: { label: "严重", color: "error" },
  medium: { label: "中等", color: "warning" },
  low: { label: "轻微", color: "default" },
};
const KIND_LABEL = { weak_point: "薄弱点", advice: "建议", trend: "趋势" };
const STATUS_LABEL = { new: "待查看", read: "已读", resolved: "已解决" };

/**
 * AI 洞察：分析薄弱知识点 → 写入 ai_insights → 展示 + 跳转知识点练习
 */
export default function Insights() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msgApi, msgHolder] = message.useMessage();

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qp = new URLSearchParams({ size: "50" });
      if (filter) qp.set("status", filter);
      const d = await api.get(`/insights?${qp.toString()}`);
      setData(d);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [filter]);

  async function analyze() {
    setBusy(true);
    try {
      const res = await api.post("/insights/analyze");
      msgApi.success(`AI 已生成 ${res.insights.length} 条学习洞察（引擎：${res.source === "llm" ? "大模型" : "本地规则"}）`);
      setFilter("");
      await load();
    } catch (e) { msgApi.error(e.message); }
    finally { setBusy(false); }
  }

  async function updateStatus(ins, status) {
    try {
      await api.post(`/insights/${ins.id}/status`, { status });
      load();
    } catch (e) { msgApi.error(e.message); }
  }

  async function remove(ins) {
    try {
      await api.delete(`/insights/${ins.id}`);
      msgApi.success("洞察已删除");
      load();
    } catch (e) { msgApi.error(e.message); }
  }

  const items = data?.items || [];

  return (
    <div className="page">
      {msgHolder}
      <header className="page-header">
        <div>
          <Title level={3} className="page-title">AI 洞察</Title>
          <Paragraph className="page-sub">
            AI 分析你的答题数据，定位薄弱知识点并给出可执行建议。结果已落库，可直接跳转专项练习。
          </Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v)}
            options={[
              { label: `待查看${data ? ` (${data.new_count})` : ""}`, value: "new" },
              { label: "已读", value: "read" },
              { label: "已解决", value: "resolved" },
              { label: "全部", value: "" },
            ]}
          />
          <Tooltip title="重新分析薄弱知识点并写入洞察库">
            <Button type="primary" icon={<ExperimentOutlined />} loading={busy} onClick={analyze}>
              AI 分析
            </Button>
          </Tooltip>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
        </Space>
      </header>

      {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 16 }}
                     action={<Button size="small" onClick={load}>重试</Button>} />}

      {loading ? (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {[0, 1, 2].map((i) => (
              <Col key={i} xs={24} md={8}><Card className="apple-card"><Skeleton active paragraph={{ rows: 2 }} /></Card></Col>
            ))}
          </Row>
          <Card className="apple-card"><Skeleton active paragraph={{ rows: 8 }} /></Card>
        </>
      ) : !items.length ? (
        <Card className="apple-card">
          <Empty
            description={
              filter
                ? "该状态下暂无洞察。"
                : "还没有 AI 洞察。点击「AI 分析」，系统会基于你的答题数据生成薄弱点分析与建议。"
            }
          >
            <Button type="primary" icon={<ExperimentOutlined />} loading={busy} onClick={analyze}>
              立即分析
            </Button>
          </Empty>
        </Card>
      ) : (
        <>
          {data && (
            <Row gutter={[16, 16]} className="stat-row">
              <Col xs={12} md={8}>
                <Card className="stat-card apple-card" variant="borderless">
                  <div className="ant-statistic-title">洞察总数</div>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>{data.total}</div>
                </Card>
              </Col>
              <Col xs={12} md={8}>
                <Card className="stat-card apple-card" variant="borderless">
                  <div className="ant-statistic-title">待查看</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: "var(--tint)" }}>{data.new_count}</div>
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card className="stat-card apple-card" variant="borderless">
                  <div className="ant-statistic-title">可跳转专项练习</div>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>
                    {items.filter((x) => x.knowledge_point_id).length}
                  </div>
                </Card>
              </Col>
            </Row>
          )}

          {items.map((ins) => {
            const sev = SEVERITY[ins.severity] || SEVERITY.medium;
            return (
              <div className={"insight-item" + (ins.status === "new" ? " is-new" : "")} key={ins.id}>
                <div className="insight-head">
                  <BulbOutlined style={{ color: "var(--tint)", fontSize: 18 }} />
                  <div className="insight-title">{ins.title}</div>
                  <Tag color={sev.color}>{sev.label}</Tag>
                  <Tag>{KIND_LABEL[ins.kind] || ins.kind}</Tag>
                  {ins.subject && <Tag>{ins.subject}</Tag>}
                  <Tag color={ins.status === "new" ? "processing" : "default"}>
                    {STATUS_LABEL[ins.status] || ins.status}
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {ins.created_at?.slice(0, 16)}
                  </Text>
                </div>

                {ins.content && <div className="insight-body">{ins.content}</div>}

                {ins.suggestion && (
                  <div className="insight-sugg">
                    <Text strong style={{ fontSize: 13 }}>💡 建议：</Text>
                    {ins.suggestion}
                  </div>
                )}

                <div className="insight-foot">
                  {ins.knowledge_point_id && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={() => nav(`/practice?knowledge_point_id=${ins.knowledge_point_id}`)}
                    >
                      练习「{ins.knowledge_point_name}」
                    </Button>
                  )}
                  {ins.status === "new" && (
                    <Button size="small" icon={<CheckOutlined />} onClick={() => updateStatus(ins, "read")}>
                      标为已读
                    </Button>
                  )}
                  {ins.status !== "resolved" && (
                    <Button size="small" onClick={() => updateStatus(ins, "resolved")}>
                      标为已解决
                    </Button>
                  )}
                  <Popconfirm
                    title="删除洞察"
                    description="确认删除这条洞察记录？"
                    okText="删除" cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => remove(ins)}
                  >
                    <Button size="small" type="text" danger icon={<DeleteOutlined />}
                            style={{ marginLeft: "auto" }}>
                      删除
                    </Button>
                  </Popconfirm>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
