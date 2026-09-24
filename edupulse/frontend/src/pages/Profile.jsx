import { useEffect, useState } from "react";
import { Card, Row, Col, Statistic, Progress, Avatar, Typography, Descriptions, Empty, Tag, Space } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function Profile() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [recs, setRecs] = useState([]);
  const [mastery, setMastery] = useState([]);

  useEffect(() => {
    api.get("/sessions/summary").then(setSummary).catch(() => setSummary(null));
    api.get("/quizzes/records").then(setRecs).catch(() => setRecs([]));
  }, []);

  useEffect(() => {
    const byTag = {};
    recs.forEach((r) => {
      const t = r.tag || "未分类";
      byTag[t] = byTag[t] || { total: 0, correct: 0 };
      byTag[t].total++;
      if (r.is_correct) byTag[t].correct++;
    });
    const arr = Object.entries(byTag).map(([tag, v]) => ({
      tag, accuracy: Math.round((v.correct / v.total) * 100),
    }));
    arr.sort((a, b) => a.accuracy - b.accuracy);
    setMastery(arr);
  }, [recs]);

  const total = recs.length;
  const correct = recs.filter((r) => r.is_correct).length;
  const acc = total ? Math.round((correct / total) * 100) : 0;

  function masteryColor(v) {
    return v >= 70 ? "var(--green)" : v >= 40 ? "var(--orange)" : "var(--red)";
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">个人中心</Typography.Title>
          <Typography.Paragraph className="page-sub">你的学习画像与掌握度概览。</Typography.Paragraph>
        </div>
      </header>

      <Card className="apple-card profile-card">
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={8}>
            <Space align="center" size={18}>
              <Avatar
                size={76}
                icon={<UserOutlined />}
                style={{
                  fontSize: 32,
                  background: "linear-gradient(135deg, var(--tint), var(--tint))",
                  boxShadow: "0 0 26px rgba(34,211,238,0.5)",
                }}
              >
                {user?.nickname?.[0] || user?.username?.[0]}
              </Avatar>
              <div className="profile-info">
                <div className="pi-name">{user?.nickname}</div>
                <Tag color={user?.role === "admin" ? "magenta" : "cyan"}>
                  {user?.role === "admin" ? "管理员" : "学员"}
                </Tag>
              </div>
            </Space>
          </Col>
          <Col xs={24} md={16}>
            <Descriptions
              column={{ xs: 1, sm: 2 }}
              size="small"
              items={[
                { key: "u", label: "用户名", children: user?.username },
                { key: "c", label: "加入时间", children: user?.created_at?.slice(0, 10) || "—" },
              ]}
            />
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
          <Col xs={12} md={6}><Statistic title="分钟总时长" value={summary?.total_duration ?? 0} styles={{ content: { color: "var(--tint)" } }} /></Col>
          <Col xs={12} md={6}><Statistic title="天坚持学习" value={summary?.days ?? 0} styles={{ content: { color: "var(--tint)" } }} /></Col>
          <Col xs={12} md={6}><Statistic title="累计答题" value={total} styles={{ content: { color: "var(--red)" } }} /></Col>
          <Col xs={12} md={6}><Statistic title="总体正确率" value={acc} suffix="%" styles={{ content: { color: "var(--green)" } }} /></Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]} className="home-grid">
        <Col xs={24} lg={12}>
          <Card className="apple-card" title="各科学习时长">
            {summary?.subject_duration?.length ? (
              <ul className="subject-bars">
                {summary.subject_duration.map((s) => (
                  <li key={s.subject}>
                    <span className="bar-label">{s.subject}</span>
                    <Progress
                      percent={Math.min(100, Math.round((s.minutes / 200) * 100))}
                      showInfo={false}
                      strokeColor={{ from: "var(--tint)", to: "var(--tint)" }}
                      trailColor="rgba(139,92,246,0.14)"
                      size="small"
                    />
                    <span className="bar-val">{s.minutes} 分钟</span>
                  </li>
                ))}
              </ul>
            ) : <Empty description="暂无学习时长数据。" />}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card className="apple-card" title="知识点掌握度（按正确率排序）">
            {mastery.length ? (
              <ul className="mastery-list">
                {mastery.map((m) => (
                  <li key={m.tag}>
                    <span className="m-tag">{m.tag}</span>
                    <Progress
                      percent={m.accuracy}
                      showInfo={false}
                      strokeColor={masteryColor(m.accuracy)}
                      trailColor="rgba(139,92,246,0.14)"
                      size="small"
                    />
                    <span className="m-val">{m.accuracy}%</span>
                  </li>
                ))}
              </ul>
            ) : <Empty description="答几道题后就能看到你的掌握度。" />}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
