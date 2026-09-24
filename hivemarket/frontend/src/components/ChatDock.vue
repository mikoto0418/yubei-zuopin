<template>
  <!-- 右下角浮层聊天窗（客服窗口形态），可最小化为气泡 -->
  <div class="dock">
    <!-- 最小化气泡 -->
    <button v-if="!ui.chatOpen || ui.chatMin" class="dock-bubble" title="打开消息" @click="open">
      <i class="pi pi-comments" />
      <span class="dock-bubble-txt">消息</span>
      <span v-if="ui.chatUnread > 0" class="dock-dot">{{ ui.chatUnread }}</span>
    </button>

    <!-- 展开的聊天窗 -->
    <div v-if="ui.chatOpen && !ui.chatMin" class="dock-win">
      <header class="dock-head">
        <span><i class="pi pi-comments" /> HiveMarket 消息</span>
        <div class="dock-head-btns">
          <button title="最小化" @click="toggleChatMin"><i class="pi pi-minus" /></button>
          <button title="关闭" @click="closeChatDock"><i class="pi pi-times" /></button>
        </div>
      </header>
      <div class="dock-body">
        <ChatPanel compact :conv-id="ui.chatConvId" @open="onOpen" @back="ui.chatConvId = null"
          @unread="(n) => (ui.chatUnread = n)" />
      </div>
    </div>
  </div>
</template>

<script setup>
import ChatPanel from './ChatPanel.vue';
import { ui, openChatDock, closeChatDock, toggleChatMin } from '../ui.js';

function open() { openChatDock(); }
function onOpen(id) { ui.chatConvId = id; }
</script>

<style scoped>
.dock { position: fixed; right: 20px; bottom: 20px; z-index: 80; }

.dock-bubble {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--red); color: #fff;
  border: var(--border); box-shadow: var(--shadow);
  padding: 12px 16px; font-weight: 900; text-transform: uppercase;
  letter-spacing: .5px; cursor: pointer; position: relative;
  transform: rotate(-1deg);
}
.dock-bubble:hover { transform: translate(2px, 2px) rotate(-1deg); box-shadow: var(--shadow-sm); }
.dock-bubble i { font-size: 18px; }
.dock-bubble-txt { font-size: 14px; }
.dock-dot {
  position: absolute; top: -10px; right: -10px;
  background: var(--yellow); color: var(--black);
  border: 2px solid var(--black); box-shadow: 2px 2px 0 0 var(--black);
  min-width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 900;
}

.dock-win {
  width: min(760px, 92vw); height: min(480px, 74vh);
  background: var(--paper);
  border: var(--border); box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column; overflow: hidden;
}
.dock-head {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px; background: var(--black); color: var(--yellow);
  font-weight: 900; text-transform: uppercase; letter-spacing: .5px; font-size: 13px;
  border-bottom: var(--border);
}
.dock-head-btns { display: flex; gap: 6px; }
.dock-head-btns button {
  width: 26px; height: 26px; border: 2px solid #fff; background: var(--yellow);
  color: var(--black); cursor: pointer; font-weight: 900;
  display: inline-flex; align-items: center; justify-content: center;
}
.dock-head-btns button:hover { background: var(--red); color: #fff; }
.dock-body { flex: 1; min-height: 0; }

@media (max-width: 720px) {
  .dock { right: 12px; bottom: 12px; }
  .dock-win { width: 94vw; height: 68vh; }
  .dock-bubble-txt { display: none; }
}
</style>
