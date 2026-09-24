<template>
  <AppShell>
    <div class="sf-page">
      <div class="sf-page-head">
        <div>
          <h1 class="sf-page-title">故事线</h1>
          <p class="sf-page-sub">A / B / C 线 · 关联场景 · 完整性检查</p>
        </div>
        <div class="head-actions">
          <select v-model="projectId" class="apple-input head-select" @change="load">
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
          </select>
          <button class="apple-btn apple-btn--primary" @click="openCreate">新建故事线</button>
        </div>
      </div>

      <StateBlock
        :state="state"
        :error="error"
        art="🧵"
        title="还没有故事线"
        description="先立一条 A 线，把主线场景串起来。"
        action-text="新建故事线"
        @action="openCreate"
        @retry="load"
      >
        <div class="sf-grid sf-grid--cards">
          <article v-for="l in list" :key="l.id" class="lcard">
            <div class="lcard__head">
              <span class="lcard__code">{{ l.code }}</span>
              <div class="lcard__id">
                <h3 class="lcard__title">{{ l.title }}</h3>
                <div class="sf-caption">{{ l.kind === 'main' ? '主线' : '支线' }} · {{ l.scene_count }} 场</div>
              </div>
              <span class="sf-badge" :class="l.complete ? 'sf-badge--approved' : 'sf-badge--revising'">
                {{ l.complete ? '完整' : '待补' }}
              </span>
            </div>

            <p class="lcard__sum">{{ l.summary || '还没有写这条线的概述。' }}</p>

            <div v-if="l.issues.length" class="lcard__issues">
              <div v-for="(it, i) in l.issues" :key="i" class="lcard__issue">· {{ it }}</div>
            </div>

            <div class="lcard__scenes">
              <div v-for="s in l.scenes" :key="s.id" class="lcard__scene">
                <span class="lcard__seq">{{ s.seq }}</span>
                <span class="lcard__scene-title">{{ s.scene_title }}</span>
                <button class="lcard__unlink" @click="unlink(l, s)">移除</button>
              </div>
              <p v-if="!l.scenes.length" class="sf-caption">尚未关联场景。</p>
            </div>

            <div class="lcard__add">
              <select v-model.number="linkTarget[l.id]" class="apple-input lcard__select">
                <option :value="null">选择场景…</option>
                <option v-for="s in availableScenes(l)" :key="s.id" :value="s.id">{{ s.title }}</option>
              </select>
              <button class="apple-btn apple-btn--secondary lcard__btn" @click="link(l)">关联</button>
            </div>
          </article>
        </div>
      </StateBlock>
    </div>

    <a-modal v-model:visible="creating" title="新建故事线" :width="520" @ok="submit" @cancel="creating = false">
      <div class="form">
        <div class="form__grid">
          <label class="form__row"><span class="sf-caption">编号</span>
            <select v-model="form.code" class="apple-input"><option>A</option><option>B</option><option>C</option><option>D</option></select>
          </label>
          <label class="form__row"><span class="sf-caption">类型</span>
            <select v-model="form.kind" class="apple-input"><option value="main">主线</option><option value="sub">支线</option></select>
          </label>
        </div>
        <label class="form__row"><span class="sf-caption">标题</span><input v-model.trim="form.title" class="apple-input" /></label>
        <label class="form__row"><span class="sf-caption">概述</span>
          <textarea v-model.trim="form.summary" class="apple-input form__area" rows="3"></textarea>
        </label>
        <p v-if="formError" class="form__err">{{ formError }}</p>
      </div>
    </a-modal>
  </AppShell>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import AppShell from '../layouts/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import { api } from '../api'

const state = ref('loading')
const error = ref('')
const projects = ref([])
const projectId = ref(null)
const list = ref([])
const scenes = ref([])
const linkTarget = reactive({})

const creating = ref(false)
const formError = ref('')
const form = reactive({ code: 'A', kind: 'main', title: '', summary: '' })

