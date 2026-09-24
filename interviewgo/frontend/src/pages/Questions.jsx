import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { useLocation } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { EmptyState, ErrorState, LoadingBlock, NoResults } from '../components/States';
import { api } from '../api';
import { useSnackbar } from '../context/SnackbarContext';

const PAGE_SIZE = 10;
const DIFFICULTIES = ['简单', '中等', '困难'];

export default function Questions() {
  const location = useLocation();
  const snackbar = useSnackbar();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [positions, setPositions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ q: '', position_id: location.state?.positionId || '', category_id: '', difficulty: '', mine: '' });
  const [expanded, setExpanded] = useState(null);
  const [dialog, setDialog] = useState({ open: false, loading: false, form: { content: '', reference_answer: '', key_points: '', difficulty: '中等', position_id: '', category_id: '' } });

  useEffect(() => {
    (async () => {
      try {
        const [p, c] = await Promise.all([api.positions({ page: 1, pageSize: 100 }), api.categories({ page: 1, pageSize: 100 })]);
        setPositions(p.list || []);
        setCategories(c.list || []);
      } catch { /* 筛选器加载失败不阻断主列表 */ }
    })();
  }, []);

  const load = useCallback(async ({ nextPage = 1, append = false, f = filters } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      const data = await api.bank({ page: nextPage, pageSize: PAGE_SIZE, ...f });
      setItems((prev) => (append ? [...prev, ...(data.list || [])] : data.list || []));
      setTotal(data.total || 0);
      setPage(nextPage);
    } catch (e) {
      setError(e.message || '题库加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters]);

  useEffect(() => { load({ nextPage: 1 }); /* eslint-disable-next-line */ }, []);

  const setF = (k) => (v) => { const next = { ...filters, [k]: v }; setFilters(next); load({ nextPage: 1, f: next }); };

  const submit = async () => {
    const f = dialog.form;
    if (!f.content.trim()) { snackbar.error('请填写题干'); return; }
    setDialog((d) => ({ ...d, loading: true }));
    try {
      await api.createQuestion({
        content: f.content.trim(),
        reference_answer: f.reference_answer,
        key_points: f.key_points.split(/[,，、\n]+/).map((s) => s.trim()).filter(Boolean),
        difficulty: f.difficulty,
        position_id: f.position_id || null,
        category_id: f.category_id || null,
      });
      snackbar.success('题目已创建');
      setDialog((d) => ({ ...d, open: false }));
      load({ nextPage: 1 });
    } catch (e) {
      snackbar.error(e.message || '创建失败');
      setDialog((d) => ({ ...d, loading: false }));
    }
  };

  const isFiltering = Boolean(filters.q || filters.position_id || filters.category_id || filters.difficulty || filters.mine);

  return (
    <AppShell
      title="题库"
      subtitle={`共 ${total} 道题 · 按岗位与分类筛选，支持自建`}
      actions={<Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDialog({ open: true, loading: false, form: { content: '', reference_answer: '', key_points: '', difficulty: '中等', position_id: filters.position_id || '', category_id: filters.category_id || '' } })}>自建题</Button>}
    >
      <Stack spacing={1.2} sx={{ mb: 2.4 }}>
        <TextField size="small" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && load({ nextPage: 1 })} placeholder="搜索题干" sx={{ maxWidth: 420 }} />
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <TextField size="small" select label="岗位" value={filters.position_id} onChange={(e) => setF('position_id')(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">全部岗位</MenuItem>
            {positions.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField size="small" select label="分类" value={filters.category_id} onChange={(e) => setF('category_id')(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="">全部分类</MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}（{c.kind}）</MenuItem>)}
          </TextField>
          <TextField size="small" select label="难度" value={filters.difficulty} onChange={(e) => setF('difficulty')(e.target.value)} sx={{ minWidth: 120 }}>
            <MenuItem value="">全部难度</MenuItem>
            {DIFFICULTIES.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
          <Chip label="只看自建题" color={filters.mine === '1' ? 'primary' : 'default'} onClick={() => setF('mine')(filters.mine === '1' ? '' : '1')} />
          {isFiltering ? <Chip label="重置筛选" variant="outlined" onClick={() => { const next = { q: '', position_id: '', category_id: '', difficulty: '', mine: '' }; setFilters(next); load({ nextPage: 1, f: next }); }} /> : null}
        </Stack>
      </Stack>

      {loading ? (
        <LoadingBlock rows={6} height={96} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load({ nextPage: 1 })} />
      ) : items.length === 0 ? (
        isFiltering
          ? <NoResults keyword={filters.q} onReset={() => { const next = { q: '', position_id: '', category_id: '', difficulty: '', mine: '' }; setFilters(next); load({ nextPage: 1, f: next }); }} />
          : <EmptyState icon={<MenuBookOutlinedIcon sx={{ fontSize: 40 }} />} title="题库还没有内容" description="创建一个自定义题目开始积累。" actionLabel="自建题" onAction={() => setDialog((d) => ({ ...d, open: true }))} />
      ) : (
        <>
          <Stack spacing={1.4}>
            {items.map((it) => {
              const open = expanded === it.id;
              return (
                <Box key={it.id} className="apple-card" sx={{ p: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 16, lineHeight: 1.5 }}>{it.content}</Typography>
                      <Stack direction="row" spacing={0.8} sx={{ mt: 0.8, flexWrap: 'wrap', gap: 0.6 }}>
                        {it.position_name ? <Box className="apple-tag">{it.position_name}</Box> : null}
                        {it.category_name ? <Box className="apple-tag">{it.category_name}</Box> : null}
                        <Box className="apple-tag">{it.difficulty}</Box>
                        {it.is_builtin ? null : <Box className="apple-tag" sx={{ color: 'primary.main' }}>自建</Box>}
                      </Stack>
                    </Box>
                    <Button size="small" variant="text" onClick={() => setExpanded(open ? null : it.id)}>{open ? '收起' : '展开'}</Button>
                  </Stack>
                  {open ? (
                    <Stack spacing={1.2} sx={{ mt: 1.6, pt: 1.6, borderTop: '1px solid', borderColor: 'divider' }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">参考答案</Typography>
                        <Typography variant="body2" sx={{ mt: 0.4, lineHeight: 1.7 }}>{it.reference_answer || '暂未提供参考答案'}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">关键要点</Typography>
                        <Stack direction="row" spacing={0.6} sx={{ mt: 0.6, flexWrap: 'wrap', gap: 0.6 }}>
                          {(it.key_points || []).length ? it.key_points.map((k) => <Box key={k} className="apple-tag">{k}</Box>) : <Typography variant="body2" color="text.disabled">暂无要点</Typography>}
                        </Stack>
                      </Box>
                      {!it.is_builtin ? (
                        <Stack direction="row" spacing={1}>
                          <Button size="small" variant="outlined" onClick={() => setDialog({ open: true, loading: false, editId: it.id, form: { content: it.content, reference_answer: it.reference_answer || '', key_points: (it.key_points || []).join(', '), difficulty: it.difficulty, position_id: it.position_id || '', category_id: it.category_id || '' } })}>编辑</Button>
                          <Button size="small" variant="text" color="error" onClick={async () => { if (!window.confirm('确定删除该题目吗？')) return; try { await api.removeQuestion(it.id); snackbar.success('已删除'); load({ nextPage: 1 }); } catch (e) { snackbar.error(e.message || '删除失败'); } }}>删除</Button>
                        </Stack>
                      ) : null}
                    </Stack>
                  ) : null}
                </Box>
              );
            })}
          </Stack>
          <Box sx={{ textAlign: 'center', pt: 3 }}>
            {items.length < total ? (
              <Button variant="outlined" disabled={loadingMore} onClick={() => load({ nextPage: page + 1, append: true })}>{loadingMore ? '加载中…' : `加载更多（${items.length}/${total}）`}</Button>
            ) : (
              <Typography variant="caption" color="text.disabled">已展示全部 {total} 道题</Typography>
            )}
          </Box>
        </>
      )}

      <Dialog open={dialog.open} onClose={dialog.loading ? undefined : () => setDialog((d) => ({ ...d, open: false }))} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>{dialog.editId ? '编辑题目' : '自建题目'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField label="题干" value={dialog.form.content} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, content: e.target.value } }))} fullWidth multiline minRows={2} autoFocus />
            <Stack direction="row" spacing={1.4}>
              <TextField label="岗位" select value={dialog.form.position_id} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, position_id: e.target.value } }))} fullWidth>
                <MenuItem value="">不指定</MenuItem>
                {positions.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </TextField>
              <TextField label="分类" select value={dialog.form.category_id} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, category_id: e.target.value } }))} fullWidth>
                <MenuItem value="">不指定</MenuItem>
                {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField label="难度" select value={dialog.form.difficulty} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, difficulty: e.target.value } }))} fullWidth>
              {DIFFICULTIES.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
            <TextField label="参考答案" value={dialog.form.reference_answer} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, reference_answer: e.target.value } }))} fullWidth multiline minRows={3} />
            <TextField label="关键要点" value={dialog.form.key_points} onChange={(e) => setDialog((d) => ({ ...d, form: { ...d.form, key_points: e.target.value } }))} fullWidth helperText="用逗号或换行分隔" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDialog((d) => ({ ...d, open: false }))} disabled={dialog.loading}>取消</Button>
          <Button
            variant="contained"
            disabled={dialog.loading}
            onClick={async () => {
              if (dialog.editId) {
                setDialog((d) => ({ ...d, loading: true }));
                try {
                  await api.updateQuestion(dialog.editId, {
                    content: dialog.form.content,
                    reference_answer: dialog.form.reference_answer,
                    key_points: dialog.form.key_points.split(/[,，、\n]+/).map((s) => s.trim()).filter(Boolean),
                    difficulty: dialog.form.difficulty,
                    position_id: dialog.form.position_id || null,
                    category_id: dialog.form.category_id || null,
                  });
                  snackbar.success('已保存');
                  setDialog((d) => ({ ...d, open: false, loading: false }));
                  load({ nextPage: 1 });
                } catch (e) { snackbar.error(e.message || '保存失败'); setDialog((d) => ({ ...d, loading: false })); }
              } else {
                submit();
              }
            }}
          >
            {dialog.loading ? '保存中…' : dialog.editId ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
