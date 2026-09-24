import React, { useEffect, useState } from "react";
import {
  Card, Button, TextInput, Text, Group, Stack, Title, Badge,
  SegmentedControl, Radio, Timeline, NumberInput, Center, Box, Alert,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconPlus, IconTrash, IconSparkles, IconClipboardHeart, IconAlertCircle,
  IconCircleCheck, IconFileText,
} from "@tabler/icons-react";
import { api } from "../api/client";
import Reveal from "../components/Reveal";

/* ---------- 标准 SDS ---------- */
const ITEMS = [
  { q: "我感到情绪沮丧、郁闷" },
  { q: "我感到早晨心情最好", rev: true },
  { q: "我要哭或想哭" },
  { q: "我晚间睡眠不好" },
  { q: "我吃饭像平常一样多", rev: true },
  { q: "我的心情和往常一样好", rev: true },
  { q: "我的体重在下降" },
  { q: "我有便秘的苦恼" },
  { q: "我心跳比平时快" },
  { q: "我无缘无故地感到疲乏" },
  { q: "我的头脑和往常一样清楚", rev: true },
  { q: "我做事和往常一样容易", rev: true },
  { q: "我做事情感到困难" },
  { q: "我觉得未来有希望", rev: true },
  { q: "我对未来感到悲观" },
  { q: "我做决定很容易", rev: true },
  { q: "我觉得自己是有用的人", rev: true },
  { q: "我的生活过得很有意义", rev: true },
  { q: "如果我死了，别人会生活得更好" },
  { q: "我仍旧喜爱自己过去喜欢的东西", rev: true },
];
const OPTIONS = ["偶尔", "有时", "经常", "持续"];

function calcTotal(answers) {
  let raw = 0;
  ITEMS.forEach((it, i) => {
    const v = answers[i] || 0;
    raw += it.rev ? 5 - v : v;
  });
  return Math.round(raw * 1.25); // 标准分
}
function levelOf(total) {
  if (total < 53) return "正常";
  if (total < 63) return "轻度抑郁";
  if (total < 73) return "中度抑郁";
  return "重度抑郁";
}

function levelColor(level) {
  if (level === "正常") return "teal";
  if (level === "轻度抑郁") return "yellow";
  if (level === "中度抑郁") return "orange";
  return "red";
}

function toast(message, color = "mindcare") {
  notifications.show({ message, color, radius: "lg", autoClose: 2200 });
}

