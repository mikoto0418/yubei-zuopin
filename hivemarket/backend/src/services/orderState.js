// 订单状态机：后端强校验，非法流转一律 400
//
//   待确认 → 待发货 → 待收货 → 已完成
//   待确认 → 已取消
//   待发货/待收货 → 退款中 → 已取消
//
const STATUSES = ['待确认', '待发货', '待收货', '已完成', '已取消', '退款中'];

const TRANSITIONS = {
  待确认: ['待发货', '已取消'],
  待发货: ['待收货', '退款中'],
  待收货: ['已完成', '退款中'],
  退款中: ['已取消'],
  已完成: [],
  已取消: [],
};

// 每条流转允许的操作者（相对订单）：buyer=买家 seller=卖家 admin=管理员
const ACTORS = {
  '待确认->待发货': ['seller'],
  '待确认->已取消': ['buyer'],
  '待发货->待收货': ['seller'],
  '待收货->已完成': ['buyer'],
  '待发货->退款中': ['buyer'],
  '待收货->退款中': ['buyer'],
  '退款中->已取消': ['seller', 'admin'],
};

const REMARK = {
  '待确认->待发货': '卖家确认订单，等待发货',
  '待确认->已取消': '订单已取消',
  '待发货->待收货': '卖家已发货，等待买家收货',
  '待收货->已完成': '买家确认收货，交易完成',
  '待发货->退款中': '买家发起退款申请',
  '待收货->退款中': '买家发起退款申请',
  '退款中->已取消': '卖家同意退款，订单关闭',
};

function isStatus(s) {
  return STATUSES.includes(s);
}

/** 该流转是否在状态机允许的边集合内 */
function canTransit(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/** 调用者是否有权执行该流转 */
function actorAllowed(from, to, relation) {
  const allowed = ACTORS[`${from}->${to}`] || [];
  return allowed.includes(relation);
}

/** 调用者相对订单的角色 */
function relationOf(order, userId, role) {
  if (order.buyer_id === userId) return 'buyer';
  if (order.seller_id === userId) return 'seller';
  if (role === 'admin') return 'admin';
  return 'stranger';
}

/** 从某状态出发的所有合法下一状态 */
function nextStatuses(from) {
  return [...(TRANSITIONS[from] || [])];
}

/** 该状态是否终态 */
function isTerminal(s) {
  return (TRANSITIONS[s] || []).length === 0;
}

/** 默认日志文案 */
function remarkFor(from, to, custom) {
  return custom || REMARK[`${from}->${to}`] || `状态变更为 ${to}`;
}

module.exports = {
  STATUSES,
  TRANSITIONS,
  ACTORS,
  isStatus,
  canTransit,
  actorAllowed,
  relationOf,
  nextStatuses,
  isTerminal,
  remarkFor,
};
