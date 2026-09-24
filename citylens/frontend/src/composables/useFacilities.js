// 设施数据 + 地图筛选状态的共享 composable。
// 地图主页与设施列表页共用一套加载/筛选逻辑，避免重复。
import { computed, reactive, ref } from 'vue'
import { api } from '../api'

export function useFacilityStore() {
  const loading = ref(false)
  const error = ref('')
  const facilities = ref([])
  const total = ref(0)

  const filters = reactive({
    categories: [],
    statuses: [],
    keyword: '',
  })

  async function load() {
    loading.value = true
    error.value = ''
    try {
      // 一次性拉取全部（地图需要全量点位），all=1 让管理员看到所有用户的数据
      const data = await api.list('facilities', { all: 1, pageSize: 500 })
      facilities.value = data.list || []
      total.value = data.total || 0
    } catch (e) {
      error.value = e.message || '加载设施数据失败'
      facilities.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  // 客户端二次过滤：地图上的显隐必须即时响应，不能每次都打后端
  const visible = computed(() => {
    const kw = filters.keyword.trim().toLowerCase()
    return facilities.value.filter((f) => {
      if (filters.categories.length && !filters.categories.includes(f.category)) return false
      if (filters.statuses.length && !filters.statuses.includes(f.status)) return false
      if (kw) {
        const hay = `${f.name || ''} ${f.address || ''} ${f.note || ''}`.toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  })

  const statusCount = computed(() => {
    const acc = {}
    facilities.value.forEach((f) => {
      acc[f.status] = (acc[f.status] || 0) + 1
    })
    return acc
  })

  const categoryCount = computed(() => {
    const acc = {}
    facilities.value.forEach((f) => {
      acc[f.category] = (acc[f.category] || 0) + 1
    })
    return acc
  })

  function toggleCategory(c) {
    const i = filters.categories.indexOf(c)
    if (i >= 0) filters.categories.splice(i, 1)
    else filters.categories.push(c)
  }

  function toggleStatus(s) {
    const i = filters.statuses.indexOf(s)
    if (i >= 0) filters.statuses.splice(i, 1)
    else filters.statuses.push(s)
  }

  function reset() {
    filters.categories = []
    filters.statuses = []
    filters.keyword = ''
  }

  async function remove(id) {
    await api.remove('facilities', id)
    facilities.value = facilities.value.filter((f) => f.id !== id)
    total.value = Math.max(0, total.value - 1)
  }

  function upsert(row) {
    const i = facilities.value.findIndex((f) => f.id === row.id)
    if (i >= 0) facilities.value.splice(i, 1, row)
    else facilities.value.unshift(row)
  }

  return {
    loading, error, facilities, total, filters,
    visible, statusCount, categoryCount,
    load, reset, remove, upsert,
    toggleCategory, toggleStatus,
  }
}

// 单例，两个页面共享同一份数据
let singleton = null
export function facilityStore() {
  if (!singleton) singleton = useFacilityStore()
  return singleton
}
