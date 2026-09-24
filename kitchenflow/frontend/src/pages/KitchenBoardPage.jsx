// 后厨看板（核心页）：按档口分列，订单卡带倒计时进度环，超时卡片橙色描边脉冲。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, TriangleAlert, Zap } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import CountdownRing from '../components/CountdownRing.jsx';
import { Button, PageHeader, Tag } from '../components/ui/primitives.jsx';
import { CardSkeleton, EmptyState, ErrorState, InlineAlert } from '../components/ui/states.jsx';
import { STATION_COLORS, countdownRatio, formatTime } from '../lib/constants.js';

export default function KitchenBoardPage() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');
  const [auto, setAuto] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.board();
      setState({ loading: false, error: '', data });
    } catch (e) {
      setState({ loading: false, error: e.message, data: null });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 自动刷新：后厨看板需要持续反映新订单，但仅在开启时轮询。
  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [auto, load]);

  // 推进档口任务：待制作 → 制作中 → 已完成（完成全部后订单自动出餐）。
  async function advance(task) {
    const next = task.status === 'pending' ? 'cooking' : 'done';
    setBusyId(task.id);
    setNotice('');
    try {
      const r = await api.updateTask(task.id, next);
      if (r?.autoReady) setNotice(`订单已完成全部档口制作，自动出餐。`);
      await load();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusyId(null);
    }
  }

  // 汇总：总任务数 / 超时任务数，用于顶部压力提示。
  const summary = useMemo(() => {
    const cols = state.data?.columns || [];
    let total = 0; let overtime = 0;
    for (const c of cols) {
      for (const t of c.tasks) {
        total += 1;
        if (countdownRatio(t.order_created_at, t.prep_minutes || 15).overtime) overtime += 1;
      }
    }
    return { total, overtime };
  }, [state.data]);

  return (
    <>
      <PageHeader
        title="后厨看板"
        subtitle="按档口分列，点击卡片推进制作状态；整单档口全部完成会自动出餐"
        actions={
          <>
            <Tag color={summary.overtime ? 'var(--red)' : 'var(--label-secondary)'}
              bg={summary.overtime ? 'rgba(255,59,48,0.12)' : 'var(--fill-secondary)'}>
              进行中 {summary.total}
            </Tag>
            {summary.overtime > 0 && (
              <Tag color="var(--orange)" bg="rgba(255,149,0,0.14)">
                <TriangleAlert size={13} /> 超时 {summary.overtime}
              </Tag>
            )}
            <Button variant="secondary" size="sm" onClick={() => setAuto((v) => !v)}>
              <Zap size={14} /> {auto ? '自动刷新中' : '已暂停刷新'}
            </Button>
            <Button variant="secondary" size="sm" onClick={load}>
              <RefreshCw size={14} /> 刷新
            </Button>
          </>
        }
      />

      {notice && <div className="mb-4"><InlineAlert kind="info">{notice}</InlineAlert></div>}

      {state.loading && <CardSkeleton count={4} />}
      {!state.loading && state.error && <ErrorState message={state.error} onRetry={load} />}
      {!state.loading && !state.error && summary.total === 0 && (
        <div className="kf-card">
          <EmptyState
            title="当前没有待制作的菜品"
            description="新订单接单后会自动拆解到各档口并出现在这里。"
            action={<Button variant="secondary" onClick={load}><RefreshCw size={15} /> 刷新</Button>}
          />
        </div>
      )}

      {!state.loading && !state.error && summary.total > 0 && (
        <div className="kf-scroll grid gap-4" style={{
          gridTemplateColumns: `repeat(${state.data.columns.length}, minmax(260px, 1fr))`,
          overflowX: 'auto', paddingBottom: 8, alignItems: 'start',
        }}>
          {state.data.columns.map((col) => {
            const color = STATION_COLORS[col.station.color] || 'var(--label-secondary)';
            return (
              <section key={col.station.id} className="flex flex-col gap-3" style={{ minWidth: 260 }}>
                {/* 档口表头 */}
                <header className="flex items-center justify-between sticky top-0 z-10 apple-glass"
                  style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)' }}>
                  <div className="flex items-center gap-2">
                    <span style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: color }} />
                    <span className="apple-headline" style={{ fontSize: 15 }}>{col.station.name}</span>
                  </div>
                  <Tag>{col.tasks.length}</Tag>
                </header>

                {col.tasks.length === 0 ? (
                  <p className="apple-footnote apple-tertiary text-center" style={{ padding: '20px 0' }}>
                    该档口暂无任务
                  </p>
                ) : col.tasks.map((task) => {
                  const { overtime } = countdownRatio(task.order_created_at, task.prep_minutes || 15);
                  const canOperate = user?.role === 'admin' || user?.role === 'chef';
                  return (
                    <article
                      key={task.id}
                      className={`kf-card kf-fade-up ${overtime ? 'kf-overtime' : ''}`}
                      style={{ padding: 12 }}
                    >
                      <div className="flex items-start gap-3">
                        <CountdownRing
                          createdAt={task.order_created_at}
                          prepMinutes={task.prep_minutes || 15}
                          size={42}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="apple-headline truncate" style={{ fontSize: 15 }}>{task.dish_name}</p>
                          <p className="apple-caption apple-secondary mt-0.5">
                            桌 {task.table_no || '-'} · ×{task.quantity} · {formatTime(task.order_created_at)} 下单
                          </p>
                          <p className="apple-caption apple-tertiary mt-0.5 truncate">{task.order_no}</p>
                          {task.note && (
                            <Tag className="mt-1.5" color="var(--orange)" bg="rgba(255,149,0,0.12)">{task.note}</Tag>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3">
                        <Tag
                          color={task.status === 'cooking' ? 'var(--orange)' : 'var(--label-secondary)'}
                          bg={task.status === 'cooking' ? 'rgba(255,149,0,0.14)' : 'var(--fill-secondary)'}
                        >
                          {task.status === 'cooking' ? '制作中' : '待制作'}
                        </Tag>
                        {canOperate && (
                          <Button
                            size="sm"
                            variant={task.status === 'cooking' ? 'primary' : 'secondary'}
                            disabled={busyId === task.id}
                            onClick={() => advance(task)}
                          >
                            {busyId === task.id ? '处理中…' : task.status === 'pending' ? '开始制作' : '完成出餐'}
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
