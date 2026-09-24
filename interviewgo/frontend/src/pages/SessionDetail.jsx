import { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Chip, Divider, Stack, Tab, Tabs, Typography,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { EmptyState, ErrorState, LoadingBlock } from '../components/States';
import SkillRadar from '../components/SkillRadar';
import ReportCard from '../components/ReportCard';
import { api } from '../api';
import { useSnackbar } from '../context/SnackbarContext';

const STATUS_LABEL = { created: '已创建', in_progress: '进行中', completed: '已完成', evaluated: '已评估' };
const STATUS_COLOR = { created: 'default', in_progress: 'primary', completed: 'info', evaluated: 'success' };

function scoreColor(n) {
  if (n >= 85) return 'success.main';
  if (n >= 70) return 'primary.main';
  if (n >= 55) return 'warning.main';
  return 'error.main';
}

/** 面试详情：多轮次展示 + 每轮答案分析 + 报告 + 技能雷达 + 练习计划 */
export default function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.sessionDetail(id));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const writeSkills = async () => {
    setBusy('skills');
    try {
      await api.writeSkills(id);
      snackbar.success('技能评分已写入');
      await load();
    } catch (e) {
      snackbar.error(e.message || '写入失败');
    } finally {
      setBusy('');
    }
  };

  const makePlans = async () => {
    setBusy('plans');
    try {
      const res = await api.aiPracticePlan({ session_id: Number(id) });
      snackbar.success(`已生成 ${res.plans.length} 条练习计划`);
      await load();
    } catch (e) {
      snackbar.error(e.message || '生成失败');
    } finally {
      setBusy('');
    }
  };

  const transition = async (to) => {
    setBusy('transition');
    try {
      await api.transitionSession(id, to);
      snackbar.success(`状态已流转到 ${STATUS_LABEL[to]}`);
      await load();
    } catch (e) {
      snackbar.error(e.message || '状态流转失败');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <AppShell title="面试详情" subtitle="加载中…">
        <LoadingBlock rows={5} height={120} />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell title="面试详情">
        <ErrorState
          message={error.status === 403 ? '这场面试不属于你，无权查看。' : error.message || '加载失败'}
          forbidden={error.status === 403}
          onRetry={error.status === 403 ? undefined : load}
        />
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate('/history')}>返回会话历史</Button>
        </Box>
      </AppShell>
    );
  }

  const { session, rounds = [], report, skills = [], plans = [] } = data || {};
  if (!session) {
    return (
      <AppShell title="面试详情">
        <EmptyState title="会话不存在" description="它可能已被删除。" actionLabel="返回会话历史" onAction={() => navigate('/history')} />
      </AppShell>
    );
  }

  const radarDims = skills.map((s) => ({ key: s.dimension_key, label: s.dimension, score: s.score, level: s.level }));

  return (
    <AppShell
      title={session.title}
      subtitle={`${session.role} · ${session.level} · 共 ${rounds.length} 轮`}
      actions={
        <Stack direction="row" spacing={1}>
          <Button startIcon={<ArrowBackRoundedIcon />} onClick={() => navigate(-1)}>返回</Button>
          {session.status === 'created' ? <Button variant="contained" disabled={busy === 'transition'} onClick={() => transition('in_progress')}>开始面试</Button> : null}
          {session.status === 'in_progress' ? <Button variant="contained" disabled={busy === 'transition'} onClick={() => transition('completed')}>结束面试</Button> : null}
          {session.status === 'completed' ? <Button variant="contained" disabled={busy === 'transition'} onClick={() => transition('evaluated')}>标记已评估</Button> : null}
        </Stack>
      }
    >
      {/* 概览 */}
      <Box className="apple-card" sx={{ p: 2.4, mb: 2.4 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.8 }}>
          <Chip size="small" label={STATUS_LABEL[session.status] || session.status} color={STATUS_COLOR[session.status] || 'default'} />
          <Box className="apple-tag">{session.role}</Box>
          <Box className="apple-tag">{session.level}</Box>
          <Typography variant="caption" color="text.secondary">创建于 {session.created_at}</Typography>
        </Stack>
        <Stack direction="row" spacing={3} sx={{ mt: 1.8, flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">总分</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 700, color: scoreColor(session.score || 0) }}>{session.score || '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">轮次</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{rounds.length}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">技能维度</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{skills.length}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">练习计划</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 700 }}>{plans.length}</Typography>
          </Box>
        </Stack>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2.4 }}>
        <Tab label={`轮次与答案分析（${rounds.length}）`} />
        <Tab label="评估报告" />
        <Tab label="技能雷达" />
        <Tab label={`练习计划（${plans.length}）`} />
      </Tabs>

      {tab === 0 ? (
        rounds.length === 0 ? (
          <EmptyState dense title="这场面试还没有轮次记录" description="进入对话区作答后，每轮会自动生成要点分析与评分。" actionLabel="去对话区" onAction={() => navigate('/', { state: { openSessionId: session.id } })} />
        ) : (
          <Stack spacing={1.8}>
            {rounds.map((r) => {
              const a = r.analysis;
              return (
                <Box key={r.id} className="apple-card" sx={{ p: 2.2 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.2 }}>
                    <Chip size="small" label={`第 ${r.round_no} 轮`} color="primary" />
                    <Typography sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{r.question}</Typography>
                    <Typography sx={{ fontWeight: 700, color: scoreColor(r.overall || 0) }}>{r.overall || '—'}</Typography>
                  </Stack>

                  <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 1.4, mb: 1.4 }}>
                    {[['技术准确度', r.tech_score], ['表达清晰度', r.clarity_score], ['深度', r.depth_score]].map(([label, v]) => (
                      <Box key={label}>
                        <Typography variant="caption" color="text.secondary">{label}</Typography>
                        <Typography sx={{ fontWeight: 600, color: scoreColor(v || 0) }}>{v || 0}</Typography>
                      </Box>
                    ))}
                  </Stack>

                  <Box sx={{ bgcolor: 'action.hover', borderRadius: 3, p: 1.6 }}>
                    <Typography variant="caption" color="text.secondary">我的回答</Typography>
                    <Typography variant="body2" sx={{ mt: 0.4, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{r.answer || '（未记录）'}</Typography>
                  </Box>

                  {a ? (
                    <Box sx={{ mt: 1.6 }}>
                      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 0.8 }}>
                        <AutoAwesomeRoundedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>要点分析</Typography>
                        {a.source === 'local' ? <Chip size="small" label="本地规则引擎" sx={{ height: 18, fontSize: 11 }} /> : null}
                      </Stack>
                      <Stack direction="row" spacing={0.6} sx={{ flexWrap: 'wrap', gap: 0.6, mb: 0.8 }}>
                        {(a.hit_points || []).map((p) => (
                          <Chip key={`hit-${p}`} size="small" label={`命中 · ${p}`} color="success" variant="outlined" />
                        ))}
                        {(a.missed_points || []).map((p) => (
                          <Chip key={`miss-${p}`} size="small" label={`遗漏 · ${p}`} color="warning" variant="outlined" />
                        ))}
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{a.comment}</Typography>
                    </Box>
                  ) : null}
                </Box>
              );
            })}
          </Stack>
        )
      ) : null}

      {tab === 1 ? (
        report ? (
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <ReportCard report={{ ...report, source: report.source || 'local' }} sessionId={session.id} onPlans={makePlans} busy={busy} onWriteSkills={writeSkills} />
          </Box>
        ) : (
          <EmptyState dense title="还没有评估报告" description="结束面试后会自动生成报告，也可以在对话区手动触发生成。" actionLabel="去对话区" onAction={() => navigate('/', { state: { openSessionId: session.id } })} />
        )
      ) : null}

      {tab === 2 ? (
        radarDims.length >= 3 ? (
          <Box className="apple-card" sx={{ p: 2.4 }}>
            <SkillRadar dimensions={radarDims} size={340} />
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1}>
              {skills.map((s) => (
                <Stack key={s.id} direction="row" spacing={1.4} alignItems="center">
                  <Typography sx={{ fontWeight: 600, width: 96 }}>{s.dimension}</Typography>
                  <Typography sx={{ fontWeight: 700, color: scoreColor(s.score) }}>{s.score}</Typography>
                  <Chip size="small" label={s.level} />
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>{s.comment}</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        ) : (
          <EmptyState
            dense
            title="还没有技能评分"
            description="写入技能评分后即可生成雷达图，并用于自动生成练习计划。"
            actionLabel={busy === 'skills' ? '写入中…' : '写入技能评分'}
            onAction={report ? writeSkills : undefined}
          />
        )
      ) : null}

      {tab === 3 ? (
        plans.length === 0 ? (
          <EmptyState
            dense
            title="还没有练习计划"
            description="系统会根据低分维度自动生成推荐题目与建议时长。"
            actionLabel={busy === 'plans' ? '生成中…' : '生成练习计划'}
            onAction={makePlans}
          />
        ) : (
          <Stack spacing={1.6}>
            {plans.map((p) => (
              <Box key={p.id} className="apple-card" sx={{ p: 2.2 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.8, flexWrap: 'wrap', gap: 0.6 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: 16 }}>{p.title}</Typography>
                  <Chip size="small" label={p.status === 'done' ? '已完成' : p.status === 'in_progress' ? '进行中' : '待开始'} color={p.status === 'done' ? 'success' : p.status === 'in_progress' ? 'primary' : 'default'} />
                  <Typography variant="caption" color="text.secondary">建议 {p.suggested_minutes} 分钟</Typography>
                  <Typography variant="caption" color="text.secondary">进度 {p.progress}%</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{p.reason}</Typography>
                <Stack spacing={0.6} sx={{ mt: 1.2 }}>
                  {(p.target_questions || []).map((q, i) => (
                    <Stack key={`${p.id}-q-${i}`} direction="row" spacing={1}>
                      <Typography variant="caption" color="text.disabled">{i + 1}.</Typography>
                      <Typography variant="body2">{typeof q === 'string' ? q : q.content}</Typography>
                    </Stack>
                  ))}
                </Stack>
                <Box sx={{ mt: 1.4 }}>
                  <Button size="small" variant="outlined" onClick={() => navigate('/plans')}>去执行计划</Button>
                </Box>
              </Box>
            ))}
          </Stack>
        )
      ) : null}
    </AppShell>
  );
}
