// 工单状态机：唯一事实来源。后端路由与测试都从这里取规则，
// 避免状态流转逻辑散落在各处导致校验不一致。
'use strict';

// 六状态：创建 → 派单 → 维修中 → 已处理 → 已验收 → 已关闭
const WORK_ORDER_STATUS = ['created', 'assigned', 'in_progress', 'resolved', 'verified', 'closed'];

const STATUS_LABEL = {
  created: '待派单',
  assigned: '已派单',
  in_progress: '维修中',
  resolved: '待验收',
  verified: '已验收',
  closed: '已关闭',
};

// 允许的流转：resolved 可退回 in_progress 重做，其余为单向推进。
const WORK_ORDER_TRANSITIONS = {
  created: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['verified', 'in_progress'],
  verified: ['closed'],
  closed: [],
};

// 视为「占用班组产能」的状态。
const ACTIVE_STATUS = ['assigned', 'in_progress', 'resolved'];

function isStatus(s) {
  return WORK_ORDER_STATUS.includes(s);
}

function canTransition(from, to) {
  if (!isStatus(from) || !isStatus(to)) return false;
  return (WORK_ORDER_TRANSITIONS[from] || []).includes(to);
}

function nextStates(from) {
  return WORK_ORDER_TRANSITIONS[from] ? [...WORK_ORDER_TRANSITIONS[from]] : [];
}

// 生成人话版错误信息，前端可直接提示。
function transitionError(from, to) {
  if (!isStatus(from)) return `未知的当前状态：${from}`;
  if (!isStatus(to)) return `未知的目标状态：${to}`;
  const allowed = nextStates(from).map((s) => `${s}(${STATUS_LABEL[s]})`).join('、');
  return allowed
    ? `非法流转：${from}(${STATUS_LABEL[from]}) 不能直接变更为 ${to}(${STATUS_LABEL[to]})，仅允许 ${allowed}`
    : `${from}(${STATUS_LABEL[from]}) 已是终态，不可再流转`;
}

module.exports = {
  WORK_ORDER_STATUS,
  WORK_ORDER_TRANSITIONS,
  STATUS_LABEL,
  ACTIVE_STATUS,
  isStatus,
  canTransition,
  nextStates,
  transitionError,
};
