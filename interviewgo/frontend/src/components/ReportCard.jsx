import { Box, Button, Chip, Divider, LinearProgress, Stack, Typography } from '@mui/material';
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';

const DIMENSIONS = [
  { key: 'logic', label: '逻辑性' },
  { key: 'depth', label: '专业深度' },
  { key: 'expression', label: '表达力' },
];

const COLOR = { great: '#34C759', good: '#AF52DE', fair: '#FF9500', low: '#FF3B30' };

function scoreColor(n) {
  if (n >= 85) return COLOR.great;
  if (n >= 70) return COLOR.good;
  if (n >= 55) return COLOR.fair;
  return COLOR.low;
}

function scoreLabel(n) {
  if (n >= 85) return '优秀';
  if (n >= 70) return '良好';
  if (n >= 55) return '及格';
  return '待提升';
}

/**
 * 评分报告：内嵌在对话流中的结构化结果。
 * 用气泡的内边距节奏呈现，不额外加卡片边框（Apple 基底 §2.3）。
 */
export default function ReportCard({ report, sessionId, onPlans, onWriteSkills, busy }) {
  const overall = Number(report.overall) || 0;
  const suggestions = String(report.suggestions || '')
    .split('\n')
    .map((s) => s.replace(/^[-*\d.、)\s]+/, '').trim())
    .filter(Boolean);

  return (
    <Box sx={{ width: '100%', maxWidth: 560, p: 2, bgcolor: 'background.paper', borderRadius: 4, boxShadow: 1 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.6 }}>
        <EmojiEventsRoundedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography sx={{ fontWeight: 600, fontSize: 17, flex: 1 }}>能力评估报告</Typography>
        {report.source ? (
          <Chip size="small" label={report.source === 'llm' ? '大模型引擎' : '本地规则引擎'} />
        ) : null}
      </Stack>

      {/* 总分 */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 1.8, mb: 1.8, borderRadius: 3, bgcolor: 'action.hover' }}>
        <Box
          sx={{
            width: 84,
            height: 84,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: `conic-gradient(${scoreColor(overall)} ${overall * 3.6}deg, rgba(120,120,128,0.16) 0deg)`,
          }}
        >
          <Box sx={{ width: 66, height: 66, borderRadius: '50%', bgcolor: 'background.paper', display: 'grid', placeItems: 'center' }}>
            <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: scoreColor(overall) }}>{overall}</Typography>
            <Typography variant="caption" color="text.secondary">总分</Typography>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.8 }}>
          {report.summary || '暂无总评'}
        </Typography>
      </Stack>

      {/* 三维度 */}
      <Stack spacing={1.3}>
        {DIMENSIONS.map((d) => {
          const v = Number(report[d.key]) || 0;
          return (
            <Box key={d.key}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.4 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{d.label}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: scoreColor(v) }}>
                  {v} <Typography component="span" variant="caption" color="text.secondary">{scoreLabel(v)}</Typography>
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={Math.max(0, Math.min(100, v))}
                sx={{ height: 8, '& .MuiLinearProgress-bar': { backgroundColor: scoreColor(v) } }}
              />
            </Box>
          );
        })}
      </Stack>

      {suggestions.length ? (
        <>
          <Divider sx={{ my: 1.8 }} />
          <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 0.8 }}>
            <LightbulbOutlinedIcon sx={{ fontSize: 17, color: 'warning.main' }} />
            <Typography variant="subtitle2">改进建议</Typography>
          </Stack>
          <Stack component="ol" spacing={0.8} sx={{ m: 0, pl: 2.6 }}>
            {suggestions.map((s, i) => (
              <Typography key={i} component="li" variant="body2" sx={{ lineHeight: 1.8 }}>{s}</Typography>
            ))}
          </Stack>
        </>
      ) : null}

      {sessionId && (onWriteSkills || onPlans) ? (
        <>
          <Divider sx={{ my: 1.8 }} />
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {onWriteSkills ? (
              <Button size="small" variant="outlined" disabled={busy === 'skills'} onClick={onWriteSkills}>
                {busy === 'skills' ? '写入中…' : '写入技能评分'}
              </Button>
            ) : null}
            {onPlans ? (
              <Button size="small" variant="contained" disabled={busy === 'plans'} onClick={onPlans}>
                {busy === 'plans' ? '生成中…' : '生成练习计划'}
              </Button>
            ) : null}
          </Stack>
        </>
      ) : null}

      <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mt: 1.8, color: 'text.secondary' }}>
        <AutoAwesomeRoundedIcon sx={{ fontSize: 14 }} />
        <Typography variant="caption">由 InterviewGo AI 面试官自动生成</Typography>
      </Stack>
    </Box>
  );
}