/* ---------- 自定义问卷：创建 ---------- */
function QuizCreate({ onCreated }) {
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [options, setOptions] = useState(["从不", "有时", "经常", "持续"]);
  const [questions, setQuestions] = useState([{ q: "", scores: [0, 1, 2, 3] }]);
  const [err, setErr] = useState("");
  const [aiTopic, setAiTopic] = useState("");
  const [aiN, setAiN] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [aiSource, setAiSource] = useState("");

  async function genByAi() {
    setErr("");
    if (!aiTopic.trim()) return setErr("请先输入问卷主题");
    setGenerating(true);
    try {
      const rt = await api.generateQuiz({ topic: aiTopic.trim(), n: aiN });
      setTitle(rt.title || "");
      setIntro(rt.intro || "");
      setOptions(Array.isArray(rt.options) ? rt.options.map(String) : []);
      const qs = (rt.questions || []).map((x) => ({ q: x.q || "", scores: (x.scores || []).map((v) => Number(v)) }));
      if (!qs.length) return setErr("AI 返回题目为空，请重试");
      setQuestions(qs);
      setAiSource(rt.source === "cloud" ? "云端生成" : "本地生成");
    } catch (ex) {
      setErr(ex.message || "生成失败，请重试");
    } finally {
      setGenerating(false);
    }
  }

  function setQ(i, patch) {
    const next = questions.slice();
    next[i] = { ...next[i], ...patch };
    setQuestions(next);
  }
  function setScore(i, j, val) {
    const next = questions.slice();
    const s = next[i].scores.slice();
    s[j] = +val || 0;
    next[i] = { ...next[i], scores: s };
    setQuestions(next);
  }
  function addQ() {
    setQuestions([...questions, { q: "", scores: options.map((_, j) => j) }]);
  }

  async function submit() {
    setErr("");
    if (!title.trim()) return setErr("请填写问卷标题");
    if (!questions.every((x) => x.q.trim())) return setErr("请补全所有题干");
    if (questions.length) {
      for (const x of questions) if (x.scores.length !== options.length) return setErr("每道题的选项分值数量需一致");
    }
    const body = {
      title,
      intro,
      options,
      questions: questions.map((x) => ({ q: x.q.trim(), scores: x.scores })),
    };
    try {
      await api.createQuiz(body);
      setTitle(""); setIntro(""); setQuestions([{ q: "", scores: options.map((_, j) => j) }]);
      onCreated();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Card radius="lg" padding="lg" className="mc-glass" mt="md">
      <Title order={4} mb={4}>自定义问卷</Title>
      <Text c="dimmed" size="sm" mb="md">
        设计你自己的心理自评问卷。每题为若干选项打分，得分越高表示该倾向越明显，系统按占比自动评定水平。
      </Text>

      <Card
        radius="lg"
        padding="md"
        mb="md"
        style={{ background: "rgba(255,45,85,.07)", border: "1px dashed rgba(255,45,85,.4)" }}
      >
        <Group gap={8} mb="sm">
          <IconSparkles size={16} color="#FF2D55" />
          <Text fw={700} size="sm">AI 一键生成问卷</Text>
          {aiSource && <Badge size="sm" variant="light" color="mindcare">{aiSource}</Badge>}
        </Group>
        <Group gap={8} align="flex-end">
          <TextInput
            placeholder="输入主题，如：考前焦虑 / 毕业压力 / 社交"
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            maxLength={30}
            radius="md"
            style={{ flex: 1 }}
          />
          <SegmentedControl
            radius="md"
            value={String(aiN)}
            onChange={(v) => setAiN(+v)}
            color="mindcare"
            data={[3, 5, 8, 10, 15].map((n) => ({ label: `${n} 题`, value: String(n) }))}
          />
          <Button radius="md" color="mindcare" onClick={genByAi} loading={generating}>
            {generating ? "生成中…" : "生成"}
          </Button>
        </Group>
        <Text c="dimmed" size="xs" mt={8}>
          AI 按主题自动拟题并填入下方表单，可改后保存。无大模型 Key 时用内置题库回退。
        </Text>
      </Card>

      <Stack gap="md">
        <TextInput
          label="问卷标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={30}
          placeholder="例如：考前焦虑自评"
          radius="md"
        />
        <TextInput
          label="简介（可选）"
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          maxLength={100}
          placeholder="一句话说明适用范围"
          radius="md"
        />
        <TextInput
          label="选项与分值（每行一个，用英文逗号分隔）"
          value={options.join(",")}
          onChange={(e) => setOptions(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          radius="md"
        />

        <Box>
          <Text size="sm" fw={600} mb={8}>题目（末位为对应选项分值）</Text>
          <Stack gap="sm">
            {questions.map((q, i) => (
              <Card key={i} radius="md" padding="sm">
                <Group gap={8} mb={8} wrap="nowrap" align="center">
                  <Badge circle color="mindcare" variant="light">{i + 1}</Badge>
                  <TextInput
                    value={q.q}
                    onChange={(e) => setQ(i, { q: e.target.value })}
                    placeholder="题干"
                    maxLength={100}
                    radius="md"
                    style={{ flex: 1 }}
                  />
                  {questions.length > 1 && (
                    <Button
                      size="compact-xs"
                      radius="md"
                      variant="light"
                      color="red"
                      leftSection={<IconTrash size={12} />}
                      onClick={() => setQuestions(questions.filter((_, x) => x !== i))}
                    >
                      删题
                    </Button>
                  )}
                </Group>
                <Group gap="sm">
                  {q.scores.map((s, j) => (
                    <NumberInput
                      key={j}
                      size="xs"
                      radius="md"
                      w={104}
                      label={options[j] || `选项${j + 1}`}
                      value={s}
                      onChange={(v) => setScore(i, j, v)}
                    />
                  ))}
                </Group>
              </Card>
            ))}
          </Stack>
          <Button mt="sm" radius="md" variant="light" color="mindcare" leftSection={<IconPlus size={15} />} onClick={addQ}>
            添加题目
          </Button>
        </Box>

        {err && (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} radius="md">
            {err}
          </Alert>
        )}

        <Group>
          <Button radius="lg" color="mindcare" onClick={submit}>保存问卷</Button>
        </Group>
      </Stack>
    </Card>
  );
}

/* ---------- 自定义问卷：作答 ---------- */
function QuizTake({ quiz, onDone }) {
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  let questions = [];
  try {
    const parsed = JSON.parse(quiz.questions);
    questions = parsed.items || parsed;
  } catch {}
  const optionLabels = quiz.options || [];

  const allDone = questions.every((_, i) => (answers[i] ?? -1) >= 0);

  async function submit() {
    const list = questions.map((_, i) => answers[i] ?? 0);
    try {
      const r = await api.submitQuiz(quiz.id, list);
      setResult(r.submission);
      if (onDone) onDone();
    } catch (ex) {
      notifications.show({ message: ex.message, color: "red", radius: "lg" });
    }
  }

  return (
    <Card radius="lg" padding="lg" className="mc-glass">
      <Title order={4}>{quiz.title}</Title>
      {quiz.intro && <Text c="dimmed" size="sm" mt={4}>{quiz.intro}</Text>}

      {result ? (
        <Card radius="lg" padding="md" mt="md" style={{ background: "rgba(255,45,85,.08)" }}>
          <Title order={4} mb="sm">本次结果</Title>
          <Group align="baseline" gap={6}>
            <Text fw={700} size="34px" c="mindcare">{result.score}</Text>
            <Text c="dimmed" size="sm">得分 / {result.max_score}</Text>
          </Group>
          <Group gap={6} mt={6}>
            <Text c="dimmed" size="sm">对应水平：</Text>
            <Badge color="mindcare" variant="light" radius="lg">{result.level}</Badge>
          </Group>
          <Text c="dimmed" size="xs" mt={8}>结果仅供自我参考。</Text>
        </Card>
      ) : (
        <>
          <Stack gap="lg" mt="md">
            {questions.map((q, i) => (
              <Box key={i}>
                <Text fw={600} size="sm" mb={8}>{i + 1}. {q.q}</Text>
                <Radio.Group
                  value={answers[i] != null ? String(answers[i]) : null}
                  onChange={(v) => setAnswers({ ...answers, [i]: +v })}
                >
                  <Group gap="sm">
                    {optionLabels.map((o, oi) => (
                      <Radio.Card
                        key={oi}
                        value={String(oi)}
                        radius="lg"
                        className="mc-radio-card"
                        style={{ padding: "8px 16px", minWidth: 88, textAlign: "center" }}
                      >
                        <Group wrap="nowrap" gap={8} justify="center">
                          <Radio.Indicator />
                          <Text size="sm">{o}</Text>
                        </Group>
                      </Radio.Card>
                    ))}
                  </Group>
                </Radio.Group>
              </Box>
            ))}
          </Stack>

          {!optionLabels.length && (
            <Alert mt="md" color="yellow" variant="light" radius="md">
              该问卷缺少选项定义，请在"我的问卷"里删除后重建。
            </Alert>
          )}

          <Button mt="md" radius="lg" color="mindcare" disabled={!allDone} onClick={submit}>
            {allDone ? "提交" : `请完成全部 ${questions.length} 题`}
          </Button>
        </>
      )}
    </Card>
  );
}

/* ---------- 自定义问卷：列表 ---------- */
function CustomAssessment() {
  const [quizzes, setQuizzes] = useState([]);
  const [active, setActive] = useState(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const d = await api.quizzes();
      setQuizzes(d.quizzes);
    } catch {}
  }
  useEffect(() => { load(); }, []);

  async function open(q) {
    try {
      const d = await api.quizDetail(q.id);
      setActive(d.quiz);
    } catch {}
  }

  async function remove(q) {
    if (!window.confirm("确定删除该问卷及其作答记录吗？")) return;
    try {
      await api.deleteQuiz(q.id);
      if (active && active.id === q.id) setActive(null);
      load();
    } catch {}
  }

  return (
    <div className="mc-flow">
      <Card radius="lg" padding="lg" className="mc-glass">
        <Title order={4} mb="md">我的问卷</Title>
        {quizzes.length ? (
          <Stack gap="sm">
            {quizzes.map((q) => (
              <Card key={q.id} radius="md" padding="sm">
                <Group justify="space-between" wrap="nowrap">
                  <Box>
                    <Text fw={700} size="sm">{q.title}</Text>
                    <Text c="dimmed" size="xs">{q.intro || "—"} · {q.question_count} 题</Text>
                  </Box>
                  <Group gap={4} wrap="nowrap">
                    <Button size="compact-xs" radius="md" color="mindcare" onClick={() => open(q)}>作答</Button>
                    <Button size="compact-xs" radius="md" variant="light" color="red" leftSection={<IconTrash size={12} />} onClick={() => remove(q)}>删除</Button>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        ) : (
          <Center py="xl">
            <Stack align="center" gap={4}>
              <IconFileText size={30} opacity={0.35} />
              <Text c="dimmed" size="sm">还没有自定义问卷</Text>
            </Stack>
          </Center>
        )}
        <Button
          mt="md"
          radius="md"
          variant={creating ? "default" : "light"}
          color="mindcare"
          fullWidth
          leftSection={<IconPlus size={15} />}
          onClick={() => setCreating(!creating)}
        >
          {creating ? "收起编辑" : "新建问卷"}
        </Button>
        {creating && <QuizCreate onCreated={() => { setCreating(false); load(); }} />}
      </Card>

      <div>
        {active ? (
          <QuizTake key={active.id} quiz={active} onDone={() => load()} />
        ) : (
          <Card radius="lg" padding="lg" className="mc-glass">
            <Center py="xl">
              <Stack align="center" gap={4}>
                <IconClipboardHeart size={32} opacity={0.35} />
                <Text c="dimmed" size="sm">选择一个问卷来作答</Text>
              </Stack>
            </Center>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ---------- 主页面 ---------- */
export default function Assessment() {
  const [tab, setTab] = useState("standard");
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.assessments().then((d) => setHistory(d.assessments)).catch(() => {});
  }, []);

  function pick(i, v) {
    setAnswers({ ...answers, [i]: v });
  }
  const answeredCount = ITEMS.filter((_, i) => answers[i] >= 1).length;
  const allDone = answeredCount === ITEMS.length;

  async function submit() {
    if (!allDone) return;
    const total = calcTotal(answers);
    const level = levelOf(total);
    try {
      await api.submitAssessment({ total_score: total });
      setResult({ total, level });
      const d = await api.assessments();
      setHistory(d.assessments);
      toast("测评已提交，感谢你的认真作答");
    } catch (ex) {
      notifications.show({ message: ex.message, color: "red", radius: "lg" });
    }
  }

  return (
    <div className="mc-flow">
      <Reveal depth={14}>
        <Box pt={6}>
          <Text className="mc-section-title">心理测评</Text>
          <h1 className="page-title" style={{ marginTop: 6 }}>了解自己的状态</h1>
          <Text c="dimmed" size="sm" mt={8}>
            标准 SDS 自评 + 可自定义的个人问卷，结果仅供自我参考，不替代专业诊断。
          </Text>
        </Box>
      </Reveal>

      <Reveal delay={60} depth={22}>
        <SegmentedControl
          fullWidth
          radius="lg"
          color="mindcare"
          value={tab}
          onChange={setTab}
          data={[
            { label: "标准测评（SDS）", value: "standard" },
            { label: "自定义问卷", value: "custom" },
          ]}
        />
      </Reveal>

      {tab === "standard" ? (
        <div className="mc-flow">
          <Card radius="lg" padding="lg" className="mc-glass">
            <Group justify="space-between" mb="md" wrap="nowrap">
              <Title order={4}>请根据最近一周的感受作答</Title>
              <Badge color="mindcare" variant="light" radius="lg">
                {answeredCount} / {ITEMS.length}
              </Badge>
            </Group>

            <Stack gap="lg">
              {ITEMS.map((it, i) => (
                <Box key={i}>
                  <Text fw={600} size="sm" mb={8}>{i + 1}. {it.q}</Text>
                  <Radio.Group
                    value={answers[i] != null ? String(answers[i]) : null}
                    onChange={(v) => pick(i, +v)}
                  >
                    <Group gap="sm">
                      {OPTIONS.map((o, oi) => (
                        <Radio.Card
                          key={o}
                          value={String(oi + 1)}
                          radius="lg"
                          className="mc-radio-card"
                          style={{ padding: "8px 16px", minWidth: 84, textAlign: "center" }}
                        >
                          <Group wrap="nowrap" gap={8} justify="center">
                            <Radio.Indicator />
                            <Text size="sm">{o}</Text>
                          </Group>
                        </Radio.Card>
                      ))}
                    </Group>
                  </Radio.Group>
                </Box>
              ))}
            </Stack>

            <Button mt="lg" radius="lg" color="mindcare" disabled={!allDone} onClick={submit} fullWidth>
              {allDone ? "提交测评" : `请完成全部 20 题（还差 ${ITEMS.length - answeredCount} 题）`}
            </Button>

            {result && (
              <Card radius="lg" padding="md" mt="md" style={{ background: "rgba(255,45,85,.08)" }}>
                <Title order={4} mb="sm">本次结果</Title>
                <Group align="baseline" gap={8}>
                  <Text fw={700} size="34px" c="mindcare">{result.total}</Text>
                  <Text c="dimmed" size="sm">标准分</Text>
                  <Badge color={levelColor(result.level)} variant="light" radius="lg" size="lg">{result.level}</Badge>
                </Group>
                <Text c="dimmed" size="xs" mt={8}>
                  本结果仅供参考，如持续困扰请寻求专业帮助。
                </Text>
              </Card>
            )}
          </Card>

          <Card radius="lg" padding="lg" className="mc-glass" style={{ alignSelf: "start" }}>
            <Title order={4} mb="md">测评记录</Title>
            {history.length ? (
              <Timeline active={history.length} bulletSize={22} lineWidth={2} color="mindcare">
                {history.map((h) => (
                  <Timeline.Item
                    key={h.id}
                    bullet={<IconClipboardHeart size={12} />}
                    title={
                      <Group gap={8} wrap="nowrap">
                        <Text fw={700} size="sm">标准分 {h.total_score}</Text>
                        <Badge size="xs" variant="light" radius="lg" color={levelColor(h.level)}>{h.level}</Badge>
                      </Group>
                    }
                  >
                    <Text c="dimmed" size="xs">{h.created_at}</Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <Center py="xl">
                <Stack align="center" gap={4}>
                  <IconCircleCheck size={30} opacity={0.35} />
                  <Text c="dimmed" size="sm">还没做过测评</Text>
                </Stack>
              </Center>
            )}
          </Card>
        </div>
      ) : (
        <CustomAssessment />
      )}
    </div>
  );
}
