<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import { useAuth } from '../auth'
import { facilityStore } from '../composables/useFacilities'
import { createMap, renderMarkers } from '../mapEngine'
import { CATEGORY_ICON, DEFAULT_CENTER, DEFAULT_ZOOM, STATUS_TAG } from '../constants'
import FilterPanel from '../components/FilterPanel.vue'
import FacilityDrawer from '../components/FacilityDrawer.vue'

const router = useRouter()
const route = useRoute()
const { state: authState, logout } = useAuth()
const store = facilityStore()

const mapEl = ref(null)
const mapState = ref(null)
const online = ref(true)
const filterCollapsed = ref(false)
const selected = ref(null)
const drawerOpen = ref(false)
const locating = ref(false)

const searchText = ref('')
const routeLoading = ref(false)
const routeResult = ref('')
const routeSource = ref('')
const routeDialog = ref(false)

const activeCount = computed(() => store.visible.value.length)

const NAV = [
  { path: '/facilities', label: '设施台账' },
  { path: '/work-orders', label: '工单管理' },
  { path: '/routes', label: '巡检路线' },
  { path: '/teams', label: '班组' },
  { path: '/districts', label: '区域' },
  { path: '/facility-types', label: '类型' },
]

// ---------- 地图初始化 ----------
onMounted(async () => {
  await store.load()
  await nextTick()

  const st = createMap(mapEl.value)
  mapState.value = st
  online.value = st.online

  st.map.on('cl:offline', () => {
    online.value = false
    ElMessage.warning('底图瓦片不可达，已切换为离线网格底图（标记仍可正常使用）')
  })
  st.map.on('cl:online', () => {
    online.value = true
    ElMessage.success('已恢复在线地图瓦片')
  })

  drawMarkers()
  fitToVisible()

  const focusId = Number(route.query.focus)
  if (focusId) {
    const target = store.facilities.value.find((f) => f.id === focusId)
    if (target) nextTick(() => selectFacility(target))
  }
})

onUnmounted(() => {
  mapState.value?.destroy()
})

function drawMarkers() {
  if (!mapState.value) return
  renderMarkers(
    mapState.value,
    store.visible.value,
    (f) => selectFacility(f),
    selected.value?.id ?? null,
  )
}

watch(() => store.visible.value, drawMarkers)

watch(() => store.filters.keyword, (v) => {
  if (v !== searchText.value) searchText.value = v
})

// ---------- 搜索 ----------
function querySearch(q, cb) {
  const kw = (q || '').trim().toLowerCase()
  if (!kw) return cb([])
  const hits = store.facilities.value
    .filter((f) => `${f.name} ${f.address}`.toLowerCase().includes(kw))
    .slice(0, 10)
    .map((f) => ({ value: f.name, id: f.id, facility: f }))
  cb(hits)
}

function onSearchPick(item) {
  if (item?.facility) selectFacility(item.facility, true)
}

function onSearchEnter() {
  store.filters.keyword = searchText.value
  const first = store.visible.value[0]
  if (first) selectFacility(first, true)
  else if (searchText.value) ElMessage.info('没有匹配的设施')
}

// ---------- 选中 / 定位 ----------
function selectFacility(f, fly = true) {
  selected.value = f
  drawerOpen.value = true
  drawMarkers()
  const st = mapState.value
  if (!st) return
  const lat = Number(f.lat)
  const lng = Number(f.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) {
    if (fly) st.map.flyTo([lat, lng], Math.max(st.map.getZoom(), 15), { duration: 0.6 })
  } else {
    ElMessage.warning('该设施未填写有效坐标')
  }
}

function closeDrawer() {
  drawerOpen.value = false
  selected.value = null
  drawMarkers()
}

