// 登录 / 注册页：左侧品牌区，右侧表单；演示账号一键填充。
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChefHat, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Field, Input, Select } from '../components/ui/primitives.jsx';
import { InlineAlert } from '../components/ui/states.jsx';
import { DEMO_ACCOUNTS, ROLES } from '../lib/constants.js';

export default function LoginPage() {
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', nickname: '', role: 'waiter' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 已登录直接回到目标页，避免重复登录。
  if (user) {
    navigate(location.state?.from || '/', { replace: true });
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.username.trim() || !form.password) { setError('请填写用户名与密码'); return; }
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(form.username.trim(), form.password);
      } else {
        await register({
          username: form.username.trim(),
          password: form.password,
          nickname: form.nickname || form.username.trim(),
          role: form.role,
        });
      }
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message || '操作失败');
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(acc) {
    setMode('login');
    setError('');
    setForm((f) => ({ ...f, username: acc.username, password: acc.password }));
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--bg-grouped)' }}>
      {/* 品牌区：桌面端展示 */}
      <div className="hidden lg:flex flex-col justify-between flex-1" style={{
        padding: 48, background: 'linear-gradient(150deg, rgba(255,149,0,0.14), rgba(255,149,0,0.02) 60%)',
      }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center" style={{
            width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--tint)', color: '#fff',
          }}>
            <ChefHat size={24} />
          </div>
          <div>
            <p className="apple-title2" style={{ letterSpacing: '-0.02em' }}>KitchenFlow</p>
            <p className="apple-footnote apple-secondary">餐厅后厨订单系统</p>
          </div>
        </div>

        <div>
          <h1 className="apple-large-title" style={{ maxWidth: 420 }}>
            从下单到结账，<br />一屏看清后厨节奏。
          </h1>
          <p className="apple-subhead apple-secondary mt-3" style={{ maxWidth: 400 }}>
            按档口分列的后厨看板、带倒计时的订单卡、自动拆解的档口任务，
            以及写入菜品的销量预测 —— 让每个档口都知道下一道菜是什么。
          </p>
        </div>

        <p className="apple-caption apple-tertiary">© KitchenFlow · 后厨协作演示系统</p>
      </div>

      {/* 表单区 */}
      <div className="flex items-center justify-center flex-1" style={{ padding: 24 }}>
        <div className="kf-card kf-fade-up w-full" style={{ maxWidth: 400, padding: 28 }}>
          <h2 className="apple-title2">{mode === 'login' ? '登录' : '注册新账号'}</h2>
          <p className="apple-footnote apple-secondary mt-1">
            {mode === 'login' ? '使用店长 / 服务员 / 厨师账号进入系统' : '选择角色后即可进入对应工作台'}
          </p>

          <form className="mt-5 space-y-3" onSubmit={submit}>
            <Field label="用户名" required>
              <Input value={form.username} onChange={set('username')} placeholder="至少 3 位" autoComplete="username" />
            </Field>
            <Field label="密码" required>
              <Input type="password" value={form.password} onChange={set('password')} placeholder="至少 6 位" autoComplete="current-password" />
            </Field>

            {mode === 'register' && (
              <>
                <Field label="昵称">
                  <Input value={form.nickname} onChange={set('nickname')} placeholder="如：小李小王" />
                </Field>
                <Field label="角色" hint="决定你能看到哪些工作台">
                  <Select
                    value={form.role}
                    onChange={(v) => setForm((f) => ({ ...f, role: v }))}
                    options={Object.entries(ROLES).map(([value, m]) => ({ value, label: m.label }))}
                  />
                </Field>
              </>
            )}

            {error && <InlineAlert kind="error">{error}</InlineAlert>}

            <Button type="submit" disabled={busy} className="w-full" size="lg">
              {busy ? '处理中…' : mode === 'login' ? <><LogIn size={16} /> 登录</> : <><UserPlus size={16} /> 注册并进入</>}
            </Button>
          </form>

          <button
            type="button"
            className="apple-footnote w-full mt-3"
            style={{ color: 'var(--tint)', background: 'none', border: 'none', padding: 6 }}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          >
            {mode === 'login' ? '还没有账号？立即注册' : '已有账号？返回登录'}
          </button>

          {/* 演示账号一键填充 */}
          <div className="mt-5" style={{ borderTop: '1px solid var(--separator)', paddingTop: 14 }}>
            <p className="apple-caption apple-tertiary mb-2">演示账号（点击填充）</p>
            <div className="flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.username}
                  type="button"
                  onClick={() => fillDemo(a)}
                  className="apple-tag"
                  style={{ cursor: 'pointer', border: 'none', height: 28 }}
                >
                  {a.role} · {a.username}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
