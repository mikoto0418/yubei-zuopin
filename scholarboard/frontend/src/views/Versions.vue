<template>
  <div class="vs">
    <!-- 左栏：笔记选择 -->
    <aside class="side">
      <div class="side-head">
        <n-input v-model:value="query" size="small" clearable placeholder="搜索笔记…" @input="onSearch">
          <template #prefix><n-icon><SearchOutline /></n-icon></template>
        </n-input>
      </div>
      <div class="side-body">
        <StateBlock v-if="notesLoading" state="loading" />
        <StateBlock v-else-if="notesError" state="error" :description="notesError" retry @retry="loadNotes" />
        <StateBlock v-else-if="!notes.length" state="empty" title="没有笔记" description="先去写一篇笔记，这里会记录它的每次改动。" action="去写笔记" @action="router.push('/notes')" />
        <button
          v-for="n in notes"
          :key="n.id"
          type="button"
          class="note-item"
          :class="{ active: currentNote && currentNote.id === n.id }"
          @click="pickNote(n)"
        >
          <span class="note-title">{{ n.title || '无标题' }}</span>
          <span class="note-sub sb-caption sb-tertiary">{{ n.updated_at }}</span>
        </button>
      </div>
    </aside>

    <!-- 主体：版本列表 + diff -->
    <section class="main">
      <template v-if="currentNote">
        <header class="main-head">
          <div class="mh-left">
            <h2 class="sb-section-title">{{ currentNote.title || '无标题' }}</h2>
            <span class="sb-footnote sb-secondary">共 {{ versions.length }} 个版本（最多保留 20 版）</span>
          </div>
          <n-button size="small" quaternary @click="openInEditor">
            <template #icon><n-icon><CreateOutline /></n-icon></template>
            在编辑器中打开
          </n-button>
        </header>

        <StateBlock v-if="versionsLoading" state="loading" />
        <StateBlock v-else-if="versionsError" state="error" :description="versionsError" retry @retry="loadVersions" />
        <StateBlock v-else-if="!versions.length" state="empty" title="还没有历史版本" description="编辑并保存这篇笔记后，会自动生成版本快照。" />

        <div v-else class="split">
          <!-- 版本时间线 -->
          <div class="vlist">
            <button
              v-for="v in versions"
              :key="v.id"
              type="button"
              class="vitem"
              :class="{ active: selected && selected.id === v.id }"
              @click="selectVersion(v)"
            >
              <span class="vitem-top">
                <span class="vtag">v{{ v.version }}</span>
                <span class="vtime sb-caption sb-tertiary">{{ v.created_at }}</span>
              </span>
              <span class="vitem-note sb-footnote sb-secondary">{{ v.change_note || '编辑' }}</span>
              <span class="vitem-size sb-caption sb-tertiary">{{ v.size }} 字符</span>
            </button>
          </div>

          <!-- diff 面板 -->
          <div class="diff">
            <header class="diff-head">
              <span class="sb-headline">{{ diffTitle }}</span>
              <span class="spacer" />
              <n-radio-group v-model:value="compareWith" size="small" @update:value="loadDiff">
                <n-radio-button value="current">对比当前</n-radio-button>
                <n-radio-button value="prev">对比上一版</n-radio-button>
              </n-radio-group>
              <n-button
                v-if="selected"
                size="small"
                type="primary"
                :loading="rollingBack"
                @click="askRollback"
              >
                <template #icon><n-icon><RefreshOutline /></n-icon></template>
                回滚到此版本
              </n-button>
            </header>

            <StateBlock v-if="diffLoading" state="loading" />
            <StateBlock v-else-if="diffError" state="error" :description="diffError" retry @retry="loadDiff" />
            <div v-else class="diff-body">
              <p v-if="diff && diff.title_changed" class="title-change sb-footnote">
                标题有变化
              </p>
              <div v-for="(l, i) in (diff ? diff.lines : [])" :key="i" class="line" :class="'is-' + l.type">
                <span class="sign">{{ l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' ' }}</span>
                <span class="text">{{ l.text || ' ' }}</span>
              </div>
              <p v-if="diff && !diff.lines.length" class="sb-hint sb-secondary">两个版本内容一致。</p>
            </div>
          </div>
        </div>
      </template>

      <StateBlock v-else state="empty" title="选择一篇笔记" description="左侧列出你的全部笔记，选中后查看它的版本历史。" />
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NButton, NInput, NIcon, NRadioGroup, NRadioButton, useDialog } from 'naive-ui';
import { SearchOutline, CreateOutline, RefreshOutline } from '@vicons/ionicons5';
import { api, toast } from '../api';
import StateBlock from '../components/StateBlock.vue';

const route = useRoute();
const router = useRouter();
const dialog = useDialog();

const notes = ref([]);
const notesLoading = ref(false);
const notesError = ref('');
const query = ref('');
let searchTimer = null;

const currentNote = ref(null);
const versions = ref([]);
const versionsLoading = ref(false);
const versionsError = ref('');

const selected = ref(null);
const compareWith = ref('current');
const diff = ref(null);
const diffLoading = ref(false);
const diffError = ref('');
const rollingBack = ref(false);

const diffTitle = computed(() => {
  if (!selected.value) return '选择一个版本查看差异';
  const from = `v${selected.value.version}`;
  const to = compareWith.value === 'current' ? '当前版本' : '上一版';
  return `${from} → ${to}`;
});

async function loadNotes() {
  notesLoading.value = true;
  notesError.value = '';
  try {
    const res = await api.notes({ page: 1, pageSize: 100, q: query.value.trim() });
    notes.value = res.notes || [];
    if (notes.value.length) {
      const wanted = route.query.note ? notes.value.find((n) => String(n.id) === String(route.query.note)) : null;
      pickNote(wanted || notes.value[0]);
    } else {
      currentNote.value = null;
      versions.value = [];
    }
  } catch (e) {
    notesError.value = e.message;
  } finally {
    notesLoading.value = false;
  }
}

