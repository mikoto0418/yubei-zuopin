import { Typography } from "antd";
import TeacherPanel from "../components/TeacherPanel.jsx";

/**
 * /teacher 路由仍然可达（路由 path 未变）。
 * 形态上不再是独立的一整页左右分栏，而是与右下角悬浮舱同一套对话内核：
 * 悬浮舱点击展开的全屏对话 = 这里的 full 变体。
 */
export default function Teacher() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">AI 数字教师</Typography.Title>
          <Typography.Paragraph className="page-sub">
            语音 / 文字提问，数字人形象答疑并朗读答案。右下角悬浮舱随时可唤起同一对话。
          </Typography.Paragraph>
        </div>
      </header>

      <div className="teacher-stage-page">
        <TeacherPanel variant="full" />
      </div>
    </div>
  );
}
