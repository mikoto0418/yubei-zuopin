import { useCallback, useEffect, useState } from 'react';
import {
  Avatar, Box, Button, Chip, Divider, Drawer, IconButton, Menu, MenuItem, Snackbar, Alert,
  Stack, Toolbar, Tooltip, Typography, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

import SessionList from '../components/SessionList';
import SessionDialog from '../components/SessionDialog';
import MessageBubble from '../components/MessageBubble';
import Composer from '../components/Composer';
import { EmptyState, ErrorState, InlineLoading, TypingIndicator } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useSnackbar } from '../context/SnackbarContext';

const SIDEBAR_WIDTH = 288;
const STATUS_LABEL = { created: '已创建', in_progress: '进行中', completed: '已完成', evaluated: '已评估' };

export default function Chat() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const snackbar = useSnackbar();
  const { user, logout } = useAuth();
  const {
    sessions, openSession, current, messages, messagesLoading, messagesError,
    busy, stream, skipTyping, reloadMessages, createSession, sendAnswer, regenerate,
    endInterview, updateSession, setCurrent, positions,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [dialog, setDialog] = useState({ open: false, mode: 'create', initial: null });
  const [dialogLoading, setDialogLoading] = useState(false);
  const [userMenu, setUserMenu] = useState(null);
  const [endOpen, setEndOpen] = useState(false);

  useEffect(() => { setSidebarOpen(!isMobile); }, [isMobile]);

  // 新消息或流式输出时保持滚动到底部
  useEffect(() => {
    const el = document.getElementById('ig-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, stream.text, busy]);

  // 从其它页面跳回时打开指定会话 / 用指定岗位新建
  useEffect(() => {
    const state = location.state || {};
    if (state.openSessionId && sessions.length) {
      const target = sessions.find((s) => s.id === state.openSessionId);
      if (target && (!current || current.id !== target.id)) openSession(target);
      navigate(location.pathname, { replace: true, state: null });
    } else if (state.newSessionPositionId && positions.length) {
      const p = positions.find((x) => x.id === state.newSessionPositionId);
      if (p) {
        setDialog({ open: true, mode: 'create', initial: { role: p.name, level: p.level, position_id: p.id, title: `${p.name}${p.level}模拟面试` } });
      }
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, sessions, positions]);

  const canRegenerate = busy === 'idle' && current && current.status !== 'evaluated';

  const handleNewSession = useCallback(() => setDialog({ open: true, mode: 'create', initial: null }), []);
  const handleEditSession = useCallback((session) => setDialog({ open: true, mode: 'edit', initial: session }), []);

  const submitDialog = useCallback(
    async (payload) => {
      setDialogLoading(true);
      try {
        if (dialog.mode === 'create') {
          setDialog((d) => ({ ...d, open: false }));
          if (isMobile) setSidebarOpen(false);
          await createSession(payload);
          snackbar.success('面试已开始，AI 面试官正在提问');
        } else {
          await updateSession(dialog.initial.id, payload);
          setDialog((d) => ({ ...d, open: false }));
          snackbar.success('会话信息已保存');
        }
      } catch (e) {
        snackbar.error(e.message || '操作失败');
      } finally {
        setDialogLoading(false);
      }
    },
    [dialog, createSession, updateSession, snackbar, isMobile],
  );

  const handleSend = useCallback(
    async (text) => {
      try {
        await sendAnswer(text);
      } catch (e) {
        snackbar.error(e.message || '发送失败，请重试');
      }
    },
    [sendAnswer, snackbar],
  );

  const handleRegenerate = useCallback(
    async (message) => {
      try {
        await regenerate(message);
      } catch (e) {
        snackbar.error(e.message || '重新生成失败');
      }
    },
    [regenerate, snackbar],
  );

  const handleEnd = useCallback(async () => {
    setEndOpen(false);
    try {
      const report = await endInterview();
      if (report) {
        snackbar.success(`评估完成，总分 ${report.overall} 分${report.plans && report.plans.length ? `，已生成 ${report.plans.length} 条练习计划` : ''}`);
      }
    } catch (e) {
      snackbar.error(e.message || '生成评估报告失败');
    }
  }, [endInterview, snackbar]);

  const handleLogout = () => { setUserMenu(null); logout(); navigate('/login', { replace: true }); };

  const sidebar = (
    <Box sx={{ width: SIDEBAR_WIDTH, height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.6 }}>
        <Avatar sx={{ width: 30, height: 30, bgcolor: 'primary.main', fontSize: 13 }}>IG</Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>InterviewGo</Typography>
          <Typography variant="caption" color="text.secondary">AI 模拟面试与能力评估</Typography>
        </Box>
        {!isMobile ? (
          <Tooltip title="收起会话列表">
            <IconButton size="small" onClick={() => setSidebarOpen(false)}>
              <ChevronLeftRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
      <Divider />
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <SessionList onNewSession={handleNewSession} onEditSession={handleEditSession} />
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      {!isMobile ? (
        <Box sx={{ width: sidebarOpen ? SIDEBAR_WIDTH : 0, transition: 'width 250ms cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden', flexShrink: 0, borderRight: sidebarOpen ? '1px solid' : 'none', borderColor: 'divider' }}>
          {sidebar}
        </Box>
      ) : (
        <Drawer open={sidebarOpen} onClose={() => setSidebarOpen(false)}>{sidebar}</Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏：毛玻璃（Apple 规范中唯一允许的悬浮层材质） */}
        <Box className="apple-glass" sx={{ borderBottom: '1px solid', borderColor: 'divider', zIndex: 5 }}>
          <Toolbar variant="dense" sx={{ gap: 1, minHeight: 60, px: { xs: 1.5, md: 2.5 } }}>
            <IconButton edge="start" onClick={() => setSidebarOpen((v) => !v)} sx={{ mr: 0.5 }}>
              <MenuRoundedIcon />
            </IconButton>

            {current ? (
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 17, lineHeight: 1.3 }} noWrap>{current.title}</Typography>
                <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 0.2 }}>
                  <Chip size="small" label={STATUS_LABEL[current.status] || current.status} color="primary" sx={{ height: 19, fontSize: 11 }} />
                  <Typography variant="caption" color="text.secondary">{current.role} · {current.level}</Typography>
                  <Typography variant="caption" color="text.disabled">第 {current.round_count || 0} 轮</Typography>
                  {current.score ? <Chip size="small" color="success" label={`总分 ${current.score}`} sx={{ height: 19, fontSize: 11 }} /> : null}
                </Stack>
              </Box>
            ) : (
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 17 }}>对话区</Typography>
                <Typography variant="caption" color="text.secondary">从左侧选择一个会话，或新建面试</Typography>
              </Box>
            )}

            {current ? (
              <Tooltip title="查看详情（多轮次与答案分析）">
                <IconButton onClick={() => navigate(`/sessions/${current.id}`)}>
                  <OpenInNewRoundedIcon />
                </IconButton>
              </Tooltip>
            ) : null}

            {current && current.status !== 'evaluated' && current.status !== 'completed' && messages.length > 0 ? (
              <Button variant="outlined" color="warning" size="small" disabled={busy !== 'idle'} onClick={() => setEndOpen(true)}>
                结束面试
              </Button>
            ) : null}

            <Tooltip title="技能雷达"><IconButton component={RouterLink} to="/radar"><InsightsRoundedIcon /></IconButton></Tooltip>
            <Tooltip title="会话历史"><IconButton component={RouterLink} to="/history"><HistoryRoundedIcon /></IconButton></Tooltip>
            <Tooltip title={user ? `${user.nickname || user.username}（${user.role === 'admin' ? '管理员' : '用户'}）` : '账户'}>
              <IconButton onClick={(e) => setUserMenu(e.currentTarget)}>
                <Avatar sx={{ width: 30, height: 30, bgcolor: 'primary.main', fontSize: 13 }}>
                  {(user && (user.nickname || user.username || 'U').slice(0, 1)) || 'U'}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu anchorEl={userMenu} open={Boolean(userMenu)} onClose={() => setUserMenu(null)}>
              <MenuItem disabled sx={{ opacity: '1 !important' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{user ? user.nickname || user.username : '未登录'}</Typography>
              </MenuItem>
              <Divider />
              <MenuItem component={RouterLink} to="/history" onClick={() => setUserMenu(null)}><HistoryRoundedIcon fontSize="small" sx={{ mr: 1 }} /> 会话历史</MenuItem>
              <MenuItem component={RouterLink} to="/radar" onClick={() => setUserMenu(null)}><InsightsRoundedIcon fontSize="small" sx={{ mr: 1 }} /> 技能雷达</MenuItem>
              {user && user.role === 'admin' ? (
                <MenuItem component={RouterLink} to="/admin" onClick={() => setUserMenu(null)}><DashboardRoundedIcon fontSize="small" sx={{ mr: 1 }} /> 管理概览</MenuItem>
              ) : null}
              <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}><LogoutRoundedIcon fontSize="small" sx={{ mr: 1 }} /> 退出登录</MenuItem>
            </Menu>
          </Toolbar>
        </Box>

        <Box id="ig-scroll" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', py: 2.4 }}>
          {!current ? (
            <EmptyState
              icon={<Box component="span" sx={{ fontSize: 40 }}>💬</Box>}
              title="开始一场 AI 模拟面试"
              description="选择目标岗位与级别，AI 面试官会逐轮提问并追问；每轮回答后自动做要点分析，结束后生成能力评估报告与练习计划。"
              actionLabel="新建面试会话"
              onAction={handleNewSession}
            />
          ) : messagesLoading ? (
            <InlineLoading label="正在加载对话记录…" rows={4} height={72} py={2} />
          ) : messagesError ? (
            <ErrorState message={messagesError} onRetry={reloadMessages} />
          ) : messages.length === 0 && busy === 'idle' ? (
            <EmptyState dense title="会话还没有内容" description="发送一条消息，或等待 AI 面试官开始提问。" />
          ) : (
            <Box sx={{ maxWidth: 980, mx: 'auto' }}>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} canRegenerate={canRegenerate} onRegenerate={handleRegenerate} />
              ))}
              {stream.text || busy === 'asking' || busy === 'evaluating' ? (
                <MessageBubble
                  streaming
                  message={{ id: 'streaming', role: 'ai', content: stream.text, card_type: '', created_at: new Date().toISOString() }}
                />
              ) : null}
            </Box>
          )}

          {(busy === 'asking' || busy === 'evaluating' || busy === 'analyzing') && !stream.text ? (
            <Box sx={{ maxWidth: 980, mx: 'auto', px: { xs: 1.5, md: 3 }, mt: 1 }}>
              <TypingIndicator
                label={
                  busy === 'evaluating' ? '面试官正在生成评估报告'
                    : busy === 'analyzing' ? '正在分析本轮回答的要点命中情况'
                      : '面试官正在思考下一个问题'
                }
              />
            </Box>
          ) : null}

          {stream.typing ? (
            <Box sx={{ textAlign: 'center', mt: 1 }}>
              <Button size="small" startIcon={<StopCircleRoundedIcon />} onClick={skipTyping}>跳过打字动画</Button>
            </Box>
          ) : null}
        </Box>

        {current && current.status !== 'evaluated' && current.status !== 'completed' ? (
          <Composer
            disabled={busy !== 'idle'}
            sending={busy !== 'idle'}
            onSend={handleSend}
            placeholder="输入你的回答…（Enter 发送，Shift+Enter 换行）"
          />
        ) : (
          <Box sx={{ px: 3, pb: 3, pt: 1.5, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {current ? '本场面试已结束，可查看报告与练习计划' : '新建或选择一个会话即可开始面试'}
            </Typography>
            {current ? (
              <Stack direction="row" spacing={1.2} justifyContent="center" sx={{ mt: 1.4 }}>
                <Button variant="outlined" onClick={() => setCurrent(null)}>返回会话概览</Button>
                <Button variant="outlined" onClick={() => navigate(`/sessions/${current.id}`)}>查看详情</Button>
                <Button variant="contained" onClick={handleNewSession}>再开一场</Button>
              </Stack>
            ) : null}
          </Box>
        )}
      </Box>

      <SessionDialog
        open={dialog.open}
        mode={dialog.mode}
        initial={dialog.initial}
        positions={positions}
        loading={dialogLoading}
        onClose={() => setDialog((d) => ({ ...d, open: false }))}
        onSubmit={submitDialog}
      />

      <Snackbar open={endOpen} onClose={() => setEndOpen(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert
          severity="warning"
          sx={{ borderRadius: 3, alignItems: 'center' }}
          action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" onClick={() => setEndOpen(false)}>取消</Button>
              <Button color="inherit" size="small" variant="outlined" onClick={handleEnd}>确认结束</Button>
            </Stack>
          }
        >
          结束本场面试？AI 将根据当前 {messages.filter((m) => m.role === 'user').length} 轮回答生成评估报告，并自动写入技能评分与练习计划。
        </Alert>
      </Snackbar>
    </Box>
  );
}
