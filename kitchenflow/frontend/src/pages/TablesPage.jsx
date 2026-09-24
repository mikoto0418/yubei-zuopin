// 桌台管理：桌位网格，状态色区分（空闲/占用/待清台），可改状态与备注。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid3x3, RefreshCw, Sparkles } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import {
  Button, Card, Field, Input, Modal, PageHeader, Segmented, Tag,
} from '../components/ui/primitives.jsx';
import { CardSkeleton, EmptyState, ErrorState, InlineAlert } from '../components/ui/states.jsx';
import { TABLE_STATUS, formatMoney } from '../lib/constants.js';

export default function TablesPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, error: '', list: [] });
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ table_no: '', seats: 4, zone: '大厅', note: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await api.list('tables', { pageSize: 100 });
      setState({ loading: false, error: '', list: data.list });
    } catch (e) {
      setState({ loading: false, error: e.message, list: [] });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => (filter === 'all' ? state.list : state.list.filter((t) => t.status === filter)),
    [state.list, filter],
  );

  const counts = useMemo(() => ({
    idle: state.list.filter((t) => t.status === 'idle').length,
    occupied: state.list.filter((t) => t.status === 'occupied').length,
    cleaning: state.list.filter((t) => t.status === 'cleaning').length,
  }), [state.list]);

  // 改桌台状态：待清台 → 空闲 是服务员最常用的动作。
  async function setStatus(table, status) {
    setNotice('');
    try {
      await api.update('tables', table.id, { status });
      await load();
    } catch (e) { setNotice(e.message); }
  }

  function openEdit(table) {
    setEditing(table);
    setForm({ table_no: table.table_no, seats: table.seats, zone: table.zone || '大厅', note: table.note || '' });
  }

  async function saveEdit() {
    setBusy(true);
    setNotice('');
    try {
      await api.update('tables', editing.id, {
        table_no: form.table_no, seats: Number(form.seats), zone: form.zone, note: form.note,
      });
      setEditing(null);
      await load();
    } catch (e) { setNotice(e.message); } finally { setBusy(false); }
  }

  async function createTable() {
    setBusy(true);
    setNotice('');
    try {
      await api.create('tables', {
        table_no: form.table_no || `A${state.list.length + 1}`,
        seats: Number(form.seats), zone: form.zone, note: form.note, restaurant_id: 1,
      });
      setEditing(null);
      await load();
    } catch (e) { setNotice(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader
        title="桌台管理"
        subtitle="点击桌位查看当前订单或调整状态"
        actions={
          <>
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `全部 ${state.list.length}` },
                { value: 'idle', label: `空闲 ${counts.idle}` },
                { value: 'occupied', label: `占用 ${counts.occupied}` },
                { value: 'cleaning', label: `待清台 ${counts.cleaning}` },
              ]}
            />
            <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> 刷新</Button>
            {isAdmin && (
              <Button size="sm" onClick={() => { setEditing({ id: null }); setForm({ table_no: '', seats: 4, zone: '大厅', note: '' }); }}>
                + 新增桌台
              </Button>
            )}
          </>
        }
      />

      {notice && <div className="mb-4"><InlineAlert kind="error">{notice}</InlineAlert></div>}

      {state.loading && <CardSkeleton count={8} />}
      {!state.loading && state.error && <ErrorState message={state.error} onRetry={load} />}
      {!state.loading && !state.error && filtered.length === 0 && (
        <div className="kf-card">
          <EmptyState icon={Grid3x3} title="没有符合条件的桌台" description="换个筛选条件试试。" />
        </div>
      )}

      {!state.loading && !state.error && filtered.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {filtered.map((t) => {
            const meta = TABLE_STATUS[t.status] || TABLE_STATUS.idle;
            return (
              <Card key={t.id} className="kf-fade-up" style={{ borderTop: `3px solid ${meta.color}`, borderRadius: 'var(--radius-md)' }}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="apple-title2" style={{ fontSize: 20 }}>{t.table_no}</p>
                    <p className="apple-caption apple-secondary mt-0.5">{t.zone} · {t.seats} 人桌</p>
                  </div>
                  <StatusBadge kind="table" value={t.status} />
                </div>

                {t.current_order_id ? (
                  <p className="apple-caption apple-tertiary mt-2">当前订单 #{t.current_order_id}</p>
                ) : (
                  <p className="apple-caption apple-tertiary mt-2">{t.note || '无进行中订单'}</p>
                )}

                <div className="flex flex-wrap gap-2 mt-3">
                  {t.status === 'idle' && (
                    <Button size="sm" onClick={() => navigate(`/order/new?table=${t.id}`)}>去点餐</Button>
                  )}
                  {t.status === 'occupied' && t.current_order_id && (
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/orders?focus=${t.current_order_id}`)}>
                      查看订单
                    </Button>
                  )}
                  {t.status === 'cleaning' && (
                    <Button size="sm" onClick={() => setStatus(t, 'idle')}>
                      <Sparkles size={14} /> 清台完成
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="plain" onClick={() => openEdit(t)}>编辑</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `编辑桌台 ${editing.table_no}` : '新增桌台'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>取消</Button>
            <Button disabled={busy} onClick={editing?.id ? saveEdit : createTable}>
              {busy ? '保存中…' : '保存'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="桌号" required>
            <Input value={form.table_no} onChange={(e) => setForm((f) => ({ ...f, table_no: e.target.value }))} placeholder="如 A13" />
          </Field>
          <Field label="座位数">
            <Input type="number" min="1" value={form.seats} onChange={(e) => setForm((f) => ({ ...f, seats: e.target.value }))} />
          </Field>
          <Field label="区域">
            <Input value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))} placeholder="大厅 / 靠窗 / 包间" />
          </Field>
          <Field label="备注">
            <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
