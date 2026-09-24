<template>
  <AppShell>
    <div class="sf-page">
      <div class="sf-page-head">
        <div>
          <h1 class="sf-page-title">对白编辑</h1>
          <p class="sf-page-sub">结构化的「角色 + 台词 + 情绪提示」 · 可导出标准剧本格式</p>
        </div>
        <div class="head-actions">
          <select v-model="projectId" class="apple-input head-select" @change="onProjectChange">
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
          </select>
          <select v-model="sceneId" class="apple-input head-select" @change="load">
            <option :value="null">全部场景</option>
            <option v-for="s in allScenes" :key="s.id" :value="s.id">{{ s.title }}</option>
          </select>
          <button class="apple-btn apple-btn--secondary" @click="exportScript">导出剧本格式</button>
          <button class="apple-btn apple-btn--primary" @click="openCreate">新增对白</button>
        </div>
      </div>

      <StateBlock
        :state="state"
        :error="error"
        art="💬"
        title="还没有对白"
        description="为场景添加第一句台词。"
        action-text="新增对白"
        @action="openCreate"
        @retry="load"
      >
        <div class="dlg-list">
          <div v-for="d in list" :key="d.id" class="dlg">
            <div class="dlg__side">
              <div class="dlg__who">{{ d.character_name || '未指定角色' }}</div>
              <div class="sf-caption">{{ sceneTitle(d.scene_id) }}</div>
            </div>
            <div class="dlg__main">
              <div class="dlg__emotion" v-if="d.emotion">（{{ d.emotion }}）</div>
              <div class="dlg__say">{{ d.line }}</div>
            </div>
            <div class="dlg__ops">
              <button class="apple-btn apple-btn--plain dlg__op" @click="polish(d)">AI 润色</button>
              <button class="apple-btn apple-btn--plain dlg__op" @click="edit(d)">编辑</button>
              <button class="apple-btn apple-btn--plain dlg__op dlg__op--danger" @click="remove(d)">删除</button>
            </div>
          </div>
        </div>

        <div v-if="pages > 1" class="pager">
          <button class="apple-btn apple-btn--secondary" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
          <span class="sf-caption">{{ page }} / {{ pages }}</span>
          <button class="apple-btn apple-btn--secondary" :disabled="page >= pages" @click="go(page + 1)">下一页</button>
        </div>
      </StateBlock>
    </div>

    <a-modal v-model:visible="editing" :title="form.id ? '编辑对白' : '新增对白'" :width="560" @ok="submit" @cancel="editing = false">
      <div class="form">
        <label class="form__row"><span class="sf-caption">场景</span>
          <select v-model.number="form.scene_id" class="apple-input">
            <option v-for="s in allScenes" :key="s.id" :value="s.id">{{ s.title }}</option>
          </select>
        </label>
        <label class="form__row"><span class="sf-caption">角色</span>
          <select v-model.number="form.character_id" class="apple-input">
            <option :value="null">（未指定）</option>
            <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label class="form__row"><span class="sf-caption">台词</span>
          <textarea v-model.trim="form.line" class="apple-input form__area" rows="3"></textarea>
        </label>
        <label class="form__row"><span class="sf-caption">情绪提示</span>
          <input v-model.trim="form.emotion" class="apple-input" placeholder="如：压低声音 / 停顿" />
        </label>
        <p v-if="formError" class="form__err">{{ formError }}</p>
      </div>
    </a-modal>

    <a-modal v-model:visible="aiOpen" title="AI 对白润色建议" :width="520" :footer="false">
      <div class="ai-out">
        <span class="sf-badge">引擎：{{ aiSource === 'llm' ? '大模型' : '本地规则（未配置 Key 自动降级）' }}</span>
        <pre class="ai-out__text">{{ aiText }}</pre>
      </div>
    </a-modal>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import AppShell from '../layouts/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import { api } from '../api'

const state = ref('loading')
const error = ref('')
const projects = ref([])
const projectId = ref(null)
const scenes = ref([])
const characters = ref([])
const sceneId = ref(null)
const list = ref([])
const page = ref(1)
const pages = ref(0)
const pageSize = 20

const editing = ref(false)
const formError = ref('')
const form = reactive({ id: null, scene_id: null, character_id: null, line: '', emotion: '' })

const aiOpen = ref(false)
const aiText = ref('')
const aiSource = ref('local')

const allScenes = computed(() => scenes.value)
const sceneTitle = (id) => scenes.value.find((s) => s.id === id)?.title || '—'

async function loadProjects() {
  const ps = await api.list('projects', { pageSize: 100 })
  projects.value = ps.list
  if (!projectId.value && ps.list.length) projectId.value = ps.list[0].id
}

