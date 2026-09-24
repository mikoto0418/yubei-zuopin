<template>
  <AppShell>
    <div class="sf-page">
      <div class="sf-page-head">
        <div>
          <h1 class="sf-page-title">审阅台</h1>
          <p class="sf-page-sub">待审作品队列 · 通过 / 返修（意见会写入该作品的创作笔记）</p>
        </div>
        <div class="head-actions">
          <select v-model="status" class="apple-input head-select" @change="reload">
            <option value="reviewing">待审（送审中）</option>
            <option value="revising">已返修</option>
            <option value="approved">已过审</option>
            <option value="draft">草稿</option>
            <option value="archived">已归档</option>
          </select>
          <input v-model.trim="q" class="apple-input head-search" placeholder="搜索标题 / 题材" @keyup.enter="reload" />
        </div>
      </div>

      <StateBlock
        :state="state"
        :error="error"
        art="📋"
        title="队列是空的"
        description="当前状态下没有需要审阅的作品。"
        @retry="reload"
      >
        <div class="queue">
          <article v-for="p in list" :key="p.id" class="qcard">
            <div class="qcard__main">
              <div class="qcard__top">
                <h3 class="qcard__title">{{ p.title }}</h3>
                <StatusBadge :value="p.status" kind="project" />
              </div>
              <div class="qcard__meta">
                <span class="sf-caption">{{ p.type }} · {{ p.genre }}</span>
                <span class="sf-caption">作者：{{ p.author_name || p.author_username }}</span>
                <span class="sf-caption">{{ p.stats.episodes }} 集 · {{ p.stats.scenes }} 场 · {{ p.stats.words }} 字</span>
              </div>
              <p class="qcard__logline">{{ p.logline || '（未写一句话故事）' }}</p>
            </div>

            <div class="qcard__ops">
              <button class="apple-btn apple-btn--secondary qcard__btn" @click="openDetail(p)">查看结构</button>
              <button
                class="apple-btn apple-btn--secondary qcard__btn"
                :disabled="!canDecide(p, 'revise')"
                @click="openDecision(p, 'revise')"
              >退回返修</button>
              <button
                class="apple-btn apple-btn--primary qcard__btn"
                :disabled="!canDecide(p, 'approve')"
                @click="openDecision(p, 'approve')"
              >通过</button>
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

    <!-- 审阅决定 -->
    <a-modal v-model:visible="deciding" :title="decision === 'approve' ? '通过作品' : '退回返修'" :width="520" @ok="submitDecision" @cancel="deciding = false">
      <div class="form">
        <div class="decide__target">《{{ target?.title }}》</div>
        <label class="form__row">
          <span class="sf-caption">{{ decision === 'approve' ? '通过意见（选填）' : '返修意见' }}</span>
          <textarea v-model.trim="comment" class="apple-input form__area" rows="4"
            :placeholder="decision === 'approve' ? '例如：结构完整，可以立项。' : '例如：第二幕冲突不足，主角动机需要更具体。'"></textarea>
        </label>
        <p class="sf-caption">
          提交后作品状态会变为「{{ decision === 'approve' ? '已过审' : '返修中' }}」，
          并在该作品的创作笔记里生成一条{{ decision === 'approve' ? '记录' : '待办' }}，编剧端可见。
        </p>
      </div>
    </a-modal>

    <!-- 结构预览 -->
    <a-drawer v-model:visible="detailOpen" :width="560" :title="`《${target?.title || ''}》结构`" unmount-on-close>
      <div v-if="detail" class="detail">
        <div class="detail__stats">
          <span class="sf-badge">{{ detail.stats.episodes }} 分集</span>
          <span class="sf-badge">{{ detail.stats.scenes }} 场景</span>
          <span class="sf-badge">{{ detail.stats.characters }} 角色</span>
          <span class="sf-badge">{{ detail.stats.dialogues }} 对白</span>
          <span class="sf-badge">{{ detail.stats.words }} 字</span>
        </div>
        <div v-for="ep in detail.episodes" :key="ep.id" class="detail__ep">
          <div class="detail__ep-title">{{ ep.title }}</div>
          <div v-for="s in ep.scenes" :key="s.id" class="detail__scene">
            <span class="detail__seq">{{ s.seq }}</span>
            <span class="detail__scene-title">{{ s.title }}</span>
            <StatusBadge :value="s.status" kind="scene" />
          </div>
        </div>
      </div>
    </a-drawer>
  </AppShell>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import AppShell from '../layouts/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { api } from '../api'
