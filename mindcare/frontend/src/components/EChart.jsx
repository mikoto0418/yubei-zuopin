import { useEffect, useRef } from "react";
import * as echarts from "echarts";

let idSeed = 0;

export default function EChart({ option, height = 280, className = "" }) {
  const ref = useRef(null);
  const idRef = useRef(`chart-${idSeed++}`);

  useEffect(() => {
    const chart = echarts.init(ref.current);
    chart.setOption(option);
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, [JSON.stringify(option)]);

  return <div ref={ref} id={idRef.current} className={"chart-box " + className} style={{ height }} />;
}