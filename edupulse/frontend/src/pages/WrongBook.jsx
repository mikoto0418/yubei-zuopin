import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Button, Tag, Typography, Empty, Skeleton, Alert, Select, Input,
  Pagination, Space, Popconfirm, message, Segmented, Checkbox,
} from "antd";
import {
  SearchOutlined, ReloadOutlined, CheckCircleOutlined, RedoOutlined,
  DeleteOutlined, PlayCircleOutlined,
} from "@ant-design/icons";
import { api } from "../api.js";

const { Title, Paragraph } = Typography;
const PAGE_SIZE = 6;

/**
 * 错题本：自动收录答错的题，支持标记已掌握 / 重做 / 移除
 */
export default function WrongBook() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [redoState, setRedoState] = useState({});   // { [wid]: chosenIndex }
  const [redoResult, setRedoResult] = useState({}); // { [wid]: response }
  const [showAnswer, setShowAnswer] = useState({}); // { [wid]: bool }
  const [msgApi, msgHolder] = message.useMessage();

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qp = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
      if (status) qp.set("status", status);
      if (search) qp.set("q", search);
      const d = await api.get(`/wrong-book?${qp.toString()}`);
      setData(d);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [page, status, search]);

  async function markMastered(item) {
    try {
      await api.post(`/wrong-book/${item.id}/master`);
      msgApi.success("已标记为掌握");
      load();
    } catch (e) { msgApi.error(e.message); }
  }

  async function submitRedo(item, idx) {
    setRedoState((s) => ({ ...s, [item.id]: idx }));
    try {
      const res = await api.post(`/wrong-book/${item.id}/redo`, { answer: idx });
      setRedoResult((s) => ({ ...s, [item.id]: res }));
      if (res.correct) msgApi.success("回答正确！已自动标记为掌握");
      load();
    } catch (e) { msgApi.error(e.message); }
  }

  async function remove(item) {
    try {
      await api.delete(`/wrong-book/${item.id}`);
      msgApi.success("已从错题本移除");
      if (data.items.length === 1 && page > 1) setPage(page - 1); else load();
    } catch (e) { msgApi.error(e.message); }
  }

  const items = data?.items || [];

  return (
    <div className="page">
      {msgHolder}
      <header className="page-header">
        <div>
          <Title level={3} className="page-title">错题本</Title>
          <Paragraph className="page-sub">
            答错的题自动收录。标记掌握或重做答对后，即转为「已掌握」。
          </Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            options={[
              { label: `待攻克${data ? ` (${data.pending})` : ""}`, value: "pending" },
              { label: `已掌握${data ? ` (${data.mastered})` : ""}`, value: "mastered" },
              { label: "全部", value: "" },
            ]}
          />
          <Button icon={<PlayCircleOutlined />} onClick={() => nav("/practice")}>去刷题</Button>
        </Space>
      </header>

      <Card className="apple-card" variant="borderless" style={{ marginBottom: 16 }}>
        <div className="list-toolbar" style={{ marginBottom: 0 }}>
          <Input
            className="search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setSearch(q); setPage(1); } }}
            placeholder="搜索题干关键词…"
            prefix={<SearchOutlined />}
            allowClear
          />
          <Button onClick={() => { setSearch(q); setPage(1); }}>查询</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setQ(""); setSearch(""); setStatus(""); setPage(1); }}>
            重置
          </Button>
        </div>
      </Card>

      {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 16 }}
                     action={<Button size="small" onClick={load}>重试</Button>} />}

      {loading ? (
        <Card className="apple-card"><Skeleton active paragraph={{ rows: 10 }} /></Card>
      ) : !items.length ? (
        <Card className="apple-card">
          <Empty
            description={
              status === "mastered"
                ? "还没有已掌握的错题，继续加油。"
                : status === "pending"
                  ? "太棒了，没有待攻克的错题！"
                  : "错题本还是空的，去刷题吧。"
            }
          >
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => nav("/practice")}>
              去刷题
            </Button>
          </Empty>
        </Card>
      ) : (
        <Card className="apple-card" variant="borderless">
          {items.map((item) => {
            const res = redoResult[item.id];
            const chosen = redoState[item.id];
            return (
              <div className="wrong-item" key={item.id}>
                <div className="wrong-head">
                  <Tag color={item.status === "mastered" ? "success" : "warning"}>
                    {item.status === "mastered" ? "已掌握" : "待攻克"}
                  </Tag>
                  <Tag>{item.knowledge_point_name || "未分类"}</Tag>
                  {item.subject_name && <Tag>{item.subject_name}</Tag>}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    答错 {item.wrong_count} 次 · 答对 {item.correct_count} 次
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: "auto" }}>
                    {item.last_wrong_at?.slice(0, 16)}
                  </Typography.Text>
                </div>

                <div className="wrong-q">{item.question}</div>

                <div className="wrong-opts">
                  {item.options.map((opt, i) => {
                    const isCorrect = i === item.correct_answer;
                    const isPicked = res ? chosen === i : (showAnswer[item.id] && item.last_answer === i);
                    return (
                      <div
                        key={i}
                        className={
                          "wrong-opt" +
                          (res && isCorrect ? " is-correct" : "") +
                          (res && isPicked && !isCorrect ? " is-picked" : "")
                        }
                      >
                        <span className="opt-key">{String.fromCharCode(65 + i)}</span>
                        <span>{opt}</span>
                        {isCorrect && <CheckCircleOutlined style={{ marginLeft: "auto", color: "var(--green)" }} />}
                      </div>
                    );
                  })}
                </div>

                {res && (
                  <Alert
                    type={res.correct ? "success" : "error"}
                    showIcon
                    message={res.correct ? "回答正确，已标记为掌握" : `回答错误，正确答案：${res.answer_text}`}
                    description={res.analysis ? `解析：${res.analysis}` : null}
                    style={{ marginBottom: 12 }}
                  />
                )}

                {!res && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "var(--label-secondary)" }}>重做：</span>
                    {item.options.map((_, i) => (
                      <Button key={i} size="small" onClick={() => submitRedo(item, i)}>
                        {String.fromCharCode(65 + i)}
                      </Button>
                    ))}
                    <Checkbox
                      checked={!!showAnswer[item.id]}
                      onChange={(e) => setShowAnswer((s) => ({ ...s, [item.id]: e.target.checked }))}
                      style={{ marginLeft: 8 }}
                    >
                      显示上次作答
                    </Checkbox>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {item.status !== "mastered" && (
                    <Button size="small" type="primary" icon={<CheckCircleOutlined />}
                            onClick={() => markMastered(item)}>
                      标记已掌握
                    </Button>
                  )}
                  <Button size="small" icon={<RedoOutlined />}
                          onClick={() => {
                            setRedoResult((s) => ({ ...s, [item.id]: null }));
                            setRedoState((s) => ({ ...s, [item.id]: undefined }));
                          }}>
                    清除重做结果
                  </Button>
                  <Popconfirm
                    title="从错题本移除"
                    description="移除后不影响历史答题记录，确认移除？"
                    okText="确认移除" cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => remove(item)}
                  >
                    <Button size="small" type="text" danger icon={<DeleteOutlined />}>移除</Button>
                  </Popconfirm>
                </div>
              </div>
            );
          })}

          <div style={{ textAlign: "center", marginTop: 20 }}>
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={data.total}
              showSizeChanger={false}
              showTotal={(t) => `共 ${t} 条错题`}
              onChange={setPage}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
