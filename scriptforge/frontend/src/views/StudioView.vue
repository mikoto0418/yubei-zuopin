<template>
  <AppShell>
    <StateBlock :state="state" :error="error" art="📖" title="作品不存在" description="这部作品可能已被删除。" @retry="load">
      <div v-if="data" class="studio">
        <!-- 顶栏：作品信息 + 状态机 -->
        <header class="studio__bar">
          <div>
            <h1 class="studio__title">{{ data.project.title }}</h1>
            <div class="studio__meta">
              <StatusBadge :value="data.project.status" kind="project" />
              <span class="sf-caption">{{ data.project.type }} · {{ data.project.genre }}</span>
              <span class="sf-caption">{{ data.stats.scenes }} 场 · {{ data.stats.words }} 字</span>
            </div>
          </div>
          <div class="studio__actions">
            <select v-if="statusOptions.length" class="apple-input studio__flow" :value="''" @change="onProjectFlow($event.target.value)">
              <option value="">作品状态流转…</option>
              <option v-for="s in statusOptions" :key="s" :value="s">{{ projectStatusLabel(s) }}</option>
            </select>
            <button class="apple-btn apple-btn--secondary" :disabled="aiBusy" @click="onLogicCheck">
              {{ aiBusy ? '检查中…' : 'AI 逻辑检查' }}
            </button>
            <button class="apple-btn apple-btn--secondary" :disabled="aiBusy" @click="onPlotSuggest">AI 情节建议</button>
          </div>
        </header>

        <div class="studio__body">
          <!-- 左：作品结构树（分集 → 场景） -->
          <aside class="col col--tree">
            <div class="col__head">
              <span class="apple-headline">作品结构</span>
              <button class="apple-btn apple-btn--plain col__add" @click="addEpisode">+ 分集</button>
            </div>
            <div>
              <div v-for="ep in data.episodes" :key="ep.id" class="tree__ep">
                <button class="tree__ep-head" @click="toggleEp(ep.id)">
                  <span class="tree__caret">{{ openEps.includes(ep.id) ? '▾' : '▸' }}</span>
                  <span class="tree__ep-title">{{ ep.title }}</span>
                  <span class="sf-caption">{{ ep.scenes.length }}</span>
                </button>
                <div v-if="openEps.includes(ep.id)" class="tree__scenes">
                  <button
                    v-for="s in ep.scenes"
                    :key="s.id"
                    class="tree__scene"
                    :class="{ 'tree__scene--active': activeScene && activeScene.id === s.id }"
                    @click="selectScene(s)"
                  >
                    <span class="tree__scene-title">{{ s.title }}</span>
                    <StatusBadge :value="s.status" kind="scene" />
                  </button>
                  <button class="tree__add" @click="addScene(ep)">+ 新增场景</button>
                </div>
              </div>
            </div>
          </aside>

          <!-- 中：场景编辑器（纸张 + 衬线正文） -->
          <section class="col col--editor">
            <div v-if="!activeScene" class="sf-empty">
              <div class="sf-empty__art">✍️</div>
              <div class="apple-headline">选择左侧的一个场景开始写</div>
              <div class="apple-subhead">场景 = 地点 + 时间 + 出场角色 + 正文</div>
            </div>

            <template v-else>
              <div class="editor__bar">
                <input v-model.trim="draft.title" class="apple-input editor__title" @blur="saveScene" />
                <div class="editor__bar-right">
                  <select v-if="sceneOptions.length" class="apple-input editor__flow" :value="''" @change="onSceneFlow($event.target.value)">
                    <option value="">场景状态…</option>
                    <option v-for="s in sceneOptions" :key="s" :value="s">{{ sceneStatusLabel(s) }}</option>
                  </select>
                  <button class="apple-btn apple-btn--secondary" @click="doSnapshot">保存快照</button>
                  <button class="apple-btn apple-btn--primary" @click="saveScene">保存</button>
                </div>
              </div>

              <div class="editor__fields">
                <label class="editor__field">
                  <span class="sf-caption">地点</span>
                  <input v-model.trim="draft.location" class="apple-input" @blur="saveScene" />
                </label>
                <label class="editor__field">
                  <span class="sf-caption">时间</span>
                  <select v-model="draft.time_of_day" class="apple-input" @change="saveScene">
                    <option v-for="t in TIME_OF_DAY" :key="t">{{ t }}</option>
                  </select>
                </label>
                <div class="editor__field editor__field--wide">
                  <span class="sf-caption">出场角色（{{ sceneCast.length }}）</span>
                  <span class="editor__cast">
                    <span v-for="c in sceneCast" :key="c.id" class="sf-badge">{{ c.name }}</span>
                    <span v-if="!sceneCast.length" class="sf-caption">尚未关联角色</span>
                  </span>
                </div>
              </div>

              <!-- 纸张 + 衬线正文：ScriptForge 唯一的差异化区域 -->
              <div class="sf-paper editor__paper">
                <textarea
                  v-model="draft.content"
                  class="sf-editor"
                  placeholder="在这里写场景正文。米色稿纸 + 衬线字体是 ScriptForge 的阅读体验核心。"
                  @blur="saveScene"
                ></textarea>
              </div>
              <div class="editor__foot">
                <span class="sf-caption">{{ wordCount }} 字</span>
                <span v-if="savedAt" class="sf-caption">已保存 {{ savedAt }}</span>
              </div>

              <div class="editor__dialogue">
                <div class="col__head">
                  <span class="apple-headline">本场对白（{{ activeScene.dialogues.length }}）</span>
                  <button class="apple-btn apple-btn--plain col__add" @click="addDialogue">+ 加一句</button>
                </div>
                <div v-for="d in activeScene.dialogues" :key="d.id" class="dline">
                  <span class="dline__who">{{ d.character_name || '未指定' }}</span>
                  <span class="dline__emotion">{{ d.emotion }}</span>
                  <span class="dline__say">{{ d.line }}</span>
                </div>
                <p v-if="!activeScene.dialogues.length" class="sf-caption">这场还没有对白。</p>
              </div>
            </template>
          </section>

          <!-- 右：角色速查 + 故事线 -->
          <aside class="col col--side">
            <div class="side-block">
              <div class="col__head"><span class="apple-headline">角色速查</span></div>
              <div v-for="c in data.characters" :key="c.id" class="side-char">
                <div class="side-char__avatar">{{ c.name.slice(0, 1) }}</div>
                <div>
                  <div class="side-char__name">{{ c.name }} · {{ c.age }}</div>
                  <div class="sf-caption">{{ c.identity }}</div>
                </div>
              </div>
            </div>

            <div class="side-block">
              <div class="col__head"><span class="apple-headline">故事线</span></div>
              <div v-for="l in data.storylines" :key="l.id" class="side-line">
                <span class="side-line__code">{{ l.code }}</span>
                <div>
                  <div class="side-line__title">{{ l.title }}</div>
                  <div class="sf-caption">{{ l.kind === 'main' ? '主线' : '支线' }}</div>
                </div>
              </div>
              <p v-if="!data.storylines.length" class="sf-caption">还没有建立故事线。</p>
            </div>
          </aside>
        </div>
      </div>
    </StateBlock>

    <a-drawer v-model:visible="aiOpen" :width="460" :title="aiTitle" unmount-on-close>
      <div class="ai-out">
        <span class="sf-badge">引擎：{{ aiSource === 'llm' ? '大模型' : '本地规则（未配置 Key 自动降级）' }}</span>
        <pre class="ai-out__text">{{ aiText }}</pre>
      </div>
    </a-drawer>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import AppShell from '../layouts/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { api } from '../api'
