// 城市设施巡检的领域常量：类别、状态、工单状态机与配色。
// 工单状态与后端 src/workflow.js 保持一致，改动需两端同步。

export const CATEGORIES = ['路灯', '垃圾箱', '监控', '消防栓', '公交站牌', '井盖', '排水', '健身器材']

export const STATUSES = ['正常', '待检修', '故障']

export const STATUS_COLOR = {
  正常: '#34C759',
  待检修: '#FF9500',
  故障: '#FF3B30',
}

export const STATUS_TAG = {
  正常: 'success',
  待检修: 'warning',
  故障: 'danger',
}

export const CATEGORY_ICON = {
  路灯: '💡',
  垃圾箱: '🗑️',
  监控: '📷',
  消防栓: '🧯',
  公交站牌: '🚏',
  井盖: '⭕',
  排水: '🌊',
  健身器材: '🏋️',
}

export const SEVERITIES = ['轻微', '一般', '严重']

export const FAULT_STATUS = ['待处理', '处理中', '已解决']

export const INSPECTION_RESULTS = ['正常', '异常']

export const SEVERITY_TAG = {
  轻微: 'info',
  一般: 'warning',
  严重: 'danger',
}

export const FAULT_STATUS_TAG = {
  待处理: 'danger',
  处理中: 'warning',
  已解决: 'success',
}

// ---------- 工单状态机（与后端 workflow.js 对齐） ----------
export const WORK_ORDER_STATUS = ['created', 'assigned', 'in_progress', 'resolved', 'verified', 'closed']

export const WORK_ORDER_LABEL = {
  created: '待派单',
  assigned: '已派单',
  in_progress: '维修中',
  resolved: '待验收',
  verified: '已验收',
  closed: '已关闭',
}

// 与后端 WORK_ORDER_TRANSITIONS 一致，前端据此决定显示哪些操作按钮。
export const WORK_ORDER_TRANSITIONS = {
  created: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['verified', 'in_progress'],
  verified: ['closed'],
  closed: [],
}

// 状态 → 语义色，用于状态点与时间轴节点。
export const WORK_ORDER_COLOR = {
  created: '#8E8E93',
  assigned: '#007AFF',
  in_progress: '#FF9500',
  resolved: '#5856D6',
  verified: '#34C759',
  closed: '#8E8E93',
}

// 流转按钮文案：同一状态可能由不同起点到达，故按「当前状态→目标状态」给文案。
export const TRANSITION_ACTION = {
  'created→assigned': '派单',
  'assigned→in_progress': '开始维修',
  'in_progress→resolved': '提交验收',
  'resolved→verified': '验收通过',
  'resolved→in_progress': '退回重做',
  'verified→closed': '关闭工单',
}

export const PRIORITIES = ['low', 'normal', 'high']

export const PRIORITY_LABEL = { low: '低', normal: '中', high: '高' }

export const PRIORITY_TAG = { low: 'info', normal: 'primary', high: 'danger' }

export const CYCLES = ['每日', '每周', '每旬', '每月']

// 济南市中心，与后端种子数据一致
export const DEFAULT_CENTER = [36.655, 117.035]
export const DEFAULT_ZOOM = 13

export function statusColor(s) {
  return STATUS_COLOR[s] || '#8E8E93'
}

export function workOrderLabel(s) {
  return WORK_ORDER_LABEL[s] || s
}

export function workOrderColor(s) {
  return WORK_ORDER_COLOR[s] || '#8E8E93'
}
