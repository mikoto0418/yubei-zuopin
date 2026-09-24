import { useEffect, useRef, useState } from "react";
import { Input, Button, Tag, Avatar, Typography, message } from "antd";
import {
  AudioOutlined,
  SendOutlined,
  StopOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { api } from "../api.js";
import DigitalTeacher from "./DigitalTeacher.jsx";
import Markdown from "./Markdown.jsx";

const TYPING_SPEED = 18; // 打字机速度 ms/字

/**
 * AI 数字教师对话面板（可复用）
 * - variant="dock"  右下角悬浮舱（紧凑）
 * - variant="full"  整页 / 全屏模式
 * 对话、语音朗读、语音识别、AI 调用逻辑与改造前完全一致。
 * 内层 DigitalTeacher（Canvas 动画）未做任何改动，仅外部容器与定位不同。
 */
export default function TeacherPanel({ variant = "dock", active = true }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [robotState, setRobotState] = useState("idle");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [engine, setEngine] = useState("mock");
  const msgsEndRef = useRef(null);
  const typingTimer = useRef(null);
  const [msgApi, msgHolder] = message.useMessage();

  const full = variant === "full";

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  useEffect(() => {
    api.get("/ai/status").then((r) => setEngine(r.engine)).catch(() => {});
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function typeReply(fullText) {
    return new Promise((resolve) => {
      let i = 0;
      setMessages((prev) => [...prev, { role: "ai", text: "" }]);
      function tick() {
        i += 2;
        const piece = fullText.slice(0, i);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "ai", text: piece };
          return next;
        });
        if (i < fullText.length) {
          typingTimer.current = setTimeout(tick, TYPING_SPEED);
        } else {
          setRobotState("idle");
          resolve();
        }
      }
      tick();
      // 开启说话状态：数字人张闭嘴
      if ("speechSynthesis" in window) setRobotState("speaking");
    });
  }

  async function ask(question) {
    const text = question?.trim();
    if (!text || thinking) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setThinking(true);
    setRobotState("thinking");
    try {
      const res = await api.post("/ai/chat", { message: text });
      // 打字机输出 + 朗读
      speak(res.reply);
      await typeReply(res.reply);
    } catch (e) {
      const fallback = "抱歉，我这边暂时处理不了，请稍后再试。";
      speak(fallback);
      await typeReply(fallback);
    } finally {
      setThinking(false);
    }
  }

  // 中文语音朗读（音频输出）
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 1;
      u.pitch = 1;
      u.onstart = () => setSpeaking(true);
      u.onend = () => { setSpeaking(false); if (!thinking) setRobotState("idle"); };
      u.onerror = () => { setSpeaking(false); setRobotState("idle"); };
      window.speechSynthesis.speak(u);
    } catch (_) { /* ignore */ }
  }

  function stopSpeak() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    setRobotState("idle");
  }

  // Web Speech API 语音输入
  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { msgApi.warning("当前浏览器不支持语音识别，请使用文字输入。"); return; }
    const rec = new SR();
    rec.lang = "zh-CN";
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      ask(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.start();
  }

  const stateText = listening ? "🎙 正在聆听…"
    : speaking ? "📢 正在朗读…"
    : thinking ? "🤔 小P思考中…" : "💬 提问试试";

  return (
    <div className={"teacher-panel" + (full ? " is-full" : " is-dock")}>
      {msgHolder}

      <div className="teacher-stage">
        <DigitalTeacher
          state={speaking || robotState === "speaking" ? "speaking" : robotState}
          size={full ? 260 : 92}
        />
        {full && <div className="state-badge">{stateText}</div>}
      </div>

      <div className="teacher-console">
        <div className="teacher-console-head">
          <div className="tc-title">
            <RobotOutlined /> 数字教师 · 小P
          </div>
          <Tag color={engine === "llm" ? "purple" : "cyan"} className="tc-engine">
            {engine === "llm" ? "智能大模型 LLM" : "本地智能回答"}
          </Tag>
        </div>

        <div className="chat-window">
          {!messages.length && (
            <div className="chat-placeholder">
              <p>你好！我是虚拟教师<b>小P</b>，专注解答学习问题。</p>
              <p>可以问我：</p>
              <div className="suggestion-chips">
                {["数学函数怎么学？", "英语怎样高效背单词？", "物理受力分析技巧？", "学习总想放弃怎么办？"].map((s) => (
                  <Tag key={s} className="sugg" onClick={() => ask(s)}>{s}</Tag>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={"msg " + m.role}>
              {m.role === "ai" && (
                <Avatar size={30} className="msg-avatar" icon={<RobotOutlined />} />
              )}
              {m.role === "ai"
                ? <div className="bubble"><Markdown>{m.text}</Markdown></div>
                : <div className="bubble">{m.text}</div>}
            </div>
          ))}
          <div ref={msgsEndRef} />
        </div>

        <div className="chat-input">
          <Button
            className={"mic-btn" + (listening ? " live" : "")}
            icon={<AudioOutlined />}
            onClick={startVoice}
            title="语音输入"
          />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="输入你的学习问题，回车发送…"
            disabled={thinking}
            size={full ? "large" : "middle"}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => ask()}
            disabled={thinking || !input.trim()}
            loading={thinking}
          >
            发送
          </Button>
          <Button icon={<StopOutlined />} onClick={stopSpeak} disabled={!speaking}>
            停止朗读
          </Button>
        </div>
      </div>
    </div>
  );
}