import { PROJECT_FLOW, SCENE_FLOW, TIME_OF_DAY, projectStatusLabel, sceneStatusLabel } from '../constants'

const route = useRoute()
const state = ref('loading')
const error = ref('')
const data = ref(null)
const openEps = ref([])
const activeScene = ref(null)
const draft = reactive({ title: '', location: '', time_of_day: '日', content: '' })
const savedAt = ref('')
const aiBusy = ref(false)
const aiOpen = ref(false)
const aiText = ref('')
const aiTitle = ref('')
const aiSource = ref('local')

const projectId = computed(() => Number(route.params.id))
const statusOptions = computed(() => (data.value ? PROJECT_FLOW[data.value.project.status] || [] : []))
const sceneOptions = computed(() => (activeScene.value ? SCENE_FLOW[activeScene.value.status] || [] : []))
const sceneCast = computed(() => activeScene.value?.characters || [])
const wordCount = computed(() => String(draft.content || '').replace(/\s/g, '').length)

function findScene(id) {
  if (!data.value) return null
  for (const ep of data.value.episodes) {
    const hit = ep.scenes.find((s) => s.id === id)
    if (hit) return hit
  }
  return null
}

async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    data.value = await api.projectFull(projectId.value)
    if (data.value.episodes.length) {
      openEps.value = [data.value.episodes[0].id]
      const first = data.value.episodes[0].scenes[0]
      if (first) selectScene(first)
    }
    state.value = 'ready'
  } catch (e) {
    error.value = e.message
    state.value = e.status === 403 ? 'forbidden' : e.status === 404 ? 'empty' : 'error'
  }
}

