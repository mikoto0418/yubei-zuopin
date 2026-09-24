// 订单列表：分页 + 按状态/桌号筛选 + 搜索 + 详情抽屉（含状态流转时间轴与可执行动作）。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, RefreshCw, Search } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import {
  Button, Card, Drawer, Input, PageHeader, Select, Tag,
} from '../components/ui/primitives.jsx';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../components/ui/states.jsx';
import {
  ACTION_LABEL, NEXT_STATUS, ORDER_FLOW, ORDER_STATUS, PAY_METHODS, ROLE_OF_TARGET,
  formatDateTime, formatMoney, formatTime,
} from '../lib/constants.js';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...Object.entries(ORDER_STATUS).map(([value, m]) => ({ value, label: m.label })),
];

export default function OrdersPage() {
  const { user, isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({
    status: params.get('status') || '',
    table_id: params.get('table_id') || '',
    q: params.get('q') || '',
    page: 1,
    pageSize: 10,
  });
  const [state, setState] = useState({ loading: true, error: '' });
  const [data, setData] = useState({ list: [], total: 0, page: 1, pages: 0, pageSize: 10 });
  const [tables, setTables] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [payMethod, setPayMethod] = useState('微信');
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    setState({ loading: true, error: '' });
    try {
      const r = await api.orders({
        status: filters.status, table_id: filters.table_id, q: filters.q,
        page: filters.page, pageSize: filters.pageSize,
      });
      setData(r);
      setState({ loading: false, error: '' });
    } catch (e) {
      setState({ loading: false, error: e.message });
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.list('tables', { pageSize: 100 }).then((r) => setTables(r.list)).catch(() => {});
  }, []);

  // 支持从桌台/点餐页带 focus 参数直接打开详情。
  useEffect(() => {
    const focus = params.get('focus');
    if (focus) openDetail(Number(focus));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDetail(id) {
    setDetailLoading(true);
    setNotice('');
    try {
      const d = await api.order(id);
      setDetail(d);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function updateFilter(patch) {
    setFilters((f) => {
      const next = { ...f, ...patch, page: patch.page || 1 };
      const sp = new URLSearchParams();
      if (next.status) sp.set('status', next.status);
      if (next.table_id) sp.set('table_id', next.table_id);
      if (next.q) sp.set('q', next.q);
      setParams(sp, { replace: true });
      return next;
    });
  }

  // 执行状态流转：前端只展示角色允许的动作，后端仍会强校验。
  async function advance(order, target) {
    setBusy(true);
    setNotice('');
    try {
      const extra = target === 'paid' ? { pay_method: payMethod }
        : target === 'cancelled' ? { reason: cancelReason || '未填写原因' } : {};
      await api.setOrderStatus(order.id, target, extra);
      await openDetail(order.id);
      await load();
      setCancelReason('');
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  const tableNo = useMemo(() => Object.fromEntries(tables.map((t) => [t.id, t.table_no])), [tables]);

  return (
    <>
      <PageHeader
        title="订单列表"
        subtitle="按状态、桌号筛选；点击任意订单查看明细与流转时间轴"
        actions={<Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> 刷新</Button>}
      />

      {/* 筛选条 */}
      <Card className="mb-4">
        <div className="flex items-end gap-3" style={{ flexWrap: 'wrap' }}>
          <div style={{ width: 160 }}>
            <Select
              value={filters.status}
              onChange={(v) => updateFilter({ status: v })}
              options={STATUS_OPTIONS}
            />
          </div>
          <div style={{ width: 160 }}>
            <Select
              value={filters.table_id}
              onChange={(v) => updateFilter({ table_id: v })}
              options={[{ value: '', label: '全部桌号' },
                ...tables.map((t) => ({ value: String(t.id), label: t.table_no }))]}
            />
          </div>
          <div className="relative" style={{ flex: 1, minWidth: 200 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--label-tertiary)' }} />
            <Input
              value={filters.q}
              placeholder="搜索订单号 / 客人"
              style={{ paddingLeft: 32 }}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') updateFilter({ q: filters.q }); }}
            />
          </div>
          <Button variant="secondary" onClick={() => updateFilter({ q: filters.q })}>搜索</Button>
          <Tag>共 {data.total} 单</Tag>
        </div>
      </Card>

      {notice && <div className="mb-4"><InlineAlert kind="error">{notice}</InlineAlert></div>}

      {state.loading && <LoadingState rows={6} />}
      {!state.loading && state.error && <ErrorState message={state.error} onRetry={load} />}
      {!state.loading && !state.error && data.list.length === 0 && (
        <div className="kf-card">
          <EmptyState icon={ClipboardList} title="没有符合条件的订单" description="调整筛选条件或去点餐页创建订单。" />
        </div>
      )}

      {!state.loading && !state.error && data.list.length > 0 && (
        <Card padded={false}>
          <div className="kf-scroll" style={{ overflowX: 'auto' }}>
            <table className="kf-table">
              <thead>
                <tr>
                  <th>订单号</th><th>桌号</th><th>客人</th><th>菜品</th>
                  <th>金额</th><th>状态</th><th>下单时间</th><th />
                </tr>
              </thead>
              <tbody>
                {data.list.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{o.order_no}</td>
                    <td>{o.table_no || '打包'}</td>
                    <td>{o.customer_name || '—'}</td>
                    <td className="apple-footnote apple-secondary" style={{ maxWidth: 200 }}>
                      {o.items.map((i) => `${i.name_snapshot}×${i.quantity}`).join('、')}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(o.total_amount)}</td>
                    <td><StatusBadge kind="order" value={o.status} /></td>
                    <td className="apple-footnote apple-secondary">{formatDateTime(o.created_at)}</td>
                    <td>
                      <Button size="sm" variant="plain" onClick={() => openDetail(o.id)}>详情</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderTop: '1px solid var(--separator)' }}>
            <span className="apple-footnote apple-secondary">
              第 {data.page} / {Math.max(1, data.pages)} 页 · 每页 {data.pageSize} 条
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={data.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>上一页</Button>
              <Button size="sm" variant="secondary" disabled={data.page >= data.pages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>下一页</Button>
            </div>
          </div>
        </Card>
      )}

      {/* 详情抽屉 */}
      <Drawer
        open={!!detail || detailLoading}
        onClose={() => { setDetail(null); setParams({}, { replace: true }); }}
        title={detail ? `订单 ${detail.order_no}` : '加载中…'}
        width={520}
      >
        {detailLoading && <LoadingState rows={4} />}
        {!detailLoading && detail && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="apple-footnote apple-secondary">
                  桌 {detail.table_no || '打包'} · {detail.people_count} 人 · {detail.customer_name || '未留称呼'}
                </p>
                <p className="apple-caption apple-tertiary mt-0.5">{formatDateTime(detail.created_at)}</p>
              </div>
              <StatusBadge kind="order" value={detail.status} />
            </div>

            {detail.note && <div className="mb-4"><InlineAlert kind="info">整单备注：{detail.note}</InlineAlert></div>}

            {/* 明细 */}
            <p className="apple-headline mb-2">菜品明细</p>
            <div style={{ border: '1px solid var(--separator)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              {detail.items.map((i, idx) => (
                <div key={i.id} className="flex items-center justify-between"
                  style={{ padding: '10px 12px', borderTop: idx ? '1px solid var(--separator)' : 'none' }}>
                  <div>
                    <p className="apple-footnote" style={{ fontWeight: 600 }}>{i.name_snapshot} × {i.quantity}</p>
                    {i.note && <p className="apple-caption" style={{ color: 'var(--orange)' }}>{i.note}</p>}
                  </div>
                  <span className="apple-footnote apple-secondary">{formatMoney(i.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between"
                style={{ padding: '10px 12px', borderTop: '1px solid var(--separator)', background: 'var(--fill-tertiary)' }}>
                <span className="apple-footnote" style={{ fontWeight: 600 }}>合计</span>
                <span className="apple-subhead" style={{ color: 'var(--tint)', fontWeight: 600 }}>
                  {formatMoney(detail.total_amount)}
                </span>
              </div>
            </div>

            {/* 档口任务 */}
            {detail.tasks?.length > 0 && (
              <>
                <p className="apple-headline mt-5 mb-2">档口任务</p>
                <div className="flex flex-wrap gap-2">
                  {detail.tasks.map((t) => (
                    <Tag key={t.id}
                      color={t.status === 'done' ? 'var(--green)' : t.status === 'cooking' ? 'var(--orange)' : 'var(--label-secondary)'}
                      bg={t.status === 'done' ? 'rgba(52,199,89,0.12)' : t.status === 'cooking' ? 'rgba(255,149,0,0.14)' : 'var(--fill-secondary)'}>
                      {t.dish_name} × {t.quantity} · {t.status === 'done' ? '已完成' : t.status === 'cooking' ? '制作中' : '待制作'}
                    </Tag>
                  ))}
                </div>
              </>
            )}

            {/* 流转时间轴 */}
            <p className="apple-headline mt-5 mb-2">状态流转</p>
            <ol className="space-y-0">
              {detail.logs.map((l, idx) => {
                const meta = ORDER_STATUS[l.to_status] || { color: 'var(--label-secondary)' };
                return (
                  <li key={l.id} className="flex gap-3" style={{ paddingBottom: idx === detail.logs.length - 1 ? 0 : 14 }}>
                    <div className="flex flex-col items-center">
                      <span style={{ width: 9, height: 9, borderRadius: 'var(--radius-full)', background: meta.color, marginTop: 5 }} />
                      {idx !== detail.logs.length - 1 && (
                        <span style={{ width: 1, flex: 1, background: 'var(--separator)', marginTop: 4 }} />
                      )}
                    </div>
                    <div>
                      <p className="apple-footnote" style={{ fontWeight: 600 }}>
                        {ORDER_STATUS[l.to_status]?.label || l.to_status}
                      </p>
                      <p className="apple-caption apple-tertiary">
                        {formatTime(l.created_at)} · {l.operator_name || '系统'}
                        {l.note ? ` · ${l.note}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* 可执行动作：按角色与状态机渲染 */}
            {(() => {
              const nexts = NEXT_STATUS[detail.status] || [];
              const allowed = nexts.filter((t) => (ROLE_OF_TARGET[t] || []).includes(user?.role));
              if (!allowed.length) {
                return <p className="apple-footnote apple-tertiary mt-5">当前状态（{ORDER_STATUS[detail.status]?.label}）无可执行操作。</p>;
              }
              return (
                <div className="mt-5" style={{ borderTop: '1px solid var(--separator)', paddingTop: 14 }}>
                  {allowed.includes('paid') && (
                    <div className="mb-3">
                      <p className="apple-footnote apple-secondary mb-1">支付方式</p>
                      <Select value={payMethod} onChange={setPayMethod}
                        options={PAY_METHODS.map((p) => ({ value: p, label: p }))} />
                    </div>
                  )}
                  {allowed.includes('cancelled') && (
                    <div className="mb-3">
                      <p className="apple-footnote apple-secondary mb-1">取消原因</p>
                      <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="如：客人临时有事" />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {allowed.map((t) => (
                      <Button
                        key={t}
                        variant={t === 'cancelled' ? 'danger' : 'primary'}
                        disabled={busy}
                        onClick={() => advance(detail, t)}
                      >
                        {busy ? '处理中…' : ACTION_LABEL[t]}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </Drawer>
    </>
  );
}
