<template>
  <div class="ed">
    <!-- 左栏：笔记树（按项目分组） -->
    <aside class="tree">
      <div class="tree-head">
        <div class="tree-title">
          <n-input v-model:value="query" size="small" clearable placeholder="搜索笔记…" @input="onSearch" @keyup.enter="load">
            <template #prefix><n-icon><SearchOutline /></n-icon></template>
          </n-input>
          <n-button quaternary size="small" title="新建笔记" @click="newDraft">
            <template #icon><n-icon><AddOutline /></n-icon></template>
          </n-button>
        </div>

        <div class="tree-filter">
          <n-select
            v-model:value="projectFilter"
            size="small"
            clearable
            placeholder="全部项目"
            :options="projectOptions"
            @update:value="load"
          />
        </div>

        <div class="tree-filter">
          <n-switch v-model:value="onlyFav" size="small" @update:value="load" />
          <span class="sb-footnote sb-secondary">只看收藏</span>
          <span class="spacer" />
          <span class="sb-caption sb-tertiary">{{ total }} 篇</span>
        </div>
      </div>

      <div class="tree-body">
        <StateBlock v-if="loading" state="loading" />
        <StateBlock v-else-if="error" state="error" :description="error" retry @retry="load" />
        <StateBlock
          v-else-if="!tree.length"
          state="empty"
          :title="query.trim() ? '没有匹配的笔记' : '还没有笔记'"
          description="写下一行思考，它会自动保存并生成版本历史。"
          action="新建笔记"
          @action="newDraft"
        />

        <template v-else>
          <div v-for="grp in tree" :key="grp.key" class="group">
            <button class="group-head" type="button" @click="toggleGroup(grp.key)">
              <n-icon class="caret" :size="12" :class="{ closed: collapsed[grp.key] }"><ChevronDownOutline /></n-icon>
              <span class="sb-dot" v-if="grp.color" :style="{ background: grp.color }" />
              <span class="group-name">{{ grp.name }}</span>
              <span class="group-count">{{ grp.items.length }}</span>
            </button>

            <template v-if="!collapsed[grp.key]">
              <button
                v-for="n in grp.items"
                :key="n.uid"
                class="item"
                :class="{ active: n.uid === activeUid }"
                type="button"
                @click="select(n)"
              >
                <span class="item-title">
                  <n-icon v-if="n.favorite" :size="11" class="star"><Star /></n-icon>
                  {{ n.title || '无标题' }}
                </span>
                <span class="item-preview">{{ preview(n.content) }}</span>
              </button>
            </template>
          </div>

          <div v-if="hasMore && !query.trim()" class="more">
            <n-button quaternary size="small" block :loading="loadingMore" @click="loadMore">
              加载更多（还有 {{ total - notes.length }} 篇）
            </n-button>
          </div>
        </template>
      </div>
    </aside>

    <!-- 中栏：编辑器 -->
    <section class="main">
      <template v-if="draft">
        <div class="main-bar">
          <span class="save-state" :class="saveState.cls">{{ saveState.text }}</span>
          <span class="sb-caption sb-tertiary">{{ countChars }} 字</span>
          <span class="spacer" />

          <n-button size="small" :type="recording ? 'primary' : 'default'" :disabled="!srSupported" @click="toggleRec">
            <template #icon><n-icon><MicOutline /></n-icon></template>
            {{ recording ? '停止' : '语音输入' }}
          </n-button>
          <n-button size="small" quaternary @click="speakText(draft.title + '。' + draft.content)">
            <template #icon><n-icon><VolumeHighOutline /></n-icon></template>
            朗读
          </n-button>
        </div>

        <div class="main-scroll">
          <input v-model="draft.title" class="title-input" type="text" placeholder="给这篇笔记一个标题" @input="markDirty" />
          <div class="title-rule" />
          <textarea
            v-model="draft.content"
            class="body-input"
            spellcheck="false"
            placeholder="开始记录…，或点击上方「语音输入」直接口述。"
            @input="markDirty"
          ></textarea>
          <p v-if="formError" class="form-error sb-danger-text">{{ formError }}</p>
        </div>
      </template>

      <StateBlock
        v-else
        state="empty"
        title="选择或新建一篇笔记"
        description="左侧是笔记树，中栏是编辑器，右侧是属性与标签。"
        action="新建笔记"
        @action="newDraft"
      />
    </section>

    <!-- 右栏：属性 / 标签 / 版本 -->
    <aside class="meta">
      <template v-if="draft">
        <div class="meta-sec">
          <span class="meta-kicker">属性</span>
          <div class="meta-row">
            <span class="meta-label">收藏</span>
            <n-switch :value="!!draft.favorite" size="small" @update:value="toggleFav" />
          </div>
          <div class="meta-row">
            <span class="meta-label">所属项目</span>
            <n-select
              :value="draft.project_id"
              size="small"
              clearable
              placeholder="未归类"
              :options="projectOptions"
              class="meta-sel"
              @update:value="onProjectChange"
            />
          </div>
          <div class="meta-row">
            <span class="meta-label">字数</span>
            <span class="meta-value">{{ countChars }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">更新</span>
            <span class="meta-value">{{ draft.updated_at || '尚未保存' }}</span>
          </div>
        </div>

        <div class="sb-rule" />

        <div class="meta-sec">
          <span class="meta-kicker">标签</span>
          <n-dynamic-tags :value="draft.tags || []" size="small" @update:value="onTagsChange" />
          <p class="sb-caption sb-tertiary">回车添加标签，可在标签云页按标签筛选。</p>
        </div>

        <div class="sb-rule" />

        <div class="meta-sec">
          <n-button type="primary" size="small" block :loading="saving" @click="save(true)">保存笔记</n-button>
          <n-button size="small" block quaternary @click="openVersions">版本历史</n-button>
          <n-button v-if="draft.id" size="small" block quaternary @click="remove">
            <template #icon><n-icon color="var(--red)"><TrashOutline /></n-icon></template>
            删除此笔记
          </n-button>
        </div>

        <div class="meta-foot sb-caption sb-tertiary">
          <div>⌘/Ctrl + K 打开命令面板</div>
          <div>⌘/Ctrl + S 立即保存</div>
        </div>
      </template>

      <p v-else class="sb-footnote sb-tertiary meta-empty">未选中笔记</p>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  NButton, NInput, NIcon, NSwitch, NSelect, NDynamicTags, useDialog,
} from 'naive-ui';
import {
  AddOutline, SearchOutline, MicOutline, VolumeHighOutline, TrashOutline,
  Star, ChevronDownOutline,
} from '@vicons/ionicons5';
import { api, toast } from '../api';
import { on } from '../bus';
import { colorOf } from '../theme';
import StateBlock from '../components/StateBlock.vue';

