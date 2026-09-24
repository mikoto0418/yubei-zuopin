<template>
  <!-- 路由 /chat 与 /chat/:convId 仍可达（path 未改动）
       主体复用浮层窗同一套 ChatPanel；同时提供「浮层形态」入口 -->
  <div class="wrap" style="padding-top: 30px;">
    <div class="title-bar">
      <h2><i class="pi pi-comments" /> 站内消息</h2>
      <Tag value="CHAT" severity="danger" />
      <Button size="small" severity="contrast" label="以浮层窗打开" icon="pi pi-window-maximize"
        @click="asDock" />
    </div>

    <div class="chat-full">
      <ChatPanel :conv-id="activeId" @open="onOpen" @unread="(n) => (ui.chatUnread = n)" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import ChatPanel from '../components/ChatPanel.vue';
import store from '../store.js';
import { ui, openChatDock } from '../ui.js';

const route = useRoute();
const router = useRouter();
const activeId = computed(() => (route.params.convId ? Number(route.params.convId) : null));

function onOpen(id) { router.push('/chat/' + id); }
function asDock() { openChatDock(activeId.value); router.push('/'); }

onMounted(() => { if (!store.state.user) store.refreshMe(); });
</script>

<style scoped>
.chat-full {
  height: calc(100vh - 260px); min-height: 420px;
  border: var(--border); box-shadow: var(--shadow); background: #fff;
  display: flex; overflow: hidden;
}
</style>
