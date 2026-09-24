<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import AppShell from '../components/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import { useAsync, debounce } from '../composables/useAsync'
import { CATEGORIES, STATUSES, CATEGORY_ICON } from '../constants'

const router = useRouter()

const query = reactive({ page: 1, pageSize: 10, q: '', category: '', status: '', district_id: '' })

const list = useAsync(() => api.list('facilities', { ...query, all: 1 }))

const districts = ref([])
const types = ref([])
onMounted(async () => {
  try {
    const [d, t] = await Promise.all([
      api.list('districts', { pageSize: 100 }),
      api.list('facility-types', { pageSize: 100 }),
    ])
    districts.value = d.list || []
    types.value = t.list || []
  } catch { /* 辅助数据失败不影响主列表 */ }
})

const districtMap = computed(() => new Map(districts.value.map((d) => [d.id, d.name])))
const typeMap = computed(() => new Map(types.value.map((t) => [t.id, t])))

const onSearch = debounce(() => { query.page = 1; list.run() }, 350)
watch(() => [query.category, query.status, query.district_id], () => { query.page = 1; list.run() })
watch(() => [query.page, query.pageSize], () => list.run())

function resetQuery() {
  Object.assign(query, { page: 1, q: '', category: '', status: '', district_id: '' })
  list.run()
}

// ---------- 新增 / 编辑 ----------
const dialogVisible = ref(false)
const editing = ref(null)
const submitting = ref(false)
const formRef = ref(null)

const blankForm = () => ({
  name: '', category: '路灯', address: '', lat: '', lng: '',
  status: '正常', installed_at: '', note: '', district_id: '', type_id: '',
})
const form = reactive(blankForm())

const rules = {
  name: [{ required: true, message: '请输入设施名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择类别', trigger: 'change' }],
  lat: [{ validator: (_r, v, cb) => (v === '' || !Number.isNaN(Number(v)) ? cb() : cb(new Error('纬度必须是数字'))), trigger: 'blur' }],
  lng: [{ validator: (_r, v, cb) => (v === '' || !Number.isNaN(Number(v)) ? cb() : cb(new Error('经度必须是数字'))), trigger: 'blur' }],
}

function openCreate() {
  editing.value = null
  Object.assign(form, blankForm())
  dialogVisible.value = true
}