const dialog = useDialog();
const route = useRoute();
const router = useRouter();

const PAGE_SIZE = 50;
const notes = ref([]);
const projects = ref([]);
const total = ref(0);
const page = ref(1);
const query = ref('');
const projectFilter = ref(null);
const onlyFav = ref(false);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const saving = ref(false);
const formError = ref('');
const dirty = ref(false);
const collapsed = reactive({});
let searchTimer = null;
let saveTimer = null;
let uidSeed = 0;

const projectOptions = computed(() => projects.value.map((p) => ({ label: p.name, value: p.id })));

function withUid(n) {
  if (!n.uid) n.uid = 'n' + (n.id != null ? n.id : 'draft-' + ++uidSeed);
  return n;
}

const hasMore = computed(() => notes.value.length < total.value);
const activeUid = ref('');
const draft = ref(null);

function normalize(n) {
  return {
    id: n.id != null ? n.id : null,
    uid: n.uid,
    title: n.title || '',
    content: n.content || '',
    tags: Array.isArray(n.tags) ? [...n.tags] : [],
    favorite: !!n.favorite,
    project_id: n.project_id == null ? null : n.project_id,
    project_name: n.project_name || '',
    updated_at: n.updated_at || '',
  };
}

// 左栏树：按项目分组，未归类落到「未归类」
const tree = computed(() => {
  const map = new Map();
  notes.value.forEach((n) => {
    const key = n.project_id == null ? 'none' : 'p' + n.project_id;
    if (!map.has(key)) {
      const p = projects.value.find((x) => x.id === n.project_id);
      map.set(key, {
        key,
        name: p ? p.name : '未归类',
        color: p ? colorOf(p.color) : '',
        items: [],
      });
    }
    map.get(key).items.push(n);
  });
  return [...map.values()];
});

