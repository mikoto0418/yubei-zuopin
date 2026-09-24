<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import {
  FAULT_STATUS_TAG, SEVERITIES, SEVERITY_TAG,
  STATUS_TAG, statusColor,
} from '../constants'

const props = defineProps({
  facility: { type: Object, default: null },
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'updated'])

const tab = ref('info')
const inspections = ref([])
const faults = ref([])
const loadingHistory = ref(false)
const historyError = ref('')

const faultForm = reactive({ title: '', description: '', severity: '一般' })
const submitting = ref(false)

const aiLoading = ref(false)
const aiResult = ref('')
const aiSource = ref('')

const infoRows = computed(() => {
  const f = props.facility
  if (!f) return []
  return [
    ['类别', f.category],
    ['地址', f.address || '—'],
    ['状态', f.status],
    ['坐标', `${Number(f.lat).toFixed(4)}, ${Number(f.lng).toFixed(4)}`],
    ['安装时间', f.installed_at || '—'],
    ['备注', f.note || '—'],
  ]
})

async function loadHistory() {
  const f = props.facility
  if (!f) return
  loadingHistory.value = true
  historyError.value = ''
  try {
    const [ins, flt] = await Promise.all([
      api.list('inspections', { facility_id: f.id, all: 1, pageSize: 100 }),
      api.list('faults', { facility_id: f.id, all: 1, pageSize: 100 }),
    ])
    inspections.value = ins.list || []
    faults.value = flt.list || []
  } catch (e) {
    historyError.value = e.message || '加载历史记录失败'
    inspections.value = []
    faults.value = []
  } finally {
    loadingHistory.value = false
  }
}

watch(
  () => props.facility?.id,
  (id) => {
    if (!id) return
    tab.value = 'info'
    aiResult.value = ''
    aiSource.value = ''
    faultForm.title = ''
    faultForm.description = ''
    faultForm.severity = '一般'
    loadHistory()
  },
)

async function submitFault() {
  if (!faultForm.title.trim()) {
    ElMessage.warning('请填写故障标题')
    return
  }
  if (!props.facility) return
  submitting.value = true
  try {
    await api.create('faults', {
      facility_id: props.facility.id,
      title: faultForm.title.trim(),
      description: faultForm.description.trim(),
      severity: faultForm.severity,
      status: '待处理',
      reporter: '现场巡检',
    })
    ElMessage.success('故障已上报')
    faultForm.title = ''
    faultForm.description = ''
    faultForm.severity = '一般'
    await loadHistory()
    emit('updated')
  } catch (e) {
    ElMessage.error(e.message || '上报失败')
  } finally {
    submitting.value = false
  }
}

async function runDiagnose() {
  const desc = faultForm.description.trim() || props.facility?.note || `设施「${props.facility?.name}」出现异常`
  aiLoading.value = true
  aiResult.value = ''
  try {
    const data = await api.diagnose(desc, faultForm.severity)
    aiResult.value = data.text || '（AI 未返回内容）'
    aiSource.value = data.source || ''
  } catch (e) {
    aiResult.value = `诊断失败：${e.message || '未知错误'}`
    aiSource.value = ''
  } finally {
    aiLoading.value = false
  }
}

function fmt(t) {
  return (t || '').replace('T', ' ').slice(0, 16)
}
</script>

