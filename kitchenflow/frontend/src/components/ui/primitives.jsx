// 基础控件：按钮 / 输入 / 选择 / 标签 / 卡片 / 抽屉 / 分段控件。
// 全部对齐 Apple 令牌，禁止自创圆角与阴影。
import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils.js';

export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }) {
  const variants = {
    primary: 'apple-btn--primary',
    secondary: 'apple-btn--secondary',
    plain: 'apple-btn--plain',
    danger: 'apple-btn--danger',
  };
  const heights = { sm: 30, md: 36, lg: 44 };
  return (
    <button
      type="button"
      className={cn('apple-btn', variants[variant], className)}
      style={{ height: heights[size] }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input({ className = '', ...rest }) {
  return <input className={cn('apple-input', className)} {...rest} />;
}

export function Textarea({ className = '', rows = 3, ...rest }) {
  return (
    <textarea
      className={cn('apple-input', className)}
      rows={rows}
      style={{ height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
      {...rest}
    />
  );
}

export function Select({ value, onChange, options, className = '', placeholder, disabled }) {
  return (
    <select
      className={cn('apple-input', className)}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      style={{ paddingRight: 8 }}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Field({ label, hint, error, children, required }) {
  return (
    <label className="block">
      {label && (
        <span className="apple-footnote flex items-center gap-1 mb-1" style={{ color: 'var(--label-secondary)' }}>
          {label}{required && <span style={{ color: 'var(--red)' }}>*</span>}
        </span>
      )}
      {children}
      {error
        ? <span className="apple-caption block mt-1" style={{ color: 'var(--red)' }}>{error}</span>
        : hint ? <span className="apple-caption apple-tertiary block mt-1">{hint}</span> : null}
    </label>
  );
}

export function Tag({ color = 'var(--label-secondary)', bg = 'var(--fill-secondary)', children, className = '' }) {
  return (
    <span className={cn('apple-tag', className)} style={{ color, background: bg }}>
      {children}
    </span>
  );
}

export function Card({ className = '', children, padded = true, style }) {
  return (
    <div className={cn('kf-card', className)} style={{ padding: padded ? 16 : 0, ...style }}>
      {children}
    </div>
  );
}

// 分段控件：胶囊底 + 选中白底。
export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex" style={{
      background: 'var(--fill-secondary)', borderRadius: 'var(--radius-full)', padding: 3, gap: 2,
    }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange?.(o.value)}
            className="apple-footnote"
            style={{
              height: 28, padding: '0 14px', borderRadius: 'var(--radius-full)', border: 'none',
              background: active ? 'var(--bg-surface)' : 'transparent',
              color: active ? 'var(--label)' : 'var(--label-secondary)',
              fontWeight: active ? 600 : 400,
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'all var(--dur-base) var(--ease-standard)',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// 抽屉：右侧滑入，只圆外侧角。
export function Drawer({ open, onClose, title, children, footer, width = 460 }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <aside
        className="kf-drawer-in relative flex flex-col h-full"
        style={{
          width, maxWidth: '94vw',
          background: 'var(--bg-surface)',
          borderTopLeftRadius: 'var(--radius-xl)', borderBottomLeftRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-float)',
        }}
      >
        <header className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--separator)' }}>
          <h2 className="apple-headline" style={{ color: 'var(--label)' }}>{title}</h2>
          <button type="button" onClick={onClose} className="flex items-center justify-center"
            style={{ width: 30, height: 30, borderRadius: 'var(--radius-full)', background: 'var(--fill-secondary)', color: 'var(--label-secondary)', border: 'none' }}>
            <X size={16} />
          </button>
        </header>
        <div className="kf-scroll flex-1 overflow-y-auto" style={{ padding: 20 }}>{children}</div>
        {footer && (
          <footer style={{ padding: 16, borderTop: '1px solid var(--separator)' }}>{footer}</footer>
        )}
      </aside>
    </div>,
    document.body,
  );
}

// 居中弹窗：用于确认与表单。
export function Modal({ open, onClose, title, children, footer, width = 420 }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ padding: 16 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="kf-scale-in relative w-full" style={{
        maxWidth: width, background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-float)',
      }}>
        <header className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--separator)' }}>
          <h2 className="apple-headline">{title}</h2>
          <button type="button" onClick={onClose} className="flex items-center justify-center"
            style={{ width: 30, height: 30, borderRadius: 'var(--radius-full)', background: 'var(--fill-secondary)', color: 'var(--label-secondary)', border: 'none' }}>
            <X size={16} />
          </button>
        </header>
        <div style={{ padding: 20 }}>{children}</div>
        {footer && <footer className="flex justify-end gap-2" style={{ padding: 16, borderTop: '1px solid var(--separator)' }}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5" style={{ flexWrap: 'wrap' }}>
      <div>
        <h1 className="apple-large-title" style={{ color: 'var(--label)' }}>{title}</h1>
        {subtitle && <p className="apple-subhead apple-secondary mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