function toggleGroup(key) { collapsed[key] = !collapsed[key]; }

const countChars = computed(() => (draft.value ? (draft.value.content || '').length : 0));

const saveState = computed(() => {
  if (saving.value) return { text: '保存中…', cls: 'busy' };
  if (dirty.value) return { text: '未保存', cls: 'dirty' };
  if (draft.value && draft.value.id) return { text: '已保存', cls: 'saved' };
  return { text: '新笔记草稿', cls: 'dirty' };
});

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
    const res = await api.notes({
      page: 1,
      pageSize: PAGE_SIZE,
      q: query.value.trim(),
      fav: onlyFav.value ? '1' : '',
      project_id: projectFilter.value == null ? '' : projectFilter.value,
    });
    notes.value = (res.notes || []).map((n) => withUid(normalize(n)));
    total.value = res.total;
    page.value = 1;
    syncDraftAfterLoad();
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
    const res = await api.notes({
      page: next, pageSize: PAGE_SIZE, q: query.value.trim(),
      fav: onlyFav.value ? '1' : '', project_id: projectFilter.value == null ? '' : projectFilter.value,
    });
    const more = (res.notes || []).map((n) => withUid(normalize(n)));
    const seen = new Set(notes.value.map((n) => n.uid));
    more.forEach((n) => { if (!seen.has(n.uid)) notes.value.push(n); });
    total.value = res.total;
    page.value = next;
  } catch (e) {
    toast(e.message);
  } finally {
    loadingMore.value = false;
  }
}

function syncDraftAfterLoad() {
  const cur = notes.value.find((n) => n.uid === activeUid.value);
  if (cur) return;
  const wanted = route.query.note ? notes.value.find((n) => String(n.id) === String(route.query.note)) : null;
  if (wanted) select(wanted);
  else if (notes.value.length) select(notes.value[0]);
  else { activeUid.value = ''; draft.value = null; }
}

function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 400);
}

function select(n) {
  if (dirty.value && draft.value) save(false);
  activeUid.value = n.uid;
  draft.value = n;
  formError.value = '';
  dirty.value = false;
}

function newDraft() {
  if (dirty.value && draft.value) save(false);
  const d = normalize({
    title: '', content: '', tags: [], favorite: false,
    project_id: projectFilter.value == null ? null : projectFilter.value,
    uid: 'draft-' + ++uidSeed, updated_at: '',
  });
  notes.value.unshift(d);
  total.value += 1;
  activeUid.value = d.uid;
  draft.value = d;
  formError.value = '';
  dirty.value = false;
}

function markDirty() {
  dirty.value = true;
  formError.value = '';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(false), 1400);
}

function onTagsChange(v) {
  if (!draft.value) return;
  draft.value.tags = v;
  markDirty();
}

function onProjectChange(v) {
  if (!draft.value) return;
  draft.value.project_id = v;
  const p = projects.value.find((x) => x.id === v);
  draft.value.project_name = p ? p.name : '';
  if (draft.value.id == null) { markDirty(); return; }
  api.updateNote(draft.value.id, { project_id: v }).catch((e) => toast(e.message));
}

function preview(c) {
  const t = (c || '').replace(/\s+/g, ' ');
  return t.length > 40 ? t.slice(0, 40) + '…' : (t || '（空白笔记）');
}

async function save(explicit) {
  const d = draft.value;
  if (!d) return;
  clearTimeout(saveTimer);

  if (!String(d.title).trim()) {
    if (explicit) { formError.value = '笔记标题不能为空'; toast('笔记标题不能为空'); }
    return;
  }

  saving.value = true;
  formError.value = '';
  try {
    const body = {
      title: d.title,
      content: d.content,
      tags: d.tags || [],
      project_id: d.project_id == null ? null : d.project_id,
    };
    if (d.id != null) {
      const res = await api.updateNote(d.id, body);
      applySaved(res.note);
    } else {
      const res = await api.createNote(body);
      d.id = res.note.id;
      d.uid = 'n' + res.note.id;
      activeUid.value = d.uid;
      applySaved(res.note);
    }
    dirty.value = false;
    if (explicit) toast('已保存');
  } catch (e) {
    formError.value = e.message;
    if (explicit) toast(e.message);
  } finally {
    saving.value = false;
  }
}

