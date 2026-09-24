<template>
  <div class="kb">
    <!-- 工具条 -->
    <div class="bar">
      <n-input v-model:value="keyword" class="search" size="small" clearable placeholder="筛选任务…">
        <template #prefix><n-icon><SearchOutline /></n-icon></template>
      </n-input>
      <n-select v-model:value="projectFilter" size="small" clearable placeholder="全部项目" :options="projectOptions" class="proj-sel" @update:value="load" />
      <n-select v-model:value="priorityFilter" size="small" clearable placeholder="全部优先级" :options="priorityOptions" class="pri-sel" @update:value="load" />
      <span class="spacer" />
      <span class="sb-caption sb-tertiary">{{ tasks.length }} 项 · 已完成 {{ doneCount }}</span>
      <n-button type="primary" size="small" @click="openNew()">
        <template #icon><n-icon><AddOutline /></n-icon></template>
        新建任务
      </n-button>
    </div>

    <StateBlock v-if="loading" state="loading" />
    <StateBlock v-else-if="error" state="error" :description="error" retry @retry="load" />
    <StateBlock
      v-else-if="!columns.length"
      state="empty"
      title="还没有任务"
      description="任务按项目分列，可拖拽跨列改归属。"
      action="新建任务"
      @action="openNew()"
    />

    <!-- 看板 -->
    <div v-else class="board">
      <section
        v-for="col in columns"
        :key="col.key"
        class="col"
        :class="{ over: dragOverCol === col.key }"
        @dragover.prevent="onDragOver(col.key)"
        @dragleave="onDragLeave(col.key, $event)"
        @drop.prevent="onDrop(col.key)"
      >
        <header class="col-head">
          <span class="sb-dot" v-if="col.color" :style="{ background: col.color }" />
          <h3 class="col-title">{{ col.name }}</h3>
          <span class="col-count">{{ col.done }}/{{ col.tasks.length }}</span>
        </header>

        <div class="col-body">
          <article
            v-for="(t, idx) in col.tasks"
            :key="t.id"
            class="card"
            :class="{ done: t.done, dragging: draggingId === t.id }"
            draggable="true"
            @dragstart="onDragStart(t)"
            @dragend="onDragEnd"
            @dragover.prevent
            @drop.stop.prevent="onDropOnCard(col, idx)"
          >
            <div class="card-top">
              <n-checkbox :checked="t.done" @update:checked="toggle(t)" />
              <span class="card-title">{{ t.title }}</span>
            </div>

            <div class="card-meta">
              <span class="pri" :class="'pri-' + t.priority">{{ priorityText(t.priority) }}</span>
              <span v-if="t.due_date" class="due">
                <n-icon :size="12"><CalendarOutline /></n-icon>
                {{ t.due_date }}
              </span>
            </div>

            <div class="card-ops">
              <n-button quaternary size="tiny" title="朗读" @click="speakTask(t)">
                <template #icon><n-icon><VolumeHighOutline /></n-icon></template>
              </n-button>
              <n-button quaternary size="tiny" title="编辑" @click="openEdit(t)">
                <template #icon><n-icon><CreateOutline /></n-icon></template>
              </n-button>
              <n-button quaternary size="tiny" title="删除" @click="remove(t)">
                <template #icon><n-icon color="var(--red)"><TrashOutline /></n-icon></template>
              </n-button>
            </div>
          </article>

          <button class="col-add" type="button" @click="openNew(col)">
            <n-icon :size="14"><AddOutline /></n-icon>
            在此列新增
          </button>
        </div>
      </section>
    </div>

    <!-- 新建 / 编辑抽屉 -->
    <n-drawer v-model:show="drawerOpen" :width="400" placement="right">
      <n-drawer-content closable>
        <template #header>
          <span class="drawer-head">{{ editing ? '编辑任务' : '新建任务' }}</span>
        </template>

        <n-form label-placement="top" :show-require-mark="false">
          <n-form-item label="任务内容" :validation-status="formError ? 'error' : undefined" :feedback="formError">
            <n-input v-model:value="form.title" placeholder="要完成什么？" />
          </n-form-item>

          <n-form-item label="所属项目">
            <n-select v-model:value="form.project_id" clearable :options="projectOptions" placeholder="未归类" />
          </n-form-item>

          <n-form-item label="优先级">
            <n-select v-model:value="form.priority" :options="priorityOptions" />
          </n-form-item>

          <n-form-item label="截止日期">
            <n-date-picker v-model:value="dueDateTs" type="date" clearable class="full" placeholder="选择截止日期" />
          </n-form-item>
        </n-form>

        <template #footer>
          <div class="drawer-foot">
            <n-button quaternary @click="drawerOpen = false">取消</n-button>
            <n-button type="primary" :loading="saving" @click="save">保存</n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  NButton, NInput, NIcon, NSelect, NCheckbox, NDatePicker, NForm, NFormItem,
  NDrawer, NDrawerContent, useDialog,
} from 'naive-ui';
import {
  AddOutline, SearchOutline, VolumeHighOutline, CreateOutline, TrashOutline, CalendarOutline,
} from '@vicons/ionicons5';
import { api, toast } from '../api';
import { on } from '../bus';
import { colorOf } from '../theme';
import StateBlock from '../components/StateBlock.vue';

