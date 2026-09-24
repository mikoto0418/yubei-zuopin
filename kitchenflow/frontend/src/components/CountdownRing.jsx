// 订单倒计时进度环（SVG）：剩余时间越少环越短，超时转为红色。
// 这是 KitchenFlow 的差异化视觉，除超时脉冲外不做任何循环动画。
import { useEffect, useState } from 'react';
import { countdownRatio } from '../lib/constants.js';

export default function CountdownRing({ createdAt, prepMinutes = 15, size = 44 }) {
  const [, force] = useState(0);

  // 每 15 秒重算一次剩余比例，保证环会走动。
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const { ratio, remainMin, overtime } = countdownRatio(createdAt, prepMinutes);
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = overtime ? 'var(--red)' : ratio > 0.5 ? 'var(--green)' : ratio > 0.25 ? 'var(--orange)' : 'var(--red)';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} title={overtime ? '已超时' : `剩余约 ${remainMin} 分钟`}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-primary)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset var(--dur-slow) linear, stroke var(--dur-base)' }}
        />
      </svg>
      <span className="apple-caption absolute" style={{ color, fontWeight: 600, letterSpacing: '-0.02em' }}>
        {overtime ? '超时' : `${remainMin}′`}
      </span>
    </div>
  );
}
