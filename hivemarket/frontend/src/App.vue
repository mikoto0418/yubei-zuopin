<template>
  <div>
    <!-- 公告条（保留：顶部滚动 ticker） -->
    <div class="topbar" aria-hidden="true">
      <div class="ticker">🐝 同校互淘 · 信用交易 · 发现宝藏闲置 🐝 同校互淘 · 信用交易 · 发现宝藏闲置 🐝 同校互淘 · 信用交易 · 发现宝藏闲置 🐝 同校互淘 · 信用交易 · 发现宝藏闲置</div>
    </div>

    <nav class="nav">
      <div class="wrap">
        <router-link to="/" class="logo">Hive<em>Market</em></router-link>
        <div class="nav-links">
          <router-link to="/">逛集市</router-link>
          <router-link to="/categories">分类</router-link>
          <router-link to="/wants">求购</router-link>
          <router-link to="/orders">订单</router-link>
          <router-link to="/reviews">评价</router-link>
          <router-link to="/reports">举报</router-link>
          <router-link to="/favorites">收藏</router-link>
          <router-link to="/mine">我的</router-link>
          <router-link v-if="isAdmin" to="/admin">管理后台</router-link>
        </div>
        <div class="nav-right">
          <!-- 发闲置：打开全屏向导（不再跳独立页） -->
          <Button label="发闲置" icon="pi pi-plus" size="small" severity="danger" @click="startPublish" />
          <!-- 消息：打开右下角浮层聊天窗（/chat 路由仍可达） -->
          <Button label="消息" icon="pi pi-comments" size="small" severity="secondary"
            :badge="ui.chatUnread > 0 ? String(ui.chatUnread) : undefined" @click="openChatDock()" />
          <!-- 通知铃铛（未读角标） -->
          <router-link v-if="store.state.user" to="/notifications" class="bell" aria-label="通知中心">
            <i class="pi pi-bell" />
            <span v-if="ui.notifUnread > 0" class="dot">{{ ui.notifUnread > 99 ? '99+' : ui.notifUnread }}</span>
          </router-link>
          <template v-if="store.state.user">
            <router-link to="/mine" class="nav-user">
              <Avatar :label="initial" shape="circle" /> {{ store.state.user.nickname || store.state.user.username }}
            </router-link>
            <Button label="退出" size="small" severity="secondary" @click="logout" />
          </template>
          <template v-else>
            <Button label="登录" size="small" severity="secondary" @click="go('/login')" />
            <Button label="注册" size="small" severity="danger" @click="go('/register')" />
          </template>
        </div>
      </div>
    </nav>

    <main>
      <router-view />
    </main>

    <footer class="site">HiveMarket · 校园二手交易平台 — 让闲置流动起来 🐝</footer>

    <!-- ★ 形态改造：全局浮层三件套 -->
    <ItemDrawer />
    <PublishWizard />
    <ChatDock />

    <!-- PrimeVue 全局服务 -->
    <Toast position="top-right" />
    <ConfirmDialog :draggable="false" />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import store from './store.js';
import api from './api.js';
import { ui, openPublish, openChatDock } from './ui.js';
import ItemDrawer from './components/ItemDrawer.vue';
import PublishWizard from './components/PublishWizard.vue';
import ChatDock from './components/ChatDock.vue';

const router = useRouter();
const isAdmin = computed(() => store.state.user?.role === 'admin');
const initial = computed(() => (store.state.user?.nickname || store.state.user?.username || '?').slice(0, 1));

function go(p) { router.push(p); }

// 发闲置 → 全屏向导；未登录先走登录页
function startPublish() {
  if (!store.state.user) { router.push({ path: '/login', query: { redirect: '/publish' } }); return; }
  openPublish('item');
}

function logout() {
  store.logout();
  router.push('/');
}

// 顶部未读徽标：消息会话数 + 通知未读数
async function loadUnread() {
  if (!store.state.user) return;
  try {
    const data = await api.get('/messages/conversations');
    ui.chatUnread = data.conversations.filter((c) => c.unread > 0).length;
  } catch (e) { /* 静默 */ }
  try {
    const n = await api.get('/notifications/unread-count');
    ui.notifUnread = n.unread || 0;
  } catch (e) { /* 静默 */ }
}

onMounted(async () => {
  if (!store.state.user) await store.refreshMe();
  loadUnread();
});
</script>
