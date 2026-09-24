<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import AppShell from '../components/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import { useAsync, debounce, formatTime } from '../composables/useAsync'
import {
  WORK_ORDER_STATUS, WORK_ORDER_LABEL, WORK_ORDER_TRANSITIONS, WORK_ORDER_COLOR,
  PRIORITY_LABEL, PRIORITY_TAG, TRANSITION_ACTION, workOrderLabel, workOrderColor,
} from '../constants'

const filters = ref({ status: '', district: '', team_id: '', q: '' })
const page = ref(1)
const pageSize = ref(12)

const list = useAsync(() => api.workOrders({
  ...filters.value, page: page.value, pageSize: pageSize.value,
}))

const districts = ref([])
const teams = ref([])

onMounted(async () => {
  try {
    const [d, t] = await Promise.all([
      api.list('districts', { pageSize: 100 }),
      api.list('maintenance-teams', { pageSize: 100 }),
    ])
    districts.value = d.list || []
    teams.value = t.list || []
  } catch { /* 筛选辅助数据失败不影响主列表 */ }
})

watch(filters, () => { page.value = 1; list.run() }, { deep: true })
watch([page, pageSize], () => list.run())

const onSearch = debounce(() => { page.value = 1; list.run() }, 350)

function resetFilters() {
  filters.value = { status: '', district: '', team_id: '', q: '' }
}

// ---------- 详情抽屉 ----------
const drawerOpen = ref(false)
const detail = ref(null)
const detailLoading = ref(false)
const acting = ref(false)
const assignTeam = ref(null)
const remark = ref('')
const resolution = ref('')

async function openDetail(row) {
  drawerOpen.value = true
  detailLoading.value = true
  detail.value = null
  assignTeam.value = null
  remark.value = ''
  resolution.value = ''
  try {
    detail.value = await api.workOrder(row.id)
  } catch (e) {
    ElMessage.error(e.message)
    drawerOpen.value = false
  } finally {
    detailLoading.value = false
  }
}

// 可用操作：来自后端同一份状态机定义，前端只做按钮呈现
const availableActions = computed(() => {
  if (!detail.value) return []
  return (WORK_ORDER_TRANSITIONS[detail.value.status] || []).map((to) => ({
    to,
    label: TRANSITION_ACTION[`${detail.value.status}→${to}`] || workOrderLabel(to),
    danger: to === 'in_progress' && detail.value.status === 'resolved',
  }))
})

async function doTransition(to) {
  if (!detail.value) return
  const body = { status: to, remark: remark.value }
  if (to === 'assigned') {
    if (!assignTeam.value) { ElMessage.warning('请先选择维修班组'); return }
    body.team_id = assignTeam.value
  }
  if (to === 'resolved') body.resolution = resolution.value

  acting.value = true
  try {
    const updated = await api.transitionWorkOrder(detail.value.id, body)
    detail.value = updated
    remark.value = ''
    resolution.value = ''
    ElMessage.success(`已变更为「${workOrderLabel(to)}」`)
    list.run()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    acting.value = false
  }
}

// ---------- AI 智能派单 ----------
const aiLoading = ref(false)
const aiResult = ref(null)

async function askDispatch() {
  if (!detail.value) return
  aiLoading.value = true
  aiResult.value = null
  try {
    aiResult.value = await api.aiDispatch({ fault_id: detail.value.fault_id || undefined, text: detail.value.description })
    assignTeam.value = aiResult.value.recommended_team_id
    ElMessage.success('已按 AI 建议预选班组')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    aiLoading.value = false
  }
}

function timelineType(log) {
  if (log.to_status === 'in_progress') return 'is-doing'
  if (['verified', 'closed'].includes(log.to_status)) return 'is-ok'
  if (log.to_status === 'resolved') return 'is-doing'
  return ''
}
</script>

