// 领域常量：状态机、角色、桌台状态、档口配色的唯一来源。
// 前端只做展示与可选项提示，最终校验以后端为准。

export const ORDER_FLOW = ['pending', 'accepted', 'cooking', 'ready', 'served', 'paid'];

export const ORDER_STATUS = {
  pending: { label: '待接单', color: 'var(--red)', bg: 'rgba(255,59,48,0.12)' },
  accepted: { label: '已接单', color: 'var(--orange)', bg: 'rgba(255,149,0,0.12)' },
  cooking: { label: '制作中', color: 'var(--orange)', bg: 'rgba(255,149,0,0.16)' },
  ready: { label: '已出餐', color: 'var(--green)', bg: 'rgba(52,199,89,0.14)' },
  served: { label: '已上菜', color: 'var(--teal)', bg: 'rgba(90,200,250,0.16)' },
  paid: { label: '已结账', color: 'var(--label-secondary)', bg: 'rgba(120,120,128,0.12)' },
  cancelled: { label: '已取消', color: 'var(--label-tertiary)', bg: 'rgba(120,120,128,0.08)' },
};

// 状态机前端镜像：用于按钮可用性提示（后端仍会强校验）。
export const NEXT_STATUS = {
  pending: ['accepted', 'cancelled'],
  accepted: ['cooking', 'cancelled'],
  cooking: ['ready'],
  ready: ['served'],
  served: ['paid'],
  paid: [],
  cancelled: [],
};

// 每个目标状态由谁操作：用于按角色渲染操作按钮。
export const ROLE_OF_TARGET = {
  accepted: ['admin', 'chef'],
  cooking: ['admin', 'chef'],
  ready: ['admin', 'chef'],
  served: ['admin', 'waiter'],
  paid: ['admin', 'waiter'],
  cancelled: ['admin', 'waiter', 'chef'],
};

export const ACTION_LABEL = {
  accepted: '接单',
  cooking: '开始制作',
  ready: '出餐',
  served: '上菜',
  paid: '结账',
  cancelled: '取消订单',
};

export const TABLE_STATUS = {
  idle: { label: '空闲', color: 'var(--green)', bg: 'rgba(52,199,89,0.12)' },
  occupied: { label: '占用', color: 'var(--orange)', bg: 'rgba(255,149,0,0.12)' },
  cleaning: { label: '待清台', color: 'var(--blue)', bg: 'rgba(0,122,255,0.12)' },
};

export const TASK_STATUS = {
  pending: { label: '待制作', color: 'var(--label-secondary)', bg: 'rgba(120,120,128,0.12)' },
  cooking: { label: '制作中', color: 'var(--orange)', bg: 'rgba(255,149,0,0.16)' },
  done: { label: '已完成', color: 'var(--green)', bg: 'rgba(52,199,89,0.14)' },
};

export const ROLES = {
  admin: { label: '店长', color: 'var(--purple)' },
  waiter: { label: '服务员', color: 'var(--blue)' },
  chef: { label: '厨师', color: 'var(--orange)' },
};

export const SHIFT_STATUS = {
  scheduled: { label: '已排班', color: 'var(--label-secondary)' },
  active: { label: '值班中', color: 'var(--orange)' },
  done: { label: '已完成', color: 'var(--green)' },
};

// 档口配色：色令牌名 → 实际颜色（与 apple-tokens 对应）。
export const STATION_COLORS = {
  '--orange': 'var(--orange)',
  '--green': 'var(--green)',
  '--yellow': 'var(--yellow)',
  '--blue': 'var(--blue)',
  '--purple': 'var(--purple)',
  '--gray': 'var(--gray)',
};

export const PAY_METHODS = ['微信', '支付宝', '现金', '刷卡'];

export const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'admin123', role: '店长' },
  { username: 'waiter1', password: 'waiter123', role: '服务员' },
  { username: 'chef1', password: 'chef123', role: '厨师' },
];

// 进度环/倒计时：按菜品预计时长算剩余比例。
export function countdownRatio(createdAt, prepMinutes) {
  const start = new Date(String(createdAt).replace(' ', 'T')).getTime();
  if (!Number.isFinite(start)) return { ratio: 0, remainMin: 0, overtime: false };
  const elapsed = (Date.now() - start) / 60000;
  const total = Math.max(1, prepMinutes || 15);
  const remainMin = total - elapsed;
  return {
    ratio: Math.min(1, Math.max(0, remainMin / total)),
    remainMin: Math.max(0, Math.ceil(remainMin)),
    overtime: remainMin < 0,
  };
}

export function formatMoney(n) {
  return `¥${Number(n || 0).toFixed(2)}`;
}

export function formatTime(v) {
  if (!v) return '—';
  return String(v).slice(11, 16) || '—';
}

export function formatDateTime(v) {
  if (!v) return '—';
  return String(v).replace('T', ' ').slice(0, 16);
}
