<template>
  <div class="tg sb-enter">
    <div class="head">
      <div>
        <h1 class="sb-page-title">标签云</h1>
        <p class="sb-subhead sb-secondary">按使用频次排布，点标签查看对应笔记。</p>
      </div>
      <n-button type="primary" @click="openNew">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建标签
      </n-button>
    </div>

    <div class="filters">
      <n-input v-model:value="query" size="small" clearable placeholder="搜索标签…" class="search" />
      <n-select v-model:value="sort" size="small" :options="sortOptions" class="sort-sel" />
      <span class="spacer" />
      <span class="sb-caption sb-tertiary">共 {{ tags.length }} 个标签 · {{ totalUses }} 次使用</span>
    </div>

    <StateBlock v-if="loading" state="loading" />
    <StateBlock v-else-if="error" state="error" :description="error" retry @retry="load" />
    <StateBlock
      v-else-if="!tags.length"
      state="empty"
      title="还没有标签"
      description="给笔记添加标签后，这里会生成标签云。"
      action="新建标签"
      @action="openNew"
    />

    <template v-else>
      <div class="cloud">
        <button
          v-for="t in visible"
          :key="t.id"
          type="button"
          class="chip"
          :class="{ active: activeId === t.id }"
          :style="chipStyle(t)"
          @click="pick(t)"
        >
          <span class="chip-name">{{ t.name }}</span>
          <span class="chip-count">{{ t.count }}</span>
        </button>
        <p v-if="!visible.length" class="sb-hint sb-secondary">没有匹配的标签。</p>
      </div>

      <!-- 选中标签 → 笔记列表 -->
      <section v-if="activeTag" class="panel">
        <header class="panel-head">
          <span class="sb-dot" :style="{ background: colorOf(activeTag.color) }" />
          <h2 class="sb-section-title">{{ activeTag.name }}</h2>
          <span class="sb-footnote sb-secondary">{{ notesTotal }} 篇笔记</span>
          <span class="spacer" />
          <n-button size="tiny" quaternary @click="openEdit(activeTag)">重命名</n-button>
          <n-button size="tiny" quaternary @click="askDelete(activeTag)">删除标签</n-button>
        </header>

        <StateBlock v-if="notesLoading" state="loading" />
        <StateBlock v-else-if="!notes.length" state="empty" title="该标签下还没有笔记" description="在笔记右侧属性栏添加这个标签即可。" />
        <ul v-else class="note-list">
          <li v-for="n in notes" :key="n.id" class="note-row" @click="openNote(n)">
            <span class="note-title">{{ n.title || '无标题' }}</span>
            <span class="note-time sb-caption sb-tertiary">{{ n.updated_at }}</span>
          </li>
        </ul>
        <div v-if="notesTotal > notes.length" class="more">
          <n-button quaternary size="small" :loading="notesLoadingMore" @click="loadMoreNotes">加载更多</n-button>
        </div>
      </section>
    </template>

    <n-modal v-model:show="modalOpen" preset="card" :title="editing ? '重命名标签' : '新建标签'" class="tg-modal">
      <n-form label-placement="top" :show-require-mark="false">
        <n-form-item label="标签名" :validation-status="formError ? 'error' : undefined" :feedback="formError">
          <n-input v-model:value="form.name" placeholder="如：算法" maxlength="20" show-count />
        </n-form-item>
        <n-form-item label="颜色">
          <div class="colors">
            <button
              v-for="c in PALETTE"
              :key="c.key"
              type="button"
              class="color-btn"
              :class="{ on: form.color === c.key }"
              :style="{ background: c.value }"
              :title="c.label"
              @click="form.color = c.key"
            />
          </div>
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-foot">
          <n-button quaternary @click="modalOpen = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="save">保存</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton, NInput, NIcon, NSelect, NModal, NForm, NFormItem, useDialog,
} from 'naive-ui';
import { AddOutline } from '@vicons/ionicons5';
import { api, toast } from '../api';
import { PALETTE, colorOf } from '../theme';
import StateBlock from '../components/StateBlock.vue';

const router = useRouter();
const dialog = useDialog();

const tags = ref([]);
const loading = ref(false);
const error = ref('');
const query = ref('');
const sort = ref('count');

const activeId = ref(null);
const activeTag = ref(null);
const notes = ref([]);
const notesTotal = ref(0);
const notesPage = ref(1);
const notesLoading = ref(false);
const notesLoadingMore = ref(false);

const modalOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const formError = ref('');
const form = ref({ name: '', color: 'orange' });

const sortOptions = [
  { label: '按使用次数', value: 'count' },
  { label: '按名称', value: 'name' },
];

const totalUses = computed(() => tags.value.reduce((s, t) => s + (t.count || 0), 0));

const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = q ? tags.value.filter((t) => t.name.toLowerCase().includes(q)) : [...tags.value];
  if (sort.value === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  else list.sort((a, b) => (b.count || 0) - (a.count || 0));
  return list;
});

