import React, { useEffect, useRef, useState } from "react";
import {
  Card, Button, Text, Group, Stack, Title, SegmentedControl, Badge, Box,
  ThemeIcon, ActionIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconPlayerPlay, IconVolume, IconYoga, IconX,
} from "@tabler/icons-react";
import { api } from "../api/client";
import Reveal from "../components/Reveal";

const GUIDE = [
  "请找一个安静的地方，舒服地坐好。",
  "轻轻闭上眼睛，把注意力放到你的呼吸上。",
  "吸气…缓慢而平稳地吸气。",
  "呼气…让身体的紧张慢慢松开。",
  "想象暖光从头顶缓缓流过你的身体。",
  "如果念头飘走，没关系，温柔地把注意力带回呼吸。",
];

export default function Meditation({ onImmersive }) {
  const [minutes, setMinutes] = useState(5);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(0);
  const [saved, setSaved] = useState(0);
  const timerRef = useRef(null);
  const guideRef = useRef(null);
  const finishedRef = useRef(false);

  function cancelSpeech() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    cancelSpeech();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }

  // 进入 / 退出全屏沉浸态：同步隐藏底部导航与悬浮头像
  useEffect(() => {
    if (onImmersive) onImmersive(running);
  }, [running, onImmersive]);

  function start() {
    cancelSpeech();
    const total = minutes * 60;
    setLeft(total);
    setRunning(true);
    finishedRef.current = false;

    // 循环朗读引导语
    let gi = 0;
    speak(GUIDE[gi]);
    guideRef.current = setInterval(() => {
      gi = (gi + 1) % GUIDE.length;
      speak(GUIDE[gi]);
    }, 22000);

    timerRef.current = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          clearInterval(guideRef.current);
          setRunning(false);
          window.speechSynthesis.cancel();
          speak("本次冥想完成，愿你带着平静与接纳继续接下来的时光。");
          if (!finishedRef.current) {
            finishedRef.current = true;
            api.meditation({ duration: total }).then(() => {
              setSaved((s) => s + 1);
              notifications.show({ message: "已完成本次冥想，记录已保存", color: "mindcare", radius: "lg" });
            }).catch(() => {});
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function stop() {
    clearInterval(timerRef.current);
    clearInterval(guideRef.current);
    cancelSpeech();
    setRunning(false);
    setLeft(0);
  }

  // ESC 退出沉浸模式
  useEffect(() => {
    if (!running) return;
    const onKey = (e) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearInterval(guideRef.current);
    cancelSpeech();
  }, []);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const totalSec = minutes * 60;
  const guideIndex = Math.min(
    GUIDE.length - 1,
    Math.floor(((totalSec - left) / (totalSec || 1)) * GUIDE.length)
  );

  /* ---------- 沉浸态：全屏，只剩呼吸圆环 + 计时 ---------- */
  if (running) {
    return (
      <div className="mc-immersive">
        <ActionIcon
          className="mc-immersive-exit"
          variant="subtle"
          color="gray"
          size="lg"
          radius="xl"
          aria-label="退出冥想（ESC）"
          onClick={stop}
        >
          <IconX size={20} color="#d9d2ff" />
        </ActionIcon>

        <div className="mc-breath-ring">
          <div className="mc-breath-core">
            {/* 保留原有呼吸动画 */}
            <div className="breath is-immersive" />
          </div>
        </div>

        <Text className="mc-immersive-time">{mm}:{ss}</Text>

        <Text className="mc-immersive-hint">{GUIDE[guideIndex]}</Text>

        <Group gap={10}>
          <Badge
            variant="light"
            color="mindcare"
            radius="lg"
            size="lg"
            leftSection={<IconVolume size={13} />}
          >
            语音引导中
          </Badge>
          <Badge variant="light" color="gray" radius="lg" size="lg">
            按 ESC 退出
          </Badge>
        </Group>
      </div>
    );
  }

  /* ---------- 准备态：App 卡片流 ---------- */
  return (
    <div className="mc-flow">
      <Reveal depth={14}>
        <Box pt={6}>
          <Text className="mc-section-title">沉浸冥想</Text>
          <h1 className="page-title" style={{ marginTop: 6 }}>给自己几分钟</h1>
          <Text c="dimmed" size="sm" mt={8}>
            开始后进入全屏，只剩呼吸与计时。按 ESC 可随时退出。
          </Text>
        </Box>
      </Reveal>

      <Reveal delay={60} depth={32}>
        <Card radius="lg" padding="xl" className="mc-glass mc-card-hero">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Box>
              <Text className="mc-section-title">选择时长</Text>
              <Text size="sm" c="dimmed" mt={8} maw={320}>
                建议戴上耳机，语音会引导你完成整个过程。
              </Text>
            </Box>
            <ThemeIcon size={54} radius="xl" variant="light" color="blush">
              <IconYoga size={28} />
            </ThemeIcon>
          </Group>

          <SegmentedControl
            mt="lg"
            fullWidth
            radius="lg"
            color="mindcare"
            value={String(minutes)}
            onChange={(v) => setMinutes(+v)}
            data={[3, 5, 10].map((m) => ({ label: `${m} 分钟`, value: String(m) }))}
          />

          <Button
            mt="lg"
            size="lg"
            fullWidth
            radius="lg"
            color="mindcare"
            leftSection={<IconPlayerPlay size={18} />}
            onClick={start}
          >
            开始冥想
          </Button>
        </Card>
      </Reveal>

      {saved > 0 && (
        <Reveal delay={40} depth={22}>
          <Card radius="lg" padding="lg" className="mc-glass">
            <Group gap={8}>
              <IconYoga size={18} color="#FF2D55" />
              <Text fw={700}>已累计记录 {saved} 次冥想</Text>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>在首页可看到累计冥想时长。</Text>
          </Card>
        </Reveal>
      )}

      <Reveal delay={40} depth={20}>
        <Card radius="lg" padding="lg" className="mc-glass">
          <Text className="mc-section-title" mb="sm">引导语预览</Text>
          <Stack gap={8}>
            {GUIDE.map((g, i) => (
              <Group key={i} gap={10} wrap="nowrap" align="flex-start">
                <Badge size="sm" radius="lg" variant="light" color="mindcare" w={26}>
                  {i + 1}
                </Badge>
                <Text size="sm" c="dimmed" style={{ flex: 1 }}>{g}</Text>
              </Group>
            ))}
          </Stack>
        </Card>
      </Reveal>
    </div>
  );
}
