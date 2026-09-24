// 全局浮层 UI 状态：抽屉式详情 / 浮层聊天窗 / 全屏发布向导 / 登录弹窗
import { reactive } from 'vue';

export const ui = reactive({
  // --- 发布向导（原发布弹窗，现为全屏向导） ---
  publishOpen: false,
  publishMode: 'item',

  // --- 右侧抽屉式商品详情 ---
  drawerOpen: false,
  drawerItemId: null,
  drawerList: [],     // 当前集市已加载列表，用于抽屉内「连续浏览」
  drawerIndex: -1,

  // --- 右下角浮层聊天窗 ---
  chatOpen: false,
  chatMin: false,     // 最小化为气泡
  chatConvId: null,
  chatUnread: 0,

  // --- 顶部铃铛未读角标 ---
  notifUnread: 0,
});

/* ---------- 发布向导 ---------- */
export function openPublish(mode = 'item') {
  ui.publishMode = mode;
  ui.publishOpen = true;
}
export function closePublish() { ui.publishOpen = false; }

/* ---------- 抽屉式详情 ---------- */
export function openItem(id, list) {
  if (Array.isArray(list) && list.length) {
    ui.drawerList = list.slice();
    ui.drawerIndex = ui.drawerList.findIndex((it) => String(it.id) === String(id));
  } else if (!ui.drawerList.some((it) => String(it.id) === String(id))) {
    ui.drawerList = [];
    ui.drawerIndex = -1;
  }
  ui.drawerItemId = id;
  ui.drawerOpen = true;
}
export function closeItem() {
  ui.drawerOpen = false;
  ui.drawerItemId = null;
}
// 抽屉内连续浏览：在同批列表里前后翻
export function stepItem(delta) {
  if (ui.drawerIndex < 0 || !ui.drawerList.length) return false;
  const next = ui.drawerIndex + delta;
  if (next < 0 || next >= ui.drawerList.length) return false;
  ui.drawerIndex = next;
  ui.drawerItemId = ui.drawerList[next].id;
  return true;
}

/* ---------- 浮层聊天窗 ---------- */
export function openChatDock(convId = null) {
  if (convId != null) ui.chatConvId = Number(convId);
  ui.chatOpen = true;
  ui.chatMin = false;
}
export function closeChatDock() { ui.chatOpen = false; }
export function toggleChatMin() { ui.chatMin = !ui.chatMin; }
