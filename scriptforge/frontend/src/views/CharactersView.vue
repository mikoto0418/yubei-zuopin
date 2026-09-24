<template>
  <AppShell>
    <div class="sf-page">
      <div class="sf-page-head">
        <div>
          <h1 class="sf-page-title">角色管理</h1>
          <p class="sf-page-sub">角色卡 + 关系网络 · 共 {{ total }} 个角色</p>
        </div>
        <div class="head-actions">
          <select v-model="projectId" class="apple-input head-select" @change="load">
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
          </select>
          <button class="apple-btn apple-btn--secondary" :disabled="aiBusy" @click="openAi">AI 生成角色卡</button>
          <button class="apple-btn apple-btn--primary" @click="openCreate">新建角色</button>
        </div>
      </div>

      <StateBlock
        :state="state"
        :error="error"
        art="🎭"
        title="还没有角色"
        description="为这部作品创建第一个角色，或让 AI 根据身份描述生成一张角色卡。"
        action-text="新建角色"
        @action="openCreate"
        @retry="load"
      >
        <!-- 角色卡网格 -->
        <div class="sf-grid sf-grid--cards chars">
          <article
            v-for="c in list"
            :key="c.id"
            class="ccard"
            :class="{ 'ccard--active': active && active.id === c.id }"
            @click="active = c"
          >
            <div class="ccard__head">
              <div class="ccard__avatar">{{ c.name.slice(0, 1) }}</div>
              <div class="ccard__id">
                <h3 class="ccard__name">{{ c.name }}</h3>
                <div class="sf-caption">{{ c.age }} 岁 · {{ c.identity }}</div>
              </div>
            </div>
            <div class="ccard__row"><span class="ccard__k">性格</span><span>{{ c.personality || '—' }}</span></div>
            <div class="ccard__row"><span class="ccard__k">目标</span><span>{{ c.goal || '—' }}</span></div>
            <div class="ccard__row"><span class="ccard__k">弧光</span><span>{{ c.arc || '—' }}</span></div>
            <div v-if="c.relations?.length" class="ccard__rels">
              <span v-for="r in c.relations.slice(0, 4)" :key="r.id" class="sf-badge">
                {{ r.from_id === c.id ? r.to_name : r.from_name }} · {{ r.relation }}
              </span>
            </div>
          </article>
        </div>

        <!-- 关系图（SVG 手绘节点连线） -->
        <section class="graph-wrap">
          <div class="graph-head">
            <span class="apple-headline">角色关系图</span>
            <button class="apple-btn apple-btn--plain graph-add" @click="openRelation">+ 建立关系</button>
          </div>

          <div v-if="!nodes.length" class="sf-empty">
            <div class="sf-empty__art">🕸</div>
            <div class="apple-subhead">这部作品还没有角色，先创建角色再来画关系。</div>
          </div>

          <svg v-else class="graph" :viewBox="`0 0 ${gw} ${gh}`" role="img" aria-label="角色关系图">
            <!-- 连线 -->
            <g>
              <line
                v-for="e in edges"
                :key="`l-${e.id}`"
                :x1="pos(e.from_id).x" :y1="pos(e.from_id).y"
                :x2="pos(e.to_id).x" :y2="pos(e.to_id).y"
                class="graph__line"
              />
              <text
                v-for="e in edges"
                :key="`t-${e.id}`"
                :x="(pos(e.from_id).x + pos(e.to_id).x) / 2"
                :y="(pos(e.from_id).y + pos(e.to_id).y) / 2 - 6"
                class="graph__label"
                text-anchor="middle"
              >{{ e.relation }}</text>
            </g>
            <!-- 节点 -->
            <g v-for="n in nodes" :key="`n-${n.id}`" class="graph__node" @click="pickNode(n)">
              <circle :cx="pos(n.id).x" :cy="pos(n.id).y" r="30" class="graph__circle" />
              <text :x="pos(n.id).x" :y="pos(n.id).y + 5" class="graph__name" text-anchor="middle">{{ n.name }}</text>
            </g>
          </svg>
        </section>
      </StateBlock>
    </div>

    <!-- 新建角色 -->
    <a-modal v-model:visible="creating" title="新建角色" :width="560" @ok="submit" @cancel="creating = false">
      <div class="form">
        <div class="form__grid">
          <label class="form__row"><span class="sf-caption">姓名</span><input v-model.trim="form.name" class="apple-input" /></label>
          <label class="form__row"><span class="sf-caption">年龄</span><input v-model.trim="form.age" class="apple-input" /></label>
        </div>
        <label class="form__row"><span class="sf-caption">身份</span><input v-model.trim="form.identity" class="apple-input" /></label>
        <label class="form__row"><span class="sf-caption">性格</span><input v-model.trim="form.personality" class="apple-input" /></label>
        <label class="form__row"><span class="sf-caption">目标</span><input v-model.trim="form.goal" class="apple-input" /></label>
        <label class="form__row"><span class="sf-caption">人物弧光</span><input v-model.trim="form.arc" class="apple-input" /></label>
        <p v-if="formError" class="form__err">{{ formError }}</p>
      </div>
    </a-modal>

    <!-- 建立关系 -->
    <a-modal v-model:visible="relating" title="建立角色关系" :width="480" @ok="submitRelation" @cancel="relating = false">
      <div class="form">
        <label class="form__row"><span class="sf-caption">从</span>
          <select v-model.number="rel.from_id" class="apple-input"><option v-for="n in nodes" :key="n.id" :value="n.id">{{ n.name }}</option></select>
        </label>
        <label class="form__row"><span class="sf-caption">关系</span>
          <select v-model="rel.relation" class="apple-input"><option v-for="r in RELATION_KINDS" :key="r">{{ r }}</option></select>
        </label>
        <label class="form__row"><span class="sf-caption">到</span>
          <select v-model.number="rel.to_id" class="apple-input"><option v-for="n in nodes" :key="n.id" :value="n.id">{{ n.name }}</option></select>
        </label>
        <label class="form__row"><span class="sf-caption">备注</span><input v-model.trim="rel.note" class="apple-input" /></label>
        <p v-if="relError" class="form__err">{{ relError }}</p>
      </div>
    </a-modal>

    <!-- AI 生成角色卡 -->
    <a-modal v-model:visible="aiOpen" title="AI 生成角色卡（结果写入角色表）" :width="520" @ok="submitAi" @cancel="aiOpen = false">
      <div class="form">
        <label class="form__row"><span class="sf-caption">身份 / 设定提示</span>
          <textarea v-model.trim="aiHint" class="apple-input form__area" rows="3" placeholder="例如：退役的潜水员，知道沉船那晚发生了什么"></textarea>
        </label>
        <p class="sf-caption">生成后会直接写入本作品的角色表，并出现在左侧卡片与关系图中。</p>
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
import { RELATION_KINDS } from '../constants'

