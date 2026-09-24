// 地图引擎：Leaflet 初始化 + 运单路线渲染 + 时间轴联动。
//
// 本文件是「时间轴 ⇄ 地图」双向联动的地图一侧。对外暴露三类能力：
//   createLogiMap(container)     创建地图实例（含离线网格底图降级）
//   renderRoute(state, nodes, …) 把时间轴节点画成折线 + 水滴标记
//   focusNode(state, node)       把地图视野飞到某个节点（时间轴 → 地图方向）
//
// 联动的关键是 **两侧共用同一份 statusMeta 颜色映射**：
// 时间轴节点的圆点颜色、地图标记的填充色、路径分段颜色都来自 node.status，
// 所以点时间轴第 3 站，地图上飞过去的那个标记与它是同一个颜色，视觉上立刻对应上。
//
// 离线降级（与 CityLens 同思路）：
//   1) navigator.onLine === false 时直接上网格底图，不发瓦片请求；
//   2) 在线时加载 OSM 瓦片，累计 tileerror 到阈值或超时无瓦片成功 → 切网格底图；
//   3) 切到网格后定期探测恢复；
//   4) 无论底图是哪种，路线与标记图层始终存在、可点击。
import L from 'leaflet'
import { DEFAULT_CENTER, DEFAULT_ZOOM, NODE_TYPE_LABEL, statusMeta } from './constants'

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors'
const ERROR_THRESHOLD = 3
const LOAD_TIMEOUT = 4500
const RETRY_INTERVAL = 20000

// 网格底图：不依赖任何网络资源，离线必然可用。
const GridFallbackLayer = L.GridLayer.extend({
  createTile(coords) {
    const tile = document.createElement('div')
    tile.className = 'lt-grid-tile'
    const label = document.createElement('div')
    label.className = 'lt-grid-label'
    label.textContent = `z${coords.z} · ${coords.x},${coords.y}`
    tile.appendChild(label)
    return tile
  },
})

export function createLogiMap(container) {
  const map = L.map(container, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: false,
    attributionControl: true,
    preferCanvas: true,
  })

  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map)

  const state = {
    map,
    online: true,
    tileLayer: null,
    fallbackLayer: null,
    routeLayer: L.layerGroup().addTo(map),   // 折线 + 标记
    markers: new Map(),                       // nodeId -> marker
    coords: [],                               // 有效坐标序列，用于 fitBounds
    selectedId: null,
    onSelect: null,
    timer: null,
    retryTimer: null,
    errorCount: 0,
  }

  // ---------- 底图切换 ----------

  function enableFallback(reason) {
    if (!state.online) return
    state.online = false
    if (state.tileLayer) {
      map.removeLayer(state.tileLayer)
      state.tileLayer = null
    }
    if (!state.fallbackLayer) {
      state.fallbackLayer = new GridFallbackLayer({ tileSize: 256, attribution: '离线网格底图' })
    }
    state.fallbackLayer.addTo(map)
    container.classList.add('is-offline')
    scheduleRetry(reason)
  }

  function enableTiles() {
    if (state.online) return
    state.online = true
    if (state.fallbackLayer) {
      map.removeLayer(state.fallbackLayer)
      state.fallbackLayer = null
    }
    container.classList.remove('is-offline')
    mountTileLayer()
  }

  function scheduleRetry() {
    clearTimeout(state.retryTimer)
    state.retryTimer = setTimeout(() => {
      if (!state.online && navigator.onLine !== false) {
        state.online = true
        mountTileLayer()
      } else if (!state.online) {
        scheduleRetry()
      }
    }, RETRY_INTERVAL)
  }

  function mountTileLayer() {
    state.errorCount = 0
    const layer = L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
      crossOrigin: true,
    })

    let loaded = false
    layer.on('load', () => { loaded = true; clearTimeout(state.timer) })
    layer.on('tileload', () => {
      loaded = true
      state.errorCount = 0
      clearTimeout(state.timer)
      container.classList.remove('is-offline')
    })
    layer.on('tileerror', () => {
      if (loaded) return
      state.errorCount += 1
      if (state.errorCount >= ERROR_THRESHOLD) enableFallback('tileerror')
    })

    layer.addTo(map)
    state.tileLayer = layer

    // 网络挂起时 tileerror 可能不触发，用超时兜底
    clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      if (!loaded) enableFallback('timeout')
    }, LOAD_TIMEOUT)
  }

  function goOfflineNow() {
    state.online = true // 让 enableFallback 的守卫通过
    enableFallback('offline')
  }

  if (navigator.onLine === false) goOfflineNow()
  else mountTileLayer()

  const onOnline = () => { if (!state.online) enableTiles() }
  const onOffline = () => goOfflineNow()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  state.destroy = () => {
    clearTimeout(state.timer)
    clearTimeout(state.retryTimer)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    map.remove()
  }
  state.forceFallback = goOfflineNow
  state.forceOnline = enableTiles

  return state
}

// ---------- 标记图标 ----------

