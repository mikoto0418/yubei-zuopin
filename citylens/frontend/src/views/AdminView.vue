<script setup>
import { computed } from 'vue'
import { api } from '../api'
import AppShell from '../components/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import { useAsync, loadClass } from '../composables/useAsync'
import { CATEGORIES, WORK_ORDER_COLOR, workOrderLabel } from '../constants'

const data = useAsync(async () => {
  const [overview, users, facilities] = await Promise.all([
    api.overview(),
    api.users(),
    api.list('facilities', { all: 1, pageSize: 500 }),
  ])
  return { overview, users: users || [], facilities: facilities.list || [] }
})

const overview = computed(() => data.data.value?.overview)
const users = computed(() => data.data.value?.users || [])
const facilities = computed(() => data.data.value?.facilities || [])

const cards = computed(() => {
  const o = overview.value || {}
  return [
    { key: 'users', label: '系统用户', value: users.value.length, icon: 'User' },
    { key: 'facilities_total', label: '设施总数', value: o.facilities_total ?? 0, icon: 'Location' },
    { key: 'inspections_total', label: '巡检记录', value: o.inspections_total ?? 0, icon: 'DocumentChecked' },
    { key: 'faults_total', label: '故障上报', value: o.faults_total ?? 0, icon: 'WarningFilled' },
    { key: 'work_orders_total', label: '工单总数', value: o.work_orders_total ?? 0, icon: 'Tickets' },
    { key: 'work_orders_open', label: '在途工单', value: o.work_orders_open ?? 0, icon: 'Clock' },
    { key: 'teams_total', label: '维修班组', value: o.teams_total ?? 0, icon: 'UserFilled' },
    { key: 'routes_total', label: '巡检路线', value: o.routes_total ?? 0, icon: 'Guide' },
  ]
})

// 工单状态分布：最大值用于条宽归一化
const statusBars = computed(() => {
  const rows = overview.value?.work_orders_by_status || []
  const max = Math.max(1, ...rows.map((r) => r.count))
  return rows.map((r) => ({ ...r, pct: Math.round((r.count / max) * 100) }))
})

function categoryStat(c) {
  return facilities.value.filter((f) => f.category === c).length
}

const categoryRows = computed(() => {
  const total = facilities.value.length || 1
  return CATEGORIES.map((c) => {
    const count = categoryStat(c)
    return { category: c, count, pct: Math.round((count / total) * 100) }
  })
})
</script>

<template>
  <AppShell title="管理概览" subtitle="设施 / 巡检 / 工单 / 班组全域统计">
    <template #actions>
      <el-button @click="data.run()" :loading="data.loading.value">
        <el-icon style="margin-right: 4px"><Refresh /></el-icon>刷新
      </el-button>
    </template>

    <StateBlock
      :loading="data.loading.value"
      :error="data.error.value"
      :forbidden="data.forbidden.value"
      :empty="false"
      @retry="data.run()"
    >
      <!-- 指标磁贴 -->
      <div class="cl-stats">
        <div v-for="c in cards" :key="c.key" class="cl-stat">
          <div class="cl-stat-label">{{ c.label }}</div>
          <div class="cl-stat-value">{{ c.value }}</div>
        </div>
      </div>

      <div class="cl-card" style="margin-top: var(--sp-4)">
        <div class="cl-field-label">工单状态分布（六状态状态机）</div>
        <div v-for="s in statusBars" :key="s.status" style="margin-bottom: 10px">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px">
            <span class="apple-footnote">
              <i
                class="cl-pill-dot"
                :style="{ background: WORK_ORDER_COLOR[s.status], display: 'inline-block', marginRight: '6px' }"
              />
              {{ s.label }}
            </span>
            <span class="apple-footnote apple-secondary" style="font-variant-numeric: tabular-nums">
              {{ s.count }}
            </span>
          </div>
          <div class="cl-load-track">
            <div class="cl-load-fill" :style="{ width: s.pct + '%' }" />
          </div>
        </div>
      </div>

      <div class="cl-card" style="margin-top: var(--sp-4)">
        <div class="cl-field-label">区域统计（设施 / 工单）</div>
        <el-table :data="overview?.district_stats || []" style="width: 100%">
          <el-table-column prop="name" label="区域" min-width="120" />
          <el-table-column prop="code" label="编码" width="90" />
          <el-table-column label="设施数" width="110">
            <template #default="{ row }">
              <el-tag size="small">{{ row.facilities }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="工单数" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="row.work_orders > 0 ? 'warning' : 'info'">
                {{ row.work_orders }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: var(--sp-4); margin-top: var(--sp-4)">
        <!-- 班组负载 -->
        <div class="cl-card">
          <div class="cl-field-label">班组负载</div>
          <div v-for="t in overview?.team_load || []" :key="t.id" style="margin-bottom: 12px">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px">
              <span class="apple-footnote">{{ t.name }}</span>
              <span class="apple-footnote apple-secondary" style="font-variant-numeric: tabular-nums">
                {{ t.active_jobs }}/{{ t.capacity }}
              </span>
            </div>
            <div class="cl-load-track">
              <div
                class="cl-load-fill" :class="loadClass(t.load)"
                :style="{ width: Math.min(100, t.load * 100) + '%' }"
              />
            </div>
          </div>
        </div>

        <!-- 设施类别分布 -->
        <div class="cl-card">
          <div class="cl-field-label">设施类别分布</div>
          <el-table :data="categoryRows" style="width: 100%" max-height="360">
            <el-table-column prop="category" label="类别" />
            <el-table-column prop="count" label="数量" width="80" />
            <el-table-column label="占比" min-width="140">
              <template #default="{ row }">
                <div class="cl-load-track">
                  <div class="cl-load-fill" :style="{ width: row.pct + '%' }" />
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <div class="cl-card" style="margin-top: var(--sp-4)">
        <div class="cl-field-label">系统用户</div>
        <el-table :data="users" style="width: 100%">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="username" label="用户名" min-width="120" />
          <el-table-column prop="nickname" label="昵称" min-width="140" />
          <el-table-column label="角色" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="row.role === 'admin' ? 'danger' : 'info'">
                {{ row.role === 'admin' ? '管理员' : '业务用户' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="district" label="辖区" min-width="110" />
          <el-table-column prop="phone" label="联系电话" min-width="140" />
        </el-table>
      </div>
    </StateBlock>
  </AppShell>
</template>
