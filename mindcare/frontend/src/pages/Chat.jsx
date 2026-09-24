import React, { useEffect, useRef, useState } from "react";
import {
  Card, TextInput, Button, Text, Group, Stack, Title, Badge, Center, ThemeIcon, Box,
  ActionIcon, Loader, ScrollArea,
} from "@mantine/core";
import { IconSend, IconVolume, IconMessageChatbot, IconSparkles } from "@tabler/icons-react";
import { api } from "../api/client";
import Markdown from "../components/Markdown";

const QUICK = ["最近有点焦虑，不知道怎么排解", "我好像总睡不好", "今天很累，没什么力气", "我想把一件纠结的事说出来"];

export default function Chat() {
  const [history, setHistory] = useState([]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    api.chatHistory().then((d) => setHistory(d.history)).catch(() => {});
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [history, thinking]);

  async function send(msg) {
    const m = (msg || text).trim();
    if (!m || thinking) return;
    setText("");
    setThinking(true);
    setHistory((h) => [...h, { role: "user", content: m }]);
    try {
      const d = await api.chat(m);
      setHistory((h) => [...h, { role: "ai", content: d.reply }]);
    } catch (ex) {
      const msg = /^[（(离线本地模式[)）]/.test(ex.message)
        ? ex.message
        : "⚠️ " + (ex.message || "云端服务不可用") + "\n\n（本次未发送成功，请稍后重试）";
      setHistory((h) => [...h, { role: "ai", content: msg }]);
    }
    setThinking(false);
  }

  function speakAi(content) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(content.replace(/[【\[]离线本地模式[】\]]|[（(]本地陪伴[)）]/, ""));
    u.lang = "zh-CN";
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }

  return (
    <div className="mc-chat">
      <Group gap={8} mb={10} wrap="nowrap">
        <ThemeIcon size={34} radius="xl" variant="light" color="mindcare">
          <IconMessageChatbot size={18} />
        </ThemeIcon>
        <Box>
          <Text fw={700} size="sm">AI 陪护</Text>
          <Text size="xs" c="dimmed">倾诉不设限，我会一直认真听</Text>
        </Box>
      </Group>

      <Group gap={8} mb="sm" wrap="wrap">
        <IconSparkles size={15} color="#FF2D55" />
        {QUICK.map((q) => (
          <Badge
            key={q}
            variant="light"
            color="mindcare"
            radius="lg"
            size="lg"
            style={{ cursor: "pointer", textTransform: "none" }}
            onClick={() => send(q)}
          >
            {q}
          </Badge>
        ))}
      </Group>

      <Card radius="lg" padding="md" className="mc-glass mc-chat-body">
        <ScrollArea h="100%" viewportRef={bodyRef} type="auto" offsetScrollbars>
          <Stack gap="md" pr="sm">
            {history.length === 0 && (
              <Center py="xl">
                <Stack align="center" gap={6}>
                  <ThemeIcon size={54} radius="xl" variant="light" color="mindcare">
                    <IconMessageChatbot size={28} />
                  </ThemeIcon>
                  <Text c="dimmed" size="sm">开始聊聊你的心情吧</Text>
                </Stack>
              </Center>
            )}

            {history.map((h, i) => {
              const isUser = h.role === "user";
              return (
                <Group key={i} justify={isUser ? "flex-end" : "flex-start"} wrap="nowrap" align="flex-start">
                  {!isUser && (
                    <ThemeIcon size={30} radius="xl" variant="light" color="mindcare">
                      <IconMessageChatbot size={17} />
                    </ThemeIcon>
                  )}
                  <Box
                    className={"mc-bubble " + (isUser ? "user" : "ai")}
                    style={{ maxWidth: "78%" }}
                  >
                    {!isUser && "speechSynthesis" in window && (
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray"
                        mb={4}
                        onClick={() => speakAi(h.content)}
                        aria-label="朗读"
                      >
                        <IconVolume size={13} />
                      </ActionIcon>
                    )}
                    {isUser ? (
                      <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{h.content}</Text>
                    ) : (
                      <Markdown text={h.content} />
                    )}
                  </Box>
                </Group>
              );
            })}

            {thinking && (
              <Group gap={8}>
                <Loader size="xs" color="mindcare" />
                <Text size="sm" c="dimmed">正在思考…</Text>
              </Group>
            )}
          </Stack>
        </ScrollArea>
      </Card>

      {/* 输入条：贴底悬浮，让出底部导航的位置 */}
      <Group gap="sm" mt="sm" wrap="nowrap" className="mc-chat-composer">
        <TextInput
          flex={1}
          radius="lg"
          size="md"
          placeholder="输入你想说的…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={thinking}
        />
        <Button
          radius="lg"
          size="md"
          color="mindcare"
          leftSection={<IconSend size={16} />}
          onClick={() => send()}
          disabled={thinking}
        >
          发送
        </Button>
      </Group>
    </div>
  );
}
