<template>
  <div class="shell">
    <aside class="shell__nav">
      <div class="shell__brand">
        <span class="shell__mark">SF</span>
        <div>
          <div class="shell__name">ScriptForge</div>
          <div class="sf-caption">剧本创作工作台</div>
        </div>
      </div>

      <nav class="shell__menu">
        <router-link
          v-for="item in menu"
          :key="item.name"
          :to="{ name: item.name }"
          class="shell__item"
          :class="{ 'shell__item--active': $route.name === item.name }"
        >
          <span class="shell__icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="shell__foot">
        <div class="shell__user">
          <div class="shell__avatar">{{ initial }}</div>
          <div class="shell__meta">
            <div class="shell__nick">{{ user?.nickname || user?.username || '未登录' }}</div>
            <div class="sf-caption">{{ roleLabel }}</div>
          </div>
        </div>
        <button class="apple-btn apple-btn--secondary shell__logout" @click="onLogout">退出登录</button>
      </div>
    </aside>

    <main class="shell__main">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../store'

const router = useRouter()
const { state, isAdmin, canReview, logout } = useAuth()

const user = computed(() => state.user)
const initial = computed(() => (user.value?.nickname || user.value?.username || '?').slice(0, 1))
const roleLabel = computed(() => {
  const r = user.value?.role
  if (r === 'admin') return '管理员'
  if (r === 'editor') return '责编'
  if (r === 'writer') return '编剧'
  return ''
})

const menu = computed(() => {
  const base = [
    { name: 'projects', label: '我的作品', icon: '📚' },
    { name: 'characters', label: '角色管理', icon: '🎭' },
    { name: 'dialogues', label: '对白编辑', icon: '💬' },
    { name: 'storylines', label: '故事线', icon: '🧵' },
    { name: 'revisions', label: '版本历史', icon: '🕰' },
    { name: 'notes', label: '创作笔记', icon: '📝' },
  ]
  if (canReview.value) base.push({ name: 'review', label: '审阅台', icon: '📋' })
  if (isAdmin.value) base.push({ name: 'admin', label: '管理概览', icon: '⚙️' })
  return base
})

function onLogout() {
  logout()
  router.push({ name: 'login' })
}
</script>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 248px 1fr;
  min-height: 100vh;
  background: var(--bg-grouped);
}

.shell__nav {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: var(--sp-5) var(--sp-3);
  background: var(--glass-bg);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  border-right: 1px solid var(--separator);
}

.shell__brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 0 var(--sp-2) var(--sp-5);
}
.shell__mark {
  width: 38px; height: 38px;
  border-radius: var(--radius-md);
  background: var(--tint);
  color: #fff;
  display: grid; place-items: center;
  font-weight: 700; font-size: 15px;
  letter-spacing: -0.02em;
}
.shell__name { font-size: var(--fs-headline); font-weight: 600; letter-spacing: -0.02em; }

.shell__menu { display: flex; flex-direction: column; gap: 2px; flex: 1; }

.shell__item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  height: 40px;
  padding: 0 var(--sp-3);
  border-radius: var(--radius-md);
  font-size: var(--fs-subhead);
  color: var(--label);
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.shell__item:hover { background: var(--fill-secondary); }
.shell__item--active {
  background: var(--tint-soft);
  color: var(--tint);
  font-weight: 600;
}
.shell__icon { width: 20px; text-align: center; font-size: 15px; }

.shell__foot { border-top: 1px solid var(--separator); padding-top: var(--sp-4); }
.shell__user { display: flex; align-items: center; gap: var(--sp-3); padding: 0 var(--sp-2) var(--sp-3); }
.shell__avatar {
  width: 34px; height: 34px;
  border-radius: var(--radius-full);
  background: var(--fill-primary);
  display: grid; place-items: center;
  font-weight: 600; font-size: var(--fs-subhead);
  flex-shrink: 0;
}
.shell__meta { min-width: 0; }
.shell__nick {
  font-size: var(--fs-subhead);
  font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.shell__logout { width: 100%; }

.shell__main { min-width: 0; }

@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .shell__nav {
    position: static;
    height: auto;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--sp-2);
    border-right: none;
    border-bottom: 1px solid var(--separator);
  }
  .shell__brand { padding: 0 var(--sp-2); }
  .shell__menu { flex-direction: row; flex-wrap: wrap; }
  .shell__foot { border-top: none; padding-top: 0; margin-left: auto; }
  .shell__user { display: none; }
  .shell__logout { width: auto; }
}
</style>
