import { useEffect, useState } from "react";
import {
  Card, Table, Input, InputNumber, Select, Button, Form, Tag, Typography,
  Row, Col, Statistic, Popconfirm, message, Alert, DatePicker,
} from "antd";
import { PlusOutlined, DeleteOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "../api.js";

const PAGE_SIZE = 10;
const SUBJECT_LIST = ["数学", "英语", "语文", "物理", "化学"];

export default function StudyLog() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({ subject: "", duration: "30", study_date: "", note: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgApi, msgHolder] = message.useMessage();

  async function load() {
    setLoading(true);
    try {
      const qp = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
      if (subject) qp.set("subject", subject);
      const [list, sum] = await Promise.all([
        api.get(`/sessions?${qp.toString()}`),
        api.get("/sessions/summary"),
      ]);
      setItems(list.items);
      setTotal(list.total);
      setSummary(sum);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [page, subject]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function add() {
    setErr("");
    try {
      await api.post("/sessions", form);
      setForm({ subject: "", duration: "30", study_date: "", note: "" });
      setPage(1);
      msgApi.success("已记录学习时长");
      load();
    } catch (ex) { setErr(ex.message); }
  }

  async function remove(item) {
    try {
      await api.delete(`/sessions/${item.id}`);
      msgApi.success("记录已删除");
      if (items.length === 1 && page > 1) setPage(page - 1); else load();
    } catch (ex) { setErr(ex.message); }
  }

  const columns = [
    {
      title: "科目",
      dataIndex: "subject",
      key: "subject",
      width: 110,
      render: (s) => <Tag color="purple">{s}</Tag>,
    },
    {
      title: "时长",
      dataIndex: "duration",
      key: "duration",
      width: 110,
      render: (d) => <Typography.Text strong style={{ color: "#fff" }}>{d} 分钟</Typography.Text>,
    },
    {
      title: "备注",
      dataIndex: "note",
      key: "note",
      render: (n) => n || <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: "日期",
      dataIndex: "study_date",
      key: "study_date",
      width: 130,
      render: (d) => <Typography.Text type="secondary">{d}</Typography.Text>,
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      render: (_, r) => (
        <Popconfirm
          title="删除记录"
          description={`确认删除 ${r.subject} ${r.duration} 分钟的学习记录？`}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => remove(r)}
        >
          <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="page">
      {msgHolder}
      <header className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">学习记录</Typography.Title>
          <Typography.Paragraph className="page-sub">录入每天各科学习时长，系统自动汇总统计。</Typography.Paragraph>
        </div>
      </header>

      {summary && (
        <Row gutter={[16, 16]} className="stat-row">
          <Col xs={8}>
            <Card className="stat-card" variant="borderless">
              <Statistic title="总时长" value={summary.total_duration} suffix="分钟" styles={{ content: { color: "var(--tint)" } }} />
            </Card>
          </Col>
          <Col xs={8}>
            <Card className="stat-card" variant="borderless">
              <Statistic title="累计天数" value={summary.days} suffix="天" styles={{ content: { color: "var(--tint)" } }} />
            </Card>
          </Col>
          <Col xs={8}>
            <Card className="stat-card" variant="borderless">
              <Statistic title="科目数" value={summary.subject_duration.length} suffix="门" styles={{ content: { color: "var(--red)" } }} />
            </Card>
          </Col>
        </Row>
      )}

      <div className="study-layout">
        <Card className="apple-card" title="录入学习">
          <Form layout="vertical" onFinish={add}>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item label="科目" required>
                  <Select
                    value={form.subject || undefined}
                    onChange={(v) => set("subject", v)}
                    placeholder="如：数学"
                    options={SUBJECT_LIST.map((s) => ({ label: s, value: s }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="时长（分钟）">
                  <InputNumber
                    min={1}
                    max={1440}
                    value={Number(form.duration)}
                    onChange={(v) => set("duration", v)}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="日期">
              <DatePicker
                style={{ width: "100%" }}
                value={form.study_date ? dayjs(form.study_date) : null}
                onChange={(d) => set("study_date", d ? d.format("YYYY-MM-DD") : "")}
                placeholder="选择日期"
              />
            </Form.Item>
            <Form.Item label="备注">
              <Input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="可选，如：刷题、背单词" />
            </Form.Item>
            {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 12 }} />}
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />} block>记录</Button>
          </Form>
        </Card>

        <Card className="apple-card" title={`学习记录列表（${total}）`}>
          <div className="list-toolbar inline">
            <Select
              className="filter-select"
              value={subject || undefined}
              onChange={(v) => { setSubject(v || ""); setPage(1); }}
              placeholder="全部科目"
              allowClear
              options={SUBJECT_LIST.map((s) => ({ label: s, value: s }))}
            />
            <Button icon={<ReloadOutlined />} onClick={() => { setSubject(""); setPage(1); }}>清除筛选</Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={items}
            loading={loading}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              showSizeChanger: false,
              showTotal: (t) => `共 ${t} 条记录`,
              onChange: (p) => setPage(p),
            }}
          />
        </Card>
      </div>
    </div>
  );
}
