// 店长概览：统计卡 + 订单趋势图（内联 SVG）+ 档口效率排行 + AI 异常识别。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { Button, Card, PageHeader, Tag } from '../components/ui/primitives.jsx';
import { CardSkeleton, ErrorState, InlineAlert, LoadingState } from '../components/ui/states.jsx';
import { formatMoney } from '../lib/constants.js';

// 内联 SVG 折线图：避免引入图表库，同时保持 Apple 克制的视觉。
function TrendChart({ data }) {
  if (!data?.length) return null;
  const w = 640; const h = 180; const pad = 28;
  const maxOrders = Math.max(...data.map((d) => d.orders), 1);
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: pad + i * stepX,
    y: h - pad - ((d.orders / maxOrders) * (h - pad * 2)),
    ...d,
  }));
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${points[points.length - 1].x},${h - pad} L${points[0].x},${h - pad} Z`;

  return (
    <div className="kf-scroll" style={{ overflowX: 'auto' }}>
      <svg width={w} height={h} role="img" aria-label="近 7 天订单趋势">
        <defs>
          <linearGradient id="kf-trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--orange)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--orange)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* 基线 */}
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--separator)" strokeWidth="1" />
        <path d={area} fill="url(#kf-trend)" />
        <path d={line} fill="none" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p) => (
          <g key={p.day}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="var(--bg-surface)" stroke="var(--orange)" strokeWidth="2" />
            <text x={p.x} y={h - pad + 16} textAnchor="middle"
              style={{ fontSize: 11, fill: 'var(--label-tertiary)' }}>
              {p.day.slice(5)}
            </text>
            <text x={p.x} y={p.y - 10} textAnchor="middle"
              style={{ fontSize: 11, fill: 'var(--label-secondary)', fontWeight: 600 }}>
              {p.orders}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function StatCard({ label, value, hint, accent }) {
  return (
    <Card>
      <p className="apple-footnote apple-secondary">{label}</p>
      <p className="apple-large-title mt-1" style={{ fontSize: 28, color: accent || 'var(--label)' }}>{value}</p>
      {hint && <p className="apple-caption apple-tertiary mt-1">{hint}</p>}
    </Card>
  );
}

export default function AdminPage() {
  const [state, setState] = useState({ loading: true, error: '' });
  const [data, setData] = useState(null);
  const [anomaly, setAnomaly] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setState({ loading: true, error: '' });
    try {
      const d = await api.overview();
      setData(d);
      setState({ loading: false, error: '' });
    } catch (e) {
      setState({ loading: false, error: e.message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runAnomaly() {
    setBusy(true);
    setNotice('');
    try {
      const r = await api.detectAnomaly();
      setAnomaly(r);
    } catch (e) { setNotice(e.message); } finally { setBusy(false); }
  }

  const stationRank = useMemo(() => {
    if (!data?.stations) return [];
    return [...data.stations].sort((a, b) => (a.avg_minutes ?? 999) - (b.avg_minutes ?? 999));
  }, [data]);

  return (
    <>
      <PageHeader
        title="店长概览"
        subtitle="经营统计、订单趋势与档口效率；AI 异常识别会实时检查超时订单"
        actions={
          <>
            <Button variant="secondary" size="sm" disabled={busy} onClick={runAnomaly}>
              <AlertTriangle size={14} /> {busy ? '检测中…' : 'AI 异常识别'}
            </Button>
            <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> 刷新</Button>
          </>
        }
      />

      {notice && <div className="mb-4"><InlineAlert kind="error">{notice}</InlineAlert></div>}

      {state.loading && <CardSkeleton count={4} />}
      {!state.loading && state.error && <ErrorState message={state.error} onRetry={load} />}

      {!state.loading && !state.error && data && (
        <>
          {/* 统计卡 */}
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            <StatCard label="今日订单" value={data.orders_today} hint={`累计 ${data.orders_total} 单`} accent="var(--tint)" />
            <StatCard label="今日营业额" value={formatMoney(data.revenue_today)} hint={`累计 ${formatMoney(data.revenue_total)}`} />
            <StatCard label="进行中订单" value={data.orders_active} hint={`待处理档口任务 ${data.tasks_pending}`} />
            <StatCard label="桌台占用" value={`${data.tables_occupied}/${data.tables}`} hint="含待清台未占用" />
            <StatCard label="菜品总数" value={data.menu_items} hint={`员工 ${data.users} 人`} />
            <StatCard label="今日排班" value={data.shifts_today} hint={`已取消 ${data.cancelled_total} 单`} />
          </div>

          {/* AI 异常结果 */}
          {anomaly && (
            <div className="mb-4">
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} style={{ color: anomaly.critical ? 'var(--red)' : 'var(--orange)' }} />
                    <p className="apple-headline">AI 异常识别</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag color="var(--red)" bg="rgba(255,59,48,0.12)">严重 {anomaly.critical}</Tag>
                    <Tag>共 {anomaly.total}</Tag>
                    <Tag color={anomaly.source === 'llm' ? 'var(--purple)' : 'var(--blue)'}
                      bg={anomaly.source === 'llm' ? 'rgba(175,82,222,0.12)' : 'rgba(0,122,255,0.12)'}>
                      {anomaly.source === 'llm' ? '大模型' : '本地规则'}
                    </Tag>
                  </div>
                </div>
                {anomaly.alerts.length === 0 ? (
                  <p className="apple-footnote apple-secondary">所有订单均在正常时效内。</p>
                ) : (
                  <ul className="space-y-2">
                    {anomaly.alerts.slice(0, 8).map((a, i) => (
                      <li key={i} className="flex items-start gap-2 apple-footnote">
                        <span style={{
                          width: 6, height: 6, borderRadius: 'var(--radius-full)', marginTop: 7,
                          background: a.level === 'critical' ? 'var(--red)' : 'var(--orange)',
                        }} />
                        <span className="apple-secondary">
                          {a.order_no !== '-' ? `${a.order_no}（桌 ${a.table_no}）：` : ''}{a.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}

          {/* 趋势 + 档口排行 */}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
            <Card>
              <div className="flex items-center justify-between mb-2">
                <p className="apple-headline">近 7 天订单趋势</p>
                <Tag><TrendingUp size={12} /> 共 {data.trend.reduce((s, d) => s + d.orders, 0)} 单</Tag>
              </div>
              <TrendChart data={data.trend} />
            </Card>

            <Card padded={false}>
              <div style={{ padding: '14px 16px' }}>
                <p className="apple-headline">档口效率排行</p>
                <p className="apple-caption apple-tertiary mt-0.5">按平均出品耗时升序</p>
              </div>
              {stationRank.length === 0 ? (
                <LoadingState rows={2} className="px-4 pb-4" />
              ) : (
                <div className="kf-scroll" style={{ overflowX: 'auto' }}>
                  <table className="kf-table">
                    <thead>
                      <tr><th>排名</th><th>档口</th><th>完成任务</th><th>平均耗时</th></tr>
                    </thead>
                    <tbody>
                      {stationRank.map((s, i) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600, color: i === 0 ? 'var(--tint)' : 'var(--label-secondary)' }}>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{s.name}</td>
                          <td>{s.done_count}</td>
                          <td className="apple-secondary">
                            {s.avg_minutes != null ? `${s.avg_minutes} 分钟` : '暂无数据'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
