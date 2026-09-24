import { useCallback, useEffect, useState } from 'react';
import {
  Box, Chip, Divider, IconButton, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import AppShell from '../components/AppShell';
import { ErrorState, LoadingBlock } from '../components/States';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

function StatTile({ label, value, hint }) {
  return (
    <Box className="apple-card" sx={{ p: 2, flex: 1, minWidth: 160 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' }}>{value}</Typography>
      {hint ? <Typography variant="caption" color="text.disabled">{hint}</Typography> : null}
    </Box>
  );
}

/** 管理概览：平台统计 + 领域数据 + 用户列表 */
export default function Admin() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [domain, setDomain] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, us, dm] = await Promise.all([api.adminOverview(), api.adminUsers(), api.adminDomainStats()]);
      setOverview(ov || {});
      setUsers(Array.isArray(us) ? us : []);
      setDomain(dm || null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AppShell
      title="管理概览"
      subtitle={`当前登录：${user ? user.nickname || user.username : '—'}（管理员）`}
      actions={<Tooltip title="刷新"><span><IconButton onClick={load} disabled={loading}><RefreshRoundedIcon /></IconButton></span></Tooltip>}
    >
      {loading ? (
        <LoadingBlock rows={5} height={110} />
      ) : error ? (
        <ErrorState
          message={error.status === 403 ? '当前账号没有管理员权限。' : error.message || '加载失败'}
          forbidden={error.status === 403}
          onRetry={error.status === 403 ? undefined : load}
        />
      ) : (
        <Stack spacing={2.4}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <StatTile label="注册用户" value={overview.users ?? 0} />
            <StatTile label="面试会话" value={overview.sessions_total ?? 0} hint={`已评估 ${overview.sessions_evaluated ?? 0} 场`} />
            <StatTile label="对话消息" value={overview.messages_total ?? 0} />
            <StatTile label="评估报告" value={overview.reports_total ?? 0} />
          </Box>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <StatTile label="岗位" value={overview.positions_total ?? 0} />
            <StatTile label="题目" value={overview.questions_total ?? 0} />
            <StatTile label="面试轮次" value={overview.rounds_total ?? 0} />
            <StatTile label="答案分析" value={overview.analyses_total ?? 0} />
            <StatTile label="技能评分" value={overview.skills_total ?? 0} />
            <StatTile label="练习计划" value={overview.plans_total ?? 0} />
          </Box>

          {domain && domain.by_status ? (
            <Box className="apple-card" sx={{ p: 2.2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1.2 }}>会话状态分布</Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                {domain.by_status.map((r) => (
                  <Box key={r.status} className="apple-tag">
                    {{ created: '已创建', in_progress: '进行中', completed: '已完成', evaluated: '已评估' }[r.status] || r.status} · {r.c}
                  </Box>
                ))}
              </Stack>
            </Box>
          ) : null}

          <Box className="apple-card" sx={{ overflow: 'hidden' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2.4, py: 1.8 }}>
              <PeopleAltRoundedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 600, flex: 1 }}>用户列表</Typography>
              <Chip size="small" label={`共 ${users.length} 人`} />
            </Stack>
            <Divider />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>用户名</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>昵称</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>目标岗位</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>角色</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>注册时间</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} hover>
                      <TableCell>{u.id}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{u.username}</TableCell>
                      <TableCell>{u.nickname || '—'}</TableCell>
                      <TableCell>{u.target_role || '—'}</TableCell>
                      <TableCell>
                        <Chip size="small" label={u.role === 'admin' ? '管理员' : '普通用户'} color={u.role === 'admin' ? 'primary' : 'default'} />
                      </TableCell>
                      <TableCell><Typography variant="caption" color="text.secondary">{u.created_at || '—'}</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Stack>
      )}
    </AppShell>
  );
}