<template>
  <AppShell title="工单管理" subtitle="故障上报 → 自动建单 → 派单 → 维修 → 验收 → 关闭">
    <template #actions>
      <el-button @click="list.run()">
        <el-icon style="margin-right: 4px"><Refresh /></el-icon>刷新
      </el-button>
    </template>

    <div class="cl-card">
      <div class="cl-toolbar">
        <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 150px">
          <el-option v-for="s in WORK_ORDER_STATUS" :key="s" :label="WORK_ORDER_LABEL[s]" :value="s" />
        </el-select>

        <el-select v-model="filters.district" placeholder="全部区域" clearable style="width: 150px">
          <el-option v-for="d in districts" :key="d.id" :label="d.name" :value="String(d.id)" />
        </el-select>

        <el-select v-model="filters.team_id" placeholder="全部班组" clearable style="width: 170px">
          <el-option v-for="t in teams" :key="t.id" :label="t.name" :value="String(t.id)" />
        </el-select>

        <el-input
          v-model="filters.q" placeholder="搜索工单号 / 描述 / 设施" clearable
          style="width: 240px" @input="onSearch"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>

        <div class="cl-spacer" />
        <el-button text @click="resetFilters">重置筛选</el-button>
      </div>

      <StateBlock
        :loading="list.loading.value"
        :error="list.error.value"
        :forbidden="list.forbidden.value"
        :empty="list.isEmpty.value"
        empty-title="没有符合条件的工单"
        empty-desc="试着放宽状态、区域或班组筛选条件"
        empty-action="重置筛选"
        @retry="list.run()"
        @action="resetFilters"
      >
        <el-table :data="list.data.value.list" style="width: 100%" @row-click="openDetail">
          <el-table-column prop="code" label="工单号" width="140">
            <template #default="{ row }">
              <span style="font-variant-numeric: tabular-nums">{{ row.code }}</span>
            </template>
          </el-table-column>

          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <span class="cl-pill">
                <i class="cl-pill-dot" :style="{ background: workOrderColor(row.status) }" />
                {{ workOrderLabel(row.status) }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="优先级" width="80">
            <template #default="{ row }">
              <el-tag size="small" :type="PRIORITY_TAG[row.priority] || 'info'">
                {{ PRIORITY_LABEL[row.priority] || row.priority }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column label="设施" min-width="200">
            <template #default="{ row }">
              <div>{{ row.facility_name || '—' }}</div>
              <div class="apple-caption apple-secondary">{{ row.district_name || '未归属区域' }}</div>
            </template>
          </el-table-column>

          <el-table-column label="班组" width="150">
            <template #default="{ row }">{{ row.team_name || '未派单' }}</template>
          </el-table-column>

          <el-table-column label="创建时间" width="150">
            <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
          </el-table-column>
        </el-table>

        <div class="cl-pager">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :total="list.data.value.total"
            :page-sizes="[12, 24, 48]"
            layout="total, sizes, prev, pager, next"
            background
          />
        </div>
      </StateBlock>
    </div>

    <!-- 详情抽屉：状态流转时间轴 + 按当前状态显示可用操作 -->
    <el-drawer v-model="drawerOpen" size="520px" :with-header="false">
      <div v-if="detailLoading" style="padding: 8px">
        <div v-for="i in 6" :key="i" class="apple-skeleton cl-skeleton-row" />
      </div>

      <div v-else-if="detail" class="cl-drawer-body">
        <header class="cl-drawer-head" style="margin: -20px -24px 16px; padding: 20px 24px 14px">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
            <span class="apple-title2">{{ detail.code }}</span>
            <span class="cl-pill">
              <i class="cl-pill-dot" :style="{ background: workOrderColor(detail.status) }" />
              {{ workOrderLabel(detail.status) }}
            </span>
            <el-tag size="small" :type="PRIORITY_TAG[detail.priority] || 'info'">
              优先级 {{ PRIORITY_LABEL[detail.priority] || detail.priority }}
            </el-tag>
          </div>
          <div class="apple-subhead apple-secondary" style="margin-top: 6px">
            {{ detail.description || '（无描述）' }}
          </div>
        </header>

        <dl class="cl-kv">
          <dt>设施</dt><dd>{{ detail.facility?.name || '—' }}</dd>
          <dt>设施地址</dt><dd>{{ detail.facility?.address || '—' }}</dd>
          <dt>关联故障</dt><dd>{{ detail.fault?.title || '—' }}</dd>
          <dt>严重程度</dt><dd>{{ detail.fault?.severity || '—' }}</dd>
          <dt>维修班组</dt><dd>{{ detail.team?.name || '未派单' }}</dd>
          <dt>创建人</dt><dd>{{ detail.creator?.nickname || detail.creator?.username || '—' }}</dd>
          <dt>创建时间</dt><dd>{{ formatTime(detail.created_at) }}</dd>
          <dt v-if="detail.resolution">处理说明</dt>
          <dd v-if="detail.resolution">{{ detail.resolution }}</dd>
        </dl>

        <div v-if="detail.fault?.diagnosis" style="margin-top: 16px">
          <div class="cl-field-label">AI 诊断结论（已落库）</div>
          <div class="cl-ai-box">{{ detail.fault.diagnosis }}</div>
        </div>

        <!-- 可用操作：由当前状态决定 -->
        <div v-if="availableActions.length" style="margin-top: 20px">
          <div class="cl-field-label">可执行操作</div>

          <div v-if="availableActions.some((a) => a.to === 'assigned')" style="margin-bottom: 10px">
            <el-select v-model="assignTeam" placeholder="选择维修班组" style="width: 100%">
              <el-option
                v-for="t in teams" :key="t.id"
                :label="`${t.name}（负载 ${t.active_jobs}/${t.capacity}）`"
                :value="t.id"
              />
            </el-select>
            <el-button
              text type="primary" style="margin-top: 6px"
              :loading="aiLoading" @click="askDispatch"
            >
              <el-icon style="margin-right: 4px"><MagicStick /></el-icon>AI 推荐班组
            </el-button>
          </div>

          <div v-if="availableActions.some((a) => a.to === 'resolved')" style="margin-bottom: 10px">
            <el-input v-model="resolution" type="textarea" :rows="2" placeholder="填写处理说明（可选）" />
          </div>

          <el-input v-model="remark" placeholder="备注（可选，会写入时间轴）" style="margin-bottom: 10px" />

          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <el-button
              v-for="a in availableActions" :key="a.to"
              :type="a.danger ? 'default' : 'primary'"
              :loading="acting" @click="doTransition(a.to)"
            >
              {{ a.label }}
            </el-button>
          </div>
        </div>

        <div v-else style="margin-top: 20px">
          <div class="cl-pill">工单已关闭，无可用操作</div>
        </div>

        <!-- AI 派单理由 -->
        <div v-if="aiResult" style="margin-top: 16px">
          <div class="cl-field-label">
            派单建议
            <el-tag size="small" effect="plain">
              {{ aiResult.source === 'llm' ? '大模型' : '本地规则' }}
            </el-tag>
          </div>
          <div class="cl-ai-box">{{ aiResult.reason }}</div>
          <div v-if="aiResult.candidates?.length" style="margin-top: 10px">
            <div class="apple-caption apple-secondary" style="margin-bottom: 6px">候选班组评分</div>
            <div
              v-for="c in aiResult.candidates" :key="c.team_id"
              style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px"
            >
              <span style="width: 130px; font-size: var(--fs-footnote)">{{ c.name }}</span>
              <div class="cl-load-track" style="flex: 1">
                <div
                  class="cl-load-fill"
                  :class="c.load >= 1 ? 'is-full' : c.load >= 0.7 ? 'is-warn' : ''"
                  :style="{ width: Math.min(100, c.load * 100) + '%' }"
                />
              </div>
              <span class="apple-caption apple-secondary" style="width: 74px; text-align: right">
                负载 {{ (c.load * 100).toFixed(0) }}%
              </span>
            </div>
          </div>
        </div>

        <!-- 时间轴 -->
        <div style="margin-top: 22px">
          <div class="cl-field-label">流转时间轴（{{ detail.logs?.length || 0 }} 条）</div>
          <div class="cl-timeline">
            <div
              v-for="log in detail.logs" :key="log.id"
              class="cl-tl-item" :class="timelineType(log)"
            >
              <div class="cl-tl-time">{{ formatTime(log.created_at) }}</div>
              <div class="cl-tl-text">
                {{ log.from_status ? workOrderLabel(log.from_status) + ' → ' : '' }}{{ workOrderLabel(log.to_status) }}
              </div>
              <div class="apple-caption apple-secondary" style="margin-top: 2px">
                {{ log.remark }} · {{ log.operator_nickname || log.operator_name || '系统' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </AppShell>
</template>

<style scoped>
.cl-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--sp-4);
}
</style>
