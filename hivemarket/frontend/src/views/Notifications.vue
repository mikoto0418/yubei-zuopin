<template>
  <div class="wrap hm-page">
    <div class="nt-head">
      <div>
        <div class="hm-title">通知中心</div>
        <div class="hm-sub" style="margin-bottom:0;">订单、消息、评价、举报的处理进度都会在这里。</div>
      </div>
      <div class="nt-actions">
        <Button label="只看未读" size="small" :severity="onlyUnread ? 'primary' : 'secondary'" @click="toggleUnread" />
        <Button label="全部已读" size="small" severity="secondary" :disabled="!unread" @click="readAll" />
      </div>
    </div>

    <!-- 加载骨架 -->
    <div v-if="loading" class="hm-skeleton">
      <div v-for="i in 5" :key="i" class="hm-skel-row apple-skeleton"></div>
    </div>

    <!-- 无权限 -->
    <div v-else-if="needLogin" class="hm-state">
      <div class="icon">🔒</div>
      <div class="title">需要登录</div>
      <div class="desc">登录后即可查看你的通知。</div>
      <Button label="去登录" @click="$router.push({ path: '/login', query: { redirect: '/notifications' } })" />
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="hm-state">
      <div class="icon">⚠️</div>
      <div class="title">加载失败</div>
      <div class="desc">{{ error }}</div>
      <Button label="重试" icon="pi pi-refresh" @click="load" />
    </div>

    <!-- 空态 -->
    <div v-else-if="!list.length" class="hm-state">
      <div class="icon">🔔</div>
      <div class="title">{{ onlyUnread ? '没有未读通知' : '还没有收到通知' }}</div>
      <div class="desc">下单、状态变更、收到评价时都会提醒你。</div>
      <Button label="去逛集市" @click="$router.push('/')" />
    </div>

    <!-- 通知列表 -->
    <div v-else class="hm-list">
      <div
        v-for="n in list" :key="n.id"
        class="hm-item nt-item" :class="{ unread: !n.read }"
        @click="open(n)"
      >
        <div class="nt-ico">{{ typeIcon(n.type) }}</div>
        <div class="hm-item-main">
          <div class="nt-top">
            <div class="hm-item-title">{{ n.title }}</div>
            <span v-if="!n.read" class="nt-dot" />
          </div>
          <div v-if="n.body" class="hm-item-body">{{ n.body }}</div>
          <div class="hm-item-meta">{{ n.created_at }}</div>
        </div>
      </div>

      <div v-if="pages > 1" class="nt-pager">
        <Button label="上一页" size="small" severity="secondary" :disabled="page <= 1" @click="goto(page - 1)" />
        <span class="muted">{{ page }} / {{ pages }}</span>
        <Button label="下一页" size="small" severity="secondary" :disabled="page >= pages" @click="goto(page + 1)" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import api from '../api.js';
import { ui } from '../ui.js';

const router = useRouter();

const list = ref([]);
const unread = ref(0);
const loading = ref(false);
const error = ref('');
const needLogin = ref(false);
const onlyUnread = ref(false);
const page = ref(1);
const pages = ref(1);

function typeIcon(t) {
  if (t === 'order') return '📦';
  if (t === 'message') return '💬';
  if (t === 'review') return '⭐';
  if (t === 'report') return '🛡️';
  return '🔔';
}

async function load() {
  loading.value = true;
  error.value = '';
  needLogin.value = false;
  try {
    const qs = new URLSearchParams({ page: String(page.value), pageSize: '20' });
    if (onlyUnread.value) qs.set('unread', '1');
    const data = await api.get('/notifications?' + qs.toString());
    list.value = data.notifications;
    unread.value = data.unread;
    pages.value = data.pages || 1;
    ui.notifUnread = data.unread;
  } catch (e) {
    if (e.status === 401) needLogin.value = true;
    else error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function toggleUnread() { onlyUnread.value = !onlyUnread.value; page.value = 1; load(); }
function goto(p) { page.value = p; load(); }

async function open(n) {
  if (!n.read) {
    try {
      const r = await api.patch(`/notifications/${n.id}/read`);
      n.read = 1;
      unread.value = r.unread;
      ui.notifUnread = r.unread;
    } catch (e) { /* 静默 */ }
  }
  if (n.link) router.push(n.link);
}

async function readAll() {
  try {
    await api.patch('/notifications/read-all');
    ui.notifUnread = 0;
    load();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<style scoped>
.nt-head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; margin-bottom: var(--sp-5); }
.nt-actions { display: flex; gap: var(--sp-2); }

.nt-item { cursor: pointer; transition: background-color var(--dur-fast) var(--ease-standard); }
.nt-item:hover { background: var(--fill-tertiary); }
.nt-item.unread { background: var(--tint-soft); }
.nt-ico {
  width: 40px; height: 40px; flex: none; border-radius: var(--radius-md);
  background: var(--fill-tertiary); display: flex; align-items: center; justify-content: center; font-size: 19px;
}
.nt-top { display: flex; align-items: center; gap: var(--sp-2); }
.nt-dot { width: 8px; height: 8px; border-radius: var(--radius-full); background: var(--red); flex: none; }
.nt-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-3); margin-top: var(--sp-5); }
</style>
