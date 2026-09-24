import { useEffect, useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormHelperText,
  InputLabel, MenuItem, Select, Stack, TextField,
} from '@mui/material';

export const LEVELS = ['初级', '中级', '高级'];
const STATUSES = [
  { k: 'created', label: '已创建' },
  { k: 'in_progress', label: '进行中' },
  { k: 'completed', label: '已完成' },
  { k: 'evaluated', label: '已评估' },
];
const FALLBACK_ROLES = ['前端工程师', '后端工程师', '算法工程师', '产品经理', '数据分析师', '测试开发工程师'];

/**
 * 会话新建 / 编辑弹窗。
 * 新建时优先从岗位库选择（带出岗位与级别），也可手填岗位名称。
 */
export default function SessionDialog({ open, mode = 'create', initial, positions = [], onClose, onSubmit, loading }) {
  const [form, setForm] = useState({ title: '', role: FALLBACK_ROLES[0], level: LEVELS[0], status: 'in_progress', position_id: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (initial) {
      setForm({
        title: initial.title || '',
        role: initial.role || FALLBACK_ROLES[0],
        level: initial.level || LEVELS[0],
        status: initial.status || 'in_progress',
        position_id: initial.position_id || '',
      });
    } else {
      setForm({ title: '', role: FALLBACK_ROLES[0], level: LEVELS[0], status: 'in_progress', position_id: '' });
    }
  }, [open, initial]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((prev) => ({ ...prev, [k]: '' }));
  };

  // 选择岗位后自动带出岗位名、级别与建议标题，减少输入负担
  const pickPosition = (e) => {
    const id = e.target.value;
    const p = positions.find((x) => x.id === id);
    setForm((f) => {
      const next = { ...f, position_id: id };
      if (p) {
        next.role = p.name;
        next.level = LEVELS.includes(p.level) ? p.level : f.level;
        if (mode === 'create') next.title = `${p.name}${next.level}模拟面试`;
      }
      return next;
    });
    setErrors({});
  };

  const setRoleOrLevel = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (mode === 'create' && !f.title.trim()) next.title = `${next.role}${next.level}模拟面试`;
      return next;
    });
    setErrors((prev) => ({ ...prev, [k]: '' }));
  };

  const validate = () => {
    const err = {};
    const title = form.title.trim();
    if (!title) err.title = '请填写会话标题';
    else if (title.length < 2) err.title = '标题至少 2 个字符';
    else if (title.length > 60) err.title = '标题不超过 60 个字符';
    if (!form.role) err.role = '请选择或填写目标岗位';
    if (!LEVELS.includes(form.level)) err.level = '请选择面试级别';
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    const payload = {
      title: form.title.trim(),
      role: form.role,
      level: form.level,
      position_id: form.position_id || null,
    };
    if (mode === 'edit') payload.status = form.status;
    onSubmit(payload);
  };

  const roleOptions = positions.length ? positions.map((p) => ({ value: p.name, label: `${p.name}（${p.category}）` })) : FALLBACK_ROLES.map((r) => ({ value: r, label: r }));

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{mode === 'create' ? '新建面试会话' : '编辑会话信息'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.2} sx={{ pt: 0.5 }}>
          {mode === 'create' && positions.length ? (
            <FormControl fullWidth>
              <InputLabel>从岗位库选择</InputLabel>
              <Select label="从岗位库选择" value={form.position_id} onChange={pickPosition}>
                <MenuItem value="">不指定（手动选择岗位）</MenuItem>
                {positions.map((p) => (
                  <MenuItem key={p.id} value={p.id}>{p.name}（{p.category} · {p.level}）</MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}

          <TextField
            label="会话标题"
            value={form.title}
            onChange={set('title')}
            error={Boolean(errors.title)}
            helperText={errors.title || '例如：前端工程师中级模拟面试'}
            fullWidth
            autoFocus
            inputProps={{ maxLength: 60 }}
          />

          <FormControl fullWidth error={Boolean(errors.role)}>
            <InputLabel>目标岗位</InputLabel>
            <Select label="目标岗位" value={form.role} onChange={setRoleOrLevel('role')}>
              {roleOptions.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
            </Select>
            {errors.role ? <FormHelperText>{errors.role}</FormHelperText> : null}
          </FormControl>

          <FormControl fullWidth error={Boolean(errors.level)}>
            <InputLabel>面试级别</InputLabel>
            <Select label="面试级别" value={form.level} onChange={setRoleOrLevel('level')}>
              {LEVELS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
            </Select>
            {errors.level ? <FormHelperText>{errors.level}</FormHelperText> : null}
          </FormControl>

          {mode === 'edit' ? (
            <FormControl fullWidth>
              <InputLabel>会话状态</InputLabel>
              <Select label="会话状态" value={form.status} onChange={set('status')}>
                {STATUSES.map((s) => <MenuItem key={s.k} value={s.k}>{s.label}</MenuItem>)}
              </Select>
            </FormControl>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={loading}>取消</Button>
        <Button variant="contained" onClick={submit} disabled={loading}>
          {loading ? '处理中…' : mode === 'create' ? '开始面试' : '保存'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
