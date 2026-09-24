<template>
  <AppShell>
    <div class="sf-page">
      <div class="sf-page-head">
        <div>
          <h1 class="sf-page-title">我的作品</h1>
          <p class="sf-page-sub">共 {{ total }} 部作品 · 草稿到过审的全流程在这里推进</p>
        </div>
        <div class="head-actions">
          <input v-model.trim="q" class="apple-input head-search" placeholder="搜索标题 / 题材" @keyup.enter="reload" />
          <select v-model="status" class="apple-input head-select" @change="reload">
            <option value="">全部状态</option>
            <option v-for="s in PROJECT_STATUS" :key="s" :value="s">{{ projectStatusLabel(s) }}</option>
          </select>
          <button class="apple-btn apple-btn--primary" @click="openCreate">新建作品</button>
        </div>
      </div>

      <StateBlock
        :state="state"
        :error="error"
        art="📚"
        title="还没有作品"
        description="创建第一部作品，从一句 logline 开始。"
        action-text="新建作品"
        @action="openCreate"
        @retry="load"
      >
        <div class="sf-grid sf-grid--cards">
          <article v-for="p in list" :key="p.id" class="pcard" @click="open(p)">
            <div class="pcard__cover" :class="`pcard__cover--${p.type === '小说' ? 'novel' : 'screen'}`">
              <span class="pcard__type">{{ p.type }}</span>
            </div>
            <div class="pcard__body">
              <div class="pcard__top">
                <h3 class="pcard__title">{{ p.title }}</h3>
                <StatusBadge :value="p.status" kind="project" />
              </div>
              <div class="pcard__genre">{{ p.genre || '未定题材' }}</div>
              <p class="pcard__logline">{{ p.logline || '还没有写一句话故事。' }}</p>
              <div class="pcard__foot">
                <span class="sf-caption">更新于 {{ (p.updated_at || '').slice(0, 10) }}</span>
                <span class="pcard__go">进入工作台 ›</span>
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

    <a-modal v-model:visible="creating" title="新建作品" :width="520" @ok="submit" @cancel="creating = false">
      <div class="form">
        <label class="form__row"><span class="sf-caption">标题</span><input v-model.trim="form.title" class="apple-input" /></label>
        <label class="form__row"><span class="sf-caption">类型</span>
          <select v-model="form.type" class="apple-input"><option v-for="t in PROJECT_TYPES" :key="t">{{ t }}</option></select>
        </label>
        <label class="form__row"><span class="sf-caption">题材</span>
          <select v-model="form.genre" class="apple-input"><option v-for="g in GENRES" :key="g">{{ g }}</option></select>
        </label>
        <label class="form__row"><span class="sf-caption">一句话故事</span>
          <textarea v-model.trim="form.logline" class="apple-input form__area" rows="3"></textarea>
        </label>
        <p v-if="formError" class="form__err">{{ formError }}</p>
      </div>
    </a-modal>
  </AppShell>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../layouts/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { api } from '../api'
import { PROJECT_STATUS, PROJECT_TYPES, GENRES, projectStatusLabel } from '../constants'

const router = useRouter()
const state = ref('loading')
const error = ref('')
const list = ref([])
const total = ref(0)
const page = ref(1)
const pages = ref(0)
const pageSize = 12
const q = ref('')
const status = ref('')

const creating = ref(false)
const formError = ref('')
const form = reactive({ title: '', type: '电影', genre: '悬疑', logline: '' })

async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    const data = await api.list('projects', { page: page.value, pageSize, q: q.value, status: status.value })
    list.value = data.list
    total.value = data.total
    pages.value = data.pages
    state.value = data.list.length ? 'ready' : 'empty'
  } catch (e) {
    error.value = e.message
    state.value = e.status === 403 ? 'forbidden' : 'error'
  }
}

function reload() { page.value = 1; load() }
function go(p) { page.value = p; load() }
function open(p) { router.push({ name: 'studio', params: { id: p.id } }) }

function openCreate() {
  formError.value = ''
  Object.assign(form, { title: '', type: '电影', genre: '悬疑', logline: '' })
  creating.value = true
}

async function submit() {
  if (!form.title) { formError.value = '请填写标题'; return }
  try {
    const created = await api.create('projects', { ...form })
    creating.value = false
    router.push({ name: 'studio', params: { id: created.id } })
  } catch (e) { formError.value = e.message }
}

onMounted(load)
</script>

<style scoped>
.head-actions { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.head-search { width: 200px; }
.head-select { width: 140px; }

.pcard {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  cursor: pointer;
  transition: transform var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.pcard:hover { transform: translateY(-2px); box-shadow: var(--shadow-float); }

.pcard__cover {
  height: 96px;
  display: grid; place-items: center;
  background: linear-gradient(135deg, var(--tint-soft), var(--fill-secondary));
}
.pcard__cover--novel { background: linear-gradient(135deg, rgba(90,200,250,0.18), var(--fill-secondary)); }
.pcard__type {
  font-size: var(--fs-footnote);
  letter-spacing: 0.14em;
  color: var(--tint);
  font-weight: 600;
}
.pcard__body { padding: var(--sp-4); }
.pcard__top { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
.pcard__title { font-size: var(--fs-headline); font-weight: 600; letter-spacing: -0.01em; }
.pcard__genre { margin-top: var(--sp-1); font-size: var(--fs-footnote); color: var(--label-secondary); }
.pcard__logline {
  margin-top: var(--sp-3);
  font-size: var(--fs-subhead);
  color: var(--label-secondary);
  line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
  min-height: 66px;
}
.pcard__foot {
  margin-top: var(--sp-3);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--separator);
  display: flex; align-items: center; justify-content: space-between;
}
.pcard__go { font-size: var(--fs-footnote); color: var(--tint); }

.pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); margin-top: var(--sp-8); }
.form { display: flex; flex-direction: column; gap: var(--sp-4); }
.form__row { display: flex; flex-direction: column; gap: var(--sp-2); }
.form__row .apple-input { height: 40px; }
.form__area { height: auto; padding: var(--sp-3); resize: vertical; }
.form__err { color: var(--red); font-size: var(--fs-footnote); }
</style>
