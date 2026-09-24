import React, { useEffect, useRef, useState } from "react";

/**
 * 滚动视差淡入容器。
 * 元素进入视口时淡入 + 上移归位，不同 depth 给不同位移幅度，形成层次错落的视差感。
 */
export default function Reveal({ children, delay = 0, depth = 26, className = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={"mc-reveal" + (shown ? " is-in" : "") + (className ? " " + className : "")}
      style={{
        transitionDelay: delay ? `${delay}ms` : undefined,
        "--rv-y": `${depth}px`,
      }}
    >
      {children}
    </div>
  );
}
