<template>
  <div class="pj sb-enter">
    <div class="head">
      <div>
        <h1 class="sb-page-title">项目</h1>
        <p class="sb-subhead sb-secondary">把笔记与任务归到项目里，保持工作区清爽。</p>
      </div>
      <n-button type="primary" @click="openNew">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建项目
      </n-button>
    </div>

    <div class="filters">
      <n-input v-model:value="query" size="small" clearable placeholder="搜索项目…" class="search" @input="onSearch">
        <template #prefix><n-icon><SearchOutline /></n-icon></template>
      </n-input>
      <n-radio-group v-model:value="archivedFilter" size="small" @update:value="load">
        <n-radio-button value="0">进行中</n-radio-button>
        <n-radio-button value="1">已归档</n-radio-button>
        <n-radio-button value="all">全部</n-radio-button>
      </n-radio-group>
      <span class="spacer" />
      <span class="sb-caption sb-tertiary">共 {{ total }} 个</span>
    </div>

    <StateBlock v-if="loading" state="loading" />
    <StateBlock v-else-if="error" state="error" :description="error" retry @retry="load" />
    <StateBlock
      v-else-if="!projects.length"
      state="empty"
      title="还没有项目"
      description="项目用来把相关笔记与任务分组，例如「数据结构课程」或「实习求职」。"
      action="新建项目"
      @action="openNew"
    />

    <div v-else class="grid">
      <article v-for="p in projects" :key="p.id" class="card" :class="{ archived: p.archived }">
        <header class="card-head">
          <span class="sb-dot" :style="{ background: colorOf(p.color) }" />
          <h3 class="card-title">{{ p.name }}</h3>
          <n-dropdown :options="menuFor(p)" trigger="click" @select="(k) => onMenu(k, p)">
            <n-button quaternary size="tiny"><template #icon><n-icon><EllipsisHorizontal /></n-icon></template></n-button>
          </n-dropdown>
        </header>

        <p class="card-desc sb-footnote sb-secondary">{{ p.description || '暂无描述' }}</p>

        <div class="card-stats">
          <span class="stat"><n-icon :size="14"><BookOutline /></n-icon>{{ p.note_count }} 篇笔记</span>
          <span class="stat"><n-icon :size="14"><CheckboxOutline /></n-icon>{{ p.task_count }} 个任务</span>
        </div>

        <footer class="card-foot">
          <n-button size="tiny" quaternary @click="openNotes(p)">查看笔记</n-button>
          <n-button size="tiny" quaternary @click="openTasks(p)">查看任务</n-button>
          <span class="spacer" />
          <n-tag v-if="p.archived" size="small">已归档</n-tag>
        </footer>
      </article>
    </div>

    <!-- 新建 / 编辑项目 -->
    <n-modal v-model:show="modalOpen" preset="card" :title="editing ? '编辑项目' : '新建项目'" class="pj-modal">
      <n-form label-placement="top" :show-require-mark="false">
        <n-form-item label="项目名称" :validation-status="formError ? 'error' : undefined" :feedback="formError">
          <n-input v-model:value="form.name" placeholder="如：数据结构课程" maxlength="40" show-count />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="form.description" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="这个项目要做什么？" />
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
import { h, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton, NInput, NIcon, NTag, NModal, NForm, NFormItem, NDropdown,
  NRadioGroup, NRadioButton, useDialog,
} from 'naive-ui';
import {
  AddOutline, SearchOutline, EllipsisHorizontal, BookOutline, CheckboxOutline,
  ArchiveOutline, TrashOutline, CreateOutline,
} from '@vicons/ionicons5';
import { api, toast } from '../api';
import { PALETTE, colorOf } from '../theme';
import StateBlock from '../components/StateBlock.vue';

const router = useRouter();
const dialog = useDialog();

const projects = ref([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const query = ref('');
const archivedFilter = ref('0');
let searchTimer = null;

const modalOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const formError = ref('');
const form = ref({ name: '', description: '', color: 'orange' });

function menuFor() {
  return [
    { label: '编辑', key: 'edit', icon: () => h(NIcon, null, { default: () => h(CreateOutline) }) },
    { label: '归档 / 取消归档', key: 'archive', icon: () => h(NIcon, null, { default: () => h(ArchiveOutline) }) },
    { type: 'divider', key: 'd1' },
    { label: '删除', key: 'delete', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) },
  ];
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.projects({ page: 1, pageSize: 100, q: query.value.trim(), archived: archivedFilter.value });
    projects.value = res.projects || [];
    total.value = res.total;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 350);
}

function openNew() {
  editing.value = null;
  form.value = { name: '', description: '', color: 'orange' };
  formError.value = '';
  modalOpen.value = true;
}

function openEdit(p) {
  editing.value = p;
  form.value = { name: p.name, description: p.description || '', color: p.color || 'orange' };
  formError.value = '';
  modalOpen.value = true;
}

async function save() {
  if (!form.value.name.trim()) { formError.value = '项目名称不能为空'; return; }
  formError.value = '';
  saving.value = true;
  try {
    if (editing.value) {
      await api.updateProject(editing.value.id, form.value);
      toast('已更新');
    } else {
      await api.createProject(form.value);
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

async function toggleArchive(p) {
  try {
    await api.updateProject(p.id, { archived: !p.archived });
    toast(p.archived ? '已取消归档' : '已归档');
    load();
  } catch (e) { toast(e.message); }
}

function onMenu(key, p) {
  if (key === 'edit') return openEdit(p);
  if (key === 'archive') return toggleArchive(p);
  if (key === 'delete') {
    dialog.warning({
      title: '删除项目',
      content: `确定删除「${p.name}」吗？项目下的笔记与任务不会被删除，只会解除归属。`,
      positiveText: '删除',
      negativeText: '取消',
      onPositiveClick: async () => {
        try {
          await api.deleteProject(p.id);
          toast('已删除');
          load();
        } catch (e) { toast(e.message); }
      },
    });
  }
}

function openNotes(p) { router.push({ path: '/notes', query: { project: String(p.id) } }); }
function openTasks(p) { router.push({ path: '/tasks', query: { project: String(p.id) } }); }

onMounted(load);
</script>

<style scoped>
.pj { display: flex; flex-direction: column; gap: var(--sp-5); }
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.filters { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.search { max-width: 260px; }
.spacer { flex: 1; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(272px, 1fr)); gap: var(--sp-4); }

.card {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--sp-5);
  display: flex; flex-direction: column; gap: var(--sp-3);
  transition: box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard);
}
.card:hover { box-shadow: var(--shadow-float); transform: translateY(-1px); }
.card.archived { opacity: 0.62; }

.card-head { display: flex; align-items: center; gap: var(--sp-2); }
.card-title { flex: 1; min-width: 0; font-size: var(--fs-headline); font-weight: 600; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-desc { margin: 0; line-height: 1.5; min-height: 20px; }

.card-stats { display: flex; gap: var(--sp-4); }
.stat { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-footnote); color: var(--label-secondary); }

.card-foot { display: flex; align-items: center; gap: var(--sp-1); margin-top: var(--sp-1); }

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
.pj-modal { width: min(480px, 92vw); }
</style>
