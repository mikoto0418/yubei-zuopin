<template>
  <AppShell>
    <div class="sf-page">
      <div class="sf-page-head">
        <div>
          <h1 class="sf-page-title">版本历史</h1>
          <p class="sf-page-sub">场景快照 · 逐字段对比 · 一键回滚</p>
        </div>
        <div class="head-actions">
          <select v-model="projectId" class="apple-input head-select" @change="onProjectChange">
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
          </select>
          <select v-model="sceneId" class="apple-input head-select" @change="loadRevisions">
            <option v-for="s in scenes" :key="s.id" :value="s.id">{{ s.title }}</option>
          </select>
          <button class="apple-btn apple-btn--primary" :disabled="!sceneId" @click="doSnapshot">为当前场景存快照</button>
        </div>
      </div>

      <StateBlock
        :state="state"
        :error="error"
        art="🕰"
        title="还没有版本快照"
        description="为场景保存一次快照，之后就能对比与回滚。"
        action-text="保存快照"
        @action="doSnapshot"
        @retry="loadRevisions"
      >
        <div class="rev">
          <!-- 快照列表 -->
          <aside class="rev__list">
            <div class="rev__list-head">
              <span class="apple-headline">快照（{{ revisions.length }}）</span>
            </div>
            <label
              v-for="r in revisions"
              :key="r.id"
              class="rev__item"
              :class="{ 'rev__item--on': picked.includes(r.version) }"
            >
              <input type="checkbox" :value="r.version" v-model="picked" />
              <div class="rev__item-body">
                <div class="rev__ver">v{{ r.version }}</div>
                <div class="rev__sum">{{ r.summary }}</div>
                <div class="sf-caption">{{ r.created_at }}</div>
              </div>
            </label>
            <p class="sf-caption rev__hint">勾选两个版本进行对比；单个版本可直接回滚。</p>
          </aside>

          <!-- 对比与回滚 -->
          <section class="rev__main">
            <div class="rev__ops">
              <button class="apple-btn apple-btn--secondary" :disabled="picked.length !== 2" @click="compare">对比选中版本</button>
              <span v-if="picked.length === 1" class="sf-caption">将回滚到 v{{ picked[0] }}</span>
              <button class="apple-btn apple-btn--primary" :disabled="picked.length !== 1" @click="rollback">回滚</button>
            </div>

            <div v-if="diff" class="diff">
              <div class="diff__head">
                <span class="sf-badge">v{{ diff.left.version }} → v{{ diff.right.version }}</span>
                <span class="sf-caption">{{ diff.changed_count }} 个字段有差异</span>
              </div>
              <div v-for="f in diff.fields" :key="f.field" class="diff__row" :class="{ 'diff__row--changed': f.changed }">
                <div class="diff__key">{{ FIELD_LABEL[f.field] || f.field }}</div>
                <div class="diff__side">
                  <div class="sf-caption">v{{ diff.left.version }}</div>
                  <div class="diff__val" :class="{ 'diff__val--serif': f.field === 'content' }">{{ f.from || '（空）' }}</div>
                </div>
                <div class="diff__side">
                  <div class="sf-caption">v{{ diff.right.version }}</div>
                  <div class="diff__val" :class="{ 'diff__val--serif': f.field === 'content' }">{{ f.to || '（空）' }}</div>
                </div>
              </div>
            </div>

            <div v-else class="sf-empty">
              <div class="sf-empty__art">⇄</div>
              <div class="apple-subhead">勾选两个版本后点击「对比选中版本」</div>
            </div>
          </section>
        </div>
      </StateBlock>
    </div>
  </AppShell>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import AppShell from '../layouts/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import { api } from '../api'

const FIELD_LABEL = {
  title: '标题', location: '地点', time_of_day: '时间', status: '状态', content: '正文',
}

const state = ref('loading')
const error = ref('')
const projects = ref([])
const projectId = ref(null)
const scenes = ref([])
const sceneId = ref(null)
const revisions = ref([])
const picked = ref([])
const diff = ref(null)

async function onProjectChange() {
  sceneId.value = null
  scenes.value = []
  revisions.value = []
  diff.value = null
  const sc = await api.list('scenes', { pageSize: 100, project_id: projectId.value })
  scenes.value = sc.list
  if (sc.list.length) { sceneId.value = sc.list[0].id; await loadRevisions() }
  else state.value = 'empty'
}

async function loadRevisions() {
  if (!sceneId.value) { state.value = 'empty'; return }
  state.value = 'loading'
  error.value = ''
  diff.value = null
  picked.value = []
  try {
    const data = await api.revisions(sceneId.value)
    revisions.value = data.revisions
    state.value = data.revisions.length ? 'ready' : 'empty'
  } catch (e) {
    error.value = e.message
    state.value = e.status === 403 ? 'forbidden' : 'error'
  }
}

async function doSnapshot() {
  if (!sceneId.value) return
  try {
    const rev = await api.snapshot(sceneId.value, '手动保存的快照')
    Message.success(`已生成快照 v${rev.version}`)
    await loadRevisions()
  } catch (e) { Message.error(e.message) }
}

async function compare() {
  const [a, b] = [...picked.value].sort((x, y) => x - y)
  try {
    diff.value = await api.compare(sceneId.value, a, b)
  } catch (e) { Message.error(e.message) }
}

async function rollback() {
  const v = picked.value[0]
  try {
    await api.rollback(sceneId.value, v)
    Message.success(`已回滚到 v${v}`)
    await loadRevisions()
  } catch (e) { Message.error(e.message) }
}

onMounted(async () => {
  try {
    const ps = await api.list('projects', { pageSize: 100 })
    projects.value = ps.list
    if (ps.list.length) { projectId.value = ps.list[0].id; await onProjectChange() }
    else state.value = 'empty'
  } catch (e) { error.value = e.message; state.value = 'error' }
})
</script>

<style scoped>
.head-actions { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.head-select { width: 180px; }

.rev { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: var(--sp-6); }
.rev__list-head { margin-bottom: var(--sp-3); }
.rev__item {
  display: flex; gap: var(--sp-3); align-items: flex-start;
  padding: var(--sp-3); border-radius: var(--radius-md);
  cursor: pointer;
  border: 2px solid transparent;
}
.rev__item:hover { background: var(--fill-secondary); }
.rev__item--on { border-color: var(--tint); background: var(--tint-soft); }
.rev__ver { font-size: var(--fs-subhead); font-weight: 600; }
.rev__sum { font-size: var(--fs-footnote); color: var(--label-secondary); }
.rev__hint { margin-top: var(--sp-3); }

.rev__ops { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-5); }

.diff { background: var(--bg-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: var(--sp-5); }
.diff__head { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-4); }
.diff__row {
  display: grid; grid-template-columns: 90px 1fr 1fr; gap: var(--sp-4);
  padding: var(--sp-3) 0; border-bottom: 1px solid var(--separator);
}
.diff__row--changed { background: rgba(88, 86, 214, 0.04); }
.diff__key { font-size: var(--fs-footnote); color: var(--label-secondary); }
.diff__val { font-size: var(--fs-subhead); line-height: 1.6; word-break: break-word; }
/* 正文差异用衬线，和编辑器保持一致 */
.diff__val--serif { font-family: var(--font-serif); }

@media (max-width: 900px) {
  .rev { grid-template-columns: 1fr; }
  .diff__row { grid-template-columns: 1fr; }
}
</style>