function toggleEp(id) {
  const i = openEps.value.indexOf(id)
  if (i >= 0) openEps.value.splice(i, 1)
  else openEps.value.push(id)
}

function selectScene(s) {
  activeScene.value = s
  Object.assign(draft, { title: s.title, location: s.location, time_of_day: s.time_of_day || '日', content: s.content || '' })
  savedAt.value = ''
}

async function saveScene() {
  if (!activeScene.value) return
  try {
    const updated = await api.update('scenes', activeScene.value.id, {
      title: draft.title, location: draft.location, time_of_day: draft.time_of_day, content: draft.content,
    })
    Object.assign(activeScene.value, updated)
    savedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (e) { Message.error(e.message) }
}

async function onSceneFlow(to) {
  if (!to || !activeScene.value) return
  try {
    const updated = await api.setSceneStatus(activeScene.value.id, to)
    Object.assign(activeScene.value, updated)
    Message.success(`场景已流转为 ${sceneStatusLabel(to)}`)
  } catch (e) { Message.error(e.message) }
}

async function onProjectFlow(to) {
  if (!to) return
  try {
    const updated = await api.setProjectStatus(projectId.value, to)
    data.value.project = updated
    Message.success(`作品已流转为 ${projectStatusLabel(to)}`)
  } catch (e) { Message.error(e.message) }
}

async function addEpisode() {
  const title = window.prompt('分集标题', `第 ${data.value.episodes.length + 1} 集`)
  if (!title) return
  try {
    await api.create('episodes', { project_id: projectId.value, title, seq: data.value.episodes.length + 1 })
    await load()
  } catch (e) { Message.error(e.message) }
}

async function addScene(ep) {
  const title = window.prompt('场景标题', '新场景')
  if (!title) return
  try {
    const created = await api.create('scenes', { episode_id: ep.id, title, seq: ep.scenes.length + 1 })
    await load()
    const s = findScene(created.id)
    if (s) selectScene(s)
  } catch (e) { Message.error(e.message) }
}

async function addDialogue() {
  if (!activeScene.value) return
  const line = window.prompt('台词内容')
  if (!line) return
  const who = window.prompt('角色名（可留空）', data.value.characters[0]?.name || '')
  const character = data.value.characters.find((c) => c.name === who)
  const sceneId = activeScene.value.id
  try {
    await api.create('dialogues', {
      scene_id: sceneId, line, character_id: character?.id || null, seq: activeScene.value.dialogues.length + 1,
    })
    await load()
    const s = findScene(sceneId)
    if (s) selectScene(s)
  } catch (e) { Message.error(e.message) }
}

async function doSnapshot() {
  if (!activeScene.value) return
  try {
    const rev = await api.snapshot(activeScene.value.id, '工作台快照')
    Message.success(`已生成快照 v${rev.version}`)
  } catch (e) { Message.error(e.message) }
}

async function onLogicCheck() {
  aiBusy.value = true
  try {
    const out = await api.aiLogicCheck(projectId.value)
    aiTitle.value = 'AI 逻辑检查'
    aiText.value = out.text || (out.issues || []).map((i) => `· ${i.scene_title}：${i.issue}`).join('\n')
    aiSource.value = out.source
    aiOpen.value = true
    if (out.notes?.length) Message.success(`${out.notes.length} 条问题已写入创作笔记待办`)
  } catch (e) { Message.error(e.message) } finally { aiBusy.value = false }
}

async function onPlotSuggest() {
  aiBusy.value = true
  try {
    const out = await api.aiPlotSuggest(projectId.value)
    aiTitle.value = 'AI 情节建议'
    aiText.value = out.text
    aiSource.value = out.source
    aiOpen.value = true
  } catch (e) { Message.error(e.message) } finally { aiBusy.value = false }
}

watch(() => route.params.id, () => { if (route.name === 'studio') load() })
onMounted(load)
</script>

<style scoped>
.studio { display: flex; flex-direction: column; min-height: 100vh; }
.studio__bar {
  display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4);
  padding: var(--sp-6) var(--sp-8) var(--sp-4);
  border-bottom: 1px solid var(--separator);
  background: var(--glass-bg);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  flex-wrap: wrap;
}
.studio__title { font-size: var(--fs-title2); font-weight: 600; letter-spacing: -0.02em; }
.studio__meta { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-2); }
.studio__actions { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.studio__flow { width: 150px; }

.studio__body { flex: 1; display: grid; grid-template-columns: 264px minmax(0, 1fr) 260px; min-height: 0; }
.col { min-height: 0; }
.col--tree { border-right: 1px solid var(--separator); overflow-y: auto; padding: var(--sp-4) var(--sp-3); }
.col--editor { overflow-y: auto; padding: var(--sp-5) var(--sp-6); }
.col--side { border-left: 1px solid var(--separator); overflow-y: auto; padding: var(--sp-4) var(--sp-3); }

.col__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.col__add { font-size: var(--fs-footnote); padding: 0 var(--sp-2); height: 26px; }

.tree__ep { margin-bottom: var(--sp-2); }
.tree__ep-head {
  width: 100%; display: flex; align-items: center; gap: var(--sp-2);
  height: 36px; padding: 0 var(--sp-2);
  border: none; background: transparent; border-radius: var(--radius-md);
  font-family: inherit; font-size: var(--fs-subhead); color: var(--label); cursor: pointer; text-align: left;
}
.tree__ep-head:hover { background: var(--fill-secondary); }
.tree__ep-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.tree__caret { color: var(--label-tertiary); font-size: 11px; width: 12px; }

.tree__scenes { padding-left: var(--sp-4); display: flex; flex-direction: column; gap: 2px; }
.tree__scene {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2);
  min-height: 34px; padding: var(--sp-1) var(--sp-2);
  border: none; background: transparent; border-radius: var(--radius-sm);
  font-family: inherit; font-size: var(--fs-footnote); color: var(--label-secondary); cursor: pointer; text-align: left;
}
.tree__scene:hover { background: var(--fill-secondary); }
.tree__scene--active { background: var(--tint-soft); color: var(--tint); font-weight: 600; }
.tree__scene-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree__add {
  border: none; background: transparent; color: var(--tint);
  font-family: inherit; font-size: var(--fs-footnote);
  text-align: left; padding: var(--sp-1) var(--sp-2); cursor: pointer;
}

