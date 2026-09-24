// 个人中心：资料编辑 + 我的排班 + 权限说明。
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Save, User } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import {
  Button, Card, Field, Input, PageHeader, Tag,
} from '../components/ui/primitives.jsx';
import { EmptyState, ErrorState, InlineAlert, LoadingState } from '../components/ui/states.jsx';
import { ROLES, formatDateTime } from '../lib/constants.js';

// 各角色的能力说明，帮助演示时讲清楚权限边界。
const CAPABILITIES = {
  admin: ['查看经营概览与档口效率', '管理桌台、菜单与员工班次', '执行全部订单状态流转', '触发 AI 销量预测（会写库）'],
  waiter: ['开台点餐与提交订单', '上菜与结账', '管理桌台清台状态', '查看订单与后厨进度'],
  chef: ['后厨看板按档口接单制作', '完成档口任务触发自动出餐', '维护菜品与档口归属', '查看 AI 备料清单与异常告警'],
};

export default function ProfilePage() {
  const { user, isAdmin } = useAuth();
  const [form, setForm] = useState({ nickname: '', phone: '', avatar: '' });
  const [state, setState] = useState({ loading: true, error: '' });
  const [shifts, setShifts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [okText, setOkText] = useState('');

  const load = useCallback(async () => {
    setState({ loading: true, error: '' });
    try {
      const [me, s] = await Promise.all([
        api.me(),
        api.list('shifts', { pageSize: 100, user_id: user?.id }),
      ]);
      setForm({ nickname: me.nickname || '', phone: me.phone || '', avatar: me.avatar || '' });
      setShifts(s.list.filter((x) => x.user_id === user?.id));
      setState({ loading: false, error: '' });
    } catch (e) {
      setState({ loading: false, error: e.message });
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true);
    setNotice('');
    setOkText('');
    try {
      await api.updateMe({ nickname: form.nickname, phone: form.phone, avatar: form.avatar });
      setOkText('资料已保存');
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="个人中心" subtitle="维护个人资料，查看自己的排班与角色权限"
        actions={<Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> 刷新</Button>} />

      {notice && <div className="mb-4"><InlineAlert kind="error">{notice}</InlineAlert></div>}
      {okText && <div className="mb-4"><InlineAlert kind="success">{okText}</InlineAlert></div>}

      {state.loading && <LoadingState rows={3} />}
      {!state.loading && state.error && <ErrorState message={state.error} onRetry={load} />}

      {!state.loading && !state.error && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'start' }}>
          <div className="space-y-4">
            {/* 资料 */}
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center" style={{
                  width: 48, height: 48, borderRadius: 'var(--radius-full)',
                  background: 'var(--tint-soft)', color: 'var(--tint)',
                }}>
                  <User size={24} />
                </div>
                <div>
                  <p className="apple-headline">{user?.nickname || user?.username}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge kind="role" value={user?.role} />
                    <span className="apple-caption apple-tertiary">
                      注册于 {formatDateTime(user?.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Field label="用户名" hint="用户名注册后不可修改">
                  <Input value={user?.username || ''} disabled />
                </Field>
                <Field label="昵称">
                  <Input value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} />
                </Field>
                <Field label="手机号">
                  <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </Field>
                <Field label="头像 URL">
                  <Input value={form.avatar} onChange={(e) => setForm((f) => ({ ...f, avatar: e.target.value }))} placeholder="https://…" />
                </Field>
                <Button disabled={busy} onClick={save}>
                  <Save size={15} /> {busy ? '保存中…' : '保存资料'}
                </Button>
              </div>
            </Card>

            {/* 我的排班 */}
            <Card padded={false}>
              <div style={{ padding: '14px 16px' }}>
                <p className="apple-headline">我的排班</p>
              </div>
              {shifts.length === 0 ? (
                <EmptyState title="暂无排班记录" description="店长在班次管理里为你排班后会显示在这里。" />
              ) : (
                <div className="kf-scroll" style={{ overflowX: 'auto' }}>
                  <table className="kf-table">
                    <thead>
                      <tr><th>日期</th><th>班次</th><th>状态</th><th>备注</th></tr>
                    </thead>
                    <tbody>
                      {shifts.map((s) => (
                        <tr key={s.id}>
                          <td>{s.shift_date}</td>
                          <td className="apple-secondary">{s.start_time} – {s.end_time}</td>
                          <td><StatusBadge kind="shift" value={s.status} /></td>
                          <td className="apple-tertiary">{s.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          {/* 权限说明 */}
          <Card>
            <p className="apple-headline mb-1">{ROLES[user?.role]?.label || user?.role} 权限</p>
            <p className="apple-caption apple-tertiary mb-3">你当前角色可以做的事</p>
            <ul className="space-y-2">
              {(CAPABILITIES[user?.role] || []).map((c) => (
                <li key={c} className="apple-footnote flex gap-2">
                  <span style={{ color: 'var(--tint)' }}>·</span>
                  <span className="apple-secondary">{c}</span>
                </li>
              ))}
            </ul>
            {!isAdmin && (
              <p className="apple-caption apple-tertiary mt-4" style={{ borderTop: '1px solid var(--separator)', paddingTop: 10 }}>
                经营概览、员工管理与会写库的 AI 预测仅店长可用。
              </p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
