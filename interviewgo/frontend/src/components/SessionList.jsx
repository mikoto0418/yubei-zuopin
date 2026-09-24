import { useState } from 'react';
import {
  Box, Button, Chip, IconButton, InputAdornment, List, ListItemButton, Menu, MenuItem,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddCommentRoundedIcon from '@mui/icons-material/AddCommentRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingBlock, NoResults } from './States';
import { useChat } from '../context/ChatContext';

const STATUS_LABEL = { created: '已创建', in_progress: '进行中', completed: '已完成', evaluated: '已评估' };
const STATUS_COLOR = { created: 'default', in_progress: 'primary', completed: 'info', evaluated: 'success' };
const FILTERS = [
  { k: '', label: '全部' },
  { k: 'created', label: '已创建' },
  { k: 'in_progress', label: '进行中' },
  { k: 'completed', label: '已完成' },
  { k: 'evaluated', label: '已评估' },
];

function relTime(v) {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return d.toLocaleDateString('zh-CN');
}

export default function SessionList({ onNewSession, onEditSession }) {
  const navigate = useNavigate();
  const {
    sessions, sessionsLoading, sessionsError, sessionTotal, current,
    openSession, loadSessions, loadMoreSessions, deleteSession, busy,
  } = useChat();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [menu, setMenu] = useState({ anchor: null, session: null });

  const search = () => loadSessions({ page: 1, q, status });
  const reset = () => {
    setQ('');
    setStatus('');
    loadSessions({ page: 1, q: '', status: '' });
  };

  const handleDelete = async () => {
    const s = menu.session;
    setMenu({ anchor: null, session: null });
    if (!s) return;
    if (!window.confirm(`确定删除会话「${s.title}」吗？对话记录与报告将一并移除。`)) return;
    try {
      await deleteSession(s.id);
    } catch (e) {
      window.alert(e.message || '删除失败');
    }
  };

  const filtering = Boolean(q || status);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 1.5, pb: 1 }}>
        <Button fullWidth variant="contained" startIcon={<AddCommentRoundedIcon />} onClick={onNewSession} sx={{ py: 1 }}>
          新建面试会话
        </Button>
      </Box>

      <Box sx={{ px: 1.5, pb: 1 }}>
        <TextField
          size="small"
          fullWidth
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="搜索会话标题或岗位"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
        />
        <Stack direction="row" spacing={0.6} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.6 }}>
          {FILTERS.map((t) => (
            <Chip
              key={t.k || 'all'}
              size="small"
              label={t.label}
              color={status === t.k ? 'primary' : 'default'}
              onClick={() => {
                setStatus(t.k);
                loadSessions({ page: 1, q, status: t.k });
              }}
            />
          ))}
        </Stack>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {sessionsLoading && sessions.length === 0 ? (
          <LoadingBlock rows={5} height={62} gap={1} />
        ) : sessionsError ? (
          <ErrorState dense message={sessionsError} onRetry={search} />
        ) : sessions.length === 0 ? (
          filtering ? (
            <NoResults keyword={q} onReset={reset} />
          ) : (
            <EmptyState
              dense
              icon={<ForumRoundedIcon sx={{ fontSize: 40 }} />}
              title="还没有面试会话"
              description="新建一个会话，选择目标岗位与级别，AI 面试官会立刻开始提问。"
              actionLabel="新建面试会话"
              onAction={onNewSession}
            />
          )
        ) : (
          <>
            <List dense disablePadding sx={{ px: 1 }}>
              {sessions.map((s) => {
                const active = current && current.id === s.id;
                return (
                  <ListItemButton
                    key={s.id}
                    selected={active}
                    onClick={() => openSession(s)}
                    sx={{
                      mb: 0.6,
                      alignItems: 'flex-start',
                      bgcolor: active ? 'action.selected' : 'transparent',
                      '&.Mui-selected': { bgcolor: 'action.selected' },
                      '&.Mui-selected:hover': { bgcolor: 'action.selected' },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={0.6}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {s.title}
                        </Typography>
                        <Chip size="small" label={STATUS_LABEL[s.status] || s.status} color={STATUS_COLOR[s.status] || 'default'} sx={{ height: 20, fontSize: 11 }} />
                      </Stack>
                      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 0.4 }}>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {s.role} · {s.level}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">{s.round_count || 0} 轮</Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>{relTime(s.created_at)}</Typography>
                      </Stack>
                    </Box>
                    <Tooltip title="更多操作">
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setMenu({ anchor: e.currentTarget, session: s }); }}
                        sx={{ ml: 0.4 }}
                      >
                        <MoreVertRoundedIcon sx={{ fontSize: 17 }} />
                      </IconButton>
                    </Tooltip>
                  </ListItemButton>
                );
              })}
            </List>

            <Box sx={{ textAlign: 'center', py: 1.4 }}>
              {sessions.length < sessionTotal ? (
                <Button size="small" onClick={loadMoreSessions} disabled={sessionsLoading}>
                  {sessionsLoading ? '加载中…' : `加载更多（${sessions.length}/${sessionTotal}）`}
                </Button>
              ) : (
                <Typography variant="caption" color="text.disabled">共 {sessionTotal} 个会话</Typography>
              )}
            </Box>
          </>
        )}
      </Box>

      <Menu anchorEl={menu.anchor} open={Boolean(menu.anchor)} onClose={() => setMenu({ anchor: null, session: null })}>
        <MenuItem onClick={() => { const s = menu.session; setMenu({ anchor: null, session: null }); if (s) navigate(`/sessions/${s.id}`); }}>
          <OpenInNewRoundedIcon fontSize="small" sx={{ mr: 1 }} /> 查看详情
        </MenuItem>
        <MenuItem onClick={() => { const s = menu.session; setMenu({ anchor: null, session: null }); if (s) onEditSession(s); }}>
          <EditRoundedIcon fontSize="small" sx={{ mr: 1 }} /> 编辑会话
        </MenuItem>
        <MenuItem onClick={handleDelete} disabled={busy !== 'idle'} sx={{ color: 'error.main' }}>
          <DeleteOutlineRoundedIcon fontSize="small" sx={{ mr: 1 }} /> 删除会话
        </MenuItem>
      </Menu>
    </Box>
  );
}