function availableScenes(line) {
  const linked = new Set(line.scenes.map((s) => s.scene_id))
  return scenes.value.filter((s) => !linked.has(s.id))
}

async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    const ps = await api.list('projects', { pageSize: 100 })
    projects.value = ps.list
    if (!projectId.value && ps.list.length) projectId.value = ps.list[0].id
    if (!projectId.value) { state.value = 'empty'; return }

    const sc = await api.list('scenes', { pageSize: 100, project_id: projectId.value })
    scenes.value = sc.list

    const data = await api.storylines({ project_id: projectId.value, pageSize: 50 })
    list.value = data.list
    data.list.forEach((l) => { if (linkTarget[l.id] === undefined) linkTarget[l.id] = null })
    state.value = data.list.length ? 'ready' : 'empty'
  } catch (e) {
    error.value = e.message
    state.value = e.status === 403 ? 'forbidden' : 'error'
  }
}

function openCreate() {
  formError.value = ''
  Object.assign(form, { code: 'A', kind: 'main', title: '', summary: '' })
  creating.value = true
}

async function submit() {
  if (!form.title) { formError.value = '请填写标题'; return }
  try {
    await api.create('storylines', { project_id: projectId.value, ...form })
    creating.value = false
    await load()
  } catch (e) { formError.value = e.message }
}

async function link(line) {
  const sceneId = linkTarget[line.id]
  if (!sceneId) return
  try {
    await api.linkScene(line.id, sceneId)
    linkTarget[line.id] = null
    await load()
    Message.success('已关联场景')
  } catch (e) { Message.error(e.message) }
}

async function unlink(line, s) {
  try {
    await api.unlinkScene(line.id, s.scene_id)
    await load()
  } catch (e) { Message.error(e.message) }
}

onMounted(load)
</script>

<style scoped>
.head-actions { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.head-select { width: 180px; }

.lcard { background: var(--bg-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: var(--sp-4); }
.lcard__head { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.lcard__code {
  width: 34px; height: 34px; border-radius: var(--radius-md);
  background: var(--tint-soft); color: var(--tint);
  display: grid; place-items: center; font-weight: 700; font-size: var(--fs-headline);
  flex-shrink: 0;
}
.lcard__id { flex: 1; min-width: 0; }
.lcard__title { font-size: var(--fs-headline); font-weight: 600; }
.lcard__sum { font-size: var(--fs-subhead); color: var(--label-secondary); line-height: 1.5; margin-bottom: var(--sp-3); }

.lcard__issues {
  background: rgba(255, 59, 48, 0.06);
  border-radius: var(--radius-sm);
  padding: var(--sp-2) var(--sp-3);
  margin-bottom: var(--sp-3);
}
.lcard__issue { font-size: var(--fs-footnote); color: var(--red); line-height: 1.6; }

.lcard__scenes { border-top: 1px solid var(--separator); padding-top: var(--sp-3); margin-bottom: var(--sp-3); }
.lcard__scene { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) 0; }
.lcard__seq { font-size: var(--fs-caption); color: var(--label-tertiary); min-width: 18px; }
.lcard__scene-title { flex: 1; min-width: 0; font-size: var(--fs-footnote); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lcard__unlink {
  border: none; background: transparent; color: var(--red);
  font-family: inherit; font-size: var(--fs-caption); cursor: pointer; padding: 0 var(--sp-1);
}

.lcard__add { display: flex; gap: var(--sp-2); }
.lcard__select { flex: 1; }
.lcard__btn { flex-shrink: 0; }

.form { display: flex; flex-direction: column; gap: var(--sp-4); }
.form__grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); }
.form__row { display: flex; flex-direction: column; gap: var(--sp-2); }
.form__row .apple-input { height: 40px; }
.form__area { height: auto; padding: var(--sp-3); resize: vertical; }
.form__err { color: var(--red); font-size: var(--fs-footnote); }
</style>
