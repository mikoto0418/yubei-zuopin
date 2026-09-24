import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);

const PAGE_SIZE = 100;

/** 分页拉全量消息（后端默认 id 升序） */
async function fetchAllMessages(sessionId) {
  const first = await api.list('messages', { session_id: sessionId, page: 1, pageSize: PAGE_SIZE });
  const list = [...(first.list || [])];
  for (let p = 2; p <= (first.pages || 1); p += 1) {
    const next = await api.list('messages', { session_id: sessionId, page: p, pageSize: PAGE_SIZE });
    list.push(...(next.list || []));
  }
  return list;
}

export function ChatProvider({ children }) {
  const { user } = useAuth();

  // —— 会话列表 ——
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState('');
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionQuery, setSessionQuery] = useState({ q: '', status: '' });

  // —— 当前会话 ——
  const [current, setCurrent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [positions, setPositions] = useState([]);

  // —— 运行态 ——
  const [busy, setBusy] = useState('idle'); // idle | asking | evaluating | analyzing
  const [stream, setStream] = useState({ text: '', typing: false });

  const streamRef = useRef({ timer: null, resolve: null, full: '' });

  useEffect(() => {
    (async () => {
      try {
        const data = await api.positions({ page: 1, pageSize: 50 });
        setPositions(data.list || []);
      } catch { /* 岗位列表加载失败不阻断对话 */ }
    })();
  }, []);

  /** 逐字打字机输出；resolve 在全部字符显示完毕后触发 */
  const streamOut = useCallback((full) => {
    const text = String(full || '');
    return new Promise((resolve) => {
      const s = streamRef.current;
      if (s.timer) clearInterval(s.timer);
      s.full = text;
      s.resolve = resolve;
      if (!text) {
        setStream({ text: '', typing: false });
        s.resolve = null;
        resolve();
        return;
      }
      const chunk = Math.max(1, Math.ceil(text.length / 240));
      let i = 0;
      setStream({ text: '', typing: true });
      s.timer = setInterval(() => {
        i = Math.min(text.length, i + chunk);
        const done = i >= text.length;
        setStream({ text: text.slice(0, i), typing: !done });
        if (done) {
          clearInterval(s.timer);
          s.timer = null;
          const cb = s.resolve;
          s.resolve = null;
          if (cb) cb();
        }
      }, 16);
    });
  }, []);

  const skipTyping = useCallback(() => {
    const s = streamRef.current;
    if (!s.timer) return;
    clearInterval(s.timer);
    s.timer = null;
    setStream({ text: s.full, typing: false });
    const cb = s.resolve;
    s.resolve = null;
    if (cb) cb();
  }, []);

  useEffect(
    () => () => {
      if (streamRef.current.timer) clearInterval(streamRef.current.timer);
    },
    [],
  );

  // —— 会话列表加载 ——
  const loadSessions = useCallback(
    async ({ page = 1, append = false, q = sessionQuery.q, status = sessionQuery.status } = {}) => {
      setSessionsLoading(true);
      setSessionsError('');
      try {
        const data = await api.list('sessions', { page, pageSize: 20, q, status });
        setSessions((prev) => (append ? [...prev, ...(data.list || [])] : data.list || []));
        setSessionTotal(data.total || 0);
        setSessionPage(page);
        setSessionQuery({ q, status });
      } catch (e) {
        setSessionsError(e.message || '会话列表加载失败');
      } finally {
        setSessionsLoading(false);
      }
    },
    [sessionQuery.q, sessionQuery.status],
  );

  useEffect(() => {
    loadSessions({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMoreSessions = useCallback(() => {
    if (sessionsLoading || sessions.length >= sessionTotal) return;
    loadSessions({ page: sessionPage + 1, append: true });
  }, [sessionsLoading, sessions.length, sessionTotal, sessionPage, loadSessions]);

  // —— 打开会话 ——
  const openSession = useCallback(async (session) => {
    setCurrent(session);
    setMessages([]);
    setMessagesError('');
    setStream({ text: '', typing: false });
    if (!session) return;
    setMessagesLoading(true);
    try {
      const list = await fetchAllMessages(session.id);
      setMessages(list);
    } catch (e) {
      setMessagesError(e.message || '对话记录加载失败');
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const reloadMessages = useCallback(async () => {
    if (!current) return;
    setMessagesLoading(true);
    setMessagesError('');
    try {
      setMessages(await fetchAllMessages(current.id));
    } catch (e) {
      setMessagesError(e.message || '对话记录加载失败');
    } finally {
      setMessagesLoading(false);
    }
  }, [current]);

  const patchSession = useCallback((id, patch) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setCurrent((c) => (c && c.id === id ? { ...c, ...patch } : c));
  }, []);

  const pushLocal = useCallback((msg) => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setMessages((prev) => [...prev, { id: tempId, created_at: new Date().toISOString(), ...msg }]);
    return tempId;
  }, []);

  /** 新建会话：创建 → 状态机进入 in_progress → 生成第一题 → 落库 */
  const createSession = useCallback(
    async ({ title, role, level, position_id }) => {
      const session = await api.create('sessions', {
        title, role, level, position_id: position_id || null, status: 'created', score: 0, round_count: 0,
      });
      setSessions((prev) => [session, ...prev]);
      setSessionTotal((t) => t + 1);
      setCurrent(session);
      setMessages([]);
      setMessagesError('');
      setBusy('asking');
      try {
        // 状态机：created → in_progress
        const started = await api.transitionSession(session.id, 'in_progress');
        patchSession(session.id, started);

        const res = await api.aiAsk({ role, level, round: 1, position_id: position_id || null });
        await streamOut(res.text);
        await api.create('messages', {
          session_id: session.id,
          role: 'ai',
          content: res.text,
          card_type: res.source === 'llm' ? 'ai:llm' : 'ai:local',
        });
        setMessages(await fetchAllMessages(session.id));
        patchSession(session.id, { round_count: 1 });
      } finally {
        setStream({ text: '', typing: false });
        setBusy('idle');
      }
      return session;
    },
    [streamOut, patchSession],
  );

  /**
   * 发送回答：落库用户消息 → AI 要点分析（写入 answer_analyses / interview_rounds）
   * → 生成下一题 → 落库。
   */
  const sendAnswer = useCallback(
    async (text) => {
      if (!current) return;
      const sessionId = current.id;
      const round = Number(current.round_count) || 0;
      const lastAi = [...messages].reverse().find((m) => m.role === 'ai' && m.card_type !== 'report');
      pushLocal({ role: 'user', content: text, card_type: '' });
      setBusy('asking');
      try {
        await api.create('messages', { session_id: sessionId, role: 'user', content: text, card_type: '' });

        // 答案分析：命中 / 遗漏要点写入数据库，同时生成该轮评分
        setBusy('analyzing');
        try {
          await api.aiAnalyzeAnswer({
            session_id: sessionId,
            question: lastAi ? lastAi.content : '',
            answer: text,
            round_no: round || undefined,
          });
        } catch (e) {
          // 分析失败不阻断对话推进，但要明确告知
          setBusy('asking');
        }

        setBusy('asking');
        const res = await api.aiAsk({ role: current.role, level: current.level, round: round + 1, position_id: current.position_id || null });
        await streamOut(res.text);
        await api.create('messages', {
          session_id: sessionId, role: 'ai', content: res.text,
          card_type: res.source === 'llm' ? 'ai:llm' : 'ai:local',
        });
        setMessages(await fetchAllMessages(sessionId));
        patchSession(sessionId, { round_count: round + 1 });
      } catch (e) {
        setStream({ text: '', typing: false });
        throw e;
      } finally {
        setBusy('idle');
      }
    },
    [current, messages, pushLocal, streamOut, patchSession],
  );

  /** 重新生成某条 AI 消息 */
  const regenerate = useCallback(
    async (message) => {
      if (!current || busy !== 'idle') return;
      const list = messages;
      const idx = list.findIndex((m) => m.id === message.id);
      if (idx < 0) return;
      const round = list.slice(0, idx + 1).filter((m) => m.role === 'ai').length || 1;
      setBusy('asking');
      try {
        const res = await api.aiAsk({ role: current.role, level: current.level, round, position_id: current.position_id || null });
        await api.remove('messages', message.id);
        await streamOut(res.text);
        const saved = await api.create('messages', {
          session_id: current.id, role: 'ai', content: res.text,
          card_type: res.source === 'llm' ? 'ai:llm' : 'ai:local',
        });
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== message.id);
          const at = Math.min(idx, next.length);
          next.splice(at, 0, saved);
          return next;
        });
      } finally {
        setStream({ text: '', typing: false });
        setBusy('idle');
      }
    },
    [current, busy, messages, streamOut],
  );

  /**
   * 结束面试：生成评估报告 → 写 reports → 状态机 completed → evaluated
   * → 技能评分落库 skill_assessments → 自动生成 practice_plans。
   */
  const endInterview = useCallback(async () => {
    if (!current || busy !== 'idle') return null;
    setBusy('evaluating');
    try {
      const payload = messages
        .filter((m) => !String(m.id || '').startsWith('tmp-') && m.card_type !== 'report')
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await api.aiEvaluate({ messages: payload, session_id: current.id });

      let parsed;
      try {
        const jsonText = String(res.text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
        parsed = JSON.parse(jsonText);
      } catch {
        parsed = { overall: 0, logic: 0, depth: 0, expression: 0, summary: res.text, suggestions: [] };
      }
      const report = {
        overall: Number(parsed.overall) || 0,
        logic: Number(parsed.logic) || 0,
        depth: Number(parsed.depth) || 0,
        expression: Number(parsed.expression) || 0,
        summary: parsed.summary || '',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.join('\n') : String(parsed.suggestions || ''),
        source: res.source,
      };

      // 落库报告
      await api.create('reports', {
        session_id: current.id,
        overall: report.overall, logic: report.logic, depth: report.depth, expression: report.expression,
        summary: report.summary, suggestions: report.suggestions, source: report.source,
      });

      // 报告卡片进入对话流
      setBusy('idle');
      await streamOut('评估完成，下面是本次面试的能力报告：');
      await api.create('messages', {
        session_id: current.id, role: 'ai', content: JSON.stringify(report), card_type: 'report',
      });

      // 状态机：in_progress → completed → evaluated（非法流转会抛出，被下面 catch 兜住）
      let updated = current;
      try {
        updated = await api.transitionSession(current.id, 'completed');
        updated = await api.transitionSession(current.id, 'evaluated');
      } catch { /* 已是终态时忽略 */ }
      patchSession(current.id, { status: updated.status || 'evaluated', score: report.overall });

      // 评分写入 skill_assessments（驱动雷达与练习计划）
      try { await api.writeSkills(current.id); } catch { /* 评分写入失败不阻断报告展示 */ }

      // 自动生成 practice_plans
      try {
        const planRes = await api.aiPracticePlan({ session_id: current.id });
        report.plans = planRes.plans || [];
      } catch { report.plans = []; }

      setMessages(await fetchAllMessages(current.id));
      return report;
    } finally {
      setStream({ text: '', typing: false });
      setBusy('idle');
    }
  }, [current, busy, messages, streamOut, patchSession]);

  const updateSession = useCallback(
    async (id, patch) => {
      const updated = await api.update('sessions', id, patch);
      patchSession(id, updated);
      return updated;
    },
    [patchSession],
  );

  const deleteSession = useCallback(
    async (id) => {
      await api.remove('sessions', id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setSessionTotal((t) => Math.max(0, t - 1));
      if (current && current.id === id) {
        setCurrent(null);
        setMessages([]);
      }
    },
    [current],
  );

  const value = useMemo(
    () => ({
      user, positions,
      sessions, sessionsLoading, sessionsError, sessionTotal, sessionQuery,
      loadSessions, loadMoreSessions,
      current, messages, messagesLoading, messagesError,
      busy, stream, skipTyping,
      openSession, reloadMessages, createSession, sendAnswer, regenerate, endInterview,
      updateSession, deleteSession, setCurrent,
    }),
    [
      user, positions,
      sessions, sessionsLoading, sessionsError, sessionTotal, sessionQuery,
      loadSessions, loadMoreSessions,
      current, messages, messagesLoading, messagesError,
      busy, stream, skipTyping,
      openSession, reloadMessages, createSession, sendAnswer, regenerate, endInterview,
      updateSession, deleteSession,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat 必须在 ChatProvider 内使用');
  return ctx;
}
