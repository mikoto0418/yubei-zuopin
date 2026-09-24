import { Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';

/** 全屏加载：路由守卫与首屏校验用（骨架屏，不用转圈） */
export function FullScreenLoading({ label = '正在加载…' }) {
  return (
    <Stack spacing={2} sx={{ minHeight: '100vh', width: '100%', bgcolor: 'background.default', p: 4 }}>
      <Skeleton variant="rounded" height={38} width="42%" sx={{ borderRadius: 2 }} />
      <Skeleton variant="rounded" height={96} sx={{ borderRadius: 3 }} />
      <Skeleton variant="rounded" height={96} sx={{ borderRadius: 3 }} />
      <Typography variant="footnote" color="text.secondary" sx={{ fontSize: 13, textAlign: 'center' }}>
        {label}
      </Typography>
    </Stack>
  );
}

/** 列表骨架屏加载态 */
export function LoadingBlock({ rows = 3, height = 64, gap = 1.5 }) {
  return (
    <Stack spacing={gap} sx={{ p: { xs: 1, md: 0 } }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={height} sx={{ borderRadius: 3 }} />
      ))}
    </Stack>
  );
}

/** 内联加载（骨架屏） */
export function InlineLoading({ label = '加载中…', py = 6, rows = 3, height = 64 }) {
  return (
    <Stack spacing={1.6} sx={{ py }}>
      <LoadingBlock rows={rows} height={height} />
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
        {label}
      </Typography>
    </Stack>
  );
}

/** 空态：插图 + 一句说明 + 一个行动按钮 */
export function EmptyState({
  icon = <InboxOutlinedIcon sx={{ fontSize: 40 }} />,
  title = '暂无数据',
  description = '',
  actionLabel = '',
  onAction,
  dense = false,
}) {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{ py: dense ? 5 : 9, px: 3, textAlign: 'center' }}
    >
      <Box sx={{ color: 'text.disabled', display: 'flex' }}>{icon}</Box>
      <Typography sx={{ fontWeight: 600, fontSize: 17, color: 'text.primary' }}>{title}</Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, lineHeight: 1.7 }}>
          {description}
        </Typography>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="contained" onClick={onAction} sx={{ mt: 1 }}>
          {actionLabel}
        </Button>
      ) : null}
    </Stack>
  );
}

/** 搜索无结果：与「暂无数据」区分，避免误导用户去创建 */
export function NoResults({ onReset, keyword = '' }) {
  return (
    <EmptyState
      dense
      icon={<SearchOffRoundedIcon sx={{ fontSize: 40 }} />}
      title={keyword ? `没有匹配「${keyword}」的结果` : '没有匹配的结果'}
      description="换个关键词，或清空筛选条件再试一次。"
      actionLabel={onReset ? '清空筛选' : ''}
      onAction={onReset}
    />
  );
}

/** 错误态：说明 + 重试 */
export function ErrorState({ message = '加载失败', onRetry, dense = false, forbidden = false }) {
  if (forbidden) return <ForbiddenState message={message} />;
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{ py: dense ? 5 : 9, px: 3, textAlign: 'center' }}
    >
      <ErrorOutlineRoundedIcon sx={{ fontSize: 40, color: 'error.main' }} />
      <Typography sx={{ fontWeight: 600, fontSize: 17 }}>出错了</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, lineHeight: 1.7 }}>
        {message}
      </Typography>
      {onRetry ? (
        <Button
          variant="outlined"
          startIcon={<RefreshRoundedIcon sx={{ fontSize: 18 }} />}
          onClick={onRetry}
          sx={{ mt: 1 }}
        >
          重试
        </Button>
      ) : null}
    </Stack>
  );
}

/** 无权限态：403，不静默失败 */
export function ForbiddenState({ message = '你没有权限查看这部分内容。', dense = false }) {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{ py: dense ? 5 : 9, px: 3, textAlign: 'center' }}
    >
      <LockOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
      <Typography sx={{ fontWeight: 600, fontSize: 17 }}>无访问权限</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, lineHeight: 1.7 }}>
        {message}
      </Typography>
    </Stack>
  );
}

/** 五态统一容器：页面只需给出状态值，渲染分支集中在这里 */
export function PageState({ loading, error, empty, emptyProps, loadingRows = 4, loadingHeight = 76, onRetry, children }) {
  if (loading) return <LoadingBlock rows={loadingRows} height={loadingHeight} />;
  if (error) {
    const forbidden = error.status === 403;
    return <ErrorState message={error.message || String(error)} onRetry={forbidden ? undefined : onRetry} forbidden={forbidden} />;
  }
  if (empty) return <EmptyState {...emptyProps} />;
  return children;
}

/** AI 思考中的三点跳动指示器（仅在请求进行中存在，非装饰性循环） */
export function TypingIndicator({ label = '面试官正在思考' }) {
  return (
    <Stack direction="row" spacing={1.2} alignItems="center" sx={{ px: 0.5, py: 0.5 }}>
      <Stack direction="row" spacing={0.5} alignItems="center">
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              opacity: 0.5,
              animation: 'ig-dot 1.2s infinite ease-in-out',
              animationDelay: `${i * 0.16}s`,
              '@keyframes ig-dot': {
                '0%, 80%, 100%': { transform: 'translateY(0)', opacity: 0.4 },
                '40%': { transform: 'translateY(-4px)', opacity: 1 },
              },
            }}
          />
        ))}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}