<template>
  <aside class="cl-panel cl-float cl-drawer" :class="{ 'is-open': open && facility }">
    <template v-if="facility">
      <div class="cl-drawer-head">
        <div style="display: flex; align-items: flex-start; gap: 10px">
          <div style="flex: 1">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
              <h3 style="margin: 0; font-size: 17px">{{ facility.name }}</h3>
              <el-tag :type="STATUS_TAG[facility.status] || 'info'" size="small" effect="dark">
                {{ facility.status }}
              </el-tag>
            </div>
            <div style="margin-top: 6px; font-size: 12px; color: #94a3b8">
              <span class="cl-dot" :style="{ background: statusColor(facility.status), display: 'inline-block' }" />
              {{ facility.category }} · 编号 #{{ facility.id }}
            </div>
          </div>
          <el-button link @click="emit('close')">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>

      <el-tabs v-model="tab" class="cl-drawer-tabs" style="padding: 0 12px">
        <el-tab-pane label="设施信息" name="info" />
        <el-tab-pane label="巡检历史" name="history" />
        <el-tab-pane label="上报故障" name="fault" />
        <el-tab-pane label="AI 诊断" name="ai" />
      </el-tabs>

      <div class="cl-drawer-body">
        <!-- 信息 -->
        <template v-if="tab === 'info'">
          <dl class="cl-kv">
            <template v-for="[k, v] in infoRows" :key="k">
              <dt>{{ k }}</dt>
              <dd>{{ v }}</dd>
            </template>
          </dl>

          <el-divider content-position="left">关联故障（{{ faults.length }}）</el-divider>
          <el-empty v-if="!faults.length && !loadingHistory" description="暂无关联故障" :image-size="70" />
          <div v-for="f in faults" :key="f.id" style="margin-bottom: 10px">
            <div style="display: flex; align-items: center; gap: 8px">
              <b style="font-size: 13px">{{ f.title }}</b>
              <el-tag size="small" :type="SEVERITY_TAG[f.severity] || 'info'">{{ f.severity }}</el-tag>
              <el-tag size="small" :type="FAULT_STATUS_TAG[f.status] || 'info'" effect="plain">{{ f.status }}</el-tag>
            </div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 3px">{{ fmt(f.created_at) }}</div>
          </div>
        </template>

        <!-- 巡检历史时间线 -->
        <template v-else-if="tab === 'history'">
          <el-alert
            v-if="historyError"
            type="error"
            :closable="false"
            show-icon
            :title="historyError"
            style="margin-bottom: 12px"
          >
            <template #default>
              <el-button link type="primary" size="small" @click="loadHistory">重试</el-button>
            </template>
          </el-alert>

          <div v-if="loadingHistory" class="cl-center-state">
            <el-skeleton :rows="4" animated />
          </div>

          <el-empty
            v-else-if="!inspections.length"
            description="该设施暂无巡检记录"
            :image-size="80"
          >
            <el-button type="primary" size="small" @click="tab = 'fault'">上报一次故障</el-button>
          </el-empty>

          <div v-else class="cl-timeline">
            <div
              v-for="r in inspections"
              :key="r.id"
              class="cl-tl-item"
              :class="r.result === '异常' ? 'is-bad' : 'is-ok'"
            >
              <div class="cl-tl-time">{{ fmt(r.inspected_at) }} · {{ r.inspector || '未署名' }}</div>
              <div class="cl-tl-text">
                <el-tag size="small" :type="r.result === '异常' ? 'danger' : 'success'" effect="plain">
                  {{ r.result }}
                </el-tag>
                <span style="margin-left: 8px">{{ r.note || '无备注' }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- 上报故障 -->
        <template v-else-if="tab === 'fault'">
          <el-form label-position="top">
            <el-form-item label="故障标题" required>
              <el-input v-model="faultForm.title" maxlength="40" show-word-limit placeholder="如：灯头持续闪烁" />
            </el-form-item>
            <el-form-item label="严重程度">
              <el-radio-group v-model="faultForm.severity">
                <el-radio-button v-for="s in SEVERITIES" :key="s" :value="s">{{ s }}</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="详细描述">
              <el-input
                v-model="faultForm.description"
                type="textarea"
                :rows="4"
                maxlength="200"
                show-word-limit
                placeholder="描述现象、发生时间、影响范围等"
              />
            </el-form-item>
            <el-button type="danger" style="width: 100%" :loading="submitting" @click="submitFault">
              提交故障上报
            </el-button>
          </el-form>

          <el-divider content-position="left">该设施历史故障</el-divider>
          <el-empty v-if="!faults.length" description="暂无历史故障" :image-size="60" />
          <div v-for="f in faults" :key="f.id" style="font-size: 12.5px; margin-bottom: 8px">
            <b>{{ f.title }}</b>
            <el-tag size="small" :type="FAULT_STATUS_TAG[f.status] || 'info'" effect="plain" style="margin-left: 6px">
              {{ f.status }}
            </el-tag>
            <div style="color: #94a3b8">{{ fmt(f.created_at) }} · {{ f.reporter || '匿名' }}</div>
          </div>
        </template>

        <!-- AI 诊断 -->
        <template v-else>
          <p style="font-size: 13px; color: #64748b; margin-top: 0">
            基于故障描述，AI 将给出可能原因、所需工具、预计工时与临时处置建议。
          </p>
          <el-form label-position="top">
            <el-form-item label="严重程度">
              <el-radio-group v-model="faultForm.severity">
                <el-radio-button v-for="s in SEVERITIES" :key="s" :value="s">{{ s }}</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="故障描述">
              <el-input
                v-model="faultForm.description"
                type="textarea"
                :rows="4"
                placeholder="留空则使用设施备注作为描述"
              />
            </el-form-item>
            <el-button type="primary" style="width: 100%" :loading="aiLoading" @click="runDiagnose">
              <el-icon style="margin-right: 4px"><MagicStick /></el-icon>
              开始 AI 诊断
            </el-button>
          </el-form>

          <div v-if="aiResult" class="cl-ai-box">
            {{ aiResult }}
            <div style="margin-top: 8px">
              <el-tag size="small" :type="aiSource === 'llm' ? 'success' : 'info'" effect="plain">
                {{ aiSource === 'llm' ? '大模型生成' : '本地规则降级' }}
              </el-tag>
            </div>
          </div>
        </template>
      </div>
    </template>
  </aside>
</template>
