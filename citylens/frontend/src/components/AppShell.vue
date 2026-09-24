<!-- 列表类页面的统一外壳：顶部导航 + 页面容器。
     地图页不用它（地图要全屏），其余页面用它保持导航一致。 -->
<script setup>
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../auth'

defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
})

const router = useRouter()
const route = useRoute()
const { state, logout } = useAuth()

const NAV = [
  { name: 'map', label: '地图', path: '/map' },
  { name: 'facilities', label: '设施', path: '/facilities' },
  { name: 'workOrders', label: '工单', path: '/work-orders' },
  { name: 'inspectionRoutes', label: '巡检路线', path: '/routes' },
  { name: 'teams', label: '班组', path: '/teams' },
  { name: 'districts', label: '区域', path: '/districts' },
  { name: 'facilityTypes', label: '类型', path: '/facility-types' },
]

function isActive(name) {
  return route.name === name
}

function doLogout() {
  logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="cl-page">
    <div class="cl-page-inner">
      <nav class="cl-nav">
        <div class="cl-brand">
          <div class="cl-brand-badge"><el-icon><Location /></el-icon></div>
          <div>
            CityLens
            <span class="cl-brand-sub">城市设施巡检</span>
          </div>
        </div>

        <div class="cl-nav-links">
          <button
            v-for="item in NAV"
            :key="item.name"
            class="cl-nav-link"
            :class="{ 'is-active': isActive(item.name) }"
            @click="router.push(item.path)"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="cl-spacer" />

        <el-button v-if="state.user?.role === 'admin'" text @click="router.push('/admin')">
          管理概览
        </el-button>
        <el-dropdown trigger="click">
          <el-button circle>
            <el-icon><User /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>
                {{ state.user?.nickname || state.user?.username }}
              </el-dropdown-item>
              <el-dropdown-item divided @click="doLogout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </nav>

      <header v-if="title" class="cl-page-head">
        <div>
          <h1 class="cl-page-title">{{ title }}</h1>
          <div v-if="subtitle" class="cl-page-sub">{{ subtitle }}</div>
        </div>
        <div class="cl-spacer" />
        <slot name="actions" />
      </header>

      <slot />
    </div>
  </div>
</template>

<style scoped>
.cl-nav {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  margin-bottom: var(--sp-5);
  padding-bottom: var(--sp-3);
  border-bottom: 1px solid var(--separator);
  flex-wrap: wrap;
}

.cl-nav-links {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--fill-secondary);
  padding: 3px;
  border-radius: var(--radius-md);
}

.cl-nav-link {
  border: none;
  background: transparent;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: var(--fs-footnote);
  font-weight: 500;
  color: var(--label-secondary);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-standard),
              color var(--dur-fast) var(--ease-standard);
}

.cl-nav-link:hover {
  color: var(--label);
}

.cl-nav-link.is-active {
  background: var(--bg-surface);
  color: var(--label);
  box-shadow: var(--shadow-card);
}
</style>