function openEdit(row) {
  editing.value = row
  Object.assign(form, {
    name: row.name, category: row.category, address: row.address,
    lat: row.lat, lng: row.lng, status: row.status,
    installed_at: row.installed_at, note: row.note,
    district_id: row.district_id ?? '', type_id: row.type_id ?? '',
  })
  dialogVisible.value = true
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  submitting.value = true
  try {
    const payload = {
      ...form,
      lat: form.lat === '' ? 0 : Number(form.lat),
      lng: form.lng === '' ? 0 : Number(form.lng),
      district_id: form.district_id === '' ? null : Number(form.district_id),
      type_id: form.type_id === '' ? null : Number(form.type_id),
    }
    if (editing.value) {
      await api.update('facilities', editing.value.id, payload)
      ElMessage.success('已保存')
    } else {
      await api.create('facilities', payload)
      ElMessage.success('已新增')
    }
    dialogVisible.value = false
    list.run()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确定删除设施「${row.name}」吗？此操作不可恢复。`, '删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch { return }
  try {
    await api.remove('facilities', row.id)
    ElMessage.success('已删除')
    if (list.data.value.list.length === 1 && query.page > 1) query.page -= 1
    list.run()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

function viewOnMap(row) {
  router.push({ name: 'map', query: { focus: row.id } })
}

function typeIcon(row) {
  const t = typeMap.value.get(row.type_id)
  return t?.icon || CATEGORY_ICON[row.category] || '📍'
}
</script>

<template>
  <AppShell title="设施台账" subtitle="全市公共设施档案，点击行可定位到地图">
    <template #actions>
      <el-button type="primary" @click="openCreate">
        <el-icon style="margin-right: 4px"><Plus /></el-icon>新增设施
      </el-button>
    </template>

    <div class="cl-card">
      <div class="cl-toolbar">
        <el-input
          v-model="query.q" placeholder="搜索名称 / 地址 / 备注" clearable
          style="width: 240px" @input="onSearch" @clear="onSearch"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>

        <el-select v-model="query.category" placeholder="全部类别" clearable style="width: 140px">
          <el-option v-for="c in CATEGORIES" :key="c" :label="c" :value="c" />
        </el-select>

        <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 130px">
          <el-option v-for="s in STATUSES" :key="s" :label="s" :value="s" />
        </el-select>

        <el-select v-model="query.district_id" placeholder="全部区域" clearable style="width: 140px">
          <el-option v-for="d in districts" :key="d.id" :label="d.name" :value="String(d.id)" />
        </el-select>

        <div class="cl-spacer" />
        <el-button text @click="resetQuery">重置筛选</el-button>
      </div>

      <StateBlock
        :loading="list.loading.value"
        :error="list.error.value"
        :forbidden="list.forbidden.value"
        :empty="list.isEmpty.value"
        :empty-title="query.q || query.category || query.status ? '没有符合条件的设施' : '还没有设施记录'"
        :empty-desc="query.q || query.category || query.status ? '换个关键词或放宽筛选条件' : '新增第一个设施，开始建立台账'"
        :empty-action="query.q || query.category || query.status ? '清空筛选' : '新增设施'"
        @retry="list.run()"
        @action="query.q || query.category || query.status ? resetQuery() : openCreate()"
      >
        <el-table :data="list.data.value.list" style="width: 100%" @row-click="viewOnMap">
          <el-table-column label="设施" min-width="220">
            <template #default="{ row }">
              <span style="margin-right: 6px">{{ typeIcon(row) }}</span>
              <b>{{ row.name }}</b>
            </template>
          </el-table-column>

          <el-table-column prop="category" label="类别" width="110" />

          <el-table-column label="区域" width="110">
            <template #default="{ row }">
              {{ districtMap.get(row.district_id) || '未归属' }}
            </template>
          </el-table-column>

          <el-table-column prop="address" label="地址" min-width="200" show-overflow-tooltip />

          <el-table-column label="坐标" width="170">
            <template #default="{ row }">
              <span style="font-variant-numeric: tabular-nums; color: var(--label-secondary)">
                {{ Number(row.lat).toFixed(4) }}, {{ Number(row.lng).toFixed(4) }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <span class="cl-pill">
                <i
                  class="cl-pill-dot"
                  :style="{ background: row.status === '正常' ? 'var(--green)' : row.status === '待检修' ? 'var(--orange)' : 'var(--red)' }"
                />
                {{ row.status }}
              </span>
            </template>
          </el-table-column>

          <el-table-column prop="installed_at" label="安装时间" width="120" />

          <el-table-column label="操作" width="190" align="right">
            <template #default="{ row }">
              <el-button text type="primary" @click.stop="viewOnMap(row)">地图</el-button>
              <el-button text type="primary" @click.stop="openEdit(row)">编辑</el-button>
              <el-button text type="danger" @click.stop="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div style="display: flex; justify-content: flex-end; margin-top: var(--sp-4)">
          <el-pagination
            v-model:current-page="query.page"
            v-model:page-size="query.pageSize"
            :total="list.data.value.total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            background
          />
        </div>
      </StateBlock>
    </div>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑设施' : '新增设施'" width="580px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="88px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="如：经十路 001 号路灯" />
        </el-form-item>

        <el-form-item label="类别" prop="category">
          <el-select v-model="form.category" style="width: 100%">
            <el-option v-for="c in CATEGORIES" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>

        <el-form-item label="区域">
          <el-select v-model="form.district_id" placeholder="选择所属区域" clearable style="width: 100%">
            <el-option v-for="d in districts" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="设施类型">
          <el-select v-model="form.type_id" placeholder="选择类型字典项" clearable style="width: 100%">
            <el-option
              v-for="t in types" :key="t.id"
              :label="`${t.icon || '📍'} ${t.name}（周期 ${t.default_cycle_days} 天）`"
              :value="t.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="地址" prop="address">
          <el-input v-model="form.address" placeholder="如：经十路与历山路交叉口东 50 米" />
        </el-form-item>

        <el-form-item label="经纬度">
          <div style="display: flex; gap: 10px; width: 100%">
            <el-input v-model="form.lat" placeholder="纬度，如 36.6512" />
            <el-input v-model="form.lng" placeholder="经度，如 117.1201" />
          </div>
        </el-form-item>

        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio-button v-for="s in STATUSES" :key="s" :value="s">{{ s }}</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="安装时间" prop="installed_at">
          <el-date-picker
            v-model="form.installed_at" type="date" value-format="YYYY-MM-DD"
            placeholder="选择日期" style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="备注" prop="note">
          <el-input v-model="form.note" type="textarea" :rows="3" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">
          {{ editing ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </AppShell>
</template>
