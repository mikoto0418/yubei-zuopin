<template>
  <!-- 聊天主体：会话列表 + 对话线程。桌面浮层窗与 /chat 页面共用 -->
  <div class="cp" :class="{ 'cp-compact': compact }">
    <!-- 会话列表 -->
    <div class="cp-list" v-if="!compact || !activeId">
      <div class="cp-list-head">
        <span><i class="pi pi-comments" /> 会话</span>
        <Badge v-if="unreadTotal > 0" :value="unreadTotal" severity="danger" />
      </div>
      <div class="cp-list-body">
        <div v-if="conversations.length">
          <div class="cp-conv" v-for="c in conversations" :key="c.id"
               :class="{ 'is-active': c.id === activeId }" @click="$emit('open', c.id)">
            <div class="cp-conv-main">
              <div class="cp-conv-title">
                {{ c.title_text }}
                <Badge v-if="c.unread > 0" :value="c.unread" severity="danger" />
              </div>
              <div class="cp-conv-sub">{{ c.item_title }} · {{ c.last_message || '暂无消息' }}</div>
            </div>
            <div class="cp-conv-time">{{ c.last_time || '' }}</div>
          </div>
        </div>
        <div class="cp-empty" v-else>
          还没有会话<br />去商品详情点「聊一聊」开始吧～
        </div>
      </div>
    </div>

    <!-- 对话线程 -->
    <div class="cp-thread" v-if="activeId || compact">
      <template v-if="activeId">
        <div class="cp-thread-head">
          <button v-if="compact" class="cp-back" title="返回会话列表" @click="$emit('back')">
            <i class="pi pi-angle-left" />
          </button>
          <Avatar :label="(peerName || '对').slice(0, 1)" shape="square" />
          <div class="cp-thread-title">
            <div>{{ activeConv?.item_title || '对话' }}</div>
            <div class="cp-peer">{{ peerName }}</div>
          </div>
        </div>
        <div class="cp-log" ref="logEl">
          <div v-for="m in messages" :key="m.id" class="cp-msg"
               :class="m.sender_id === me?.id ? 'mine' : 'theirs'">
            <small>{{ m.sender_id === me?.id ? '我' : peerName }}</small>
            {{ m.content }}
          </div>
          <div class="cp-empty" v-if="!messages.length">发送第一条消息吧</div>
        </div>
        <form class="cp-form" @submit.prevent="send">
          <InputText v-model="draft" placeholder="输入消息…" class="cp-input" />
          <Button type="submit" icon="pi pi-send" :loading="sending" class="cp-send" />
        </form>
      </template>
      <div class="cp-empty cp-empty-thread" v-else>
        <i class="pi pi-angle-left" /> 请选择一个会话
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Badge from 'primevue/badge';
import Avatar from 'primevue/avatar';
import api from '../api.js';
import store from '../store.js';