function fitToVisible() {
  const st = mapState.value
  if (!st) return
  const pts = store.visible.value
    .map((f) => [Number(f.lat), Number(f.lng)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && (a || b))
  if (!pts.length) {
    st.map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    return
  }
  st.map.fitBounds(pts, { padding: [70, 70], maxZoom: 16 })
}

function locateMe() {
  if (!navigator.geolocation) {
    ElMessage.warning('当前浏览器不支持定位')
    return
  }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      const { latitude, longitude } = pos.coords
      mapState.value?.map.flyTo([latitude, longitude], 16, { duration: 0.8 })
      ElMessage.success('已定位到当前位置')
    },
    () => {
      locating.value = false
      ElMessage.warning('定位失败或未授权，已保持当前视野')
    },
    { timeout: 8000 },
  )
}

// ---------- AI 路线规划 ----------
async function planRoute() {
  if (!activeCount.value) {
    ElMessage.info('当前没有可规划的设施')
    return
  }
  routeLoading.value = true
  routeResult.value = ''
  routeSource.value = ''
  routeDialog.value = true
  try {
    const payload = store.visible.value.slice(0, 30).map((f) => ({
      name: f.name, address: f.address, lat: f.lat, lng: f.lng, status: f.status,
    }))
    const data = await api.planRoute(payload)
    routeResult.value = data.text || '（AI 未返回内容）'
    routeSource.value = data.source || ''
  } catch (e) {
    routeResult.value = `规划失败：${e.message || '未知错误'}`
  } finally {
    routeLoading.value = false
  }
}

function onFacilityUpdated() {
  store.load()
}

