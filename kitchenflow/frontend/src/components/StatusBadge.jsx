// 状态徽章：订单 / 桌台 / 档口任务 / 班次共用。
import { ORDER_STATUS, TABLE_STATUS, TASK_STATUS, SHIFT_STATUS, ROLES } from '../lib/constants.js';
import { Tag } from './ui/primitives.jsx';

const MAPS = { order: ORDER_STATUS, table: TABLE_STATUS, task: TASK_STATUS, shift: SHIFT_STATUS, role: ROLES };

export default function StatusBadge({ kind = 'order', value, className }) {
  const meta = MAPS[kind]?.[value] || { label: value || '—', color: 'var(--label-secondary)', bg: 'var(--fill-secondary)' };
  return <Tag color={meta.color} bg={meta.bg} className={className}>{meta.label}</Tag>;
}
