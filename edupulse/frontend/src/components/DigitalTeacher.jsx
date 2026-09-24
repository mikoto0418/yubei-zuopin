import { useEffect, useRef } from "react";

/**
 * AI 数字人虚拟教师形象
 * Canvas 手绘拟人化机器人头像：
 *  - 瞳孔跟随鼠标
 *  - 周期性眨眼
 *  - 说话时嘴部张合动画
 *  - 思考时头顶信号扩散 + 光标旋转
 * props.state: "idle" | "thinking" | "speaking" | "happy"
 */
export default function DigitalTeacher({ state = "idle", size = 320 }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let raf = null;
    let t = 0;
    let blinkElapsed = 0;    // 自上次变化以来的时间
    let blinkPhase = 1;      // 1=睁眼 0=闭眼
    let blinkCooldown = 2200;// 睁眼保持时长
    let mouseX = 0, mouseY = 0;
    let mouth = 0;           // mouth openness 0..1
    const cx = size / 2, cy = size / 2, R = size * 0.38;

    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left - cx) / R;
      mouseY = (e.clientY - rect.top - cy) / R;
    }
    canvas.addEventListener("mousemove", onMove);

    function drawFace() {
      // ---- 头 ----
      ctx.clearRect(0, 0, size, size);
      const headGrad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      headGrad.addColorStop(0, "#EAF4FF");
      headGrad.addColorStop(0.55, "#DCEBFA");
      headGrad.addColorStop(1, "#C9DFF5");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = headGrad;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#5AC8FA";
      ctx.shadowColor = "#5AC8FA";
      ctx.shadowBlur = 0;
      ctx.stroke();

      // 彩虹霓虹描边光环
      ctx.beginPath();
      ctx.arc(cx, cy, R + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(90,200,250,0.40)";
      ctx.shadowColor = "#5AC8FA";
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 顶部小天线 + 闪光点
      ctx.strokeStyle = "#007AFF";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - R + 4);
      ctx.lineTo(cx, cy - R - 14);
      ctx.stroke();
      const dotY = cy - R - 14 + Math.sin(t / 450) * 3;
      ctx.beginPath();
      ctx.arc(cx, dotY, 5, 0, Math.PI * 2);
      ctx.fillStyle = Math.floor(t / 300) % 2 ? "#007AFF" : "#5AC8FA";
      ctx.shadowColor = "#5AC8FA";
      ctx.shadowBlur = 0;
      ctx.fill();
      ctx.shadowBlur = 0;

      // 双"颊"发光
      ctx.beginPath(); ctx.arc(cx - R * 0.62, cy + R * 0.28, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,149,0,0.18)"; ctx.fill();
      ctx.beginPath(); ctx.arc(cx + R * 0.62, cy + R * 0.28, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(90,200,250,0.18)"; ctx.fill();

      // ---- 眼睛（瞳孔跟踪 + 眨眼）----
      const eyeY = cy - R * 0.15;
      const eyeDX = R * 0.32;
      const eyeW = R * 0.30, eyeH = R * 0.26 * (blinkPhase);
      const open = blinkPhase > 0.05;
      const trackedX = mouseX * 5, trackedY = open ? mouseY * 4 : 0;

      for (const sx of [-1, 1]) {
        const ex = cx + sx * eyeDX;
        // 眼白
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, eyeW, Math.max(eyeH, open ? eyeW * 0.62 : 2), 0, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        // 发光瞳孔
        ctx.beginPath();
        ctx.arc(ex + trackedX, eyeY + trackedY, eyeW * 0.48, 0, Math.PI * 2);
        const pg = ctx.createRadialGradient(ex + trackedX, eyeY + trackedY, 1, ex + trackedX, eyeY + trackedY, eyeW * 0.5);
        pg.addColorStop(0, "#007AFF");
        pg.addColorStop(0.5, "#5AC8FA");
        pg.addColorStop(1, "#0055B3");
        ctx.fillStyle = pg;
        ctx.shadowColor = "#5AC8FA";
        ctx.shadowBlur = 0;
        ctx.fill();
        ctx.shadowBlur = 0;
        // 高光
        ctx.beginPath();
        ctx.arc(ex + trackedX - eyeW * 0.15, eyeY + trackedY - eyeW * 0.18, eyeW * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }

      // ---- 眉毛（情绪）----
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#007AFF";
      for (const sx of [-1, 1]) {
        const bx = cx + sx * eyeDX;
        const by = cy - R * 0.38;
        ctx.beginPath();
        if (stateRef.current === "thinking") {
          ctx.moveTo(bx - eyeW * 0.7, by - 3);
          ctx.lineTo(bx + eyeW * 0.7, by + 6);
        } else if (stateRef.current === "happy") {
          ctx.moveTo(bx - eyeW * 0.7, by + 4);
          ctx.lineTo(bx + eyeW * 0.7, by - 5);
        } else if (stateRef.current === "speaking") {
          ctx.moveTo(bx - eyeW * 0.7, by);
          ctx.lineTo(bx + eyeW * 0.7, by);
        } else {
          ctx.moveTo(bx - eyeW * 0.7, by);
          ctx.lineTo(bx + eyeW * 0.7, by + 2);
        }
        ctx.stroke();
      }

      // ---- 嘴 ----
      const isSpeaking = stateRef.current === "speaking";
      if (isSpeaking) {
        // 张合的嘴
        ctx.beginPath();
        ctx.ellipse(cx, cy + R * 0.42, R * 0.22, R * 0.18 * (0.3 + 0.7 * mouth), 0, 0, Math.PI * 2);
        ctx.fillStyle = "#F2F2F7";
        ctx.fill();
        ctx.strokeStyle = "#007AFF";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // 微笑弧线
        ctx.beginPath();
        ctx.arc(cx, cy + R * 0.32, R * 0.22, 0.12 * Math.PI, 0.88 * Math.PI);
        ctx.strokeStyle = stateRef.current === "happy" ? "#007AFF" : "#5AC8FA";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      // _best-effort to keep no-shadow leaks
      ctx.shadowBlur = 0;
    }

    function drawEffects() {
      // 思考态：头顶信号扩散 + 旋转光标环
      if (stateRef.current === "thinking") {
        for (let i = 0; i < 3; i++) {
          const prog = ((t / 900 + i / 3) % 1);
          ctx.beginPath();
          ctx.arc(cx, cy - R - 26, 6 + prog * 30, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(52,211,153,${0.6 * (1 - prog)})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t / 500);
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.12, 0, Math.PI * 1.5);
        ctx.strokeStyle = "rgba(90,200,250,0.55)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.restore();
      }
      // 呼吸圈
      const breathe = 1 + Math.sin(t / 800) * 0.02;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.05 * breathe, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(90,200,250,0.22)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    function frame(now) {
      t = now;
      // 眨眼：睁眼保持 blinkCooldown 后快速闭-睁各一拍实现"眨"
      blinkElapsed += 16;
      if (blinkPhase === 1 && blinkElapsed >= blinkCooldown) {
        blinkPhase = 0;
        blinkElapsed = 0;
      } else if (blinkPhase === 0 && blinkElapsed >= 120) {
        blinkPhase = 1;
        blinkElapsed = 0;
        blinkCooldown = 1500 + Math.random() * 2500;
      }
      // 嘴部动画（说话时随机张闭）
      mouth = stateRef.current === "speaking"
        ? 0.3 + 0.7 * Math.abs(Math.sin(now / 180)) * (0.4 + Math.random() * 0.6)
        : 0;

      drawFace();
      drawEffects();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove", onMove);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className="digital-teacher"
      style={{ width: size, height: size }}
      aria-label="AI 数字人教师形象"
    />
  );
}