.editor__bar { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-4); flex-wrap: wrap; }
.editor__title { flex: 1; min-width: 200px; height: 40px; font-size: var(--fs-headline); font-weight: 600; }
.editor__bar-right { display: flex; gap: var(--sp-2); align-items: center; }
.editor__flow { width: 130px; }

.editor__fields { display: flex; gap: var(--sp-4); margin-bottom: var(--sp-4); flex-wrap: wrap; }
.editor__field { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 140px; }
.editor__field--wide { flex: 1; }
.editor__cast { display: flex; gap: var(--sp-1); flex-wrap: wrap; min-height: 24px; align-items: center; }

.editor__paper { padding: var(--sp-2) 0; }
.editor__foot { display: flex; align-items: center; justify-content: space-between; margin-top: var(--sp-3); }

.editor__dialogue { margin-top: var(--sp-6); padding-top: var(--sp-5); border-top: 1px solid var(--separator); }
.dline { display: flex; align-items: baseline; gap: var(--sp-3); padding: var(--sp-2) 0; border-bottom: 1px solid var(--separator); }
.dline__who { font-size: var(--fs-subhead); font-weight: 600; min-width: 72px; }
.dline__emotion { font-size: var(--fs-caption); color: var(--label-secondary); min-width: 60px; }
.dline__say { font-size: var(--fs-subhead); color: var(--label); }

.side-block { margin-bottom: var(--sp-5); }
.side-char { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) 0; }
.side-char__avatar {
  width: 30px; height: 30px; border-radius: var(--radius-full);
  background: var(--fill-primary); display: grid; place-items: center;
  font-size: var(--fs-footnote); font-weight: 600; flex-shrink: 0;
}
.side-char__name { font-size: var(--fs-footnote); font-weight: 600; }

.side-line { display: flex; gap: var(--sp-3); padding: var(--sp-2) 0; align-items: flex-start; }
.side-line__code {
  width: 22px; height: 22px; border-radius: var(--radius-sm);
  background: var(--tint-soft); color: var(--tint);
  display: grid; place-items: center; font-size: var(--fs-caption); font-weight: 700; flex-shrink: 0;
}
.side-line__title { font-size: var(--fs-footnote); font-weight: 600; }

.ai-out { display: flex; flex-direction: column; gap: var(--sp-4); }
.ai-out__text {
  white-space: pre-wrap; word-break: break-word;
  font-family: var(--font-sans); font-size: var(--fs-subhead); line-height: 1.6;
  background: var(--fill-secondary); padding: var(--sp-4); border-radius: var(--radius-md); margin: 0;
}

@media (max-width: 1200px) {
  .studio__body { grid-template-columns: 220px minmax(0, 1fr); }
  .col--side { display: none; }
}
@media (max-width: 860px) {
  .studio__body { grid-template-columns: 1fr; }
  .col--tree { border-right: none; border-bottom: 1px solid var(--separator); max-height: 240px; }
}
</style>
