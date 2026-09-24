import { useEffect, useRef } from "react";
import * as echarts from "echarts";

/**
 * 通用 ECharts 封装：Apple 系统色系，无辉光，自动释放实例
 */
export default function EChart({ option, height = 260 }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, null, { renderer: "canvas" });
    chartRef.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.setOption(option, true);
    }
  }, [option]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}

/** Apple 系统色（与 apple-tokens.css 一致） */
export const APPLE_COLORS = {
  blue: "#007AFF", green: "#34C759", red: "#FF3B30",
  orange: "#FF9500", purple: "#AF52DE", pink: "#FF2D55",
  teal: "#5AC8FA", yellow: "#FFCC00", indigo: "#5856D6",
  gray: "#8E8E93",
};

export const PALETTE = [
  APPLE_COLORS.blue, APPLE_COLORS.green, APPLE_COLORS.orange,
  APPLE_COLORS.purple, APPLE_COLORS.pink, APPLE_COLORS.teal,
  APPLE_COLORS.indigo, APPLE_COLORS.yellow,
];

/** 浅色基底下的通用坐标轴/文字样式 */
export function baseText() {
  return { color: "rgba(60, 60, 67, 0.60)", fontSize: 12 };
}

export function baseAxis() {
  return {
    axisLabel: { color: "rgba(60, 60, 67, 0.60)", fontSize: 11 },
    axisLine: { lineStyle: { color: "rgba(60, 60, 67, 0.16)" } },
    splitLine: { lineStyle: { color: "rgba(60, 60, 67, 0.08)" } },
  };
}

export function baseTooltip() {
  return {
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(60, 60, 67, 0.16)",
    borderWidth: 1,
    textStyle: { color: "rgba(0, 0, 0, 0.92)", fontSize: 12 },
    extraCssText: "box-shadow: 0 4px 16px rgba(0,0,0,0.08); border-radius: 10px;",
  };
}

/** 掌握度分档色（与语义一致：绿=好，橙=中，红=弱） */
export function masteryColor(v) {
  if (v >= 85) return APPLE_COLORS.green;
  if (v >= 70) return APPLE_COLORS.teal;
  if (v >= 50) return APPLE_COLORS.orange;
  return APPLE_COLORS.red;
}
