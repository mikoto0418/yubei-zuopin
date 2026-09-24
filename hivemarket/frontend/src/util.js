// 分类 -> 图标（占位图用；兼容一级与二级分类名）
export const CATEGORY_ICON = {
  // 一级
  数码电子: '📱', 书籍教材: '📚', 生活百货: '🧺', 运动户外: '🏀', 服饰鞋帽: '👕',
  // 二级
  手机通讯: '📱', 电脑办公: '💻', 影音配件: '🎧',
  考研考证: '📖', 专业教材: '📘', 课外读物: '📚',
  宿舍电器: '🔌', 厨具餐具: '🍳', 日用清洁: '🧴',
  球类器材: '🏀', 健身装备: '🏋️', 骑行滑板: '🚲',
  男装: '👔', 女装: '👗', 鞋靴: '👟',
  // 旧名兜底
  交通工具: '🚲', 美妆个护: '💄', 其他: '📦',
};

export function iconFor(cat) {
  return CATEGORY_ICON[cat] || '📦';
}

export const CONDITIONS = ['全新', '九成新', '八成新', '七成新', '五成新', '不限'];

// 余额格式化
export function money(n) {
  return Number(n || 0).toFixed(2);
}

// 商品状态 -> 自研 badge class
export function statusBadge(status) {
  if (status === '在售') return 'badge-on';
  if (status === '已售') return 'badge-sold';
  return 'badge-off';
}

// 商品状态 -> PrimeVue Tag severity
export function itemStatusSeverity(status) {
  if (status === '在售') return 'success';
  if (status === '已售') return 'secondary';
  return 'danger';
}

/* ===== 订单状态机（6 状态）
   待确认 → 待发货 → 待收货 → 已完成
   待确认 → 已取消
   待发货/待收货 → 退款中 → 已取消                       */

export const ORDER_STATUSES = ['待确认', '待发货', '待收货', '已完成', '已取消', '退款中'];

// 状态 -> PrimeVue Tag severity
export function orderStatusSeverity(status) {
  if (status === '已完成') return 'success';
  if (status === '待确认') return 'warn';
  if (status === '待发货' || status === '待收货') return 'info';
  if (status === '退款中') return 'warn';
  if (status === '已取消') return 'danger';
  return 'secondary';
}

// 状态 -> 颜色令牌（自研视觉）
export function orderStatusColor(status) {
  if (status === '已完成') return 'var(--green)';
  if (status === '待确认') return 'var(--orange)';
  if (status === '待发货' || status === '待收货') return 'var(--blue)';
  if (status === '退款中') return 'var(--orange)';
  if (status === '已取消') return 'var(--gray)';
  return 'var(--gray)';
}

// 主链路步骤（退款/取消不走 Steps，用 Timeline 展示）
export const ORDER_STEPS = [
  { label: '待确认' },
  { label: '待发货' },
  { label: '待收货' },
  { label: '已完成' },
];

// 状态 -> Steps activeIndex（-1 表示不在主链路上）
export function orderStepIndex(status) {
  const i = ORDER_STEPS.findIndex((s) => s.label === status);
  return i < 0 ? -1 : i + 1;
}

// 每个状态下，当前用户（买家/卖家）可执行的流转按钮
// 返回 [{ to, label, severity }]
export function orderActions(status, relation) {
  const isBuyer = relation === 'buyer';
  const isSeller = relation === 'seller';
  if (status === '待确认') {
    const list = [];
    if (isSeller) list.push({ to: '待发货', label: '确认订单', severity: 'primary' });
    if (isBuyer) list.push({ to: '已取消', label: '取消订单', severity: 'secondary' });
    return list;
  }
  if (status === '待发货') {
    const list = [];
    if (isSeller) list.push({ to: '待收货', label: '确认发货', severity: 'primary' });
    if (isBuyer) list.push({ to: '退款中', label: '申请退款', severity: 'secondary' });
    return list;
  }
  if (status === '待收货') {
    const list = [];
    if (isBuyer) list.push({ to: '已完成', label: '确认收货', severity: 'primary' });
    if (isBuyer) list.push({ to: '退款中', label: '申请退款', severity: 'secondary' });
    return list;
  }
  if (status === '退款中') {
    if (isSeller) return [{ to: '已取消', label: '同意退款', severity: 'primary' }];
    return [];
  }
  return [];
}

// 状态 -> 中文说明
export function orderStatusHint(status, relation) {
  const me = relation === 'seller' ? '买家' : '卖家';
  if (status === '待确认') return relation === 'seller' ? '买家已下单，请及时确认。' : '你已下单，等待卖家确认。';
  if (status === '待发货') return relation === 'seller' ? '请尽快发货。' : '卖家已确认，等待发货。';
  if (status === '待收货') return relation === 'buyer' ? '卖家已发货，当面交易后点「确认收货」。' : `等待${me}收货。`;
  if (status === '已完成') return '交易已完成，欢迎互相评价。';
  if (status === '退款中') return relation === 'seller' ? '买家申请退款，请处理。' : '退款申请处理中。';
  if (status === '已取消') return '该订单已关闭。';
  return '';
}

// 订单状态 -> 主链路时间线（供 Timeline / 自研时间轴使用）
export function orderTimeline(status) {
  const idx = orderStepIndex(status);
  const terminal = status === '已取消' || status === '退款中';
  return ORDER_STEPS.map((s, i) => {
    const done = idx >= 0 ? i < idx : (status === '退款中' ? i <= 1 : i === 0);
    let note = '';
    if (terminal && i === ORDER_STEPS.length - 1) note = `订单${status}`;
    else if (done) note = '已完成';
    else note = '待处理';
    return { label: s.label, done, note };
  });
}

// 状态流转向导文案
export const STATUS_CONFIRM_TEXT = {
  待发货: '确认接受这笔订单？确认后商品将标记为已售。',
  待收货: '确认已发货？',
  已完成: '确认已收到货物？确认后交易完成，可互相评价。',
  已取消: '确认取消这笔订单？商品将重新上架。',
  退款中: '确认发起退款申请？',
};

export function firstImage(item) {
  const imgs = item?.images?.split(',').filter(Boolean) || [];
  return imgs[0] || '';
}
