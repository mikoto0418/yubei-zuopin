import { Box, Stack, Typography, useTheme } from '@mui/material';

/**
 * 技能雷达图：纯 SVG 绘制，不引入图表库。
 * 数据来自 /api/skill-radar 的 dimensions（0-100 分）。
 */
export default function SkillRadar({ dimensions = [], size = 300, showLegend = true }) {
  const theme = useTheme();
  const list = dimensions.filter((d) => d && typeof d.score === 'number');
  const n = list.length;

  if (n < 3) {
    return (
      <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          至少需要 3 个维度才能绘制雷达图（当前 {n} 个）。
        </Typography>
      </Stack>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 52;
  const angleOf = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointOf = (i, ratio) => {
    const a = angleOf(i);
    return [cx + Math.cos(a) * radius * ratio, cy + Math.sin(a) * radius * ratio];
  };
  const polygon = (ratio) => list.map((_, i) => pointOf(i, ratio).join(',')).join(' ');

  const dataPoints = list.map((d, i) => pointOf(i, Math.max(0, Math.min(100, d.score)) / 100).join(',')).join(' ');

  const gridColor = theme.palette.divider;
  const tint = theme.palette.primary.main;

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Box
        component="svg"
        viewBox={`0 0 ${size} ${size}`}
        sx={{ width: '100%', maxWidth: size, height: 'auto', overflow: 'visible' }}
        role="img"
        aria-label="技能雷达图"
      >
        {/* 网格：4 圈 */}
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon key={r} points={polygon(r)} fill="none" stroke={gridColor} strokeWidth={1} />
        ))}

        {/* 轴线 */}
        {list.map((d, i) => {
          const [x, y] = pointOf(i, 1);
          return <line key={`axis-${d.key}`} x1={cx} y1={cy} x2={x} y2={y} stroke={gridColor} strokeWidth={1} />;
        })}

        {/* 数据面 */}
        <polygon points={dataPoints} fill={tint} fillOpacity={0.18} stroke={tint} strokeWidth={2} strokeLinejoin="round" />

        {/* 数据点 */}
        {list.map((d, i) => {
          const [x, y] = pointOf(i, Math.max(0, Math.min(100, d.score)) / 100);
          return <circle key={`dot-${d.key}`} cx={x} cy={y} r={3.5} fill={tint} />;
        })}

        {/* 维度标签 */}
        {list.map((d, i) => {
          const [x, y] = pointOf(i, 1.16);
          const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end';
          return (
            <text
              key={`label-${d.key}`}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fontSize={12}
              fill={theme.palette.text.secondary}
            >
              {d.label}
              <tspan fontSize={11} fill={theme.palette.text.disabled}> {d.score}</tspan>
            </text>
          );
        })}
      </Box>

      {showLegend ? (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', justifyContent: 'center', gap: 0.8 }}>
          {list.map((d) => (
            <Stack
              key={`legend-${d.key}`}
              direction="row"
              spacing={0.6}
              alignItems="center"
              sx={{ px: 1, py: 0.4, borderRadius: 2, bgcolor: 'action.hover' }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {d.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {d.score} · {d.level}
              </Typography>
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}