const state = ref('loading')
const error = ref('')
const projects = ref([])
const projectId = ref(null)
const list = ref([])
const total = ref(0)
const nodes = ref([])
const edges = ref([])
const active = ref(null)

const creating = ref(false)
const formError = ref('')
const form = reactive({ name: '', age: '', identity: '', personality: '', goal: '', arc: '' })

const relating = ref(false)
const relError = ref('')
const rel = reactive({ from_id: null, to_id: null, relation: '敌对', note: '' })

const aiOpen = ref(false)
const aiHint = ref('')
const aiBusy = ref(false)

// 关系图布局：节点按圆周均匀分布
const gw = 720
const gh = 360
const positions = computed(() => {
  const map = {}
  const n = nodes.value.length || 1
  const cx = gw / 2
  const cy = gh / 2
  const r = Math.min(gw, gh) / 2 - 56
  nodes.value.forEach((node, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    map[node.id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  })
  return map
})
function pos(id) { return positions.value[id] || { x: gw / 2, y: gh / 2 } }

function pickNode(n) {
  active.value = n
  rel.from_id = n.id
}

async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    const ps = await api.list('projects', { pageSize: 100 })
    projects.value = ps.list
    if (!projectId.value && ps.list.length) projectId.value = ps.list[0].id

    if (!projectId.value) { state.value = 'empty'; return }

    const chars = await api.list('characters', { pageSize: 100, project_id: projectId.value })
    list.value = chars.list
    total.value = chars.total

    const graph = await api.relationGraph(projectId.value)
    nodes.value = graph.nodes
    edges.value = graph.edges

    state.value = list.value.length ? 'ready' : 'empty'
  } catch (e) {
    error.value = e.message
    state.value = e.status === 403 ? 'forbidden' : 'error'
  }
}

