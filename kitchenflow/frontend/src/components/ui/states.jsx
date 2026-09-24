// 页面五态统一组件：加载（骨架）/ 空 / 错误 / 无权限。404 在 pages/NotFoundPage.jsx。
import { AlertCircle, Inbox, Lock, RefreshCw } from 'lucide-react';

// 骨架屏：按行数铺，避免转圈。
export function LoadingState({ rows = 3, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="apple-skeleton" style={{ height: i === 0 ? 56 : 44, borderRadius: 'var(--radius-md)' }} />
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="apple-skeleton" style={{ height: 120, borderRadius: 'var(--radius-md)' }} />
      ))}
    </div>
  );
}

// 空态：插图 + 说明 + 可选行动按钮。
export function EmptyState({ title = '暂无数据', description, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ padding: '48px 24px' }}>
      <div className="flex items-center justify-center mb-4" style={{
        width: 56, height: 56, borderRadius: 'var(--radius-full)',
        background: 'var(--fill-secondary)', color: 'var(--label-tertiary)',
      }}>
        <Icon size={26} strokeWidth={1.6} />
      </div>
      <p className="apple-headline" style={{ color: 'var(--label)' }}>{title}</p>
      {description && <p className="apple-footnote apple-secondary mt-1" style={{ maxWidth: 320 }}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// 错误态：说明 + 重试。
export function ErrorState({ message = '数据加载失败', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ padding: '48px 24px' }}>
      <div className="flex items-center justify-center mb-4" style={{
        width: 56, height: 56, borderRadius: 'var(--radius-full)',
        background: 'rgba(255,59,48,0.12)', color: 'var(--red)',
      }}>
        <AlertCircle size={26} strokeWidth={1.8} />
      </div>
      <p className="apple-headline" style={{ color: 'var(--label)' }}>出错了</p>
      <p className="apple-footnote apple-secondary mt-1" style={{ maxWidth: 360 }}>{message}</p>
      {onRetry && (
        <button type="button" className="apple-btn apple-btn--secondary mt-4" onClick={onRetry}>
          <RefreshCw size={15} /> 重试
        </button>
      )}
    </div>
  );
}

// 无权限态：越权访问时展示，而不是白屏。
export function ForbiddenState({ message = '当前角色没有访问该页面的权限' }) {
  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ padding: '56px 24px' }}>
      <div className="flex items-center justify-center mb-4" style={{
        width: 56, height: 56, borderRadius: 'var(--radius-full)',
        background: 'var(--fill-secondary)', color: 'var(--label-secondary)',
      }}>
        <Lock size={26} strokeWidth={1.8} />
      </div>
      <p className="apple-headline" style={{ color: 'var(--label)' }}>无访问权限</p>
      <p className="apple-footnote apple-secondary mt-1" style={{ maxWidth: 360 }}>{message}</p>
    </div>
  );
}

// 行内提示条：用于表单/操作的错误反馈。
export function InlineAlert({ kind = 'error', children }) {
  const palette = {
    error: { color: 'var(--red)', bg: 'rgba(255,59,48,0.10)' },
    success: { color: 'var(--green)', bg: 'rgba(52,199,89,0.12)' },
    info: { color: 'var(--blue)', bg: 'rgba(0,122,255,0.10)' },
    warning: { color: 'var(--orange)', bg: 'rgba(255,149,0,0.12)' },
  }[kind] || {};
  return (
    <div className="apple-footnote" style={{
      padding: '10px 12px', borderRadius: 'var(--radius-sm)',
      background: palette.bg, color: palette.color,
    }}>
      {children}
    </div>
  );
}