function applySaved(n) {
  if (!n || !draft.value) return;
  draft.value.id = n.id;
  draft.value.title = n.title || '';
  draft.value.content = n.content || '';
  draft.value.tags = Array.isArray(n.tags) ? [...n.tags] : [];
  draft.value.favorite = !!n.favorite;
  draft.value.project_id = n.project_id == null ? null : n.project_id;
  draft.value.updated_at = n.updated_at || '';
}

async function toggleFav(v) {
  if (!draft.value) return;
  if (draft.value.id == null) { draft.value.favorite = v; markDirty(); return; }
  try {
    const res = await api.updateNote(draft.value.id, { favorite: v });
    draft.value.favorite = !!res.note.favorite;
  } catch (e) { toast(e.message); }
}

function remove() {
  const d = draft.value;
  if (!d || d.id == null) {
    notes.value = notes.value.filter((x) => x.uid !== d.uid);
    total.value = Math.max(0, total.value - 1);
    activeUid.value = '';
    draft.value = null;
    toast('已移除草稿');
    return;
  }
  dialog.warning({
    title: '删除笔记',
    content: `确定删除「${d.title || '无标题'}」吗？删除后不可恢复，版本历史也会一并删除。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.deleteNote(d.id);
        notes.value = notes.value.filter((x) => x.uid !== d.uid);
        total.value = Math.max(0, total.value - 1);
        activeUid.value = '';
        draft.value = notes.value.length ? notes.value[0] : null;
        if (draft.value) activeUid.value = draft.value.uid;
        toast('已删除');
      } catch (e) { toast(e.message); }
    },
  });
}

function openVersions() {
  if (!draft.value || draft.value.id == null) { toast('请先保存笔记再查看版本历史'); return; }
  router.push({ path: '/versions', query: { note: String(draft.value.id) } });
}

// ---- 语音合成 ----
const synth = window.speechSynthesis;
function pickVoice() {
  const voices = synth.getVoices();
  const zh = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('zh'));
  return zh || voices[0] || null;
}
function speakText(text) {
  if (!synth || !text) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = v && v.lang ? v.lang : 'zh-CN';
  u.rate = 0.98;
  synth.speak(u);
}

// ---- 语音转文字 ----
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const srSupported = !!SR;
let recognition = null;
const recording = ref(false);

function toggleRec() {
  if (recording.value) { stopRec(); return; }
  if (!SR) return;
  try {
    recognition = new SR();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
      if (draft.value) { draft.value.content = text; markDirty(); }
    };
    recognition.onerror = (e) => { recording.value = false; toast('语音识别出错了：' + e.error); };
    recognition.onend = () => { recording.value = false; };
    recognition.start();
    recording.value = true;
  } catch {
    toast('无法启动语音识别');
  }
}
function stopRec() {
  if (recognition) { recognition.stop(); recognition = null; }
  recording.value = false;
}

function onKeydown(e) {
  const k = e.key && e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 's') {
    e.preventDefault();
    save(true);
  }
}

const offNew = on('cmd:new-note', () => newDraft());
const offVersions = on('cmd:open-versions', () => openVersions());
const offOpen = on('cmd:open-note', async ({ id }) => {
  const found = notes.value.find((n) => n.id === id);
  if (found) { select(found); return; }
  try {
    await load();
    const hit = notes.value.find((n) => n.id === id);
    if (hit) select(hit);
  } catch (e) { toast(e.message); }
});

onMounted(async () => {
  if (route.query.project) projectFilter.value = Number(route.query.project);
  await loadProjects();
  await load();
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  synth && synth.cancel();
  stopRec();
  clearTimeout(searchTimer);
  clearTimeout(saveTimer);
  window.removeEventListener('keydown', onKeydown);
  offNew(); offOpen(); offVersions();
});
</script>

<style scoped>
.ed {
  display: grid;
  grid-template-columns: 280px 1fr 268px;
  height: 100%;
  min-height: 0;
  background: var(--bg-surface);
}

/* 左栏 */
.tree { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--separator); background: var(--bg-surface); }
.tree-head { flex: none; padding: var(--sp-3); border-bottom: 1px solid var(--separator); display: flex; flex-direction: column; gap: var(--sp-2); }
.tree-title { display: flex; align-items: center; gap: var(--sp-2); }
.tree-filter { display: flex; align-items: center; gap: var(--sp-2); }
.spacer { flex: 1; }

.tree-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-2); }

.group { margin-bottom: var(--sp-1); }
.group-head {
  display: flex; align-items: center; gap: var(--sp-2);
  width: 100%; border: none; background: transparent;
  padding: var(--sp-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--fs-footnote);
  font-weight: 600;
  color: var(--label-secondary);
}
.group-head:hover { background: var(--fill-secondary); }
.caret { transition: transform var(--dur-fast) var(--ease-standard); }
.caret.closed { transform: rotate(-90deg); }
.group-name { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-count { font-size: var(--fs-caption); color: var(--label-tertiary); }

.item {
  display: flex; flex-direction: column; gap: 2px;
  width: 100%; text-align: left;
  border: none; background: transparent;
  padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-5);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--dur-fast) var(--ease-standard);
}
.item:hover { background: var(--fill-secondary); }
.item.active { background: var(--tint-soft); }
.item-title {
  display: flex; align-items: center; gap: 5px;
  font-size: var(--fs-footnote); font-weight: 600; color: var(--label);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.star { color: var(--tint); flex: none; }
.item-preview { font-size: var(--fs-caption); color: var(--label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.more { padding: var(--sp-2); }

/* 中栏 */
.main { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--bg-surface); }
.main-bar {
  flex: none; display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-5);
  border-bottom: 1px solid var(--separator);
}
.save-state { font-size: var(--fs-caption); }
.save-state.saved { color: var(--label-tertiary); }
.save-state.dirty { color: var(--tint); }
.save-state.busy { color: var(--label-secondary); }

.main-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-8) var(--sp-10) var(--sp-12); }

.title-input {
  width: 100%; border: none; outline: none; background: transparent;
  font-family: inherit;
  font-size: var(--fs-large-title);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--label);
  padding: 0;
}
.title-input::placeholder { color: var(--label-tertiary); }
.title-rule { height: 3px; width: 48px; background: var(--tint); border-radius: var(--radius-full); margin: var(--sp-4) 0 var(--sp-5); }

.body-input {
  width: 100%; min-height: 46vh;
  border: none; outline: none; resize: none; background: transparent;
  font-family: inherit;
  font-size: var(--fs-body);
  line-height: 1.7;
  color: var(--label);
  padding: 0;
}
.body-input::placeholder { color: var(--label-tertiary); }
.form-error { margin-top: var(--sp-3); font-size: var(--fs-footnote); }

/* 右栏 */
.meta {
  display: flex; flex-direction: column; gap: var(--sp-4);
  min-height: 0; overflow-y: auto;
  border-left: 1px solid var(--separator);
  background: var(--bg-surface);
  padding: var(--sp-5);
}
.meta-sec { display: flex; flex-direction: column; gap: var(--sp-3); }
.meta-kicker { font-size: var(--fs-caption); font-weight: 600; color: var(--label-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
.meta-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.meta-label { font-size: var(--fs-footnote); color: var(--label-secondary); flex: none; }
.meta-value { font-family: var(--font-mono); font-size: var(--fs-caption); color: var(--label-secondary); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
.meta-sel { max-width: 140px; }
.meta-foot { margin-top: auto; padding-top: var(--sp-4); display: flex; flex-direction: column; gap: 3px; }
.meta-empty { margin: auto; }

@media (max-width: 1080px) {
  .ed { grid-template-columns: 248px 1fr; }
  .meta { display: none; }
}
@media (max-width: 780px) {
  .ed { grid-template-columns: 1fr; grid-template-rows: 220px 1fr; }
  .tree { border-right: none; border-bottom: 1px solid var(--separator); }
  .main-scroll { padding: var(--sp-5) var(--sp-4) var(--sp-10); }
  .title-input { font-size: 26px; }
}
</style>
