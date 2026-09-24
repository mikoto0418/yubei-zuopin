<template>
  <div class="home sb-enter">
    <div class="head">
      <div>
        <h1 class="sb-page-title">活动流</h1>
        <p class="sb-subhead sb-secondary">你在 ScholarBoard 上的关键操作，按时间倒序。</p>
      </div>
      <div class="head-ops">
        <n-select v-model:value="type" size="small" :options="typeOptions" class="type-sel" @update:value="reload" />
        <n-button size="small" @click="reload">刷新</n-button>
      </div>
    </div>

    <StateBlock v-if="loading" state="loading" />
    <StateBlock v-else-if="error" state="error" :description="error" retry @retry="reload" />
    <StateBlock
      v-else-if="!items.length"
      state="empty"
      title="还没有活动记录"
      description="创建笔记、任务或润色简历后，这里会出现时间线。"
      action="去写笔记"
      @action="router.push('/notes')"
    />

    <template v-else>
      <div class="timeline">
        <div v-for="(a, i) in items" :key="a.id" class="tl-item">
          <div class="tl-rail">
            <span class="tl-dot" :style="{ background: dotColor(a) }">
              <n-icon :size="13"><component :is="iconOf(a)" /></n-icon>
            </span>
            <span v-if="i < items.length - 1" class="tl-line" />
          </div>
          <div class="tl-body">
            <div class="tl-top">
              <span class="tl-summary">{{ a.summary }}</span>
              <span class="tl-time sb-caption sb-tertiary">{{ timeAgo(a.created_at) }}</span>
            </div>
            <div class="tl-meta sb-caption sb-tertiary">
              <span class="tl-badge">{{ typeLabel(a.type) }}</span>
              <span v-if="a.meta && a.meta.source">来源：{{ a.meta.source === 'llm' ? 'AI 大模型' : '本地兜底' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="more">
        <n-button v-if="hasMore" :loading="loadingMore" quaternary @click="loadMore">
          加载更多（还有 {{ total - items.length }} 条）
        </n-button>
        <span v-else class="sb-caption sb-tertiary">已到底部 · 共 {{ total }} 条</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NSelect, NIcon } from 'naive-ui';
import {
  CreateOutline, TrashOutline, SparklesOutline, CheckboxOutline,
  RefreshOutline, CloudDownloadOutline,
} from '@vicons/ionicons5';
import { api } from '../api';
import StateBlock from '../components/StateBlock.vue';

const router = useRouter();
const PAGE = 20;

const items = ref([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const type = ref('');

const typeOptions = [
  { label: '全部类型', value: '' },
  { label: '创建', value: 'create' },
  { label: '编辑', value: 'update' },
  { label: '完成', value: 'complete' },
  { label: 'AI 润色', value: 'polish' },
  { label: '应用润色', value: 'apply' },
  { label: '回滚', value: 'rollback' },
  { label: '删除', value: 'delete' },
];

const hasMore = computed(() => items.value.length < total.value);

const TYPE_LABEL = {
  create: '创建', update: '编辑', delete: '删除', complete: '完成', reopen: '重开',
  polish: 'AI 润色', apply: '应用润色', rollback: '回滚', status: '状态变更',
  register: '注册', report: '周报',
};
function typeLabel(t) { return TYPE_LABEL[t] || t; }

const ICONS = {
  create: CreateOutline, update: CreateOutline, delete: TrashOutline,
  complete: CheckboxOutline, reopen: RefreshOutline, polish: SparklesOutline,
  apply: CloudDownloadOutline, rollback: RefreshOutline, status: RefreshOutline,
  report: SparklesOutline, register: CreateOutline,
};
function iconOf(a) { return ICONS[a.type] || CreateOutline; }

// 语义色：按操作类型着色
const COLORS = {
  create: 'var(--green)', update: 'var(--blue)', delete: 'var(--red)',
  complete: 'var(--green)', polish: 'var(--purple)', apply: 'var(--orange)',
  rollback: 'var(--yellow)', status: 'var(--blue)', report: 'var(--purple)',
};
function dotColor(a) { return COLORS[a.type] || 'var(--gray)'; }

function timeAgo(s) {
  if (!s) return '';
  const t = new Date(String(s).replace(' ', 'T'));
  if (Number.isNaN(t.getTime())) return s;
  const diff = (Date.now() - t.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
  return s.slice(0, 10);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.activities({ page: 1, pageSize: PAGE, type: type.value });
    items.value = res.activities || [];
    total.value = res.total;
    page.value = 1;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const next = page.value + 1;
    const res = await api.activities({ page: next, pageSize: PAGE, type: type.value });
    items.value = items.value.concat(res.activities || []);
    total.value = res.total;
    page.value = next;
  } catch (e) {
    error.value = e.message;
  } finally {
    loadingMore.value = false;
  }
}

function reload() { load(); }

onMounted(load);
</script>

<style scoped>
.home { display: flex; flex-direction: column; gap: var(--sp-5); }

.head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.head-ops { display: flex; align-items: center; gap: var(--sp-2); }
.type-sel { width: 140px; }

.timeline {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--sp-5) var(--sp-5) var(--sp-2);
}

.tl-item { display: flex; gap: var(--sp-3); }
.tl-rail { flex: none; display: flex; flex-direction: column; align-items: center; width: 26px; }
.tl-dot {
  width: 26px; height: 26px;
  display: grid; place-items: center;
  border-radius: var(--radius-full);
  color: #fff;
  flex: none;
}
.tl-line { flex: 1; width: 2px; background: var(--separator); margin: 4px 0; min-height: 12px; }

.tl-body { flex: 1; min-width: 0; padding-bottom: var(--sp-5); }
.tl-top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); }
.tl-summary { font-size: var(--fs-subhead); color: var(--label); }
.tl-time { flex: none; }
.tl-meta { display: flex; align-items: center; gap: var(--sp-2); margin-top: 3px; }
.tl-badge {
  display: inline-flex; align-items: center;
  height: 20px; padding: 0 var(--sp-2);
  background: var(--fill-secondary);
  border-radius: var(--radius-sm);
  font-size: var(--fs-caption);
  color: var(--label-secondary);
}

.more { display: flex; justify-content: center; padding: var(--sp-2) 0 var(--sp-6); }
</style>
