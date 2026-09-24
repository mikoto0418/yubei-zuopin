// 班次管理：排班表（按日期分组）+ 各班次订单量统计。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import {
  Button, Card, Field, Input, Modal, PageHeader, Select, Segmented, Tag,
} from '../components/ui/primitives.jsx';
import { CardSkeleton, EmptyState, ErrorState, InlineAlert } from '../components/ui/states.jsx';
import { ROLES, formatMoney } from '../lib/constants.js';

const today = () => new Date().toISOString().slice(0, 10);

export default function ShiftsPage() {
  const { isAdmin } = useAuth();
  const [state, setState] = useState({ loading: true, error: '' });
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [orders, setOrders] = useState([]);
  const [view, setView] = useState('table');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    user_id: '', shift_date: today(), start_time: '10:00', end_time: '18:00', role: 'waiter', note: '',
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setState({ loading: true, error: '' });
    try {
      const [s, st, o] = await Promise.all([
        api.list('shifts', { pageSize: 100 }),
        api.staff(),
        api.orders({ pageSize: 100 }),
      ]);
      setShifts(s.list);
      setStaff(st);
      setOrders(o.list);
      setState({ loading: false, error: '' });
    } catch (e) {
      setState({ loading: false, error: e.message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 按日期分组，便于排班表按天展示。
  const grouped = useMemo(() => {
    const map = new Map();
    for (const s of shifts) {
      if (!map.has(s.shift_date)) map.set(s.shift_date, []);
      map.get(s.shift_date).push(s);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [shifts]);

  // 各班次订单量统计：按日期聚合订单数与营业额，与排班对照。
  const statsByDate = useMemo(() => {
    const map = new Map();
    for (const o of orders) {
      const d = String(o.created_at).slice(0, 10);
      if (!map.has(d)) map.set(d, { count: 0, revenue: 0 });
      const cur = map.get(d);
      cur.count += 1;
      if (o.status !== 'cancelled') cur.revenue += Number(o.total_amount || 0);
    }
    return map;
  }, [orders]);

  const staffName = useMemo(() => Object.fromEntries(staff.map((u) => [u.id, u.nickname || u.username])), [staff]);

  async function save() {
    setBusy(true);
    setNotice('');
    try {
      await api.create('shifts', {
        ...form, user_id: Number(form.user_id), restaurant_id: 1, status: 'scheduled',
      });
      setCreating(false);
      await load();
    } catch (e) { setNotice(e.message); } finally { setBusy(false); }
  }

  async function remove(shift) {
    if (!window.confirm(`确认删除 ${shift.shift_date} 的这条排班？`)) return;
    setNotice('');
    try {
      await api.remove('shifts', shift.id);
      await load();
    } catch (e) { setNotice(e.message); }
  }

  // 一键把今天所有排班置为「值班中」，方便演示。
  async function activateToday() {
    setNotice('');
    const todayShifts = shifts.filter((s) => s.shift_date === today() && s.status !== 'active');
    try {
      await Promise.all(todayShifts.map((s) => api.update('shifts', s.id, { status: 'active' })));
      await load();
    } catch (e) { setNotice(e.message); }
  }

  return (
    <>
      <PageHeader
        title="班次管理"
        subtitle="员工排班与各班次订单量对照；店长可新增与删除排班"
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[{ value: 'table', label: '排班表' }, { value: 'stats', label: '订单量统计' }]}
            />
            <Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> 刷新</Button>
            {isAdmin && <Button variant="secondary" size="sm" onClick={activateToday}>今日全部值班</Button>}
            {isAdmin && (
              <Button size="sm" onClick={() => {
                setForm({ user_id: String(staff[0]?.id || ''), shift_date: today(), start_time: '10:00', end_time: '18:00', role: 'waiter', note: '' });
                setCreating(true);
              }}>
                <Plus size={14} /> 新增排班
              </Button>
            )}
          </>
        }
      />

      {notice && <div className="mb-4"><InlineAlert kind="error">{notice}</InlineAlert></div>}

      {state.loading && <CardSkeleton count={4} />}
      {!state.loading && state.error && <ErrorState message={state.error} onRetry={load} />}

      {!state.loading && !state.error && view === 'table' && (
        grouped.length === 0 ? (
          <div className="kf-card">
            <EmptyState icon={CalendarDays} title="暂无排班记录" description="点击右上角「新增排班」开始排班。" />
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([date, list]) => {
              const stat = statsByDate.get(date);
              const isToday = date === today();
              return (
                <Card key={date}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <p className="apple-headline">{date}</p>
                      {isToday && <Tag color="var(--orange)" bg="rgba(255,149,0,0.14)">今天</Tag>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Tag>排班 {list.length} 人</Tag>
                      {stat && <Tag>订单 {stat.count} 单 · {formatMoney(stat.revenue)}</Tag>}
                    </div>
                  </div>

                  <div className="kf-scroll" style={{ overflowX: 'auto' }}>
                    <table className="kf-table">
                      <thead>
                        <tr><th>员工</th><th>角色</th><th>班次</th><th>状态</th><th>备注</th><th /></tr>
                      </thead>
                      <tbody>
                        {list.map((s) => (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 600 }}>{staffName[s.user_id] || `#${s.user_id}`}</td>
                            <td><StatusBadge kind="role" value={s.role} /></td>
                            <td className="apple-footnote apple-secondary">{s.start_time} – {s.end_time}</td>
                            <td><StatusBadge kind="shift" value={s.status} /></td>
                            <td className="apple-footnote apple-tertiary">{s.note || '—'}</td>
                            <td>
                              {isAdmin && (
                                <Button size="sm" variant="plain" onClick={() => remove(s)}>
                                  <Trash2 size={13} /> 删除
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {!state.loading && !state.error && view === 'stats' && (
        <Card padded={false}>
          <div className="kf-scroll" style={{ overflowX: 'auto' }}>
            <table className="kf-table">
              <thead>
                <tr><th>日期</th><th>排班人数</th><th>订单数</th><th>营业额</th><th>人均订单</th></tr>
              </thead>
              <tbody>
                {[...statsByDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, st]) => {
                  const people = shifts.filter((s) => s.shift_date === date).length;
                  return (
                    <tr key={date}>
                      <td>{date}{date === today() ? '（今天）' : ''}</td>
                      <td>{people}</td>
                      <td style={{ fontWeight: 600 }}>{st.count}</td>
                      <td>{formatMoney(st.revenue)}</td>
                      <td className="apple-secondary">{people ? (st.count / people).toFixed(1) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="新增排班"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>取消</Button>
            <Button disabled={busy || !form.user_id} onClick={save}>{busy ? '保存中…' : '保存'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="员工" required>
            <Select
              value={form.user_id}
              onChange={(v) => {
                const u = staff.find((x) => String(x.id) === v);
                setForm((f) => ({ ...f, user_id: v, role: u?.role || 'waiter' }));
              }}
              options={staff.map((u) => ({ value: String(u.id), label: `${u.nickname || u.username}（${ROLES[u.role]?.label || u.role}）` }))}
              placeholder="请选择员工"
            />
          </Field>
          <Field label="日期" required>
            <Input type="date" value={form.shift_date} onChange={(e) => setForm((f) => ({ ...f, shift_date: e.target.value }))} />
          </Field>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="开始时间">
              <Input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
            </Field>
            <Field label="结束时间">
              <Input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
            </Field>
          </div>
          <Field label="备注">
            <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="如：晚市加班" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
