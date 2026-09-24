<template>
  <AppShell>
    <div class="sf-page">
      <div class="sf-page-head">
        <div>
          <h1 class="sf-page-title">管理概览</h1>
          <p class="sf-page-sub">全站创作数据与账号</p>
        </div>
        <button class="apple-btn apple-btn--secondary" @click="load">刷新</button>
      </div>

      <StateBlock :state="state" :error="error" art="⚙️" title="暂无数据" description="还没有可统计的创作数据。" @retry="load">
        <div class="stats">
          <div v-for="s in statCards" :key="s.key" class="stat">
            <div class="stat__label">{{ s.label }}</div>
            <div class="stat__value">{{ overview[s.key] ?? 0 }}</div>
            <div class="stat__hint">{{ s.hint }}</div>
          </div>
        </div>

        <section class="users">
          <div class="users__head">
            <span class="apple-headline">账号（{{ users.length }}）</span>
          </div>
          <table class="utable">
            <thead>
              <tr><th>ID</th><th>用户名</th><th>昵称</th><th>角色</th><th>注册时间</th></tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.id">
                <td>{{ u.id }}</td>
                <td class="utable__mono">{{ u.username }}</td>
                <td>{{ u.nickname || '—' }}</td>
                <td><span class="sf-badge">{{ roleLabel(u.role) }}</span></td>
                <td class="sf-caption">{{ u.created_at }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </StateBlock>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import AppShell from '../layouts/AppShell.vue'
import StateBlock from '../components/StateBlock.vue'
import { api } from '../api'

const state = ref('loading')
const error = ref('')
const overview = ref({})
const users = ref([])

const statCards = [
  { key: 'users', label: '账号数', hint: '平台注册用户' },
  { key: 'projects_total', label: '作品总数', hint: '全部作品' },
  { key: 'projects_reviewing', label: '待审作品', hint: '送审中' },
  { key: 'episodes_total', label: '分集总数', hint: '章节单元' },
  { key: 'scenes_total', label: '场景总数', hint: '含全部状态' },
  { key: 'scenes_final', label: '定稿场景', hint: 'status = final' },
  { key: 'characters_total', label: '角色总数', hint: '含 AI 生成' },
  { key: 'dialogues_total', label: '对白条数', hint: '结构化台词' },
  { key: 'storylines_total', label: '故事线', hint: '主线 + 支线' },
  { key: 'notes_total', label: '创作笔记', hint: '含 AI 待办' },
  { key: 'notes_todo', label: '未处理待办', hint: 'open + todo' },
  { key: 'revisions_total', label: '版本快照', hint: '可回滚' },
  { key: 'words_total', label: '总字数', hint: '场景正文合计' },
]

function roleLabel(r) {
  if (r === 'admin') return '管理员'
  if (r === 'editor') return '责编'
  if (r === 'writer') return '编剧'
  return r
}

async function load() {
  state.value = 'loading'
  error.value = ''
  try {
    overview.value = await api.overview()
    users.value = await api.users()
    state.value = 'ready'
  } catch (e) {
    error.value = e.message
    state.value = e.status === 403 ? 'forbidden' : 'error'
  }
}

onMounted(load)
</script>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: var(--sp-4);
  margin-bottom: var(--sp-8);
}
.stat {
  background: var(--bg-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
  padding: var(--sp-4);
}
.stat__label { font-size: var(--fs-footnote); color: var(--label-secondary); }
.stat__value {
  font-size: var(--fs-large-title);
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: var(--sp-1) 0;
}
.stat__hint { font-size: var(--fs-caption); color: var(--label-tertiary); }

.users { background: var(--bg-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); padding: var(--sp-5); }
.users__head { margin-bottom: var(--sp-4); }
.utable { width: 100%; border-collapse: collapse; }
.utable th {
  text-align: left; font-size: var(--fs-footnote); font-weight: 600;
  color: var(--label-secondary); padding: var(--sp-2) var(--sp-3);
  border-bottom: 1px solid var(--separator);
}
.utable td {
  padding: var(--sp-3); font-size: var(--fs-subhead);
  border-bottom: 1px solid var(--separator);
}
.utable__mono { font-family: var(--font-mono); font-size: var(--fs-footnote); }
</style>
