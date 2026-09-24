import { useState } from 'react';
import { Avatar, Box, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import Markdown from './Markdown';
import ReportCard from './ReportCard';
import { useSnackbar } from '../context/SnackbarContext';

function formatTime(v) {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * 对话气泡：InterviewGo 的差异化核心 —— 只有气泡，没有卡片。
 * AI 气泡 --fill-secondary 底；用户气泡主题色底白字。
 */
export default function MessageBubble({ message, streaming = false, onRegenerate, canRegenerate }) {
  const snackbar = useSnackbar();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isReport = message.card_type === 'report';

  let report = null;
  if (isReport) {
    try {
      report = JSON.parse(message.content);
    } catch {
      report = null;
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      snackbar.success('已复制到剪贴板');
    } catch {
      snackbar.error('复制失败，请手动选择文本');
    }
  };

  return (
    <Stack
      direction="row"
      spacing={1.1}
      sx={{
        mb: 2,
        px: { xs: 1.5, md: 3 },
        flexDirection: isUser ? 'row-reverse' : 'row',
        animation: 'ig-bubble-in var(--dur-base) var(--ease-standard) both',
      }}
    >
      <Avatar
        sx={{
          width: 32,
          height: 32,
          mt: 0.3,
          flexShrink: 0,
          fontSize: 13,
          bgcolor: isUser ? 'primary.main' : 'action.hover',
          color: isUser ? '#fff' : 'text.secondary',
        }}
      >
        {isUser ? '我' : 'AI'}
      </Avatar>

      <Box
        sx={{
          maxWidth: { xs: '86%', md: '72%' },
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 0.4, px: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            {isUser ? '我' : 'AI 面试官'}
          </Typography>
          {!isUser && !isReport && message.card_type === 'ai:local' ? (
            <Chip size="small" label="本地规则引擎" sx={{ height: 18, fontSize: 11 }} />
          ) : null}
          <Typography variant="caption" color="text.disabled">
            {formatTime(message.created_at)}
          </Typography>
        </Stack>

        {/* 气泡本体：无边框、无阴影，靠底色与圆角说话 */}
        <Box
          sx={{
            px: isReport ? 0 : 1.8,
            py: isReport ? 0 : 1.3,
            borderRadius: isUser ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
            bgcolor: isUser ? 'primary.main' : 'action.hover',
            color: isUser ? '#fff' : 'text.primary',
            width: isReport ? '100%' : 'auto',
            wordBreak: 'break-word',
            '& .md-p': { color: 'inherit' },
            '& a': { color: isUser ? '#fff' : 'primary.main', textDecoration: 'underline' },
          }}
        >
          {isReport && report ? <ReportCard report={report} /> : <Markdown>{message.content}</Markdown>}

          {streaming ? (
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                width: 6,
                height: 15,
                ml: 0.4,
                verticalAlign: 'text-bottom',
                bgcolor: 'primary.main',
                animation: 'ig-caret 0.9s steps(2) infinite',
              }}
            />
          ) : null}
        </Box>

        {!streaming ? (
          <Stack
            direction="row"
            spacing={0.2}
            sx={{ mt: 0.3, opacity: 0.6, '&:hover': { opacity: 1 } }}
          >
            <Tooltip title={copied ? '已复制' : '复制'}>
              <IconButton size="small" onClick={copy}>
                {copied ? (
                  <CheckRoundedIcon sx={{ fontSize: 15, color: 'success.main' }} />
                ) : (
                  <ContentCopyRoundedIcon sx={{ fontSize: 15 }} />
                )}
              </IconButton>
            </Tooltip>
            {!isUser && !isReport ? (
              <Tooltip title={canRegenerate ? '重新生成' : '生成中，请稍候'}>
                <span>
                  <IconButton size="small" disabled={!canRegenerate} onClick={() => onRegenerate && onRegenerate(message)}>
                    <RefreshRoundedIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
          </Stack>
        ) : null}
      </Box>
    </Stack>
  );
}
