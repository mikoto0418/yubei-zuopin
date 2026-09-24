import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Chip, LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import PlaylistAddCheckRoundedIcon from '@mui/icons-material/PlaylistAddCheckRounded';
import AppShell from '../components/AppShell';
import { EmptyState, ErrorState, LoadingBlock } from '../components/States';
import { api } from '../api';
import { useSnackbar } from '../context/SnackbarContext';

const PAGE_SIZE = 8;
const STATUS_LABEL = { pending: '待开始', in_progress: '进行中', done: '已完成' };
const STATUS_COLOR = { pending: 'default', in_progress: 'primary', done: 'success' };
const NEXT_STATUS = { pending: 'in_progress', in_progress: 'done' };

export default function Plans() {
  const snackbar = useSnackbar();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async ({ nextPage = 1, append = false, st = status } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      const data = await api.plans({ page: nextPage, pageSize: PAGE_SIZE, status: st });
      setItems((prev) => (append ? [...prev, ...(data.list || [])] : data.list || []));
      setTotal(data.total || 0);
      setPage(nextPage);
    } catch (e) {
      setError(e.message || '练习计划加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [status]);

  useEffect(() => { load({ nextPage: 1 }); /* eslint-disable-next-line */ }, []);

  const updateProgress = async (plan, nextProgress, forcedStatus) => {
    setBusyId(plan.id);
    try {
      const updated = await api.updatePlanProgress(plan.id, forcedStatus ? { progress: nextProgress, status: forcedStatus } : { progress: nextProgress });
      setItems((prev) => prev.map((p) => (p.id === plan.id ? { ...p, ...updated, target_questions: updated.target_questions ? JSON.parse(updated.target_questions) : p.target_questions } : p)));
      snackbar.success(`进度已更新到 ${updated.progress}%`);
    } catch (e) {
      snackbar.error(e.message || '更新失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell
      title="练习计划"
      subtitle={`共 ${total} 条计划 · 由弱项维度自动生成，完成后回写进度`}
    >
      <Stack direction="row" spacing={0.8} sx={{ mb: 2.4, flexWrap: 'wrap', gap: 0.8 }}>
        {[{ k: '', label: '全部' }, { k: 'pending', label: '待开始' }, { k: 'in_progress', label: '进行中' }, { k: 'done', label: '已完成' }].map((t) => (
          <Chip
            key={t.k || 'all'}
            label={t.label}
            color={status === t.k ? 'primary' : 'default'}
            onClick={() => { setStatus(t.k); load({ nextPage: 1, st: t.k }); }}
          />
        ))}
      </Stack>

      {loading ? (
        <LoadingBlock rows={5} height={130} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load({ nextPage: 1 })} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<PlaylistAddCheckRoundedIcon sx={{ fontSize: 40 }} />}
          title={status ? `没有${STATUS_LABEL[status]}的计划` : '还没有练习计划'}
          description="完成一场面试并在报告页生成练习计划，系统会按低分维度自动安排题目与时长。"
        />
      ) : (
        <>
          <Stack spacing={1.8}>
            {items.map((p) => {
              const questions = Array.isArray(p.target_questions) ? p.target_questions : [];
              const nextStatus = NEXT_STATUS[p.status];
              return (
                <Box key={p.id} className="apple-card" sx={{ p: 2.2 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.4} alignItems={{ sm: 'center' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.6 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: 17 }}>{p.title}</Typography>
                        <Chip size="small" label={STATUS_LABEL[p.status] || p.status} color={STATUS_COLOR[p.status] || 'default'} />
                        {p.dimension ? <Box className="apple-tag">{p.dimension}</Box> : null}
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8, lineHeight: 1.7 }}>
                        {p.reason || '针对弱项维度生成的专项练习。'}
                      </Typography>
                      <Stack direction="row" spacing={1.4} sx={{ mt: 0.8, flexWrap: 'wrap', gap: 0.8 }}>
                        <Typography variant="caption" color="text.secondary">建议时长：{p.suggested_minutes} 分钟</Typography>
                        {p.due_date ? <Typography variant="caption" color="text.secondary">截止：{String(p.due_date).slice(0, 10)}</Typography> : null}
                      </Stack>
                    </Box>
                  </Stack>

                  <Box sx={{ mt: 1.8 }}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.6 }}>
                      <Typography variant="caption" color="text.secondary">执行进度</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>{p.progress}%</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={Math.min(100, p.progress || 0)} sx={{ height: 8 }} />
                  </Box>

                  {questions.length ? (
                    <Stack spacing={0.8} sx={{ mt: 1.8, pt: 1.6, borderTop: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary">推荐练习题目</Typography>
                      {questions.map((q, i) => (
                        <Stack key={`${p.id}-${i}`} direction="row" spacing={1} alignItems="flex-start">
                          <Typography variant="caption" color="text.disabled" sx={{ pt: 0.2 }}>{i + 1}.</Typography>
                          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{typeof q === 'string' ? q : q.content}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                  ) : null}

                  <Stack direction="row" spacing={1} sx={{ mt: 1.8, flexWrap: 'wrap', gap: 1 }}>
                    <Button size="small" variant="outlined" disabled={busyId === p.id || p.progress <= 0} onClick={() => updateProgress(p, Math.max(0, p.progress - 20))}>-20%</Button>
                    <Button size="small" variant="outlined" disabled={busyId === p.id || p.progress >= 100} onClick={() => updateProgress(p, Math.min(100, p.progress + 20))}>+20%</Button>
                    {nextStatus ? (
                      <Button size="small" variant="contained" disabled={busyId === p.id} onClick={() => updateProgress(p, nextStatus === 'done' ? 100 : Math.max(p.progress, 10), nextStatus)}>
                        {nextStatus === 'in_progress' ? '开始执行' : '标记完成'}
                      </Button>
                    ) : (
                      <Chip label="已完成" color="success" />
                    )}
                    <Button
                      size="small"
                      variant="text"
                      color="error"
                      disabled={busyId === p.id}
                      onClick={async () => {
                        if (!window.confirm('删除该练习计划？')) return;
                        try {
                          await api.removePlan(p.id);
                          snackbar.success('已删除');
                          load({ nextPage: 1 });
                        } catch (e) {
                          snackbar.error(e.message || '删除失败');
                        }
                      }}
                    >
                      删除
                    </Button>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
          <Box sx={{ textAlign: 'center', pt: 3 }}>
            {items.length < total ? (
              <Button variant="outlined" disabled={loadingMore} onClick={() => load({ nextPage: page + 1, append: true })}>{loadingMore ? '加载中…' : `加载更多（${items.length}/${total}）`}</Button>
            ) : (
              <Typography variant="caption" color="text.disabled">已展示全部 {total} 条计划</Typography>
            )}
          </Box>
        </>
      )}
    </AppShell>
  );
}