const props = defineProps({
  // 当前会话 id；为空时显示会话列表
  convId: { type: [Number, String], default: null },
  // 紧凑模式（浮层窗）：窄布局
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(['open', 'back', 'unread']);

const conversations = ref([]);
const messages = ref([]);
const fetchedConv = ref(null);
const draft = ref('');
const sending = ref(false);
const logEl = ref(null);

const me = computed(() => store.state.user);
const activeId = computed(() => (props.convId != null && props.convId !== '' ? Number(props.convId) : null));
const activeConv = computed(
  () => conversations.value.find((c) => c.id === activeId.value) || fetchedConv.value
);
const peerName = computed(() => {
  if (!activeConv.value || !me.value) return '对方';
  return activeConv.value.buyer_id === me.value.id
    ? activeConv.value.seller_nickname
    : activeConv.value.buyer_nickname;
});
const unreadTotal = computed(() => conversations.value.reduce((n, c) => n + (c.unread > 0 ? 1 : 0), 0));

async function loadConvs() {
  if (!store.state.user) return;
  try {
    const data = await api.get('/messages/conversations');
    conversations.value = data.conversations.map((c) => ({
      ...c,
      title_text:
        c.buyer_id === me.value?.id
          ? `与 ${c.seller_nickname} 的会话`
          : `与 ${c.buyer_nickname} 的会话`,
    }));
    emit('unread', unreadTotal.value);
  } catch (e) {
    /* 未登录或网络异常时静默 */
  }
}

async function loadMessages(convId) {
  const data = await api.get('/messages/conversations/' + convId + '/messages');
  fetchedConv.value = data.conversation;
  messages.value = data.messages;
  await nextTick();
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
}

async function send() {
  const text = draft.value.trim();
  if (!text || !activeId.value) return;
  sending.value = true;
  try {
    const data = await api.post('/messages/conversations/' + activeId.value + '/messages', { content: text });
    messages.value.push(data.message);
    draft.value = '';
    await nextTick();
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
    loadConvs();
  } finally {
    sending.value = false;
  }
}

watch(
  activeId,
  async (id) => {
    if (id) {
      await loadMessages(id);
      loadConvs();
    } else {
      fetchedConv.value = null;
      messages.value = [];
    }
  },
  { immediate: true }
);

watch(() => store.state.user, (u) => { if (u) loadConvs(); });

onMounted(async () => {
  if (!store.state.user) await store.refreshMe();
  loadConvs();
});

defineExpose({ reload: loadConvs });
</script>

<style scoped>
.cp { display: flex; height: 100%; min-height: 0; background: #fff; }
.cp-list {
  flex: 0 0 250px; min-width: 0; border-right: var(--border);
  display: flex; flex-direction: column; min-height: 0; background: var(--paper);
}
.cp-compact .cp-list { flex: 1 1 auto; border-right: none; }
.cp-compact .cp-thread { flex: 1 1 auto; }
.cp-list-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 10px 12px; background: var(--black); color: var(--yellow);
  font-weight: 900; text-transform: uppercase; letter-spacing: .5px; font-size: 13px;
}
.cp-list-body { flex: 1; overflow-y: auto; padding: 8px; }
.cp-conv {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 9px 10px; border: 2px solid var(--black); margin-bottom: 8px;
  background: #fff; cursor: pointer; box-shadow: 2px 2px 0 0 var(--black);
}
.cp-conv:hover { background: var(--yellow); }
.cp-conv.is-active { background: var(--yellow); transform: translate(1px, 1px); box-shadow: none; }
.cp-conv-main { min-width: 0; }
.cp-conv-title { font-weight: 900; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.cp-conv-sub {
  font-size: 11px; color: var(--muted); font-weight: 700;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 165px;
}
.cp-conv-time { font-size: 10px; color: var(--muted); font-weight: 700; white-space: nowrap; }
.cp-thread { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.cp-thread-head {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  background: var(--black); color: #fff; border-bottom: var(--border); flex: 0 0 auto;
}
.cp-thread-title { min-width: 0; }
.cp-thread-title > div:first-child { font-weight: 900; font-size: 14px; }
.cp-peer { color: #d9d2c5; font-size: 11px; font-weight: 700; }
.cp-back {
  background: var(--yellow); border: 2px solid #fff; color: var(--black);
  width: 26px; height: 26px; cursor: pointer; font-weight: 900;
}
.cp-log { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 9px; }
.cp-msg { max-width: 74%; padding: 7px 11px; border: 2px solid var(--black); font-size: 13px; font-weight: 600; }
.cp-msg.mine { align-self: flex-end; background: var(--yellow); box-shadow: 2px 2px 0 0 var(--black); }
.cp-msg.theirs { align-self: flex-start; background: #fff; box-shadow: 2px 2px 0 0 var(--black); }
.cp-msg small { display: block; font-weight: 900; font-size: 10px; color: var(--muted); text-transform: uppercase; }
.cp-form { display: flex; border-top: var(--border); flex: 0 0 auto; align-items: stretch; }
.cp-input { border: none !important; box-shadow: none !important; flex: 1; }
.cp-input:focus { background: var(--yellow) !important; box-shadow: none !important; }
.cp-send {
  border: none !important; box-shadow: none !important; flex: 0 0 54px; height: auto;
}
.cp-send:hover { transform: none !important; box-shadow: none !important; }
.cp-empty { text-align: center; padding: 26px 14px; color: var(--muted); font-weight: 700; font-size: 13px; }
.cp-empty-thread { margin: auto; }
</style>
