import { useEffect, useState } from "react";
import {
  Card, Button, Tag, Typography, Empty, Skeleton, Alert, Progress, Row, Col,
  Space, Modal, Form, Input, InputNumber, Select, message, Segmented, Tooltip,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, AimOutlined, CheckCircleOutlined,
  StopOutlined, DeleteOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import { api } from "../api.js";

const { Title, Paragraph, Text } = Typography;

const STATUS_LABEL = { active: "进行中", achieved: "已达成", expired: "已过期" };
const STATUS_COLOR = { active: "processing", achieved: "success", expired: "default" };
const METRIC_ICON = { duration: "⏱️", quiz_count: "✏️", accuracy: "🎯" };

/**
 * 学习目标：周/月目标（时长/题量/正确率），进度实时，状态机 active → achieved / expired
 */
export default function Goals() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", period: "week", metric: "duration", target: 300, subject: "" });
  const [busy, setBusy] = useState(false);
  const [msgApi, msgHolder] = message.useMessage();

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const d = await api.get(`/goals${filter ? `?status=${filter}` : ""}`);
      setData(d);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [filter]);

  async function create() {
    if (!form.title.trim()) { msgApi.error("请填写目标名称"); return; }
    setBusy(true);
    try {
      await api.post("/goals", form);
      msgApi.success("目标已创建");
      setOpen(false);
      setForm({ title: "", period: "week", metric: "duration", target: 300, subject: "" });
      load();
    } catch (e) { msgApi.error(e.message); }
    finally { setBusy(false); }
  }

  async function refresh(goal) {
    try {
      const res = await api.post(`/goals/${goal.id}/progress`);
      if (res.unlocked?.length) {
        msgApi.success(`目标达成！解锁成就：${res.unlocked.map((a) => a.title).join("、")}`);
      } else {
        msgApi.success("进度已刷新");
      }
      load();
    } catch (e) { msgApi.error(e.message); }
  }

  async function transition(goal, status) {
    try {
      const res = await api.post(`/goals/${goal.id}/transition`, { status });
      msgApi.success(status === "achieved" ? "已标记达成" : "已标记过期");
      if (res.unlocked?.length) {
        msgApi.success(`同时解锁成就：${res.unlocked.map((a) => a.title).join("、")}`);
      }
      load();
    } catch (e) { msgApi.error(e.message); }
  }

  async function remove(goal) {
    try {
      await api.delete(`/goals/${goal.id}`);
      msgApi.success("目标已删除");
      load();
    } catch (e) { msgApi.error(e.message); }
  }

  const items = data?.items || [];
  const stats = data?.stats;

  return (
    <div className="page">
      {msgHolder}
      <header className="page-header">
        <div>
          <Title level={3} className="page-title">学习目标</Title>
          <Paragraph className="page-sub">
            设定周/月目标并实时追踪进度。达成时自动解锁成就徽章。
          </Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v)}
            options={[
              { label: `进行中${stats ? ` (${stats.active})` : ""}`, value: "active" },
              { label: `已达成${stats ? ` (${stats.achieved})` : ""}`, value: "achieved" },
              { label: `已过期${stats ? ` (${stats.expired})` : ""}`, value: "expired" },
              { label: "全部", value: "" },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建目标</Button>
        </Space>
      </header>

      {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 16 }}
                     action={<Button size="small" onClick={load}>重试</Button>} />}

      {loading ? (
        <Row gutter={[16, 16]}>
          {[0, 1, 2].map((i) => (
            <Col key={i} xs={24} lg={12}><Card className="apple-card"><Skeleton active paragraph={{ rows: 3 }} /></Card></Col>
          ))}
        </Row>
      ) : !items.length ? (
        <Card className="apple-card">
          <Empty description={filter ? "该状态下暂无目标。" : "还没有学习目标，创建一个开始追踪吧。"}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建目标</Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {items.map((g) => (
            <Col key={g.id} xs={24} lg={12}>
              <Card className="apple-card goal-card">
                <div className="goal-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="goal-title">
                      {METRIC_ICON[g.metric]} {g.title}
                    </div>
                    <div className="goal-meta">
                      {g.period === "week" ? "周目标" : "月目标"} · {g.metric_label}
                      {g.subject ? ` · ${g.subject}` : ""}
                      {" · "}{g.start_date} ~ {g.end_date}
                    </div>
                  </div>
                  <Tag color={STATUS_COLOR[g.status]}>{STATUS_LABEL[g.status]}</Tag>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 22 }}>
                    {g.progress}
                  </Text>
                  <Text type="secondary">/ {g.target}{g.metric === "accuracy" ? "%" : g.metric === "duration" ? " 分钟" : " 道"}</Text>
                  <Text type="secondary" style={{ marginLeft: "auto", fontSize: 13 }}>{g.percent}%</Text>
                </div>

                <Progress
                  percent={g.percent}
                  showInfo={false}
                  strokeColor={g.status === "achieved" ? "var(--green)" : g.status === "expired" ? "var(--gray)" : "var(--tint)"}
                  trailColor="rgba(120,120,128,0.12)"
                />

                <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  {g.status === "active" && (
                    <>
                      <Button size="small" type="primary" icon={<ThunderboltOutlined />} onClick={() => refresh(g)}>
                        刷新进度
                      </Button>
                      <Tooltip title={g.progress >= g.target ? "标记达成并解锁成就" : "进度未达标时无法标记达成"}>
                        <Button
                          size="small"
                          icon={<CheckCircleOutlined />}
                          disabled={g.progress < g.target}
                          onClick={() => transition(g, "achieved")}
                        >
                          标记达成
                        </Button>
                      </Tooltip>
                      <Button size="small" icon={<StopOutlined />} onClick={() => transition(g, "expired")}>
                        放弃
                      </Button>
                    </>
                  )}
                  {g.status === "achieved" && g.achieved_at && (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      <CheckCircleOutlined style={{ color: "var(--green)" }} /> 达成于 {g.achieved_at.slice(0, 16)}
                    </Text>
                  )}
                  <Button
                    size="small" type="text" danger icon={<DeleteOutlined />}
                    style={{ marginLeft: "auto" }}
                    onClick={() => remove(g)}
                  >
                    删除
                  </Button>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        open={open}
        title="新建学习目标"
        onCancel={() => setOpen(false)}
        onOk={create}
        okText="创建目标"
        cancelText="取消"
        confirmLoading={busy}
        width={520}
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label="目标名称" required>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="如：本周学习 600 分钟"
            />
          </Form.Item>
          <div className="form-row">
            <Form.Item label="周期">
              <Select
                value={form.period}
                onChange={(v) => setForm((f) => ({ ...f, period: v }))}
                options={[{ label: "本周", value: "week" }, { label: "本月", value: "month" }]}
              />
            </Form.Item>
            <Form.Item label="指标">
              <Select
                value={form.metric}
                onChange={(v) => setForm((f) => ({ ...f, metric: v }))}
                options={[
                  { label: "学习时长（分钟）", value: "duration" },
                  { label: "答题数量（道）", value: "quiz_count" },
                  { label: "正确率（%）", value: "accuracy" },
                ]}
              />
            </Form.Item>
          </div>
          <div className="form-row">
            <Form.Item label={form.metric === "accuracy" ? "目标正确率(%)" : form.metric === "duration" ? "目标时长(分钟)" : "目标题量(道)"} required>
              <InputNumber
                min={1}
                max={form.metric === "accuracy" ? 100 : form.metric === "duration" ? 100000 : 10000}
                value={form.target}
                onChange={(v) => setForm((f) => ({ ...f, target: v || 1 }))}
                style={{ width: "100%" }}
              />
            </Form.Item>
            <Form.Item label="限定科目（可选）">
              <Select
                value={form.subject || ""}
                onChange={(v) => setForm((f) => ({ ...f, subject: v || "" }))}
                options={[
                  { label: "不限", value: "" },
                  ...["数学", "英语", "语文", "物理", "化学", "生物"].map((s) => ({ label: s, value: s })),
                ]}
              />
            </Form.Item>
          </div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            周期起止日期由系统按当前周/月自动计算，进度依据真实学习数据实时统计。
          </Text>
        </Form>
      </Modal>
    </div>
  );
}
