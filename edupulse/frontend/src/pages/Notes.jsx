import { useEffect, useState } from "react";
import {
  Card, Table, Input, Select, Button, Space, Modal, Form, Tag, Spin, Empty,
  Typography, Popconfirm, message, Alert,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  RobotOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { api } from "../api.js";
import Markdown from "../components/Markdown.jsx";

const PAGE_SIZE = 8;

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");      // 实际提交的搜索词
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false); // 新建/编辑弹窗
  const [editing, setEditing] = useState(null);     // 'new' 或笔记 id
  const [form, setForm] = useState({ title: "", subject: "", content: "", mistake: "" });
  const [aiResult, setAiResult] = useState(null);   // AI 梳理结果（弹窗）
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState(null);       // 当前 AI 梳理的笔记
  const [err, setErr] = useState("");
  const [msgApi, msgHolder] = message.useMessage();

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
      if (search) params.set("q", search);
      if (subject) params.set("subject", subject);
      const data = await api.get(`/notes?${params.toString()}`);
      setNotes(data.items);
      setTotal(data.total);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [page, search, subject]);

  useEffect(() => {
    api.get("/notes/subjects").then((s) => setSubjects(s)).catch(() => {});
  }, []);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function openNew() {
    setEditing("new");
    setForm({ title: "", subject: subject, content: "", mistake: "" });
    setModalOpen(true);
  }
  function openEdit(note) {
    setEditing(note.id);
    setForm({ title: note.title, subject: note.subject, content: note.content, mistake: note.mistake });
    setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setEditing(null); }

  async function save() {
    setErr("");
    try {
      if (editing === "new") {
        await api.post("/notes", form);
        msgApi.success("笔记已创建");
      } else {
        await api.put(`/notes/${editing}`, form);
        msgApi.success("笔记已保存");
      }
      await load();
      closeModal();
    } catch (ex) { setErr(ex.message); }
  }

  async function summarize(note) {
    setAiNote(note);
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await api.post(`/notes/${note.id}/summarize`);
      setAiResult(res);
      await load();
    } catch (ex) {
      setAiResult({ summary: "调用失败：" + ex.message });
    } finally {
      setAiLoading(false);
    }
  }

  async function confirmDelete(note) {
    setErr("");
    try {
      await api.delete(`/notes/${note.id}`);
      msgApi.success("笔记已删除");
      if (notes.length === 1 && page > 1) setPage(page - 1); else load();
    } catch (ex) { setErr(ex.message); }
  }

  const columns = [
    {
      title: "标题",
      dataIndex: "title",
      key: "title",
      render: (t, n) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong style={{ color: "#fff" }}>{t}</Typography.Text>
          <Typography.Text type="secondary" className="note-preview">
            {n.content?.slice(0, 40)}…
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: "科目",
      dataIndex: "subject",
      key: "subject",
      width: 110,
      render: (s) => (s ? <Tag color="cyan">{s}</Tag> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    {
      title: "AI 梳理",
      key: "summary",
      width: 120,
      render: (_, n) => (
        n.summary
          ? <Tag color="success">✓ 已梳理</Tag>
          : <Tag color="default">○ 未梳理</Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 230,
      render: (_, n) => (
        <Space size={4} wrap>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(n)}>编辑</Button>
          <Button size="small" type="link" icon={<RobotOutlined />} onClick={() => summarize(n)}>AI 梳理</Button>
          <Popconfirm
            title="删除笔记"
            description={`确认删除「${n.title}」？删除后不可恢复。`}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => confirmDelete(n)}
          >
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="page">
      {msgHolder}
      <header className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">学习笔记</Typography.Title>
          <Typography.Paragraph className="page-sub">
            记录知识要点，一键交给 AI 知识梳理，提炼要点与易错点。
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>新建笔记</Button>
      </header>

      <Card className="apple-card" variant="borderless">
        <div className="list-toolbar">
          <Input
            className="search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setSearch(q); setPage(1); } }}
            placeholder="搜索标题或正文…"
            prefix={<SearchOutlined />}
            allowClear
          />
          <Select
            className="filter-select"
            value={subject}
            onChange={(v) => { setSubject(v || ""); setPage(1); }}
            placeholder="全部科目"
            allowClear
            options={subjects.map((s) => ({ label: s, value: s }))}
          />
          <Button onClick={() => { setSearch(q); setPage(1); }}>查询</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setQ(""); setSearch(""); setSubject(""); setPage(1); }}>重置</Button>
        </div>

        {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 12 }} />}

        <Table
          rowKey="id"
          columns={columns}
          dataSource={notes}
          loading={loading}
          locale={{ emptyText: <Empty description={err ? "加载失败" : "暂无笔记，点击右上角新建。"} /> }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条笔记`,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>

      {/* AI 梳理结果 */}
      {(aiLoading || aiResult) && (
        <Card
          className="apple-card ai-result"
          title={`🤖 AI 知识梳理结果${aiNote ? ` · 《${aiNote.title}》` : ""}`}
          extra={<Button size="small" onClick={() => { setAiResult(null); setAiNote(null); }}>关闭</Button>}
          style={{ marginTop: 20 }}
        >
          {aiLoading ? (
            <div className="ai-loading"><Spin /> AI 正在梳理…</div>
          ) : (
            <>
              {aiResult.summary && <div className="ai-summary"><Markdown>{aiResult.summary}</Markdown></div>}
              {aiResult.key_points?.length > 0 && (
                <>
                  <Typography.Title level={5} className="ai-sub">📌 要点提取</Typography.Title>
                  <ul className="ai-list">{aiResult.key_points.map((p, i) => <li key={i}><Markdown>{p}</Markdown></li>)}</ul>
                </>
              )}
              {aiResult.mistakes?.length > 0 && (
                <>
                  <Typography.Title level={5} className="ai-sub">⚠ 易错点</Typography.Title>
                  <ul className="ai-list warn">{aiResult.mistakes.map((p, i) => <li key={i}><Markdown>{p}</Markdown></li>)}</ul>
                </>
              )}
              {aiResult.suggestion && (
                <>
                  <Typography.Title level={5} className="ai-sub">💡 学习建议</Typography.Title>
                  <div className="ai-suggestion"><Markdown>{aiResult.suggestion}</Markdown></div>
                </>
              )}
            </>
          )}
        </Card>
      )}

      {/* 新建/编辑笔记弹窗 */}
      <Modal
        open={modalOpen}
        title={editing === "new" ? "新建笔记" : "编辑笔记"}
        onCancel={closeModal}
        onOk={save}
        okText="保存笔记"
        cancelText="取消"
        width={620}
        destroyOnHidden
      >
        {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 12 }} />}
        <Form layout="vertical">
          <div className="form-row">
            <Form.Item label="标题" required>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="如：导数与函数极值" />
            </Form.Item>
            <Form.Item label="来源科目">
              <Select
                value={form.subject || undefined}
                onChange={(v) => set("subject", v || "")}
                placeholder="如：数学"
                allowClear
                options={["数学", "英语", "语文", "物理", "化学"].map((s) => ({ label: s, value: s }))}
              />
            </Form.Item>
          </div>
          <Form.Item label="笔记易错点">
            <Input value={form.mistake} onChange={(e) => set("mistake", e.target.value)} placeholder="可选：你特别容易错的地方" />
          </Form.Item>
          <Form.Item label="正文" required>
            <Input.TextArea rows={8} value={form.content} onChange={(e) => set("content", e.target.value)} placeholder="粘贴或输入学习笔记内容…" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
