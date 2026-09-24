import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { EmptyState, ErrorState, LoadingBlock, NoResults } from '../components/States';
import { api } from '../api';

const PAGE_SIZE = 8;
const STATUS_LABEL = { created: '已创建', in_progress: '进行中', completed: '已完成', evaluated: '已评估' };
const STATUS_COLOR = { created: 'default', in_progress: 'primary', completed: 'info', evaluated: 'success' };
const FILTERS = [
  { k: '', label: '全部' },
  { k: 'created', label: '已创建' },
  { k: 'in_progress', label: '进行中' },
  { k: 'completed', label: '已完成' },
  { k: 'evaluated', label: '已评估' },
];

function fmt(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function scoreColor(n) {
  if (n >= 85) return 'success.main';
  if (n >= 70) return 'primary.main';
  if (n >= 55) return 'warning.main';
  return 'error.main';
}

/** 会话历史：回看历次面试，支持按状态筛选与关键字搜索 */
export default function History() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(
    async ({ nextPage = 1, append = false, keyword = q, st = status } = {}) => {
      if (append) setLoadingMore(true); else setLoading(true);
      setError('');
      try {
        const data = await api.list('sessions', { page: nextPage, pageSize: PAGE_SIZE, q: keyword, status: st });
        setItems((prev) => (append ? [...prev, ...(data.list || [])] : data.list || []));
        setTotal(data.total || 0);
        setPage(nextPage);
      } catch (e) {
        setError(e.message || '加载失败');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [q, status],
  );

  useEffect(() => { load({ nextPage: 1 }); /* eslint-disable-next-line */ }, []);

  const filtering = Boolean(q || status);

  return (
    <AppShell title="会话历史" subtitle={`共 ${total} 场面试记录 · 点击进入详情查看多轮次与答案分析`}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.4} sx={{ mb: 2.4, flexWrap: 'wrap', gap: 1 }}>
        <TextField
          size="small"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load({ nextPage: 1 })}
          placeholder="搜索标题或岗位"
          sx={{ flex: 1, maxWidth: 320 }}
        />
        <TextField size="small" select label="状态" value={status} onChange={(e) => { setStatus(e.target.value); load({ nextPage: 1, st: e.target.value }); }} sx={{ minWidth: 140 }}>
          {FILTERS.map((t) => <MenuItem key={t.k || 'all'} value={t.k}>{t.label}</MenuItem>)}
        </TextField>
        <Button variant="outlined" onClick={() => load({ nextPage: 1 })}>搜索</Button>
      </Stack>

      {loading ? (
        <LoadingBlock rows={5} height={104} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load({ nextPage: 1 })} />
      ) : items.length === 0 ? (
        filtering ? (
          <NoResults keyword={q} onReset={() => { setQ(''); setStatus(''); load({ nextPage: 1, keyword: '', st: '' }); }} />
        ) : (
          <EmptyState
            icon={<HistoryRoundedIcon sx={{ fontSize: 40 }} />}
            title="还没有面试记录"
            description="去对话区开启第一场 AI 模拟面试吧。"
            actionLabel="返回对话"
            onAction={() => navigate('/')}
          />
        )
      ) : (
        <>
          <Stack spacing={1.6}>
            {items.map((s) => (
              <Box
                key={s.id}
                className="apple-card"
                onClick={() => navigate(`/sessions/${s.id}`)}
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  transition: 'transform var(--dur-fast) var(--ease-standard)',
                  '&:hover': { transform: 'translateY(-2px)' },
                }}
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.6, flexWrap: 'wrap', gap: 0.6 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 17 }} noWrap>{s.title}</Typography>
                      <Chip size="small" label={STATUS_LABEL[s.status] || s.status} color={STATUS_COLOR[s.status] || 'default'} />
                    </Stack>
                    <Stack direction="row" spacing={1.4} sx={{ flexWrap: 'wrap', gap: 0.8 }}>
                      <Typography variant="caption" color="text.secondary">岗位：{s.role}</Typography>
                      <Typography variant="caption" color="text.secondary">级别：{s.level}</Typography>
                      <Stack direction="row" spacing={0.4} alignItems="center">
                        <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                        <Typography variant="caption" color="text.secondary">{s.round_count || 0} 轮</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.disabled">{fmt(s.created_at)}</Typography>
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={1.4} alignItems="center">
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" color="text.secondary">总分</Typography>
                      <Typography sx={{ fontSize: 22, fontWeight: 700, color: scoreColor(s.score || 0) }}>
                        {s.score || '—'}
                      </Typography>
                    </Box>
                    <OpenInNewRoundedIcon sx={{ color: 'text.disabled', fontSize: 18 }} />
                  </Stack>
                </Stack>
                {s.status === 'evaluated' ? (
                  <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mt: 1.4, pt: 1.2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <AssessmentOutlinedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.secondary">已完成评估，可查看技能雷达与练习计划</Typography>
                  </Stack>
                ) : null}
              </Box>
            ))}
          </Stack>
          <Box sx={{ textAlign: 'center', pt: 3 }}>
            {items.length < total ? (
              <Button variant="outlined" disabled={loadingMore} onClick={() => load({ nextPage: page + 1, append: true })}>
                {loadingMore ? '加载中…' : `加载更多（${items.length}/${total}）`}
              </Button>
            ) : (
              <Typography variant="caption" color="text.disabled">已展示全部 {total} 条记录</Typography>
            )}
          </Box>
        </>
      )}
    </AppShell>
  );
}
