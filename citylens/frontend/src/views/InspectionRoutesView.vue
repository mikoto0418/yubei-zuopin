<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import AppShell from '../components/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import { useAsync, formatTime } from '../composables/useAsync'
import { CATEGORY_ICON, CYCLES, STATUS_TAG } from '../constants'

const list = useAsync(() => api.list('inspection-routes', { pageSize: 100 }))

const districts = ref([])
const facilities = ref([])
onMounted(async () => {
  try {
    const [d, f] = await Promise.all([
      api.list('districts', { pageSize: 100 }),
      api.list('facilities', { pageSize: 100, all: 1 }),
    ])
    districts.value = d.list || []
    facilities.value = f.list || []
  } catch { /* 辅助数据失败不影响主列表 */ }
})

const facilityMap = computed(() => new Map(facilities.value.map((f) => [f.id, f])))
const districtMap = computed(() => new Map(districts.value.map((d) => [d.id, d])))

// 详情抽屉：有序设施点 + 打卡
const drawerOpen = ref(false)
const detail = ref(null)
const checked = ref({})
const checkTimes = ref({})

function openDetail(row) {
  detail.value = row
  checked.value = {}
  checkTimes.value = {}
  drawerOpen.value = true
}

const points = computed(() => {
  if (!detail.value) return []
  return (detail.value.facility_ids || [])
    .map((id) => facilityMap.value.get(id))
    .filter(Boolean)
})

const progress = computed(() => {
  if (!points.value.length) return 0
  return Math.round((Object.keys(checked.value).length / points.value.length) * 100)
})

function toggleCheck(id) {
  const next = { ...checked.value }
  const times = { ...checkTimes.value }
  if (next[id]) {
    delete next[id]
    delete times[id]
  } else {
    next[id] = true
    times[id] = new Date().toISOString().slice(0, 19).replace('T', ' ')
  }
  checked.value = next
  checkTimes.value = times
}

// 打卡即写入一条巡检记录，让路线执行落到 inspections 表里。
async function submitChecks() {
  const ids = Object.keys(checked.value).map(Number)
  if (!ids.length) { ElMessage.warning('请先打卡至少一个点位'); return }
  try {
    for (const fid of ids) {
      await api.create('inspections', {
        facility_id: fid,
        result: '正常',
        inspector: detail.value.name,
        note: `按路线「${detail.value.name}」打卡`,
        inspected_at: checkTimes.value[fid],
        route_id: detail.value.id,
      })
    }
    ElMessage.success(`已提交 ${ids.length} 条巡检记录`)
    checked.value = {}
    checkTimes.value = {}
    drawerOpen.value = false
  } catch (e) {
    ElMessage.error(e.message)
  }
}

// ---------- 新建 / 编辑 ----------
const isAdmin = ref(false)
try { isAdmin.value = (JSON.parse(localStorage.getItem('cl_user') || '{}').role === 'admin') } catch { isAdmin.value = false }

const dialog = ref(false)
const editing = ref(null)
const saving = ref(false)
const form = ref({ name: '', district_id: '', cycle: '每周', note: '', facility_ids: [] })

function openCreate() {
  editing.value = null
  form.value = { name: '', district_id: '', cycle: '每周', note: '', facility_ids: [] }
  dialog.value = true
}

function openEdit(row) {
  editing.value = row
  form.value = {
    name: row.name, district_id: row.district_id || '',
    cycle: row.cycle || '每周', note: row.note || '',
    facility_ids: [...(row.facility_ids || [])],
  }
  dialog.value = true
}

const formFacilities = computed(() => {
  if (!form.value.district_id) return facilities.value
  return facilities.value.filter((f) => f.district_id === Number(form.value.district_id))
})

