import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Card, Button, Tag, Space, Modal, Form, Input, InputNumber, Typography,
  Row, Col, Statistic, Progress, message, Tooltip, Alert,
} from "antd";
import {
  RobotOutlined,
  PlayCircleOutlined,
  LogoutOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LeftOutlined,
  RightOutlined,
  FlagOutlined,
} from "@ant-design/icons";
import { api } from "../api.js";
import { masteryColor } from "../components/EChart.jsx";

const { Title, Paragraph } = Typography;

/**
 * 题库练习 = 卡片翻页式（一题一屏，左右滑切）
 * 支持 ?knowledge_point_id=xx 直接进入该知识点专项练习（AI 洞察 / 掌握度页跳转入口）
 */
export default function Practice() {
  const [searchParams, setSearchParams] = useSearchParams();
  const kpFromUrl = searchParams.get("knowledge_point_id");

  const [tags, setTags] = useState([]);
  const [selTag, setSelTag] = useState("");
  const [count, setCount] = useState(5);
  const [paper, setPaper] = useState([]);
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [stats, setStats] = useState({ total: 0, correct: 0 });
  const [answered, setAnswered] = useState({});
  const [autoStarted, setAutoStarted] = useState(false);
  const [kpName, setKpName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  // AI 出题
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiSubject, setAiSubject] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [aiLoading, setAiLoading] = useState(false);
  const [msgApi, msgHolder] = message.useMessage();

  const touchStart = useRef(null);
  const current = paper[idx];

  useEffect(() => { loadTags(); loadStats(); }, []);

  // 从 URL 带知识点进入时自动抽题
  useEffect(() => {
    if (kpFromUrl && !autoStarted) {
      setAutoStarted(true);
      startByKnowledgePoint(kpFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpFromUrl]);

  async function loadTags() {
    try {
      const res = await api.get("/quizzes/tags");
      setTags(res.tags);
    } catch (_) { /* ignore */ }
  }

  async function loadStats() {
    try {
      const s = await api.get("/quizzes/my-summary");
      setStats({ total: s.total, correct: s.correct });
    } catch (_) {
      try {
        const recs = await api.get("/quizzes/records");
        setStats({ total: recs.length, correct: recs.filter((r) => r.is_correct).length });
      } catch (_) { /* ignore */ }
    }
  }

  async function startByKnowledgePoint(kpId) {
    setLoading(true);
    setErr("");
    try {
      const p = await api.get(`/quizzes/practice?knowledge_point_id=${kpId}&count=${count}`);
      resetPaper(p);
      if (p.length) setKpName(p[0].knowledge_point_name || "");
    } catch (e) {
      setErr(e.message);
      msgApi.error("抽题失败：" + e.message);
    } finally { setLoading(false); }
  }

  function startPractice() {
    setLoading(true);
    setErr("");
    const params = new URLSearchParams({ count: String(count) });
    if (selTag) params.set("tag", selTag);
    setKpName(selTag || "");
    api.get(`/quizzes/practice?${params.toString()}`)
      .then((p) => resetPaper(p))
      .catch((e) => { setPaper([]); setErr(e.message); msgApi.error("抽题失败：" + e.message); })
      .finally(() => setLoading(false));
  }

  function resetPaper(qs) {
    setPaper(qs || []);
    setIdx(0);
    setChosen(null);
    setFeedback(null);
    setAnswered({});
  }

  function exitPractice() {
    setPaper([]);
    setKpName("");
    if (kpFromUrl) setSearchParams({});
  }

  async function genByAi() {
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    try {
      const res = await api.post("/ai/generate-quiz", { topic: aiTopic.trim(), subject: aiSubject.trim(), count: aiCount });
      const qs = res.questions.map((x) => ({
        id: null, question: x.q, options: x.options, answer: x.answer, tag: x.tag,
        difficulty: x.difficulty, analysis: x.analysis,
      }));
      resetPaper(qs);
      setKpName(aiTopic.trim());
      setAiOpen(false);
    } catch (e) {
      msgApi.error("AI 出题失败：" + e.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function answer(optIdx) {
    if (feedback || !current?.id) {
      if (!current?.id) msgApi.info("AI 生成的题目暂不支持自动判分，请自行对照解析。");
      return;
    }
    setChosen(optIdx);
    setFeedback(null);
    try {
      const res = await api.post(`/quizzes/${current.id}/answer`, { answer: optIdx });
      setFeedback(res);
      setAnswered((a) => ({ ...a, [idx]: true }));
      loadStats();
      if (res.unlocked?.length) {
        msgApi.success(`解锁成就：${res.unlocked.map((a) => a.title).join("、")}`);
      }
    } catch (e) {
      setFeedback({ correct: false, analysis: "提交失败：" + e.message });
      setAnswered((a) => ({ ...a, [idx]: true }));
    }
  }

  function goTo(i) {
    if (i < 0 || i >= paper.length) return;
    setIdx(i);
    setChosen(null);
    setFeedback(null);
  }

  function next() {
    if (idx + 1 < paper.length) goTo(idx + 1);
    else exitPractice();
  }

  useEffect(() => {
    if (!paper.length) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") goTo(idx - 1);
      if (e.key === "ArrowRight") goTo(idx + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.length, idx]);

  function onTouchStart(e) {
    touchStart.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e) {
    const start = touchStart.current;
    touchStart.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) goTo(idx + 1);
    else goTo(idx - 1);
  }

  // ---------- 未开始：设置面板 ----------
  if (!paper.length) {
    const accuracy = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
    return (
      <div className="page">
        {msgHolder}
        <header className="page-header">
          <div>
            <Title level={3} className="page-title">题库练习</Title>
            <Paragraph className="page-sub">按知识点抽题，一题一屏限时作答，左右滑动切换。</Paragraph>
          </div>
        </header>

        {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 16 }} />}

        <Card className="apple-card practice-setup" title="开始一场练习">
          <div className="tag-picker">
            <Tag.CheckableTag checked={!selTag} onChange={() => setSelTag("")}>全部</Tag.CheckableTag>
            {tags.map((t) => (
              <Tag.CheckableTag key={t} checked={selTag === t} onChange={() => setSelTag(t)}>{t}</Tag.CheckableTag>
            ))}
          </div>
          <div className="setup-row">
            <Space size={16} wrap align="end">
              <div>
                <div className="field-label">题目数量</div>
                <InputNumber
                  min={3}
                  max={10}
                  value={count}
                  onChange={(v) => setCount(v || 3)}
                  addonAfter="题"
                />
              </div>
              <Button type="primary" size="large" icon={<PlayCircleOutlined />}
                      loading={loading} onClick={startPractice}>
                开始作答
              </Button>
              <Button size="large" icon={<RobotOutlined />} onClick={() => setAiOpen(true)}>AI 出题</Button>
            </Space>
          </div>
        </Card>

        <Card className="apple-card practice-stats">
          <Row gutter={16}>
            <Col span={8}><Statistic title="累计答题" value={stats.total} /></Col>
            <Col span={8}><Statistic title="答对" value={stats.correct} styles={{ content: { color: "var(--green)" } }} /></Col>
            <Col span={8}><Statistic title="正确率" value={accuracy} suffix="%" styles={{ content: { color: masteryColor(accuracy) } }} /></Col>
          </Row>
          <Progress
            percent={accuracy}
            strokeColor={masteryColor(accuracy)}
            trailColor="rgba(120,120,128,0.12)"
            style={{ marginTop: 8 }}
          />
        </Card>

        <Modal
          open={aiOpen}
          title="AI 智能出题"
          onCancel={() => setAiOpen(false)}
          onOk={genByAi}
          okText={aiLoading ? "生成中…" : "生成并开始练习"}
          cancelText="取消"
          confirmLoading={aiLoading}
          okButtonProps={{ disabled: !aiTopic.trim() }}
          width={480}
        >
          <Form layout="vertical">
            <Form.Item label="知识点 / 主题" required>
              <Input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="如：导数极值 / 现在完成时" />
            </Form.Item>
            <Form.Item label="学科（可选）">
              <Input value={aiSubject} onChange={(e) => setAiSubject(e.target.value)} placeholder="如：数学 / 英语" />
            </Form.Item>
            <Form.Item label="题目数量">
              <InputNumber min={3} max={8} value={aiCount} onChange={(v) => setAiCount(v || 3)} addonAfter="题" style={{ width: "100%" }} />
            </Form.Item>
          </Form>
          <Typography.Text type="secondary">由云端大模型根据知识点即时生成贴合真实考点的题目。</Typography.Text>
        </Modal>
      </div>
    );
  }

  // ---------- 答题中 ----------
  const done = Object.keys(answered).length;

  return (
    <div className="page practice-run">
      {msgHolder}
      <header className="page-header">
        <div>
          <Title level={3} className="page-title">
            练习进行中 · 第 {idx + 1} / {paper.length} 题
          </Title>
          <Paragraph className="page-sub">
            知识点：{current.tag || kpName || "综合"} ｜ 难度：{"★".repeat(current.difficulty || 1)} ｜ 左右滑动或按 ← → 切题
          </Paragraph>
        </div>
        <Space>
          <Button icon={<FlagOutlined />} onClick={exitPractice}>结束本轮</Button>
          <Button icon={<LogoutOutlined />} onClick={exitPractice}>退出练习</Button>
        </Space>
      </header>

      <div className="pager-progress">
        <div className="pager-bar">
          <span style={{ width: `${((idx + 1) / paper.length) * 100}%` }} />
        </div>
        <div className="pager-dots">
          {paper.map((q, i) => (
            <button
              key={i}
              type="button"
              title={`第 ${i + 1} 题`}
              className={"pager-dot" + (i === idx ? " is-current" : "") + (answered[i] ? " is-done" : "")}
              onClick={() => goTo(i)}
            />
          ))}
          <span className="pager-count">已答 {done}/{paper.length}</span>
        </div>
      </div>

      <div className="pager-stage">
        <button type="button" className="pager-arrow left" onClick={() => goTo(idx - 1)}
                disabled={idx === 0} aria-label="上一题">
          <LeftOutlined />
        </button>

        <div className="pager-viewport" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="pager-track" style={{ transform: `translateX(-${idx * 100}%)` }}>
            {paper.map((q, qi) => {
              const isActive = qi === idx;
              return (
                <div className="pager-slide" key={qi} aria-hidden={!isActive}>
                  <Card className="apple-card quiz-card flip-card">
                    <div className="flip-head">
                      <span className="flip-no">Q{qi + 1}</span>
                      <Tag style={{ marginInlineEnd: 0 }}>{q.tag || "综合"}</Tag>
                      <span className="flip-diff">{"★".repeat(q.difficulty || 1)}</span>
                    </div>

                    <Typography.Title level={4} className="quiz-q">{q.question}</Typography.Title>

                    <div className="options">
                      {q.options.map((opt, i) => {
                        const fb = isActive ? feedback : null;
                        const ch = isActive ? chosen : null;
                        return (
                          <button
                            key={i}
                            className={
                              "option" +
                              (fb
                                ? ch === i
                                  ? (fb.correct ? " right" : " wrong")
                                  : ""
                                : ch === i ? " picked" : "")
                            }
                            onClick={() => isActive && answer(i)}
                            disabled={!isActive || !!fb}
                          >
                            <span className="opt-key">{String.fromCharCode(65 + i)}</span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    {isActive && feedback && (
                      <div className={"feedback " + (feedback.correct ? "ok" : "bad")}>
                        <div className="fb-head">
                          {feedback.correct
                            ? <><CheckCircleOutlined style={{ color: "var(--green)" }} /> 回答正确！</>
                            : <><CloseCircleOutlined style={{ color: "var(--red)" }} /> 回答错误</>}
                        </div>
                        {!feedback.correct && <div className="fb-ana">正确答案：{feedback.answer_text}</div>}
                        {feedback.analysis && <div className="fb-ana">解析：{feedback.analysis}</div>}
                        {!feedback.correct && (
                          <div className="fb-ana" style={{ marginBottom: 12 }}>
                            该题已自动加入错题本，可在「错题本」中重做。
                          </div>
                        )}
                        <Button type="primary" onClick={next}>
                          {idx + 1 < paper.length ? "下一题" : "完成练习"}
                        </Button>
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>
        </div>

        <button type="button" className="pager-arrow right" onClick={() => goTo(idx + 1)}
                disabled={idx === paper.length - 1} aria-label="下一题">
          <RightOutlined />
        </button>
      </div>

      <div className="pager-actions">
        <Button size="large" icon={<LeftOutlined />} onClick={() => goTo(idx - 1)} disabled={idx === 0}>
          上一题
        </Button>
        <span className="pager-pos">{idx + 1} / {paper.length}</span>
        <Tooltip title={feedback ? "" : "先作答再切题"}>
          <Button size="large" type="primary" icon={<RightOutlined />}
                  onClick={() => goTo(idx + 1)} disabled={idx === paper.length - 1}>
            下一题
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
