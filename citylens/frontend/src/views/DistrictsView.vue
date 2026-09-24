<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import AppShell from '../components/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import { useAsync } from '../composables/useAsync'

const list = useAsync(async () => {
  // 区域列表 + 概览统计（设施数/工单数）合并展示
  const [rows, overview] = await Promise.all([
    api.list('districts', { pageSize: 100 }),
    api.overview().catch(() => null),
  ])
  const stats = new Map((overview?.district_stats || []).map((s) => [s.id, s]))
  return {
    list: (rows.list || []).map((d) => ({
      ...d,
      facilities: stats.get(d.id)?.facilities ?? 0,
      work_orders: stats.get(d.id)?.work_orders ?? 0,
    })),
    total: rows.total,
  }
})

const isAdmin = ref(false)
try { isAdmin.value = (JSON.parse(localStorage.getItem('cl_user') || '{}').role === 'admin') } catch { isAdmin.value = false }

const dialog = ref(false)
const editing = ref(null)
const form = ref({ name: '', code: '', center_lat: '', center_lng: '', note: '' })
const saving = ref(false)

function openCreate() {
  editing.value = null
  form.value = { name: '', code: '', center_lat: '', center_lng: '', note: '' }
  dialog.value = true
}

function openEdit(row) {
  editing.value = row
  form.value = {
    name: row.name, code: row.code, center_lat: row.center_lat,
    center_lng: row.center_lng, note: row.note || '',
  }
  dialog.value = true
}

async function save() {
  if (!form.value.name.trim() || !form.value.code.trim()) {
    ElMessage.warning('名称与编码为必填项')
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await api.update('districts', editing.value.id, form.value)
      ElMessage.success('已保存')
    } else {
      await api.create('districts', form.value)
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
    await ElMessageBox.confirm(`确认删除区域「${row.name}」？该区域下的设施将变为未归属。`, '删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch { return }
  try {
    await api.remove('districts', row.id)
    ElMessage.success('已删除')
    list.run()
  } catch (e) {
    ElMessage.error(e.message)
  }
}
</script>

<template>
  <AppShell title="区域管理" subtitle="行政区 / 网格划分，含设施数与工单数统计">
    <template #actions>
      <el-button v-if="isAdmin" type="primary" @click="openCreate">
        <el-icon style="margin-right: 4px"><Plus /></el-icon>新增区域
      </el-button>
    </template>

    <StateBlock
      :loading="list.loading.value"
      :error="list.error.value"
      :forbidden="list.forbidden.value"
      :empty="list.isEmpty.value"
      empty-title="还没有任何区域"
      empty-desc="先建区域，设施才能归属到网格"
      :empty-action="isAdmin ? '新增区域' : ''"
      @retry="list.run()"
      @action="openCreate"
    >
      <div class="cl-stats" style="margin-bottom: 16px">
        <div class="cl-stat">
          <div class="cl-stat-label">区域总数</div>
          <div class="cl-stat-value cl-stat-tint">{{ list.data.value.total }}</div>
        </div>
        <div class="cl-stat">
          <div class="cl-stat-label">覆盖设施</div>
          <div class="cl-stat-value">
            {{ list.data.value.list.reduce((s, d) => s + d.facilities, 0) }}
          </div>
        </div>
        <div class="cl-stat">
          <div class="cl-stat-label">关联工单</div>
          <div class="cl-stat-value">
            {{ list.data.value.list.reduce((s, d) => s + d.work_orders, 0) }}
          </div>
        </div>
      </div>

      <div class="cl-card">
        <el-table :data="list.data.value.list" style="width: 100%">
          <el-table-column prop="name" label="区域名称" min-width="140" />
          <el-table-column prop="code" label="编码" width="100" />
          <el-table-column label="中心坐标" width="190">
            <template #default="{ row }">
              <span style="font-variant-numeric: tabular-nums">
                {{ Number(row.center_lat).toFixed(4) }}, {{ Number(row.center_lng).toFixed(4) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="设施数" width="100">
            <template #default="{ row }">
              <el-tag size="small">{{ row.facilities }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="工单数" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.work_orders > 0 ? 'warning' : 'info'">
                {{ row.work_orders }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="note" label="备注" min-width="200" show-overflow-tooltip />
          <el-table-column v-if="isAdmin" label="操作" width="140" align="right">
            <template #default="{ row }">
              <el-button text type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button text type="danger" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </StateBlock>

    <el-dialog v-model="dialog" :title="editing ? '编辑区域' : '新增区域'" width="480px">
      <el-form label-width="84px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：历下区" />
        </el-form-item>
        <el-form-item label="编码" required>
          <el-input v-model="form.code" placeholder="如：LXA" />
        </el-form-item>
        <el-form-item label="中心纬度">
          <el-input v-model="form.center_lat" placeholder="36.6660" />
        </el-form-item>
        <el-form-item label="中心经度">
          <el-input v-model="form.center_lng" placeholder="117.0380" />
        </el-form-item>
        <el-form-item label="备注">
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