async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    if (!projects.value.length) await loadProjects()
    if (!projectId.value) { state.value = 'empty'; return }

    const sc = await api.list('scenes', { pageSize: 100, project_id: projectId.value })
    scenes.value = sc.list
    const ch = await api.list('characters', { pageSize: 100, project_id: projectId.value })
    characters.value = ch.list

    const data = await api.list('dialogues', { page: page.value, pageSize, scene_id: sceneId.value || '' })
    list.value = data.list
    pages.value = data.pages
    state.value = data.list.length ? 'ready' : 'empty'
  } catch (e) {
    error.value = e.message
    state.value = e.status === 403 ? 'forbidden' : 'error'
  }
}

async function onProjectChange() {
  sceneId.value = null
  page.value = 1
  scenes.value = []
  characters.value = []
  await load()
}

function go(p) { page.value = p; load() }

function openCreate() {
  formError.value = ''
  Object.assign(form, {
    id: null, scene_id: scenes.value[0]?.id || null,
    character_id: characters.value[0]?.id || null, line: '', emotion: '',
  })
  editing.value = true
}

function edit(d) {
  formError.value = ''
  Object.assign(form, { id: d.id, scene_id: d.scene_id, character_id: d.character_id, line: d.line, emotion: d.emotion || '' })
  editing.value = true
}

async function submit() {
  if (!form.scene_id) { formError.value = '请选择场景'; return }
  if (!form.line) { formError.value = '请填写台词'; return }
  try {
    const payload = { scene_id: form.scene_id, character_id: form.character_id, line: form.line, emotion: form.emotion }
    if (form.id) await api.update('dialogues', form.id, payload)
    else await api.create('dialogues', payload)
    editing.value = false
    await load()
    Message.success('已保存')
  } catch (e) { formError.value = e.message }
}

async function remove(d) {
  try {
    await api.remove('dialogues', d.id)
    await load()
    Message.success('已删除')
  } catch (e) { Message.error(e.message) }
}

async function polish(d) {
  try {
    const out = await api.aiPolishDialogue({
      line: d.line, character_name: d.character_name, emotion: d.emotion,
    })
    aiText.value = out.text
    aiSource.value = out.source
    aiOpen.value = true
  } catch (e) { Message.error(e.message) }
}

function exportScript() {
  const lines = []
  const grouped = {}
  list.value.forEach((d) => { (grouped[d.scene_id] = grouped[d.scene_id] || []).push(d) })
  Object.keys(grouped).forEach((sid) => {
    const s = scenes.value.find((x) => x.id === Number(sid))
    lines.push('')
    lines.push(`${s ? s.title : '场景'}　${s ? s.location : ''}　${s ? s.time_of_day : ''}`.trim())
    lines.push('')
    grouped[sid].forEach((d) => {
      lines.push(`　　　　　${(d.character_name || '旁白').toUpperCase()}`)
      if (d.emotion) lines.push(`　　　（${d.emotion}）`)
      lines.push(`　　${d.line}`)
      lines.push('')
    })
  })
  const text = lines.join('\n')
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'scriptforge-剧本.txt'
  a.click()
  URL.revokeObjectURL(url)
  Message.success('已导出标准剧本格式')
}

onMounted(load)
</script>

<style scoped>
.head-actions { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.head-select { width: 180px; }

.dlg-list { display: flex; flex-direction: column; }
.dlg {
  display: flex; gap: var(--sp-4); align-items: flex-start;
  padding: var(--sp-4) 0;
  border-bottom: 1px solid var(--separator);
}
.dlg__side { width: 150px; flex-shrink: 0; }
.dlg__who { font-size: var(--fs-subhead); font-weight: 600; }
.dlg__main { flex: 1; min-width: 0; }
.dlg__emotion { font-size: var(--fs-caption); color: var(--label-secondary); margin-bottom: var(--sp-1); }
/* 台词本身用衬线，和纸张编辑区保持一致的阅读体验 */
.dlg__say { font-family: var(--font-serif); font-size: var(--fs-body); line-height: 1.7; color: var(--label); }
.dlg__ops { display: flex; gap: var(--sp-1); flex-shrink: 0; }
.dlg__op { font-size: var(--fs-footnote); height: 28px; padding: 0 var(--sp-2); }
.dlg__op--danger { color: var(--red); }

.pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); margin-top: var(--sp-8); }
.form { display: flex; flex-direction: column; gap: var(--sp-4); }
.form__row { display: flex; flex-direction: column; gap: var(--sp-2); }
.form__row .apple-input { height: 40px; }
.form__area { height: auto; padding: var(--sp-3); resize: vertical; font-family: var(--font-serif); }
.form__err { color: var(--red); font-size: var(--fs-footnote); }
.ai-out { display: flex; flex-direction: column; gap: var(--sp-4); }
.ai-out__text {
  white-space: pre-wrap; word-break: break-word; margin: 0;
  font-family: var(--font-sans); font-size: var(--fs-subhead); line-height: 1.6;
  background: var(--fill-secondary); padding: var(--sp-4); border-radius: var(--radius-md);
}
</style>