const dialog = useDialog();
const route = useRoute();

const tasks = ref([]);
const projects = ref([]);
const drawerOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const loading = ref(false);
const error = ref('');
const keyword = ref('');
const projectFilter = ref(null);
const priorityFilter = ref(null);
const formError = ref('');
const form = ref({ title: '', project_id: null, priority: 'medium' });
const dueDateTs = ref(null);

const draggingId = ref(null);
const dragOverCol = ref('');

const priorityOptions = [
  { label: '高', value: 'high' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
];
const projectOptions = computed(() => projects.value.map((p) => ({ label: p.name, value: p.id })));

const synth = window.speechSynthesis;
function speakText(text) {
  if (!synth || !text) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const zh = synth.getVoices().find((v) => v.lang && v.lang.startsWith('zh'));
  if (zh) u.voice = zh;
  u.lang = 'zh-CN';
  synth.speak(u);
}
function speakTask(t) { speakText(`${t.title}，优先级${priorityText(t.priority)}${t.due_date ? '，截止' + t.due_date : ''}`); }

const priorityText = (p) => ({ high: '高', medium: '中', low: '低' }[p] || '中');
const doneCount = computed(() => tasks.value.filter((t) => t.done).length);

// 看板列：按项目分组（未归类单独一列）；关键词为纯前端过滤
const columns = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  const filtered = kw ? tasks.value.filter((t) => String(t.title).toLowerCase().includes(kw)) : tasks.value;

  const map = new Map();
  filtered.forEach((t) => {
    const key = t.project_id == null ? 'none' : 'p' + t.project_id;
    if (!map.has(key)) {
      const p = projects.value.find((x) => x.id === t.project_id);
      map.set(key, { key, name: p ? p.name : '未归类', color: p ? colorOf(p.color) : '', tasks: [], done: 0, project_id: t.project_id });
    }
    const col = map.get(key);
    col.tasks.push(t);
    if (t.done) col.done += 1;
  });
  return [...map.values()].map((c) => ({ ...c, tasks: c.tasks.sort((a, b) => Number(a.done) - Number(b.done)) }));
});

function dateToTs(s) {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}
function tsToDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function openNew(col) {
  editing.value = null;
  form.value = {
    title: '',
    project_id: col && col.project_id != null ? col.project_id : projectFilter.value,
    priority: 'medium',
  };
  dueDateTs.value = null;
  formError.value = '';
  drawerOpen.value = true;
}

function openEdit(t) {
  editing.value = t;
  form.value = { title: t.title, project_id: t.project_id == null ? null : t.project_id, priority: t.priority };
  dueDateTs.value = dateToTs(t.due_date);
  formError.value = '';
  drawerOpen.value = true;
}

async function save() {
  if (!form.value.title.trim()) {
    formError.value = '任务内容不能为空';
    return toast('请填写任务内容');
  }
  formError.value = '';
  const payload = {
    title: form.value.title,
    project_id: form.value.project_id == null ? null : form.value.project_id,
    priority: form.value.priority,
    due_date: tsToDate(dueDateTs.value),
  };
  saving.value = true;
  try {
    if (editing.value) {
      await api.updateTask(editing.value.id, payload);
      toast('已更新');
    } else {
      await api.createTask(payload);
      toast('已创建');
    }
    drawerOpen.value = false;
    load();
  } catch (e) { toast(e.message); } finally { saving.value = false; }
}

async function toggle(t) {
  try {
    const res = await api.updateTask(t.id, { done: !t.done });
    t.done = res.task.done;
  } catch (e) { toast(e.message); }
}

function remove(t) {
  dialog.warning({
    title: '删除任务',
    content: '确定删除这个任务吗？删除后不可恢复。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.deleteTask(t.id);
        tasks.value = tasks.value.filter((x) => x.id !== t.id);
        toast('已删除');
      } catch (e) { toast(e.message); }
    },
  });
}

// ---- 拖拽：跨列改项目，列内仅本地重排 ----
function onDragStart(t) { draggingId.value = t.id; }
function onDragOver(key) { dragOverCol.value = key; }
function onDragLeave(key, e) {
  const to = e.relatedTarget;
  if (!to || !e.currentTarget.contains(to)) {
    if (dragOverCol.value === key) dragOverCol.value = '';
  }
}
function onDragEnd() { draggingId.value = null; dragOverCol.value = ''; }

