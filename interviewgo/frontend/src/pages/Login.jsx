import { useEffect, useState } from 'react';
import {
  Avatar, Box, Button, Chip, Divider, IconButton, InputAdornment, Link, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from '../context/SnackbarContext';
import { api } from '../api';

const DEMOS = [
  { u: 'admin', p: 'admin123', label: 'admin / admin123（管理员）' },
  { u: 'candidate', p: 'candidate123', label: 'candidate / candidate123（张同学）' },
  { u: 'jobseeker', p: 'jobseeker123', label: 'jobseeker / jobseeker123（刘同学）' },
];

/** 登录 / 注册：Apple 基底，左侧品牌 + 右侧表单 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, isAuthenticated } = useAuth();
  const snackbar = useSnackbar();

  const [tab, setTab] = useState(0);
  const [form, setForm] = useState({ username: '', password: '', confirm: '', nickname: '', target_role: '' });
  const [roles, setRoles] = useState([]);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const from = (location.state && location.state.from && location.state.from.pathname) || '/';

  useEffect(() => { if (isAuthenticated) navigate(from, { replace: true }); }, [isAuthenticated, from, navigate]);

  // 岗位下拉直接用岗位库，避免两处维护
  useEffect(() => {
    (async () => {
      try {
        const data = await api.positions({ page: 1, pageSize: 50 });
        const names = (data.list || []).map((p) => p.name);
        setRoles(names);
        setForm((f) => ({ ...f, target_role: f.target_role || names[0] || '' }));
      } catch { /* 岗位加载失败时退回自由输入 */ }
    })();
  }, []);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((prev) => ({ ...prev, [k]: '' }));
    setServerError('');
  };

  const validate = () => {
    const err = {};
    const u = form.username.trim();
    if (!u) err.username = '请输入用户名';
    else if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) err.username = '用户名需为 3-20 位字母、数字或下划线';
    if (!form.password) err.password = '请输入密码';
    else if (form.password.length < 6) err.password = '密码至少 6 位';
    if (tab === 1) {
      if (!form.confirm) err.confirm = '请再次输入密码';
      else if (form.confirm !== form.password) err.confirm = '两次输入的密码不一致';
      if (!form.nickname.trim()) err.nickname = '请输入昵称';
    }
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setServerError('');
    try {
      if (tab === 0) {
        await login(form.username.trim(), form.password);
        snackbar.success('登录成功');
      } else {
        await register({
          username: form.username.trim(),
          password: form.password,
          nickname: form.nickname.trim(),
          target_role: form.target_role,
        });
        snackbar.success('注册成功，已自动登录');
      }
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(err.message || '操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (u, p) => {
    setTab(0);
    setForm((f) => ({ ...f, username: u, password: p }));
    setErrors({});
    setServerError('');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' }, bgcolor: 'background.default' }}>
      {/* 左侧品牌区（大屏） */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          px: 8,
          bgcolor: 'primary.main',
          color: '#fff',
        }}
      >
        <Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 4 }}>
          <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.18)', width: 44, height: 44, fontSize: 17 }}>IG</Avatar>
          <Typography sx={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>InterviewGo</Typography>
        </Stack>
        <Typography sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', mb: 2 }}>
          把面试练成对话
          <br />
          让每一次回答都被看见
        </Typography>
        <Typography sx={{ fontSize: 17, lineHeight: 1.5, opacity: 0.9, maxWidth: 460 }}>
          AI 面试官根据目标岗位与级别逐轮提问、追问，每轮回答给出要点命中分析，
          结束后生成结构化能力评估报告、技能雷达与弱项练习计划。
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 4, flexWrap: 'wrap', gap: 1 }}>
          {['流式打字机输出', '逐轮要点分析', '技能雷达', '练习计划闭环'].map((t) => (
            <Chip key={t} label={t} sx={{ bgcolor: 'rgba(255,255,255,0.16)', color: '#fff' }} />
          ))}
        </Stack>
      </Box>

      {/* 右侧表单区 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2.5, md: 6 } }}>
        <Box className="apple-card" sx={{ width: '100%', maxWidth: 420, p: { xs: 2.6, md: 3.4 } }}>
          <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2.4, display: { md: 'none' } }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 34, height: 34, fontSize: 14 }}>IG</Avatar>
            <Typography sx={{ fontWeight: 600, fontSize: 17 }}>InterviewGo</Typography>
          </Stack>

          <Tabs value={tab} onChange={(_, v) => { setTab(v); setErrors({}); setServerError(''); }} variant="fullWidth" sx={{ mb: 2.4 }}>
            <Tab label="登录" />
            <Tab label="注册" />
          </Tabs>

          <form onSubmit={submit} noValidate>
            <Stack spacing={2}>
              {serverError ? (
                <Typography variant="body2" sx={{ color: 'error.main', lineHeight: 1.5 }}>{serverError}</Typography>
              ) : null}

              <TextField
                label="用户名"
                value={form.username}
                onChange={set('username')}
                error={Boolean(errors.username)}
                helperText={errors.username || (tab === 1 ? '3-20 位字母、数字或下划线' : ' ')}
                fullWidth
                autoFocus
                autoComplete="username"
              />

              <TextField
                label="密码"
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                error={Boolean(errors.password)}
                helperText={errors.password || ' '}
                fullWidth
                autoComplete={tab === 0 ? 'current-password' : 'new-password'}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPwd((v) => !v)} edge="end" size="small">
                        {showPwd ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              {tab === 1 ? (
                <>
                  <TextField
                    label="确认密码"
                    type={showPwd ? 'text' : 'password'}
                    value={form.confirm}
                    onChange={set('confirm')}
                    error={Boolean(errors.confirm)}
                    helperText={errors.confirm || ' '}
                    fullWidth
                  />
                  <TextField
                    label="昵称"
                    value={form.nickname}
                    onChange={set('nickname')}
                    error={Boolean(errors.nickname)}
                    helperText={errors.nickname || ' '}
                    fullWidth
                  />
                  <TextField
                    label="目标岗位"
                    value={form.target_role}
                    onChange={set('target_role')}
                    fullWidth
                    helperText="可在新建会话时调整"
                    select
                    SelectProps={{ native: true }}
                  >
                    {(roles.length ? roles : ['前端工程师', '后端工程师', '算法工程师', '产品经理', '数据分析师']).map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </TextField>
                </>
              ) : null}

              <Button type="submit" variant="contained" size="large" disabled={loading} sx={{ py: 1.2 }}>
                {loading ? '处理中…' : tab === 0 ? '登录' : '注册并登录'}
              </Button>
            </Stack>
          </form>

          <Divider sx={{ my: 2.4 }}>
            <Typography variant="caption" color="text.secondary">演示账号</Typography>
          </Divider>

          <Stack spacing={1}>
            {DEMOS.map((d) => (
              <Button key={d.u} variant="outlined" size="small" onClick={() => fillDemo(d.u, d.p)}>
                {d.label}
              </Button>
            ))}
          </Stack>

          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
            点击演示账号可自动填充表单 ·{' '}
            <Link component="button" type="button" underline="hover" onClick={() => fillDemo('', '')}>清空</Link>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
