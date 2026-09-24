// 地图引擎：Leaflet 初始化、标记渲染、瓦片离线降级。
//
// 降级策略（评审重点）：
//   1. 若 navigator.onLine === false，直接使用网格底图，不发瓦片请求；
//   2. 在线时正常加载 OSM 瓦片，同时监听 tileerror 与加载超时；
//      瓦片错误累计到阈值、或超时仍无任何瓦片加载成功 → 自动切换网格底图；
//   3. 切到网格底图后仍定期探测（online 事件 / 定时重试）恢复真实瓦片；
//   4. 无论底图是哪种，标记图层始终存在、可点击。
import L from 'leaflet'
import { CATEGORY_ICON, DEFAULT_CENTER, DEFAULT_ZOOM, statusColor } from './constants'

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors'
const ERROR_THRESHOLD = 3
const LOAD_TIMEOUT = 4500
const RETRY_INTERVAL = 20000

// 网格底图：继承 GridLayer，直接产出带网格线的 div 瓦片，
// 不依赖任何网络资源，因此离线时必然可用。
const GridFallbackLayer = L.GridLayer.extend({
  createTile(coords) {
    const tile = document.createElement('div')
    tile.className = 'cl-grid-fallback'
    const label = document.createElement('div')
    label.className = 'cl-grid-label'
    label.textContent = `z${coords.z} · ${coords.x},${coords.y}`
    tile.appendChild(label)
    return tile
  },
})

export function createMap(container) {
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
    fallbackLayer: null,
    tileLayer: null,
    markerLayer: L.layerGroup().addTo(map),
    markers: new Map(),
    timer: null,
    errorCount: 0,
    timer2: null,
  }

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
    map.fire('cl:offline', { reason })
    scheduleRetry()
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
    map.fire('cl:online', {})
  }

  function scheduleRetry() {
    clearTimeout(state.timer2)
    state.timer2 = setTimeout(() => {
      if (!state.online && navigator.onLine !== false) {
        // 乐观探测：挂上瓦片图层，若再次失败会自动回到网格
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
      className: 'cl-map-attr',
    })

    let loaded = false
    layer.on('load', () => {
      loaded = true
      clearTimeout(state.timer)
    })
    layer.on('tileload', () => {
      loaded = true
      state.errorCount = 0
      clearTimeout(state.timer)
      if (!state.online) return
      container.classList.remove('is-offline')
    })
    layer.on('tileerror', () => {
      if (loaded) return
      state.errorCount += 1
      if (state.errorCount >= ERROR_THRESHOLD) enableFallback('tileerror')
    })

    layer.addTo(map)
    state.tileLayer = layer

    // 超时兜底：网络挂起时 tileerror 可能不触发
    clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      if (!loaded) enableFallback('timeout')
    }, LOAD_TIMEOUT)
  }

  function goOfflineNow() {
    state.online = true // 让 enableFallback 的守卫通过
    enableFallback('offline')
  }

  if (navigator.onLine === false) {
    goOfflineNow()
  } else {
    mountTileLayer()
  }

  const onOnline = () => {
    if (!state.online) enableTiles()
  }
  const onOffline = () => {
    goOfflineNow()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  state.destroy = () => {
    clearTimeout(state.timer)
    clearTimeout(state.timer2)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    map.remove()
  }

  state.forceFallback = goOfflineNow
  state.forceOnline = enableTiles
  return state
}

// 生成一个带状态色的水滴形标记
export function makeMarkerIcon(facility, selected) {
  const color = statusColor(facility.status)
  const icon = CATEGORY_ICON[facility.category] || '📍'
  const size = selected ? 34 : 28
  return L.divIcon({
    className: 'cl-marker-wrap',
    html: `<div class="cl-marker ${selected ? 'is-selected' : ''}"
      style="width:${size}px;height:${size}px;background:${color}"><span>${icon}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

// 依据筛选后的设施列表重绘标记，返回 id → marker 映射。
// selectedId 用于把当前选中的标记画得更大更亮。
export function renderMarkers(state, facilities, onSelect, selectedId = null) {
  const { markerLayer } = state
  markerLayer.clearLayers()
  state.markers.clear()

  facilities.forEach((f) => {
    const lat = Number(f.lat)
    const lng = Number(f.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return

    const marker = L.marker([lat, lng], {
      icon: makeMarkerIcon(f, f.id === selectedId),
      title: f.name,
      riseOnHover: true,
    })
    marker.bindPopup(
      `<div style="min-width:170px">
        <div style="font-weight:700;margin-bottom:4px">${escapeHtml(f.name)}</div>
        <div style="font-size:12px;color:#64748b">${escapeHtml(f.category)} · ${escapeHtml(f.status)}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px">${escapeHtml(f.address || '地址未填写')}</div>
      </div>`,
    )
    marker.on('click', () => onSelect(f))
    marker.addTo(markerLayer)
    state.markers.set(f.id, marker)
  })
  return state.markers
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c])
}
