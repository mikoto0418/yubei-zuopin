// 结账页：列出已上菜待结账订单，选择支付方式整单结账。
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Wallet } from 'lucide-react';
import { api } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { Button, Card, Field, Modal, PageHeader, Select, Tag } from '../components/ui/primitives.jsx';
import { CardSkeleton, EmptyState, ErrorState, InlineAlert } from '../components/ui/states.jsx';
import { PAY_METHODS, formatDateTime, formatMoney } from '../lib/constants.js';

export default function CheckoutPage() {
  const [state, setState] = useState({ loading: true, error: '' });
  const [orders, setOrders] = useState([]);
  const [target, setTarget] = useState(null);
  const [payMethod, setPayMethod] = useState('微信');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setState({ loading: true, error: '' });
    try {
      const r = await api.orders({ status: 'served', pageSize: 100 });
      setOrders(r.list);
      setState({ loading: false, error: '' });
    } catch (e) {
      setState({ loading: false, error: e.message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  async function confirmPay() {
    if (!target) return;
    setBusy(true);
    setNotice('');
    try {
      await api.setOrderStatus(target.id, 'paid', { pay_method: payMethod });
      setTarget(null);
      await load();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="结账"
        subtitle="已上菜的订单可整单结账；结账后桌台自动转为待清台"
        actions={
          <>
            <Tag>待结账 {orders.length} 单</Tag>
            <Tag color="var(--tint)" bg="var(--tint-soft)">合计 {formatMoney(total)}</Tag>
            <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> 刷新</Button>
          </>
        }
      />

      {notice && <div className="mb-4"><InlineAlert kind="error">{notice}</InlineAlert></div>}

      {state.loading && <CardSkeleton count={4} />}
      {!state.loading && state.error && <ErrorState message={state.error} onRetry={load} />}
      {!state.loading && !state.error && orders.length === 0 && (
        <div className="kf-card">
          <EmptyState icon={Wallet} title="当前没有待结账的订单"
            description="订单在上菜（已上菜）之后才会出现在这里。" />
        </div>
      )}

      {!state.loading && !state.error && orders.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {orders.map((o) => (
            <Card key={o.id} className="kf-fade-up">
              <div className="flex items-start justify-between">
                <div>
                  <p className="apple-headline" style={{ fontFamily: 'var(--font-mono)', fontSize: 15 }}>{o.order_no}</p>
                  <p className="apple-caption apple-secondary mt-0.5">
                    桌 {o.table_no || '打包'} · {o.people_count} 人
                  </p>
                  <p className="apple-caption apple-tertiary mt-0.5">{formatDateTime(o.created_at)}</p>
                </div>
                <StatusBadge kind="order" value={o.status} />
              </div>

              <div className="mt-3 apple-footnote apple-secondary">
                {o.items.map((i) => `${i.name_snapshot}×${i.quantity}`).join('、')}
              </div>

              <div className="flex items-center justify-between mt-3"
                style={{ borderTop: '1px solid var(--separator)', paddingTop: 10 }}>
                <span className="apple-subhead" style={{ color: 'var(--tint)', fontWeight: 600 }}>
                  {formatMoney(o.total_amount)}
                </span>
                <Button size="sm" onClick={() => { setTarget(o); setPayMethod('微信'); }}>
                  <Wallet size={14} /> 结账
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={target ? `结账：${target.order_no}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>取消</Button>
            <Button disabled={busy} onClick={confirmPay}>{busy ? '处理中…' : '确认收款'}</Button>
          </>
        }
      >
        {target && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="apple-footnote apple-secondary">桌号</span>
              <span className="apple-footnote">{target.table_no || '打包'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="apple-footnote apple-secondary">菜品数</span>
              <span className="apple-footnote">{target.items.length} 项</span>
            </div>
            <div className="flex items-center justify-between"
              style={{ borderTop: '1px solid var(--separator)', paddingTop: 10 }}>
              <span className="apple-subhead apple-secondary">应收金额</span>
              <span className="apple-title2" style={{ color: 'var(--tint)' }}>{formatMoney(target.total_amount)}</span>
            </div>
            <Field label="支付方式">
              <Select value={payMethod} onChange={setPayMethod}
                options={PAY_METHODS.map((p) => ({ value: p, label: p }))} />
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