function doLogout() {
  logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="cl-map-shell">
    <div ref="mapEl" class="cl-map" :class="{ 'is-offline': !online }" />

    <!-- 顶部栏（毛玻璃浮层） -->
    <header class="cl-panel cl-float cl-topbar">
      <div class="cl-brand">
        <div class="cl-brand-badge"><el-icon><Location /></el-icon></div>
        <div>
          CityLens
          <span class="cl-brand-sub">城市设施巡检 · 空间视图</span>
        </div>
      </div>

      <div class="cl-search">
        <el-autocomplete
          v-model="searchText"
          :fetch-suggestions="querySearch"
          placeholder="搜索设施名称或地址，回车定位"
          clearable
          style="width: 100%"
          @select="onSearchPick"
          @keyup.enter="onSearchEnter"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
          <template #default="{ item }">
            <div style="display: flex; justify-content: space-between; gap: 12px">
              <span>{{ CATEGORY_ICON[item.facility.category] }} {{ item.value }}</span>
              <el-tag size="small" :type="STATUS_TAG[item.facility.status] || 'info'">
                {{ item.facility.status }}
              </el-tag>
            </div>
          </template>
        </el-autocomplete>
      </div>

      <div class="cl-topbar-right">
        <el-tag v-if="!online" type="warning" class="cl-offline-tip">
          <el-icon><WarningFilled /></el-icon> 离线
        </el-tag>

        <el-tooltip content="定位到我的位置" placement="bottom">
          <el-button circle :loading="locating" @click="locateMe">
            <el-icon><Aim /></el-icon>
          </el-button>
        </el-tooltip>

        <el-tooltip content="适应全部可见设施" placement="bottom">
          <el-button circle @click="fitToVisible">
            <el-icon><FullScreen /></el-icon>
          </el-button>
        </el-tooltip>

        <el-button v-for="n in NAV" :key="n.path" @click="router.push(n.path)">
          {{ n.label }}
        </el-button>

        <el-dropdown trigger="click">
          <el-button circle>
            <el-icon><User /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>
                {{ authState.user?.nickname || authState.user?.username }}
              </el-dropdown-item>
              <el-dropdown-item v-if="authState.user?.role === 'admin'" @click="router.push('/admin')">
                管理概览
              </el-dropdown-item>
              <el-dropdown-item divided @click="doLogout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <!-- 筛选面板折叠按钮 -->
    <el-button
      v-show="filterCollapsed"
      class="cl-panel cl-float cl-filter-toggle"
      @click="filterCollapsed = false"
    >
      <el-icon style="margin-right: 4px"><Filter /></el-icon>
      筛选
      <el-badge
        v-if="store.filters.categories.length + store.filters.statuses.length"
        :value="store.filters.categories.length + store.filters.statuses.length"
        style="margin-left: 6px"
      />
    </el-button>

    <FilterPanel
      :filters="store.filters"
      :status-count="store.statusCount.value"
      :category-count="store.categoryCount.value"
      :visible-count="activeCount"
      :total-count="store.total.value"
      :collapsed="filterCollapsed"
      @toggle-category="store.toggleCategory"
      @toggle-status="store.toggleStatus"
      @reset="store.reset"
      @plan-route="planRoute"
    />
    <el-button
      v-show="!filterCollapsed"
      class="cl-panel cl-float"
      style="top: 92px; left: 328px; z-index: 810"
      circle
      size="small"
      @click="filterCollapsed = true"
    >
      <el-icon><ArrowLeft /></el-icon>
    </el-button>

    <!-- 加载骨架 -->
    <div
      v-if="store.loading.value"
      class="cl-panel cl-float cl-map-state"
    >
      <div v-for="i in 4" :key="i" class="apple-skeleton cl-skeleton-row" style="width: 220px" />
      <div class="apple-footnote apple-secondary" style="text-align: center; margin-top: 8px">
        正在加载设施点位…
      </div>
    </div>

    <!-- 错误重试 -->
    <div v-else-if="store.error.value" class="cl-panel cl-float cl-map-state">
      <el-icon class="cl-state-icon"><CircleCloseFilled /></el-icon>
      <div class="cl-state-title">设施数据加载失败</div>
      <div class="cl-state-desc">{{ store.error.value }}</div>
      <el-button type="primary" @click="store.load()">重试</el-button>
    </div>

    <!-- 空态 -->
    <div v-else-if="!store.total.value" class="cl-panel cl-float cl-map-state">
      <el-icon class="cl-state-icon"><DocumentRemove /></el-icon>
      <div class="cl-state-title">还没有任何设施点位</div>
      <div class="cl-state-desc">新增第一个设施后，地图上就会出现标记</div>
      <el-button type="primary" @click="router.push('/facilities')">去新增设施</el-button>
    </div>

    <!-- 筛选后无结果 -->
    <div v-else-if="!activeCount" class="cl-panel cl-float cl-map-state">
      <div class="cl-state-title">当前筛选条件下没有设施</div>
      <div class="cl-state-desc">试着放宽类别或状态条件</div>
      <el-button type="primary" @click="store.reset()">重置筛选</el-button>
    </div>

    <FacilityDrawer
      :facility="selected"
      :open="drawerOpen"
      @close="closeDrawer"
      @updated="onFacilityUpdated"
    />

    <!-- AI 路线规划结果 -->
    <el-dialog v-model="routeDialog" title="AI 巡检路线规划" width="600px">
      <div v-if="routeLoading" style="padding: 12px 0">
        <div v-for="i in 5" :key="i" class="apple-skeleton cl-skeleton-row" />
        <div class="apple-footnote apple-secondary" style="text-align: center; margin-top: 10px">
          正在依据 {{ activeCount }} 个点位规划路线…
        </div>
      </div>
      <template v-else>
        <div class="cl-ai-box" style="margin-top: 0">{{ routeResult }}</div>
        <div style="margin-top: 10px">
          <el-tag size="small" :type="routeSource === 'llm' ? 'success' : 'info'">
            来源：{{ routeSource === 'llm' ? '大模型生成' : '本地规则降级' }}
          </el-tag>
        </div>
      </template>
      <template #footer>
        <el-button @click="routeDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cl-map-state {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: var(--sp-6) var(--sp-8);
  text-align: center;
  max-width: 400px;
}
</style>
