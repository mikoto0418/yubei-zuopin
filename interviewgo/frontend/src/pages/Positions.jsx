import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { EmptyState, ErrorState, LoadingBlock, NoResults } from '../components/States';
import { api } from '../api';
import { useSnackbar } from '../context/SnackbarContext';

const PAGE_SIZE = 9;
const CATEGORIES = ['全部', '技术', '产品', '数据', '设计', '运营'];

export default function Positions() {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [dialog, setDialog] = useState({ open: false, loading: false, form: { name: '', category: '技术', level: '中级', description: '', skills: '' } });

  const load = useCallback(async ({ nextPage = 1, append = false, keyword = q, cat = category } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      const data = await api.positions({ page: nextPage, pageSize: PAGE_SIZE, q: keyword, category: cat });
      setItems((prev) => (append ? [...prev, ...(data.list || [])] : data.list || []));
      setTotal(data.total || 0);
      setPage(nextPage);
    } catch (e) {
      setError(e.message || '岗位加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [q, category]);

  useEffect(() => { load({ nextPage: 1 }); /* eslint-disable-next-line */ }, []);

  const openCreate = () => setDialog({ open: true, loading: false, form: { name: '', category: '技术', level: '中级', description: '', skills: '' } });

  const submit = async () => {
    const form = dialog.form;
    if (!form.name.trim()) { snackbar.error('请填写岗位名称'); return; }
    setDialog((d) => ({ ...d, loading: true }));
    try {
      await api.createPosition({
        name: form.name.trim(),
        category: form.category,
        level: form.level,
        description: form.description,
        skills: form.skills.split(/[,，、\s]+/).filter(Boolean),
        dimensions: ['逻辑性', '专业深度', '表达力'],
        is_builtin: 0,
      });
      snackbar.success('岗位已创建');
      setDialog((d) => ({ ...d, open: false }));
      load({ nextPage: 1 });
    } catch (e) {
      snackbar.error(e.message || '创建失败');
      setDialog((d) => ({ ...d, loading: false }));
    }
  };

  const isFiltering = Boolean(q || category);

  return (
    <AppShell
      title="岗位库"
      subtitle={`共 ${total} 个岗位 · 每个岗位带技能标签与考察维度`}
      actions={<Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>自建岗位</Button>}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.4} sx={{ mb: 2.4 }}>
        <TextField
          size="small"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load({ nextPage: 1 })}
          placeholder="搜索岗位名称或描述"
          sx={{ flex: 1, maxWidth: 360 }}
        />
        <Stack direction="row" spacing={0.8} sx={{ flexWrap: 'wrap', gap: 0.8 }}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={c === '全部' ? '全部' : c}
              size="small"
              color={category === (c === '全部' ? '' : c) ? 'primary' : 'default'}
              onClick={() => { const v = c === '全部' ? '' : c; setCategory(v); load({ nextPage: 1, cat: v }); }}
            />
          ))}
        </Stack>
      </Stack>

      {loading ? (
        <LoadingBlock rows={6} height={110} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load({ nextPage: 1 })} />
      ) : items.length === 0 ? (
        isFiltering
          ? <NoResults keyword={q} onReset={() => { setQ(''); setCategory(''); load({ nextPage: 1, keyword: '', cat: '' }); }} />
          : <EmptyState icon={<WorkOutlineRoundedIcon sx={{ fontSize: 40 }} />} title="还没有岗位" description="创建一个岗位，或等待管理员预置。" actionLabel="自建岗位" onAction={openCreate} />
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(3,1fr)' }, gap: 2 }}>
            {items.map((p) => (
              <Box
                key={p.id}
                className="apple-card"
                sx={{
                  p: 2.2, display: 'flex', flexDirection: 'column', gap: 1.2,
                  transition: 'transform var(--dur-fast) var(--ease-standard)',
                  '&:hover': { transform: 'translateY(-2px)' },
                }}
              >
                <Stack direction="row" alignItems="flex-start" spacing={1}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 17 }} noWrap>{p.name}</Typography>
                    <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 0.4 }}>
                      <Typography variant="caption" color="text.secondary">{p.category}</Typography>
                      <Typography variant="caption" color="text.disabled">·</Typography>
                      <Typography variant="caption" color="text.secondary">{p.level}</Typography>
                      {p.is_builtin ? <Chip size="small" label="内置" sx={{ height: 18, fontSize: 11 }} /> : null}
                    </Stack>
                  </Box>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {p.description || '暂无描述'}
                </Typography>
                <Stack direction="row" spacing={0.6} sx={{ flexWrap: 'wrap', gap: 0.6 }}>
                  {(p.skills || []).slice(0, 5).map((s) => (
                    <Box key={s} className="apple-tag">{s}</Box>
                  ))}
                </Stack>
                <Stack direction="row" spacing={0.8} sx={{ mt: 'auto', pt: 0.6 }}>
                  <Button size="small" variant="contained" onClick={() => navigate('/questions', { state: { positionId: p.id } })}>看题目</Button>
                  <Button size="small" variant="outlined" onClick={() => navigate('/', { state: { newSessionPositionId: p.id } })}>开始面试</Button>
                </Stack>
              </Box>
            ))}
          </Box>
          <Box sx={{ textAlign: 'center', pt: 3 }}>
            {items.length < total ? (
              <Button variant="outlined" disabled={loadingMore} onClick={() => load({ nextPage: page + 1, append: true })}>
                {loadingMore ? '加载中…' : `加载更多（${items.length}/${total}）`}
              </Button>
            ) : (
              <Typography variant="caption" color="text.disabled">已展示全部 {total} 个岗位</Typography>
            )}
          </Box>
        </>
      )}

      <Dialog open={dialog.open} onClose={dialog.loading ? undefined : () => setDialog((d) => ({ ...d, open: false }))} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>自建岗位</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField label="岗位名称" value={dialog.form.name} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, name: e.target.value } }))} fullWidth autoFocus />
            <TextField label="类别" select value={dialog.form.category} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, category: e.target.value } }))} fullWidth>
              {CATEGORIES.filter((c) => c !== '全部').map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <TextField label="级别" select value={dialog.form.level} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, level: e.target.value } }))} fullWidth>
              {['初级', '中级', '高级'].map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
            </TextField>
            <TextField label="岗位描述" value={dialog.form.description} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, description: e.target.value } }))} fullWidth multiline minRows={2} />
            <TextField label="技能标签" value={dialog.form.skills} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, skills: e.target.value } }))} fullWidth helperText="用逗号分隔，例如：React, TypeScript, 性能优化" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDialog((d) => ({ ...d, open: false }))} disabled={dialog.loading}>取消</Button>
          <Button variant="contained" onClick={submit} disabled={dialog.loading}>{dialog.loading ? '创建中…' : '创建'}</Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