function openCreate() {
  formError.value = ''
  Object.assign(form, { name: '', age: '', identity: '', personality: '', goal: '', arc: '' })
  creating.value = true
}

async function submit() {
  if (!form.name) { formError.value = '请填写姓名'; return }
  try {
    await api.create('characters', { project_id: projectId.value, ...form })
    creating.value = false
    await load()
  } catch (e) { formError.value = e.message }
}

function openRelation() {
  relError.value = ''
  rel.from_id = nodes.value[0]?.id || null
  rel.to_id = nodes.value[1]?.id || null
  rel.relation = '敌对'
  rel.note = ''
  relating.value = true
}

async function submitRelation() {
  if (!rel.from_id || !rel.to_id) { relError.value = '请选择两个角色'; return }
  try {
    await api.createRelation({ ...rel })
    relating.value = false
    await load()
    Message.success('关系已建立')
  } catch (e) { relError.value = e.message }
}

function openAi() { aiHint.value = ''; aiOpen.value = true }

async function submitAi() {
  if (!aiHint.value) return
  aiBusy.value = true
  try {
    const out = await api.aiCharacterGen(projectId.value, aiHint.value)
    aiOpen.value = false
    await load()
    Message.success(`已生成角色「${out.character.name}」（引擎：${out.source === 'llm' ? '大模型' : '本地规则'}）`)
  } catch (e) { Message.error(e.message) } finally { aiBusy.value = false }
}

onMounted(load)
</script>

<style scoped>
.head-actions { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.head-select { width: 160px; }

.chars { margin-bottom: var(--sp-8); }
.ccard {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--sp-4);
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color var(--dur-fast) var(--ease-standard);
}
.ccard--active { border-color: var(--tint); }
.ccard__head { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.ccard__avatar {
  width: 42px; height: 42px; border-radius: var(--radius-full);
  background: var(--tint-soft); color: var(--tint);
  display: grid; place-items: center; font-weight: 700; font-size: var(--fs-headline);
  flex-shrink: 0;
}
.ccard__name { font-size: var(--fs-headline); font-weight: 600; }
.ccard__row {
  display: flex; gap: var(--sp-2);
  font-size: var(--fs-footnote); color: var(--label-secondary);
  padding: var(--sp-1) 0; line-height: 1.5;
}
.ccard__k { color: var(--label-tertiary); min-width: 32px; flex-shrink: 0; }
.ccard__rels { display: flex; flex-wrap: wrap; gap: var(--sp-1); margin-top: var(--sp-3); }

.graph-wrap { background: var(--bg-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: var(--sp-5); }
.graph-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-4); }
.graph-add { font-size: var(--fs-footnote); height: 26px; padding: 0 var(--sp-2); }
.graph { width: 100%; height: auto; }
.graph__line { stroke: var(--separator); stroke-width: 1.5; }
.graph__label { fill: var(--label-secondary); font-size: 11px; }
.graph__node { cursor: pointer; }
.graph__circle {
  fill: var(--bg-surface);
  stroke: var(--tint);
  stroke-width: 1.5;
  transition: fill var(--dur-fast) var(--ease-standard);
}
.graph__node:hover .graph__circle { fill: var(--tint-soft); }
.graph__name { fill: var(--label); font-size: 13px; font-weight: 600; }

.form { display: flex; flex-direction: column; gap: var(--sp-4); }
.form__grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); }
.form__row { display: flex; flex-direction: column; gap: var(--sp-2); }
.form__row .apple-input { height: 40px; }
.form__area { height: auto; padding: var(--sp-3); resize: vertical; }
.form__err { color: var(--red); font-size: var(--fs-footnote); }
</style>
