import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import AppShell from '../components/AppShell';
import { EmptyState, ErrorState, LoadingBlock } from '../components/States';
import SkillRadar from '../components/SkillRadar';
import { api } from '../api';

const LEVEL_COLOR = { 优秀: 'success', 良好: 'primary', 及格: 'warning', 待提升: 'error' };

export default function Radar() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.list('sessions', { page: 1, pageSize: 50 });
        setSessions(res.list || []);
      } catch { /* 下拉加载失败不阻断雷达图 */ }
    })();
  }, []);

  const load = useCallback(async (sid) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.skillRadar(sid ? { session_id: sid } : {});
      setData(res);
    } catch (e) {
      setError(e.message || '技能雷达加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(sessionId); }, [sessionId, load]);

  const dims = (data && data.dimensions) || [];

  return (
    <AppShell
      title="技能雷达"
      subtitle="评分来自每场面试的 skill_assessments 落库结果，按维度聚合"
      actions={
        <TextField
          size="small"
          select
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          sx={{ minWidth: 200 }}
          label="按会话查看"
        >
          <MenuItem value="">全部面试（累计）</MenuItem>
          {sessions.map((s) => (
            <MenuItem key={s.id} value={s.id}>{s.title}</MenuItem>
          ))}
        </TextField>
      }
    >
      {loading ? (
        <LoadingBlock rows={4} height={120} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(sessionId)} />
      ) : dims.length === 0 ? (
        <EmptyState
          icon={<InsightsRoundedIcon sx={{ fontSize: 40 }} />}
          title="还没有可用的技能评分"
          description="完成一场面试并在报告页写入技能评分后，这里会生成雷达图。"
        />
      ) : (
        <Stack spacing={2.4}>
          <Box className="apple-card" sx={{ p: 2.4 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.4} alignItems="center">
              <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
                <SkillRadar dimensions={dims} size={320} />
              </Box>
              <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
              <Stack spacing={1.6} sx={{ flex: 1, width: '100%' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">综合评分</Typography>
                  <Stack direction="row" spacing={1} alignItems="baseline">
                    <Typography sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2 }}>{data.average}</Typography>
                    <Chip size="small" label={data.level} color={LEVEL_COLOR[data.level] || 'default'} />
                  </Stack>
                </Box>
                {data.strongest ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">最强维度</Typography>
                    <Typography sx={{ fontWeight: 600, fontSize: 17 }}>{data.strongest.label} · {data.strongest.score}</Typography>
                  </Box>
                ) : null}
                {data.weakest ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">待提升维度</Typography>
                    <Typography sx={{ fontWeight: 600, fontSize: 17, color: 'warning.main' }}>{data.weakest.label} · {data.weakest.score}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, lineHeight: 1.6 }}>
                      该维度低于其他维度，可到「练习计划」查看对应的强化安排。
                    </Typography>
                  </Box>
                ) : null}
              </Stack>
            </Stack>
          </Box>

          <Stack spacing={1.4}>
            {dims.map((d) => (
              <Box key={d.key} className="apple-card" sx={{ p: 2 }}>
                <Stack direction="row" alignItems="center" spacing={1.4}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography sx={{ fontWeight: 600, fontSize: 16 }}>{d.label}</Typography>
                      <Chip size="small" label={d.level} color={LEVEL_COLOR[d.level] || 'default'} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.4 }}>
                      样本 {d.samples} 次 · 最高 {d.best} · 最低 {d.worst}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{d.score}</Typography>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Stack>
      )}
    </AppShell>
  );
}
