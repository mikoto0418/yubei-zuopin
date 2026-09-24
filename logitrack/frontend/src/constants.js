// 领域常量：8 状态元数据（颜色/图标/标签）+ 地图默认视图 + 工具函数。
//
// 状态色是"时间轴节点着色"与"地图标记着色"的共同来源——
// 时间轴与地图联动的前提是两边用同一份颜色映射，这样点节点时地图标记的
// 高亮色和节点本身的颜色一致，视觉上立刻能对应上。

export const STATUSES = [
  { key: 'created', label: '已下单', color: '#8E8E93', soft: 'rgba(142,142,147,0.12)', icon: 'order' },
  { key: 'picked_up', label: '已揽收', color: '#5AC8FA', soft: 'rgba(90,200,250,0.14)', icon: 'pickup' },
  { key: 'in_transit', label: '运输中', color: '#007AFF', soft: 'rgba(0,122,255,0.12)', icon: 'truck' },
  { key: 'arrived_hub', label: '到达分拨', color: '#5856D6', soft: 'rgba(88,86,214,0.12)', icon: 'hub' },
  { key: 'out_for_delivery', label: '派送中', color: '#FF9500', soft: 'rgba(255,149,0,0.14)', icon: 'delivery' },
  { key: 'delivered', label: '已签收', color: '#34C759', soft: 'rgba(52,199,89,0.14)', icon: 'signed' },
  { key: 'exception', label: '异常', color: '#FF3B30', soft: 'rgba(255,59,48,0.14)', icon: 'alert' },
  { key: 'returned', label: '已退回', color: '#AF52DE', soft: 'rgba(175,82,222,0.14)', icon: 'return' },
]

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]))

export function statusMeta(key) {
  // 收件地锚点在货到达前没有真实状态，后端用 'pending' 占位，
  // 这里给它一个中文标签，避免时间轴上出现英文原始键。
  if (key === 'pending') {
    return { key: 'pending', label: '待收货', color: '#8E8E93', soft: 'rgba(142,142,147,0.12)', icon: 'dot' }
  }
  return STATUS_MAP[key] || { key, label: key || '未知', color: '#8E8E93', soft: 'rgba(142,142,147,0.12)', icon: 'dot' }
}

// 主链路的固定顺序——时间轴用它决定"已完成 / 进行中 / 待完成"三段的着色
export const MAIN_CHAIN = ['created', 'picked_up', 'in_transit', 'arrived_hub', 'out_for_delivery', 'delivered']

// 地图默认视图：中国东部（八个种子网点都在此范围内）
export const DEFAULT_CENTER = [31.5, 116.5]
export const DEFAULT_ZOOM = 5

export const NODE_TYPE_LABEL = {
  origin: '寄件地',
  created: '下单',
  pickup: '揽收',
  transit: '运输中',
  hub: '分拨中心',
  delivery: '派送',
  signed: '签收',
  exception: '异常',
  returned: '退回',
  destination: '收件地',
}

export const GOODS_TYPES = ['日用品', '服装鞋帽', '数码产品', '食品', '文件资料', '家具配件', '医药用品', '化妆品', '汽车配件', '图书']
export const PAYMENT_METHODS = ['寄付', '到付', '月结']
export const EXCEPTION_TYPES = ['拒收', '破损', '地址错误', '超时']
export const SEVERITIES = ['一般', '严重', '紧急']

export const DRIVER_STATUS = {
  available: { label: '空闲', color: '#34C759' },
  on_task: { label: '任务中', color: '#007AFF' },
  resting: { label: '休息中', color: '#8E8E93' },
}

export const VEHICLE_STATUS = {
  idle: { label: '空闲', color: '#34C759' },
  in_use: { label: '使用中', color: '#007AFF' },
  maintenance: { label: '维保中', color: '#FF9500' },
}

export const EX_STATUS = {
  open: { label: '待处理', color: '#FF3B30' },
  processing: { label: '处理中', color: '#FF9500' },
  resolved: { label: '已解决', color: '#34C759' },
  closed: { label: '已关闭', color: '#8E8E93' },
}

// "2026-09-24 14:30:00" -> "09-24 14:30"
export function formatDateTime(v) {
  if (!v) return '—'
  const s = String(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return s
  return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`
}

// 完整时间：用于详情页
export function formatFull(v) {
  if (!v) return '—'
  const s = String(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return s
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日 ${m[4]}:${m[5]}`
}

export function formatDate(v) {
  if (!v) return '—'
  const s = String(v).slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return s
  return `${m[1]}-${m[2]}-${m[3]}`
}

// 相对时间："3 小时前" / "刚刚"
export function timeAgo(v) {
  if (!v) return '—'
  const t = new Date(String(v).replace(' ', 'T')).getTime()
  if (!Number.isFinite(t)) return '—'
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return formatDate(v)
}

export function money(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '¥0.00'
  return `¥${n.toFixed(2)}`
}

export function num(v, digits = 2) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return n.toFixed(digits).replace(/\.?0+$/, '') || '0'
}

// 判断某状态相对当前状态是"已完成 / 进行中 / 待完成"，用于时间轴分段着色
export function stageOf(status, current) {
  if (status === current) return 'current'
  if (status === 'exception' || status === 'returned') return status === current ? 'current' : 'pending'
  const i = MAIN_CHAIN.indexOf(status)
  const j = MAIN_CHAIN.indexOf(current)
  if (i < 0 || j < 0) return 'pending'
  return i < j ? 'done' : 'pending'
}

// 角色标签
export const ROLE_LABEL = {
  admin: '总部管理员',
  dispatcher: '调度员',
  courier: '快递员',
  user: '用户',
}

// 权限判定：集中在一处，避免各页面各写一套
export const can = {
  dispatch: (u) => u && (u.role === 'admin' || u.role === 'dispatcher'),
  manageFleet: (u) => u && (u.role === 'admin' || u.role === 'dispatcher'),
  manageWarehouse: (u) => u && (u.role === 'admin' || u.role === 'dispatcher'),
  admin: (u) => u && u.role === 'admin',
  createWaybill: (u) => u && (u.role === 'admin' || u.role === 'dispatcher' || u.role === 'courier'),
  handleException: (u) => u && (u.role === 'admin' || u.role === 'dispatcher'),
}