import { PROJECT_FLOW } from '../constants'

const state = ref('loading')
const error = ref('')
const list = ref([])
const status = ref('reviewing')
const q = ref('')
const page = ref(1)
const pages = ref(0)
const pageSize = 12

const deciding = ref(false)
const decision = ref('approve')
const comment = ref('')
const target = ref(null)

const detailOpen = ref(false)
const detail = ref(null)

// 只有合法流转才允许点击，避免前端就能触发 400
function canDecide(p, kind) {
  const to = kind === 'approve' ? 'approved' : 'revising'
  return (PROJECT_FLOW[p.status] || []).includes(to)
}

async function reload() { page.value = 1; await load() }
function go(p) { page.value = p; load() }

async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    const data = await api.reviewQueue({ status: status.value, q: q.value, page: page.value, pageSize })
    list.value = data.list
    pages.value = data.pages
    state.value = data.list.length ? 'ready' : 'empty'
  } catch (e) {
    error.value = e.message
    state.value = e.status === 403 ? 'forbidden' : 'error'
  }
}

function openDecision(p, kind) {
  target.value = p
  decision.value = kind
  comment.value = ''
  deciding.value = true
}

async function submitDecision() {
  try {
    const out = await api.reviewDecision(target.value.id, decision.value, comment.value)
    deciding.value = false
    Message.success(decision.value === 'approve' ? '已通过' : '已退回返修')
    await load()
  } catch (e) { Message.error(e.message) }
}

async function openDetail(p) {
  target.value = p
  detail.value = null
  detailOpen.value = true
  try {
    detail.value = await api.projectFull(p.id)
  } catch (e) { Message.error(e.message) }
}

onMounted(load)
</script>

<style scoped>
.head-actions { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.head-select { width: 170px; }
.head-search { width: 200px; }

.queue { display: flex; flex-direction: column; gap: var(--sp-4); }
.qcard {
  display: flex; gap: var(--sp-5); align-items: center; justify-content: space-between;
  background: var(--bg-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
  padding: var(--sp-5); flex-wrap: wrap;
}
.qcard__main { flex: 1; min-width: 260px; }
.qcard__top { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-2); }
.qcard__title { font-size: var(--fs-title2); font-weight: 600; letter-spacing: -0.01em; }
.qcard__meta { display: flex; gap: var(--sp-4); flex-wrap: wrap; margin-bottom: var(--sp-3); }
.qcard__logline { font-size: var(--fs-subhead); color: var(--label-secondary); line-height: 1.55; }
.qcard__ops { display: flex; gap: var(--sp-2); flex-shrink: 0; }
.qcard__btn { flex-shrink: 0; }

.pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); margin-top: var(--sp-8); }

.form { display: flex; flex-direction: column; gap: var(--sp-4); }
.form__row { display: flex; flex-direction: column; gap: var(--sp-2); }
.form__area { height: auto; padding: var(--sp-3); resize: vertical; font-family: var(--font-serif); }
.decide__target { font-size: var(--fs-headline); font-weight: 600; }

.detail__stats { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-5); }
.detail__ep { margin-bottom: var(--sp-5); }
.detail__ep-title { font-size: var(--fs-headline); font-weight: 600; margin-bottom: var(--sp-2); }
.detail__scene {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-2) 0; border-bottom: 1px solid var(--separator);
}
.detail__seq { font-size: var(--fs-caption); color: var(--label-tertiary); min-width: 18px; }
.detail__scene-title { flex: 1; min-width: 0; font-size: var(--fs-footnote); }
</style>