async function save() {
  if (!form.value.name.trim()) { ElMessage.warning('路线名称为必填项'); return }
  if (!form.value.facility_ids.length) { ElMessage.warning('请至少选择一个设施点'); return }
  saving.value = true
  try {
    const payload = { ...form.value, facility_ids: JSON.stringify(form.value.facility_ids) }
    if (editing.value) {
      await api.update('inspection-routes', editing.value.id, payload)
      ElMessage.success('已保存')
    } else {
      await api.create('inspection-routes', payload)
      ElMessage.success('已创建')
    }
    dialog.value = false
    list.run()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除路线「${row.name}」？`, '删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch { return }
  try {
    await api.remove('inspection-routes', row.id)
    ElMessage.success('已删除')
    list.run()
  } catch (e) {
    ElMessage.error(e.message)
  }
}
</script>

<template>
  <AppShell title="巡检路线" subtitle="预设有序设施点，巡检员按路线打卡">
    <template #actions>
      <el-button v-if="isAdmin" type="primary" @click="openCreate">
        <el-icon style="margin-right: 4px"><Plus /></el-icon>新增路线
      </el-button>
    </template>

    <StateBlock
      :loading="list.loading.value"
      :error="list.error.value"
      :forbidden="list.forbidden.value"
      :empty="list.isEmpty.value"
      empty-title="还没有巡检路线"
      empty-desc="把同一区域的设施串成一条线，巡检就能按顺序打卡"
      :empty-action="isAdmin ? '新增路线' : ''"
      @retry="list.run()"
      @action="openCreate"
    >
      <div class="cl-card">
        <el-table :data="list.data.value.list" style="width: 100%" @row-click="openDetail">
          <el-table-column prop="name" label="路线名称" min-width="200" />
          <el-table-column label="所属区域" width="130">
            <template #default="{ row }">
              {{ districtMap.get(row.district_id)?.name || '未归属' }}
            </template>
          </el-table-column>
          <el-table-column label="巡检周期" width="110">
            <template #default="{ row }">
              <el-tag size="small">{{ row.cycle }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="打卡点" width="110">
            <template #default="{ row }">
              <el-tag size="small" type="primary">{{ (row.facility_ids || []).length }} 个</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="note" label="说明" min-width="200" show-overflow-tooltip />
          <el-table-column v-if="isAdmin" label="操作" width="140" align="right">
            <template #default="{ row }">
              <el-button text type="primary" @click.stop="openEdit(row)">编辑</el-button>
              <el-button text type="danger" @click.stop="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </StateBlock>

    <!-- 路线详情：有序点位 + 打卡 -->
    <el-drawer v-model="drawerOpen" size="480px" :with-header="false">
      <div v-if="detail" class="cl-drawer-body">
        <header class="cl-drawer-head" style="margin: -20px -24px 16px; padding: 20px 24px 14px">
          <div class="apple-title2">{{ detail.name }}</div>
          <div class="apple-subhead apple-secondary" style="margin-top: 4px">
            {{ districtMap.get(detail.district_id)?.name || '未归属区域' }} · {{ detail.cycle }} · 共 {{ points.length }} 个点位
          </div>
        </header>

        <div class="cl-field-label">
          打卡进度
          <span style="font-variant-numeric: tabular-nums">{{ progress }}%</span>
        </div>
        <div class="cl-load-track" style="margin-bottom: 16px">
          <div class="cl-load-fill" :style="{ width: progress + '%' }" />
        </div>

        <div class="cl-field-label">有序设施点</div>
        <div class="cl-timeline">
          <div
            v-for="(f, i) in points" :key="f.id"
            class="cl-tl-item" :class="{ 'is-ok': checked[f.id] }"
          >
            <div class="cl-tl-time">第 {{ i + 1 }} 站 · {{ f.status }}</div>
            <div class="cl-tl-text">
              {{ CATEGORY_ICON[f.category] || '📍' }} {{ f.name }}
            </div>
            <div class="apple-caption apple-secondary" style="margin-top: 2px">
              {{ f.address || '地址未填写' }}
            </div>
            <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px">
              <el-button
                size="small" :type="checked[f.id] ? 'success' : 'default'"
                @click="toggleCheck(f.id)"
              >
                {{ checked[f.id] ? '已打卡' : '打卡' }}
              </el-button>
              <span v-if="checkTimes[f.id]" class="apple-caption apple-secondary">
                {{ checkTimes[f.id] }}
              </span>
            </div>
          </div>
        </div>

        <div style="margin-top: 18px; display: flex; gap: 8px">
          <el-button type="primary" @click="submitChecks">提交巡检记录</el-button>
          <el-button @click="drawerOpen = false">关闭</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 新建 / 编辑 -->
    <el-dialog v-model="dialog" :title="editing ? '编辑路线' : '新增路线'" width="560px">
      <el-form label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：历下区主干道晨检线" />
        </el-form-item>
        <el-form-item label="所属区域">
          <el-select v-model="form.district_id" placeholder="选择区域" clearable style="width: 100%">
            <el-option v-for="d in districts" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="巡检周期">
          <el-select v-model="form.cycle" style="width: 100%">
            <el-option v-for="c in CYCLES" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="设施点" required>
          <el-select
            v-model="form.facility_ids" multiple filterable
            placeholder="按顺序选择设施（选择顺序即打卡顺序）" style="width: 100%"
          >
            <el-option
              v-for="f in formFacilities" :key="f.id"
              :label="`${f.name}（${f.status}）`" :value="f.id"
            />
          </el-select>
          <div class="apple-caption apple-secondary" style="margin-top: 4px">
            已选 {{ form.facility_ids.length }} 个点位
          </div>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.note" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </AppShell>
</template>