function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadNotes, 350);
}

async function pickNote(n) {
  currentNote.value = n;
  selected.value = null;
  diff.value = null;
  versionsLoading.value = true;
  versionsError.value = '';
  try {
    const res = await api.noteVersions(n.id);
    versions.value = res.versions || [];
    if (versions.value.length) selectVersion(versions.value[0]);
  } catch (e) {
    versionsError.value = e.message;
    versions.value = [];
  } finally {
    versionsLoading.value = false;
  }
}

async function selectVersion(v) {
  selected.value = v;
  await loadDiff();
}

async function loadDiff() {
  if (!currentNote.value || !selected.value) return;
  diffLoading.value = true;
  diffError.value = '';
  try {
    let against = undefined;
    if (compareWith.value === 'prev') {
      const idx = versions.value.findIndex((x) => x.id === selected.value.id);
      const prev = versions.value[idx + 1];
      if (!prev) {
        diff.value = { lines: [], title_changed: false };
        return;
      }
      against = prev.id;
    }
    const res = await api.noteVersionDiff(currentNote.value.id, selected.value.id, against);
    diff.value = res;
  } catch (e) {
    diffError.value = e.message;
    diff.value = null;
  } finally {
    diffLoading.value = false;
  }
}

function askRollback() {
  const v = selected.value;
  if (!v || !currentNote.value) return;
  dialog.warning({
    title: '回滚笔记',
    content: `确定把「${currentNote.value.title || '无标题'}」回滚到 v${v.version} 吗？当前内容会先自动存为一个新版本，可再次回滚回来。`,
    positiveText: '确认回滚',
    negativeText: '取消',
    onPositiveClick: async () => {
      rollingBack.value = true;
      try {
        const res = await api.rollbackNote(currentNote.value.id, v.id);
        toast(`已回滚到 v${v.version}`);
        currentNote.value = { ...currentNote.value, ...res.note };
        await pickNote(currentNote.value);
      } catch (e) {
        toast(e.message);
      } finally {
        rollingBack.value = false;
      }
    },
  });
}

function openInEditor() {
  if (!currentNote.value) return;
  router.push({ path: '/notes', query: { note: String(currentNote.value.id) } });
}

onMounted(loadNotes);
</script>

<style scoped>
.vs {
  display: grid;
  grid-template-columns: 264px 1fr;
  height: 100%;
  min-height: 0;
  background: var(--bg-grouped);
}

/* 左栏 */
.side {
  display: flex; flex-direction: column; min-height: 0;
  border-right: 1px solid var(--separator);
  background: var(--bg-surface);
}
.side-head { flex: none; padding: var(--sp-3) var(--sp-3) var(--sp-2); border-bottom: 1px solid var(--separator); }
.side-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-2); }

.note-item {
  display: flex; flex-direction: column; gap: 2px;
  width: 100%; text-align: left;
  border: none; background: transparent;
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--dur-fast) var(--ease-standard);
}
.note-item:hover { background: var(--fill-secondary); }
.note-item.active { background: var(--tint-soft); }
.note-title { font-size: var(--fs-footnote); font-weight: 600; color: var(--label); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 主体 */
.main { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.main-head {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-5);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--separator);
}
.mh-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

.split { flex: 1; min-height: 0; display: grid; grid-template-columns: 248px 1fr; }

/* 版本列表 */
.vlist { min-height: 0; overflow-y: auto; border-right: 1px solid var(--separator); background: var(--bg-surface); padding: var(--sp-2); }
.vitem {
  display: flex; flex-direction: column; gap: 3px;
  width: 100%; text-align: left;
  border: none; background: transparent;
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  margin-bottom: var(--sp-1);
  transition: background var(--dur-fast) var(--ease-standard);
}
.vitem:hover { background: var(--fill-secondary); }
.vitem.active { background: var(--tint-soft); }
.vitem-top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); }
.vtag {
  font-family: var(--font-mono); font-size: var(--fs-footnote); font-weight: 600;
  color: var(--tint);
}
.vtime { flex: none; }
.vitem-note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vitem-size { }

/* diff */
.diff { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.diff-head {
  flex: none; display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-5);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--separator);
}
.spacer { flex: 1; }

.diff-body { flex: 1; min-height: 0; overflow: auto; padding: var(--sp-4) var(--sp-5); background: var(--bg-surface); }
.title-change { margin: 0 0 var(--sp-3); color: var(--orange); }

.line { display: flex; gap: var(--sp-3); padding: 1px var(--sp-2); border-radius: 4px; font-family: var(--font-mono); font-size: var(--fs-footnote); line-height: 1.6; }
.line .sign { flex: none; width: 12px; color: var(--label-tertiary); user-select: none; }
.line .text { white-space: pre-wrap; word-break: break-word; }
.line.is-add { background: rgba(52, 199, 89, 0.12); }
.line.is-add .sign { color: var(--green); }
.line.is-del { background: rgba(255, 59, 48, 0.10); }
.line.is-del .sign { color: var(--red); }
.line.is-del .text { text-decoration: line-through; opacity: 0.72; }

@media (max-width: 1000px) {
  .split { grid-template-columns: 1fr; grid-template-rows: 200px 1fr; }
  .vlist { border-right: none; border-bottom: 1px solid var(--separator); }
}
@media (max-width: 780px) {
  .vs { grid-template-columns: 1fr; grid-template-rows: 180px 1fr; }
  .side { border-right: none; border-bottom: 1px solid var(--separator); }
}
</style>
