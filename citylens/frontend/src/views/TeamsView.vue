<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import AppShell from '../components/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import { useAsync, loadClass } from '../composables/useAsync'

const list = useAsync(() => api.list('maintenance-teams', { pageSize: 100 }))

const isAdmin = ref(false)
try { isAdmin.value = (JSON.parse(localStorage.getItem('cl_user') || '{}').role === 'admin') } catch { isAdmin.value = false }

const dialog = ref(false)
const editing = ref(null)
const form = ref({ name: '', leader: '', phone: '', specialties: '', capacity: 8, active: 1, note: '' })
const saving = ref(false)

function openCreate() {
  editing.value = null
  form.value = { name: '', leader: '', phone: '', specialties: '', capacity: 8, active: 1, note: '' }
  dialog.value = true
}

function openEdit(row) {
  editing.value = row
  form.value = {
    name: row.name, leader: row.leader || '', phone: row.phone || '',
    specialties: row.specialties || '', capacity: row.capacity ?? 8,
    active: row.active ?? 1, note: row.note || '',
  }
  dialog.value = true
}

async function save() {
  if (!form.value.name.trim()) { ElMessage.warning('班组名称为必填项'); return }
  saving.value = true
  try {
    if (editing.value) {
      await api.update('maintenance-teams', editing.value.id, form.value)
      ElMessage.success('已保存')
    } else {
      await api.create('maintenance-teams', form.value)
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
    await ElMessageBox.confirm(`确认删除班组「${row.name}」？`, '删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch { return }
  try {
    await api.remove('maintenance-teams', row.id)
    ElMessage.success('已删除')
    list.run()
  } catch (e) {
    ElMessage.error(e.message)
  }
}

function loadOf(row) {
  const cap = row.capacity || 0
  return cap > 0 ? (row.active_jobs || 0) / cap : 0
}

function specialtiesOf(row) {
  return String(row.specialties || '').split(/[,，、\s]+/).filter(Boolean)
}
</script>

<template>
  <AppShell title="班组管理" subtitle="维修班组档案与当前负载">
    <template #actions>
      <el-button v-if="isAdmin" type="primary" @click="openCreate">
        <el-icon style="margin-right: 4px"><Plus /></el-icon>新增班组
      </el-button>
    </template>

    <StateBlock
      :loading="list.loading.value"
      :error="list.error.value"
      :forbidden="list.forbidden.value"
      :empty="list.isEmpty.value"
      empty-title="还没有维修班组"
      empty-desc="建好班组后才能把工单派下去"
      :empty-action="isAdmin ? '新增班组' : ''"
      @retry="list.run()"
      @action="openCreate"
    >
      <div class="cl-stats" style="margin-bottom: 16px">
        <div class="cl-stat">
          <div class="cl-stat-label">班组总数</div>
          <div class="cl-stat-value cl-stat-tint">{{ list.data.value.total }}</div>
        </div>
        <div class="cl-stat">
          <div class="cl-stat-label">在途工单</div>
          <div class="cl-stat-value">
            {{ list.data.value.list.reduce((s, t) => s + (t.active_jobs || 0), 0) }}
          </div>
        </div>
        <div class="cl-stat">
          <div class="cl-stat-label">总产能</div>
          <div class="cl-stat-value">
            {{ list.data.value.list.reduce((s, t) => s + (t.capacity || 0), 0) }}
          </div>
        </div>
      </div>

      <div class="cl-card">
        <el-table :data="list.data.value.list" style="width: 100%">
          <el-table-column prop="name" label="班组" min-width="160">
            <template #default="{ row }">
              <div>{{ row.name }}</div>
              <div class="apple-caption apple-secondary">
                {{ row.active ? '在编' : '停用' }}
              </div>
            </template>
          </el-table-column>

          <el-table-column label="班组长" width="120">
            <template #default="{ row }">{{ row.leader || '—' }}</template>
          </el-table-column>

          <el-table-column label="联系电话" width="140">
            <template #default="{ row }">
              <span style="font-variant-numeric: tabular-nums">{{ row.phone || '—' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="专长" min-width="200">
            <template #default="{ row }">
              <el-tag
                v-for="s in specialtiesOf(row)" :key="s"
                size="small" style="margin-right: 4px"
              >{{ s }}</el-tag>
              <span v-if="!specialtiesOf(row).length" class="apple-secondary">未标注</span>
            </template>
          </el-table-column>

          <el-table-column label="当前负载" width="220">
            <template #default="{ row }">
              <div style="display: flex; align-items: center; gap: 10px">
                <div class="cl-load-track" style="flex: 1">
                  <div
                    class="cl-load-fill" :class="loadClass(loadOf(row))"
                    :style="{ width: Math.min(100, loadOf(row) * 100) + '%' }"
                  />
                </div>
                <span class="apple-footnote apple-secondary" style="font-variant-numeric: tabular-nums; width: 52px; text-align: right">
                  {{ row.active_jobs || 0 }}/{{ row.capacity || 0 }}
                </span>
              </div>
            </template>
          </el-table-column>

          <el-table-column v-if="isAdmin" label="操作" width="140" align="right">
            <template #default="{ row }">
              <el-button text type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button text type="danger" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </StateBlock>

    <el-dialog v-model="dialog" :title="editing ? '编辑班组' : '新增班组'" width="500px">
      <el-form label-width="110px">
        <el-form-item label="班组名称" required>
          <el-input v-model="form.name" placeholder="如：照明维修一班" />
        </el-form-item>
        <el-form-item label="班组长">
          <el-input v-model="form.leader" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="专长标签">
          <el-input v-model="form.specialties" placeholder="逗号分隔，如：照明,电气" />
        </el-form-item>
        <el-form-item label="产能上限">
          <el-input-number v-model="form.capacity" :min="1" :max="100" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.active" :active-value="1" :inactive-value="0" />
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