async function onDrop(targetKey) {
  const id = draggingId.value;
  dragOverCol.value = '';
  if (id == null) return;
  const t = tasks.value.find((x) => x.id === id);
  if (!t) { onDragEnd(); return; }

  const targetProjectId = targetKey === 'none' ? null : Number(String(targetKey).slice(1));
  const curKey = t.project_id == null ? 'none' : 'p' + t.project_id;
  if (curKey === targetKey) { onDragEnd(); return; }

  const prev = t.project_id;
  t.project_id = targetProjectId;
  try {
    await api.updateTask(t.id, { project_id: targetProjectId });
    const p = projects.value.find((x) => x.id === targetProjectId);
    toast('已移动到「' + (p ? p.name : '未归类') + '」');
  } catch (e) {
    t.project_id = prev;
    toast(e.message);
  } finally {
    onDragEnd();
  }
}

function onDropOnCard(col, idx) {
  const id = draggingId.value;
  if (id == null) { onDragEnd(); return; }
  const t = tasks.value.find((x) => x.id === id);
  if (!t) { onDragEnd(); return; }
  const curKey = t.project_id == null ? 'none' : 'p' + t.project_id;
  if (curKey !== col.key) { onDrop(col.key); return; }
  // 同列重排（仅前端顺序，不提交）
  const rest = tasks.value.filter((x) => x.id !== id);
  const anchor = col.tasks[idx];
  const at = anchor ? rest.indexOf(anchor) : rest.length;
  rest.splice(at < 0 ? rest.length : at, 0, t);
  tasks.value = rest;
  onDragEnd();
}

async function loadProjects() {
  try {
    const res = await api.projects({ page: 1, pageSize: 100, archived: '0' });
    projects.value = res.projects || [];
  } catch { projects.value = []; }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.tasks({
      page: 1, pageSize: 100,
      priority: priorityFilter.value || '',
      project_id: projectFilter.value == null ? '' : projectFilter.value,
    });
    tasks.value = res.tasks || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

const offNew = on('cmd:new-task', () => openNew());

onMounted(async () => {
  if (route.query.project) projectFilter.value = Number(route.query.project);
  await loadProjects();
  await load();
});
onUnmounted(() => { offNew(); synth && synth.cancel(); });
</script>

<style scoped>
.kb { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-grouped); }

.bar {
  flex: none; display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap;
  padding: var(--sp-3) var(--sp-5);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--separator);
}
.search { max-width: 220px; }
.proj-sel { width: 150px; }
.pri-sel { width: 130px; }
.spacer { flex: 1; }

.board { flex: 1; min-height: 0; display: flex; gap: 0; overflow-x: auto; overflow-y: hidden; }

.col {
  flex: 0 0 300px;
  display: flex; flex-direction: column; min-height: 0;
  border-right: 1px solid var(--separator);
  transition: background var(--dur-fast) var(--ease-standard);
}
.col:last-child { border-right: none; }
.col.over { background: var(--tint-soft); }

.col-head {
  flex: none; display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--separator);
}
.col-title { flex: 1; font-size: var(--fs-subhead); font-weight: 600; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-count { font-size: var(--fs-caption); color: var(--label-tertiary); }

.col-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); }

.card {
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  padding: var(--sp-3);
  cursor: grab;
  transition: box-shadow var(--dur-fast) var(--ease-standard), opacity var(--dur-fast) var(--ease-standard);
}
.card:hover { box-shadow: var(--shadow-float); }
.card.dragging { opacity: 0.4; cursor: grabbing; }
.card.done { opacity: 0.6; }
.card.done .card-title { text-decoration: line-through; color: var(--label-tertiary); }

.card-top { display: flex; align-items: flex-start; gap: var(--sp-2); }
.card-title { flex: 1; font-size: var(--fs-footnote); line-height: 1.5; word-break: break-word; }

.card-meta { display: flex; align-items: center; gap: var(--sp-2); margin: var(--sp-2) 0 0 26px; flex-wrap: wrap; }
.pri { font-size: var(--fs-caption); padding: 1px var(--sp-2); border-radius: var(--radius-sm); background: var(--fill-secondary); color: var(--label-secondary); }
.pri-high { color: var(--red); background: rgba(255, 59, 48, 0.1); }
.pri-medium { color: var(--orange); background: var(--tint-soft); }
.pri-low { color: var(--green); background: rgba(52, 199, 89, 0.12); }
.due { display: inline-flex; align-items: center; gap: 3px; font-size: var(--fs-caption); color: var(--label-tertiary); }

.card-ops { display: flex; justify-content: flex-end; gap: 0; margin-top: 2px; opacity: 0; transition: opacity var(--dur-fast) var(--ease-standard); }
.card:hover .card-ops { opacity: 1; }

.col-add {
  display: flex; align-items: center; justify-content: center; gap: var(--sp-2);
  width: 100%; padding: var(--sp-3);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--label-tertiary);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--fs-footnote);
  transition: background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
.col-add:hover { background: var(--fill-secondary); color: var(--tint); }

.drawer-head { font-size: var(--fs-headline); font-weight: 600; }
.drawer-foot { display: flex; justify-content: flex-end; gap: var(--sp-2); width: 100%; }
.full { width: 100%; }

@media (max-width: 720px) {
  .bar { padding: var(--sp-3); }
  .search { max-width: none; flex: 1; }
  .col { flex: 0 0 84vw; }
}
</style>
