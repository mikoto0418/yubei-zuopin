<template>
  <AppShell>
    <div class="sf-page">
      <div class="sf-page-head">
        <div>
          <h1 class="sf-page-title">创作笔记</h1>
          <p class="sf-page-sub">灵感 · 设定 · 参考 · 待办（AI 逻辑检查的问题会落到这里）</p>
        </div>
        <div class="head-actions">
          <select v-model="projectId" class="apple-input head-select" @change="reload">
            <option :value="null">全部作品</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
          </select>
          <select v-model="kind" class="apple-input head-select" @change="reload">
            <option value="">全部类型</option>
            <option v-for="k in NOTE_KINDS" :key="k" :value="k">{{ NOTE_KIND_LABEL[k] }}</option>
          </select>
          <select v-model="status" class="apple-input head-select" @change="reload">
            <option value="">全部状态</option>
            <option value="open">未完成</option>
            <option value="done">已完成</option>
          </select>
          <button class="apple-btn apple-btn--primary" @click="openCreate">新建笔记</button>
        </div>
      </div>

      <StateBlock
        :state="state"
        :error="error"
        art="📝"
        title="还没有笔记"
        description="记下第一个灵感，或者先跑一次 AI 逻辑检查。"
        action-text="新建笔记"
        @action="openCreate"
        @retry="reload"
      >
        <div class="notes">
          <article v-for="n in list" :key="n.id" class="note" :class="{ 'note--done': n.status === 'done' }">
            <div class="note__head">
              <span class="sf-badge" :class="`sf-badge--${n.kind === 'todo' ? 'revising' : 'drafted'}`">
                {{ NOTE_KIND_LABEL[n.kind] || n.kind }}
              </span>
              <span v-if="n.source === 'ai'" class="sf-badge">AI 生成</span>
              <span class="sf-caption note__time">{{ n.created_at }}</span>
            </div>
            <h3 class="note__title">{{ n.title }}</h3>
            <p class="note__body">{{ n.content || '（无正文）' }}</p>
            <div class="note__foot">
              <span class="sf-caption">{{ projectTitle(n.project_id) }}</span>
              <div class="note__ops">
                <button v-if="n.status === 'open'" class="apple-btn apple-btn--plain note__op" @click="toggle(n)">标记完成</button>
                <button v-else class="apple-btn apple-btn--plain note__op" @click="toggle(n)">重新打开</button>
                <button class="apple-btn apple-btn--plain note__op note__op--danger" @click="remove(n)">删除</button>
              </div>
            </div>
          </article>
        </div>

        <div v-if="pages > 1" class="pager">
          <button class="apple-btn apple-btn--secondary" :disabled="page <= 1" @click="go(page - 1)">上一页</button>
          <span class="sf-caption">{{ page }} / {{ pages }}</span>
          <button class="apple-btn apple-btn--secondary" :disabled="page >= pages" @click="go(page + 1)">下一页</button>
        </div>
      </StateBlock>
    </div>

    <a-modal v-model:visible="editing" :title="form.id ? '编辑笔记' : '新建笔记'" :width="560" @ok="submit" @cancel="editing = false">
      <div class="form">
        <label class="form__row"><span class="sf-caption">标题</span><input v-model.trim="form.title" class="apple-input" /></label>
        <div class="form__grid">
          <label class="form__row"><span class="sf-caption">类型</span>
            <select v-model="form.kind" class="apple-input">
              <option v-for="k in NOTE_KINDS" :key="k" :value="k">{{ NOTE_KIND_LABEL[k] }}</option>
            </select>
          </label>
          <label class="form__row"><span class="sf-caption">作品</span>
            <select v-model.number="form.project_id" class="apple-input">
              <option :value="null">（不关联）</option>
              <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
            </select>
          </label>
        </div>
        <label class="form__row"><span class="sf-caption">内容</span>
          <textarea v-model.trim="form.content" class="apple-input form__area" rows="4"></textarea>
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
import { NOTE_KINDS, NOTE_KIND_LABEL } from '../constants'

const state = ref('loading')
const error = ref('')
const projects = ref([])
const projectId = ref(null)
const kind = ref('')
const status = ref('')
const list = ref([])
const page = ref(1)
const pages = ref(0)
const pageSize = 20

const editing = ref(false)
const formError = ref('')
const form = reactive({ id: null, title: '', content: '', kind: 'idea', project_id: null })

const projectTitle = (id) => projects.value.find((p) => p.id === id)?.title || '—'

async function reload() { page.value = 1; await load() }
function go(p) { page.value = p; load() }

async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    const data = await api.list('notes', {
      page: page.value, pageSize, project_id: projectId.value || '', kind: kind.value, status: status.value,
    })
    list.value = data.list
    pages.value = data.pages
    state.value = data.list.length ? 'ready' : 'empty'
  } catch (e) {
    error.value = e.message
    state.value = e.status === 403 ? 'forbidden' : 'error'
  }
}

function openCreate() {
  formError.value = ''
  Object.assign(form, { id: null, title: '', content: '', kind: 'idea', project_id: projectId.value })
  editing.value = true
}

async function submit() {
  if (!form.title) { formError.value = '请填写标题'; return }
  try {
    if (form.id) await api.update('notes', form.id, form)
    else await api.create('notes', form)
    editing.value = false
    await load()
    Message.success('已保存')
  } catch (e) { formError.value = e.message }
}

async function toggle(n) {
  try {
    await api.update('notes', n.id, { status: n.status === 'open' ? 'done' : 'open' })
    await load()
  } catch (e) { Message.error(e.message) }
}

async function remove(n) {
  try {
    await api.remove('notes', n.id)
    await load()
  } catch (e) { Message.error(e.message) }
}

onMounted(async () => {
  try {
    const ps = await api.list('projects', { pageSize: 100 })
    projects.value = ps.list
  } catch { /* 忽略：笔记页不依赖作品列表 */ }
  await load()
})
</script>

<style scoped>
.head-actions { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.head-select { width: 150px; }

.notes { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--sp-4); }
.note {
  background: var(--bg-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
  padding: var(--sp-4); display: flex; flex-direction: column;
}
.note--done { opacity: 0.6; }
.note__head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); flex-wrap: wrap; }
.note__time { margin-left: auto; }
.note__title { font-size: var(--fs-headline); font-weight: 600; margin-bottom: var(--sp-2); }
.note__body {
  flex: 1; font-size: var(--fs-subhead); color: var(--label-secondary); line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
}
.note__foot {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: var(--sp-4); padding-top: var(--sp-3); border-top: 1px solid var(--separator);
}
.note__ops { display: flex; gap: var(--sp-1); }
.note__op { font-size: var(--fs-footnote); height: 26px; padding: 0 var(--sp-2); }
.note__op--danger { color: var(--red); }

.pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); margin-top: var(--sp-8); }
.form { display: flex; flex-direction: column; gap: var(--sp-4); }
.form__grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); }
.form__row { display: flex; flex-direction: column; gap: var(--sp-2); }
.form__row .apple-input { height: 40px; }
.form__area { height: auto; padding: var(--sp-3); resize: vertical; }
.form__err { color: var(--red); font-size: var(--fs-footnote); }
</style>