// 水滴形标记：颜色 = 节点状态色，选中时放大并加白色描边环。
// 这一形状与 CityLens 的标记同源，但这里多了 selected 态的强调环，
// 因为本系统的核心交互是"当前选中的是哪一个节点"。
function markerIcon(node, selected) {
  const meta = statusMeta(node.status)
  const size = selected ? 36 : 26
  const inner = node.node_type === 'origin' ? '起'
    : node.node_type === 'destination' ? '终'
      : (NODE_TYPE_LABEL[node.node_type] || '·').slice(0, 1)
  return L.divIcon({
    className: 'lt-marker-wrap',
    html: `<div class="lt-marker ${selected ? 'is-selected' : ''}" style="--m-color:${meta.color};width:${size}px;height:${size}px">
        <span>${inner}</span>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c])
}

// ---------- 路线渲染 ----------

/**
 * 依据时间轴节点重绘路线。
 * @param {object} state createLogiMap 返回的实例
 * @param {Array} nodes  时间轴节点数组（已按 seq 排序）
 * @param {object} opts  { selectedId, onSelect, fit }
 */
export function renderRoute(state, nodes, opts = {}) {
  const { selectedId = null, onSelect = null, fit = true } = opts
  state.routeLayer.clearLayers()
  state.markers.clear()
  state.selectedId = selectedId
  if (onSelect) state.onSelect = onSelect

  // 只保留有坐标的节点——时间轴可能包含尚未产生坐标的节点
  const located = nodes.filter((n) => Number(n.lat) && Number(n.lng))
  state.coords = located.map((n) => [Number(n.lat), Number(n.lng)])
  if (!located.length) return { plotted: 0 }

  // 1) 路径：整条虚线打底
  L.polyline(state.coords, {
    color: '#007AFF',
    weight: 3,
    opacity: 0.28,
    dashArray: '2 6',
    lineCap: 'round',
  }).addTo(state.routeLayer)

  // 2) 已走过的段落：按"到达顺序"分段上色，已完成段是实线
  //    这样时间轴的推进在地图上表现为"实线一段段长出来"
  for (let i = 0; i < located.length - 1; i += 1) {
    const a = located[i]
    const b = located[i + 1]
    const done = a.node_status === 'done' && b.node_status !== 'pending'
    L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
      color: done ? statusMeta(b.status).color : '#007AFF',
      weight: done ? 4 : 2,
      opacity: done ? 0.9 : 0.3,
      dashArray: done ? null : '4 6',
      lineCap: 'round',
    }).addTo(state.routeLayer)
  }

  // 3) 标记
  located.forEach((node) => {
    const marker = L.marker([Number(node.lat), Number(node.lng)], {
      icon: markerIcon(node, node.id === selectedId),
      title: node.name,
      riseOnHover: true,
      zIndexOffset: node.id === selectedId ? 1000 : 0,
    })

    const meta = statusMeta(node.status)
    marker.bindPopup(`
      <div class="lt-popup">
        <div class="lt-popup-title">${escapeHtml(node.name)}</div>
        <div class="lt-popup-row">
          <span class="lt-popup-dot" style="background:${meta.color}"></span>
          <span>${escapeHtml(meta.label)}</span>
          <span class="lt-popup-type">${escapeHtml(NODE_TYPE_LABEL[node.node_type] || node.node_type)}</span>
        </div>
        ${node.operator ? `<div class="lt-popup-sub">操作人：${escapeHtml(node.operator)}</div>` : ''}
        ${node.arrived_at ? `<div class="lt-popup-sub">到达：${escapeHtml(node.arrived_at)}</div>` : ''}
        ${node.remark ? `<div class="lt-popup-sub">${escapeHtml(node.remark)}</div>` : ''}
      </div>
    `)

    // 点击标记 → 回调（父组件据此滚动时间轴并高亮）——这是"地图 → 时间轴"方向
    marker.on('click', () => {
      if (state.onSelect) state.onSelect(node.id)
    })
    marker.addTo(state.routeLayer)
    state.markers.set(node.id, marker)
  })

  if (fit && state.coords.length > 1) {
    state.map.fitBounds(state.coords, { padding: [48, 48], maxZoom: 12 })
  } else if (fit && state.coords.length === 1) {
    state.map.setView(state.coords[0], 12)
  }

  return { plotted: located.length }
}

/**
 * 把地图视野聚焦到某个节点，并把它设为选中态。
 * 这是"时间轴 → 地图"方向的联动入口。
 */
export function focusNode(state, node, { openPopup = true } = {}) {
  if (!node || !Number(node.lat) || !Number(node.lng)) return false
  state.map.flyTo([Number(node.lat), Number(node.lng)], Math.max(state.map.getZoom(), 11), {
    duration: 0.6,
  })

  // 重置上一个选中标记，避免出现两个"选中"标记
  if (state.selectedId && state.selectedId !== node.id) {
    const prev = state.markers.get(state.selectedId)
    const prevNode = prev && state.lastNodes ? state.lastNodes.find((n) => n.id === state.selectedId) : null
    if (prev && prevNode) prev.setIcon(markerIcon(prevNode, false))
  }

  const marker = state.markers.get(node.id)
  if (marker) {
    marker.setIcon(markerIcon(node, true))
    marker.setZIndexOffset(1000)
    if (openPopup) marker.openPopup()
  }
  state.selectedId = node.id
  return true
}

// 让后续 focusNode 能取到节点原始数据（用于还原上一个标记的图标）
export function rememberNodes(state, nodes) {
  state.lastNodes = nodes
}
