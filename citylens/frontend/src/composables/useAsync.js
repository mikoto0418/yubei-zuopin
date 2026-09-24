// 列表页通用异步状态：加载 / 错误 / 数据 / 五态判定。
// 每个页面只需给出 fetcher，骨架、空态、错误重试的判定都从这里取。
import { ref, computed } from 'vue'

export function useAsync(fetcher, { immediate = true } = {}) {
  const data = ref(null)
  const loading = ref(false)
  const error = ref('')
  const forbidden = ref(false)

  async function run(...args) {
    loading.value = true
    error.value = ''
    forbidden.value = false
    try {
      data.value = await fetcher(...args)
      return data.value
    } catch (e) {
      if (e.status === 403) forbidden.value = true
      else error.value = e.message || '加载失败'
      data.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  // 空态：加载完成、无错误、无权限限制，但列表为空
  const isEmpty = computed(() => !loading.value && !error.value && !forbidden.value && !!data.value
    && Array.isArray(data.value.list) && data.value.list.length === 0)

  if (immediate) run()

  return { data, loading, error, forbidden, isEmpty, run }
}

// 通用的防抖，用于搜索框输入。
export function debounce(fn, wait = 300) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}

// 负载率 → 语义色 class，班组管理页与概览共用。
export function loadClass(load) {
  if (load >= 1) return 'is-full'
  if (load >= 0.7) return 'is-warn'
  return ''
}

export function formatTime(s) {
  if (!s) return '—'
  return String(s).replace('T', ' ').slice(0, 16)
}
