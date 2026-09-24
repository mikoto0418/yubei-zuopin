<template>
  <div class="shell">
    <!-- 顶栏：毛玻璃悬浮层，承载品牌 / 命令面板入口 / 导航 / 账号 -->
    <header class="topbar sb-glass">
      <div class="brand" @click="router.push('/home')">
        <span class="brand-mark">S</span>
        <span class="brand-name">ScholarBoard</span>
      </div>

      <button class="cmdk-trigger" type="button" @click="openPalette">
        <n-icon :size="16"><SearchOutline /></n-icon>
        <span class="cmdk-txt">搜索笔记、跳转页面或执行操作…</span>
        <span class="sb-kbd">⌘</span><span class="sb-kbd">K</span>
      </button>

      <nav class="nav">
        <RouterLink
          v-for="n in navItems"
          :key="n.key"
          :to="n.to"
          class="nav-link"
          :class="{ active: activeKey === n.key }"
        >{{ n.label }}</RouterLink>
      </nav>

      <div class="account">
        <n-button quaternary size="small" @click="router.push('/profile')">
          <template #icon><span class="avatar">{{ avatarChar }}</span></template>
          {{ displayName }}
        </n-button>
        <n-button quaternary size="small" @click="logout">退出</n-button>
      </div>
    </header>

    <main class="stage" :class="{ wide: isWide }">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>

    <CommandPalette ref="palette" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { NButton, NIcon } from 'naive-ui';
import { SearchOutline } from '@vicons/ionicons5';
import { api, toast } from '../api';
import CommandPalette from '../components/CommandPalette.vue';

const route = useRoute();
const router = useRouter();
const user = api.getUser();
const palette = ref(null);

const isAdmin = computed(() => user && user.role === 'admin');
const displayName = computed(() => (user && user.nickname) || (user && user.username) || '');
const avatarChar = computed(() => (user && user.avatar) || (user ? (user.username || 'U').charAt(0).toUpperCase() : 'U'));
const activeKey = computed(() => (route.name ? String(route.name) : 'home'));

// 编辑器/看板类页面铺满舞台，其余居中阅读宽度
const WIDE_ROUTES = ['notes', 'resumes', 'tasks', 'versions'];
const isWide = computed(() => WIDE_ROUTES.includes(String(route.name)));

const navItems = computed(() => {
  const items = [
    { key: 'home', label: '活动', to: '/home' },
    { key: 'notes', label: '笔记', to: '/notes' },
    { key: 'projects', label: '项目', to: '/projects' },
    { key: 'tags', label: '标签', to: '/tags' },
    { key: 'tasks', label: '任务', to: '/tasks' },
    { key: 'resumes', label: '简历', to: '/resumes' },
  ];
  if (isAdmin.value) items.push({ key: 'dashboard', label: '仪表盘', to: '/dashboard' });
  return items;
});

function openPalette() { palette.value && palette.value.show(); }

function logout() {
  api.logout().catch(() => {});
  api.setAuth('', null);
  toast('已退出登录');
  router.push('/login');
}
</script>

<style scoped>
.shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-grouped);
  overflow: hidden;
}

/* ---- 顶栏（毛玻璃，仅悬浮层用）---- */
.topbar {
  flex: none;
  height: var(--shell-head);
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: 0 var(--sp-5);
  border-bottom: 1px solid var(--separator);
  position: relative;
  z-index: 20;
}

.brand { display: flex; align-items: center; gap: var(--sp-2); cursor: pointer; flex: none; }
.brand-mark {
  width: 26px; height: 26px;
  display: grid; place-items: center;
  background: var(--tint); color: #fff;
  border-radius: var(--radius-sm);
  font-size: 15px; font-weight: 700;
}
.brand-name { font-size: var(--fs-subhead); font-weight: 600; color: var(--label); letter-spacing: -0.01em; }

.cmdk-trigger {
  flex: 1;
  max-width: 440px;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  height: 32px;
  padding: 0 var(--sp-3);
  background: var(--fill-secondary);
  border: none;
  border-radius: var(--radius-md);
  color: var(--label-tertiary);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--fs-footnote);
  text-align: left;
  transition: background var(--dur-fast) var(--ease-standard);
}
.cmdk-trigger:hover { background: var(--fill-primary); }
.cmdk-txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.nav { display: flex; align-items: center; gap: var(--sp-1); flex: none; }
.nav-link {
  padding: 5px var(--sp-3);
  font-size: var(--fs-footnote);
  color: var(--label-secondary);
  border-radius: var(--radius-sm);
  transition: color var(--dur-fast) var(--ease-standard), background var(--dur-fast) var(--ease-standard);
}
.nav-link:hover { color: var(--label); background: var(--fill-secondary); }
.nav-link.active { color: var(--tint); background: var(--tint-soft); font-weight: 600; }

.account { margin-left: auto; display: flex; align-items: center; gap: var(--sp-1); flex: none; }
.avatar {
  width: 22px; height: 22px;
  display: grid; place-items: center;
  background: var(--tint); color: #fff;
  border-radius: var(--radius-full);
  font-size: 11px; font-weight: 600;
}

/* ---- 舞台 ---- */
.stage { flex: 1; min-height: 0; overflow: auto; padding: var(--sp-6) var(--sp-8) var(--sp-12); }
.stage > * { max-width: 1180px; margin: 0 auto; }
.stage.wide { padding: 0; overflow: hidden; }
.stage.wide > * { max-width: none; margin: 0; height: 100%; }

@media (max-width: 960px) {
  .topbar { gap: var(--sp-3); padding: 0 var(--sp-3); }
  .cmdk-trigger { max-width: none; }
  .cmdk-txt { display: none; }
  .nav { display: none; }
  .stage { padding: var(--sp-4) var(--sp-4) var(--sp-10); }
}
</style>
