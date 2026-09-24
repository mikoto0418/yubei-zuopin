<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import AppShell from '../components/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import { useAsync, debounce } from '../composables/useAsync'

const q = ref('')
const list = useAsync(() => api.list('facility-types', { q: q.value, pageSize: 100 }))
const onSearch = debounce(() => list.run(), 300)

watch(q, onSearch)

const isAdmin = ref(false)
try { isAdmin.value = (JSON.parse(localStorage.getItem('cl_user') || '{}').role === 'admin') } catch { isAdmin.value = false }

const ICONS = ['💡', '🗑️', '📷', '🧯', '🚏', '⭕', '🌊', '🏋️', '🪧', '🚧', '🌳', '🔌']

const dialog = ref(false)
const editing = ref(null)
const form = ref({ name: '', icon: '💡', default_cycle_days: 30, note: '' })
const saving = ref(false)

function openCreate() {
  editing.value = null
  form.value = { name: '', icon: '💡', default_cycle_days: 30, note: '' }
  dialog.value = true
}

function openEdit(row) {
  editing.value = row
  form.value = {
    name: row.name, icon: row.icon || '💡',
    default_cycle_days: row.default_cycle_days ?? 30, note: row.note || '',
  }
  dialog.value = true
}

async function save() {
  if (!form.value.name.trim()) { ElMessage.warning('类型名称为必填项'); return }
  saving.value = true
  try {
    if (editing.value) {
      await api.update('facility-types', editing.value.id, form.value)
      ElMessage.success('已保存')
    } else {
      await api.create('facility-types', form.value)
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
    await ElMessageBox.confirm(`确认删除类型「${row.name}」？`, '删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch { return }
  try {
    await api.remove('facility-types', row.id)
    ElMessage.success('已删除')
    list.run()
  } catch (e) {
    ElMessage.error(e.message)
  }
}
</script>

<template>
  <AppShell title="设施类型" subtitle="类型字典与默认巡检周期">
    <template #actions>
      <el-input v-model="q" placeholder="搜索类型" clearable style="width: 200px">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
      <el-button v-if="isAdmin" type="primary" @click="openCreate">
        <el-icon style="margin-right: 4px"><Plus /></el-icon>新增类型
      </el-button>
    </template>

    <StateBlock
      :loading="list.loading.value"
      :error="list.error.value"
      :forbidden="list.forbidden.value"
      :empty="list.isEmpty.value"
      :empty-title="q ? '没有匹配的类型' : '还没有设施类型'"
      :empty-desc="q ? '换个关键词试试' : '先建类型，设施台账才能归类'"
      :empty-action="q ? '' : (isAdmin ? '新增类型' : '')"
      @retry="list.run()"
      @action="openCreate"
    >
      <div class="cl-card">
        <el-table :data="list.data.value.list" style="width: 100%">
          <el-table-column label="图标" width="80">
            <template #default="{ row }">
              <span style="font-size: 22px">{{ row.icon || '📍' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="类型名称" min-width="140" />
          <el-table-column label="默认巡检周期" width="150">
            <template #default="{ row }">
              <el-tag size="small">{{ row.default_cycle_days }} 天</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="note" label="说明" min-width="220" show-overflow-tooltip />
          <el-table-column v-if="isAdmin" label="操作" width="140" align="right">
            <template #default="{ row }">
              <el-button text type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button text type="danger" @click="remove(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </StateBlock>

    <el-dialog v-model="dialog" :title="editing ? '编辑类型' : '新增类型'" width="460px">
      <el-form label-width="110px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：路灯" />
        </el-form-item>
        <el-form-item label="图标">
          <div style="display: flex; gap: 6px; flex-wrap: wrap">
            <button
              v-for="ic in ICONS" :key="ic"
              class="cl-chip" :class="{ 'is-active': form.icon === ic }"
              type="button" style="font-size: 18px; padding: 4px 10px"
              @click="form.icon = ic"
            >{{ ic }}</button>
          </div>
        </el-form-item>
        <el-form-item label="巡检周期（天）">
          <el-input-number v-model="form.default_cycle_days" :min="1" :max="365" />
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
