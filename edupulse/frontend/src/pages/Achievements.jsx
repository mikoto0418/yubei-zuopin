import { useEffect, useState } from "react";
import {
  Card, Button, Typography, Empty, Skeleton, Alert, Progress, Row, Col,
  Space, Segmented, Tag, message,
} from "antd";
import { ReloadOutlined, TrophyOutlined, LockOutlined } from "@ant-design/icons";
import { api } from "../api.js";

const { Title, Paragraph, Text } = Typography;

const CATEGORY_LABEL = {
  streak: "连续打卡", volume: "题量里程碑", accuracy: "正确率突破", duration: "学习时长",
};

/**
 * 成就墙：连续打卡 / 正确率突破 / 题量里程碑自动解锁
 */
export default function Achievements() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgApi, msgHolder] = message.useMessage();

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const d = await api.get("/achievements");
      setData(d);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function evaluate() {
    setBusy(true);
    try {
      const res = await api.post("/achievements/evaluate");
      if (res.unlocked?.length) {
        msgApi.success(`新解锁 ${res.unlocked.length} 个成就：${res.unlocked.map((a) => a.title).join("、")}`);
      } else {
        msgApi.info("暂时没有新成就，继续努力！");
      }
      load();
    } catch (e) { msgApi.error(e.message); }
    finally { setBusy(false); }
  }

  const items = (data?.items || []).filter((a) => !filter || a.category === filter);

  return (
    <div className="page">
      {msgHolder}
      <header className="page-header">
        <div>
          <Title level={3} className="page-title">成就墙</Title>
          <Paragraph className="page-sub">
            连续打卡、题量里程碑、正确率突破与学习时长会自动解锁徽章。
          </Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v)}
            options={[
              { label: "全部", value: "" },
              { label: "打卡", value: "streak" },
              { label: "题量", value: "volume" },
              { label: "正确率", value: "accuracy" },
              { label: "时长", value: "duration" },
            ]}
          />
          <Button icon={<ReloadOutlined />} loading={busy} onClick={evaluate}>重新评估</Button>
        </Space>
      </header>

      {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 16 }}
                     action={<Button size="small" onClick={load}>重试</Button>} />}

      {loading ? (
        <Row gutter={[16, 16]}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Col key={i} xs={12} md={8} lg={6}>
              <Card className="apple-card"><Skeleton active paragraph={{ rows: 3 }} /></Card>
            </Col>
          ))}
        </Row>
      ) : (
        <>
          {data && (
            <Row gutter={[16, 16]} className="stat-row">
              <Col xs={12} md={6}>
                <Card className="stat-card apple-card" variant="borderless">
                  <div className="ant-statistic-title">已解锁</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: "var(--green)" }}>
                    {data.unlocked_count}<span style={{ fontSize: 15, color: "var(--label-secondary)", fontWeight: 400 }}> / {data.total_count}</span>
                  </div>
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card className="stat-card apple-card" variant="borderless">
                  <div className="ant-statistic-title">连续打卡</div>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>{data.metrics?.streak ?? 0} <span style={{ fontSize: 15, fontWeight: 400, color: "var(--label-secondary)" }}>天</span></div>
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card className="stat-card apple-card" variant="borderless">
                  <div className="ant-statistic-title">累计答题</div>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>{data.metrics?.quiz_total ?? 0}</div>
                </Card>
              </Col>
              <Col xs={12} md={6}>
                <Card className="stat-card apple-card" variant="borderless">
                  <div className="ant-statistic-title">累计时长</div>
                  <div style={{ fontSize: 26, fontWeight: 700 }}>{data.metrics?.duration ?? 0} <span style={{ fontSize: 15, fontWeight: 400, color: "var(--label-secondary)" }}>分钟</span></div>
                </Card>
              </Col>
            </Row>
          )}

          {data?.latest?.length > 0 && (
            <Card className="apple-card" title="最近解锁" style={{ marginBottom: 16 }}>
              <Space wrap>
                {data.latest.map((a) => (
                  <Tag key={a.id} color="success" style={{ padding: "4px 12px", fontSize: 14 }}>
                    {a.icon} {a.title}
                  </Tag>
                ))}
              </Space>
            </Card>
          )}

          {!items.length ? (
            <Card className="apple-card">
              <Empty description="该类别下暂无成就。" />
            </Card>
          ) : (
            <div className="achv-grid">
              {items.map((a) => (
                <div className={"achv-cell" + (a.unlocked ? "" : " is-locked")} key={a.id}>
                  <div className="achv-icon">
                    {a.unlocked ? a.icon : <LockOutlined style={{ fontSize: 32, color: "var(--label-tertiary)" }} />}
                  </div>
                  <div className="achv-title">{a.title}</div>
                  <div className="achv-desc">{a.description}</div>
                  {!a.unlocked && (
                    <Progress
                      percent={a.percent}
                      showInfo={false}
                      strokeColor="var(--tint)"
                      trailColor="rgba(120,120,128,0.14)"
                      size="small"
                    />
                  )}
                  <Text type="secondary" style={{ fontSize: 12, marginTop: 6 }}>
                    {a.unlocked
                      ? `已解锁 · ${a.unlocked_at?.slice(0, 10) || ""}`
                      : `${a.progress} / ${a.threshold}`}
                  </Text>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
