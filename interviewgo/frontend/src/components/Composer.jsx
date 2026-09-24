import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import MicOffRoundedIcon from '@mui/icons-material/MicOffRounded';
import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import { useSnackbar } from '../context/SnackbarContext';

const MAX_LEN = 2000;

/** 取浏览器 SpeechRecognition 实现（含 webkit 前缀） */
function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/** 输入区：Apple 填充式输入（无边框 + 聚焦描边），发送按钮为主题色圆形 */
export default function Composer({ disabled, sending, onSend, placeholder }) {
  const snackbar = useSnackbar();
  const [value, setValue] = useState('');
  const [listening, setListening] = useState(false);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');

  const speechSupported = useMemo(() => Boolean(getSpeechRecognition()), []);

  useEffect(
    () => () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* 忽略 */ }
      }
    },
    [],
  );

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled || sending) return;
    if (text.length > MAX_LEN) {
      snackbar.error(`内容过长，请控制在 ${MAX_LEN} 字以内`);
      return;
    }
    setValue('');
    onSend(text);
  }, [value, disabled, sending, onSend, snackbar]);

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    if (e.nativeEvent && e.nativeEvent.isComposing) return;
    if (e.shiftKey) return;
    e.preventDefault();
    submit();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* 忽略 */ }
    }
    setListening(false);
  };

  const toggleVoice = () => {
    if (!speechSupported) {
      snackbar.info('当前浏览器不支持原生语音输入，建议使用 Chrome 或 Edge');
      return;
    }
    if (listening) { stopListening(); return; }
    const SR = getSpeechRecognition();
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = true;
    rec.interimResults = true;
    baseTextRef.current = value ? `${value} ` : '';

    rec.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalText) baseTextRef.current += finalText;
      setValue((baseTextRef.current + interim).slice(0, MAX_LEN));
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        snackbar.error('麦克风权限被拒绝，请在浏览器设置中允许后重试');
      } else if (e.error !== 'aborted') {
        snackbar.error('语音识别出错，请稍后重试');
      }
    };
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
      snackbar.info('正在聆听…再次点击麦克风结束');
    } catch {
      setListening(false);
      snackbar.error('语音输入启动失败');
    }
  };

  const len = value.length;

  return (
    <Box sx={{ px: { xs: 1.5, md: 3 }, pb: 2, pt: 1 }}>
      <Box
        sx={{
          maxWidth: 900,
          mx: 'auto',
          p: 0.8,
          pl: 1.6,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          borderRadius: 5,
          bgcolor: 'background.paper',
          boxShadow: 1,
          border: '2px solid',
          borderColor: listening ? 'primary.main' : 'transparent',
          transition: 'border-color var(--dur-fast) var(--ease-standard)',
        }}
      >
        <Box
          component="textarea"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={placeholder || '输入你的回答…（Enter 发送，Shift+Enter 换行）'}
          sx={{
            flex: 1,
            border: 0,
            outline: 'none',
            resize: 'none',
            bgcolor: 'transparent',
            font: 'inherit',
            fontSize: 15,
            lineHeight: 1.6,
            py: 1.2,
            maxHeight: 168,
            overflowY: 'auto',
            color: 'text.primary',
            '&::placeholder': { color: 'text.disabled' },
          }}
          onInput={(e) => {
            const el = e.target;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
          }}
        />
        <Stack direction="row" spacing={0.4} alignItems="center" sx={{ pb: 0.4 }}>
          {len > MAX_LEN * 0.8 ? (
            <Typography variant="caption" color={len >= MAX_LEN ? 'error' : 'text.secondary'} sx={{ mr: 0.5 }}>
              {len}/{MAX_LEN}
            </Typography>
          ) : null}
          <Tooltip title={speechSupported ? (listening ? '结束语音输入' : '语音输入') : '当前浏览器不支持语音输入'}>
            <IconButton
              onClick={toggleVoice}
              disabled={disabled}
              sx={{
                color: listening ? 'error.main' : speechSupported ? 'text.secondary' : 'text.disabled',
                bgcolor: listening ? 'rgba(255,59,48,0.10)' : 'transparent',
              }}
            >
              {listening ? <StopCircleRoundedIcon /> : speechSupported ? <MicRoundedIcon /> : <MicOffRoundedIcon />}
            </IconButton>
          </Tooltip>
          <IconButton
            onClick={submit}
            disabled={disabled || !value.trim() || sending}
            sx={{
              bgcolor: 'primary.main',
              color: '#fff',
              '&:hover': { bgcolor: 'primary.dark' },
              '&:active': { transform: 'scale(0.97)' },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' },
            }}
          >
            <SendRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'center', mt: 0.9 }}>
        Enter 发送 · Shift+Enter 换行
        {speechSupported ? ' · 支持浏览器原生语音输入' : ' · 语音输入需 Chrome/Edge'}
      </Typography>
    </Box>
  );
}