// 标签云字号/透明度随使用次数变化（视觉权重，不是新令牌）
function chipStyle(t) {
  const max = Math.max(1, ...tags.value.map((x) => x.count || 0));
  const ratio = (t.count || 0) / max;
  const size = 13 + Math.round(ratio * 7); // 13–20px，落在字号阶梯附近
  const bg = colorOf(t.color);
  return {
    fontSize: size + 'px',
    background: `color-mix(in srgb, ${bg} ${12 + Math.round(ratio * 14)}%, transparent)`,
    color: 'var(--label)',
  };
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.tags();
    tags.value = res.tags || [];
    if (activeId.value && !tags.value.some((t) => t.id === activeId.value)) {
      activeId.value = null; activeTag.value = null; notes.value = [];
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function pick(t) {
  if (activeId.value === t.id) {
    activeId.value = null; activeTag.value = null; notes.value = []; notesTotal.value = 0;
    return;
  }
  activeId.value = t.id;
  activeTag.value = t;
  notesPage.value = 1;
  notesLoading.value = true;
  try {
    const res = await api.tagNotes(t.id, { page: 1, pageSize: 10 });
    notes.value = res.notes || [];
    notesTotal.value = res.total;
  } catch (e) {
    toast(e.message);
    notes.value = [];
  } finally {
    notesLoading.value = false;
  }
}

async function loadMoreNotes() {
  if (!activeTag.value || notesLoadingMore.value) return;
  notesLoadingMore.value = true;
  try {
    const next = notesPage.value + 1;
    const res = await api.tagNotes(activeTag.value.id, { page: next, pageSize: 10 });
    notes.value = notes.value.concat(res.notes || []);
    notesTotal.value = res.total;
    notesPage.value = next;
  } catch (e) {
    toast(e.message);
  } finally {
    notesLoadingMore.value = false;
  }
}

function openNew() {
  editing.value = null;
  form.value = { name: '', color: 'orange' };
  formError.value = '';
  modalOpen.value = true;
}

function openEdit(t) {
  editing.value = t;
  form.value = { name: t.name, color: t.color || 'orange' };
  formError.value = '';
  modalOpen.value = true;
}

async function save() {
  if (!form.value.name.trim()) { formError.value = '标签名不能为空'; return; }
  formError.value = '';
  saving.value = true;
  try {
    if (editing.value) {
      await api.updateTag(editing.value.id, form.value);
      toast('已更新');
    } else {
      await api.createTag(form.value);
      toast('已创建');
    }
    modalOpen.value = false;
    load();
  } catch (e) {
    formError.value = e.message;
    toast(e.message);
  } finally {
    saving.value = false;
  }
}

function askDelete(t) {
  dialog.warning({
    title: '删除标签',
    content: `确定删除标签「${t.name}」吗？笔记本身不会被删除，只会移除这个标签。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.deleteTag(t.id);
        if (activeId.value === t.id) { activeId.value = null; activeTag.value = null; notes.value = []; }
        toast('已删除');
        load();
      } catch (e) { toast(e.message); }
    },
  });
}

function openNote(n) {
  router.push({ path: '/notes', query: { note: String(n.id) } });
}

onMounted(load);
</script>

<style scoped>
.tg { display: flex; flex-direction: column; gap: var(--sp-5); }
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.filters { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.search { max-width: 240px; }
.sort-sel { width: 140px; }
.spacer { flex: 1; }

.cloud {
  display: flex; flex-wrap: wrap; gap: var(--sp-2);
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--sp-5);
}
.chip {
  display: inline-flex; align-items: center; gap: var(--sp-2);
  height: auto; padding: 6px var(--sp-3);
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  transition: transform var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.chip:hover { transform: translateY(-1px); box-shadow: var(--shadow-card); }
.chip.active { outline: 2px solid var(--tint); outline-offset: 1px; }
.chip-count {
  font-size: 11px; font-weight: 400;
  color: var(--label-secondary);
  background: var(--fill-secondary);
  border-radius: var(--radius-full);
  padding: 1px 6px;
}

.panel {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--sp-5);
}
.panel-head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }

.note-list { list-style: none; margin: 0; padding: 0; }
.note-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-2);
  border-bottom: 1px solid var(--separator);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-standard);
}
.note-row:last-child { border-bottom: none; }
.note-row:hover { background: var(--fill-secondary); border-radius: var(--radius-sm); }
.note-title { font-size: var(--fs-subhead); color: var(--label); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note-time { flex: none; }

.more { display: flex; justify-content: center; margin-top: var(--sp-3); }

.colors { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.color-btn {
  width: 26px; height: 26px;
  border: 2px solid transparent;
  border-radius: var(--radius-full);
  cursor: pointer;
  padding: 0;
  transition: transform var(--dur-fast) var(--ease-standard);
}
.color-btn.on { border-color: var(--label); transform: scale(1.1); }

.modal-foot { display: flex; justify-content: flex-end; gap: var(--sp-2); }
.tg-modal { width: min(440px, 92vw); }
</style>
