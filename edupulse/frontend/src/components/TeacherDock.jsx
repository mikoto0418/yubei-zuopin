import { useEffect, useState } from "react";
import { Tooltip } from "antd";
import { ExpandOutlined, CloseOutlined, CustomerServiceOutlined } from "@ant-design/icons";
import DigitalTeacher from "./DigitalTeacher.jsx";
import TeacherPanel from "./TeacherPanel.jsx";

/**
 * 常驻右下角的数字人教师悬浮舱
 * - 收起：右下角浮动头像（Canvas 小P 持续呼吸/眨眼，鼠标可逗它）
 * - 展开：全屏对话（复用 TeacherPanel 的 full 变体）
 * - 路由 /teacher 仍然可达，页面内使用同一 TeacherPanel
 *
 * 内层 DigitalTeacher（Canvas 动画逻辑）一行未改，只改外层容器与定位。
 */
export default function TeacherDock() {
  const [open, setOpen] = useState(false);

  // 展开时锁滚动 + 支持 ESC 收起
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {!open && (
        <div className="teacher-dock">
          <Tooltip title="点我展开全屏对话" placement="left">
            <button
              type="button"
              className="dock-orb"
              onClick={() => setOpen(true)}
              aria-label="展开 AI 数字教师对话"
            >
              <DigitalTeacher state="idle" size={92} />
              <span className="dock-badge">
                <CustomerServiceOutlined />
              </span>
              <span className="dock-hint">问小P</span>
            </button>
          </Tooltip>
        </div>
      )}

      {open && (
        <div className="teacher-overlay" role="dialog" aria-modal="true" aria-label="AI 数字教师全屏对话">
          <div className="teacher-overlay-head">
            <span className="to-title">AI 数字教师 · 全屏对话</span>
            <button type="button" className="to-close" onClick={() => setOpen(false)}>
              <CloseOutlined /> 收起
            </button>
          </div>
          <TeacherPanel variant="full" />
          <div className="teacher-overlay-foot">
            <ExpandOutlined /> 按 ESC 或右上角「收起」返回驾驶舱
          </div>
        </div>
      )}
    </>
  );
}
