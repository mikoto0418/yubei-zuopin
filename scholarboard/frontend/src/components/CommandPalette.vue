<template>
  <Teleport to="body">
    <Transition name="cmdk-fade">
      <div v-if="open" class="mask" @mousedown.self="close">
        <div class="panel" role="dialog" aria-label="命令面板">
          <div class="head">
            <n-icon class="glass" :size="18"><SearchOutline /></n-icon>
            <input
              ref="inputEl"
              v-model="query"
              class="input"
              type="text"
              spellcheck="false"
              placeholder="搜索笔记、跳转页面，或输入操作…"
              @keydown="onKeydown"
            />
            <span class="sb-kbd">esc</span>
          </div>

          <div class="sb-rule" />

          <div ref="listEl" class="body">
            <template v-for="g in groups" :key="g.key">
              <div class="group">{{ g.title }}</div>
              <button
                v-for="it in g.items"
                :key="it.uid"
                class="item"
                :class="{ active: it.uid === activeUid }"
                @mouseenter="activeUid = it.uid"
                @click="run(it)"
              >
                <n-icon class="item-icon" :size="16"><component :is="it.icon" /></n-icon>
                <span class="item-label">{{ it.label }}</span>
                <span v-if="it.hint" class="item-hint">{{ it.hint }}</span>
              </button>
            </template>

            <div v-if="!groups.length" class="empty">
              <span class="sb-footnote sb-tertiary">没有匹配的结果</span>
            </div>
          </div>

          <div class="sb-rule" />

          <div class="foot">
            <span class="sb-kbd">↑</span><span class="sb-kbd">↓</span><span class="foot-txt">选择</span>
            <span class="sb-kbd">↵</span><span class="foot-txt">执行</span>
            <span class="spacer" />
            <span class="sb-caption sb-tertiary">{{ noteCountHint }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { NIcon } from 'naive-ui';
import {
  SearchOutline, AddOutline, BookOutline, DocumentTextOutline, CheckboxOutline,
  StatsChartOutline, PersonOutline, SparklesOutline, CreateOutline, FolderOpenOutline,
  PricetagsOutline, TimeOutline,
} from '@vicons/ionicons5';
import { api } from '../api';
import { emitRetry } from '../bus';

const router = useRouter();

const open = ref(false);
const query = ref('');
const inputEl = ref(null);
const listEl = ref(null);
const activeUid = ref('');
const noteHits = ref([]);
const noteSearching = ref(false);
let searchTimer = null;

const isAdmin = computed(() => {
  const u = api.getUser();
  return !!(u && u.role === 'admin');
});

const ACTIONS = computed(() => [
  { id: 'new-note', label: '新建笔记', hint: '操作', icon: AddOutline, kw: 'xinjian biji note new' },
  { id: 'new-task', label: '新建任务', hint: '操作', icon: CheckboxOutline, kw: 'renwu task todo xinjian' },
  { id: 'new-resume', label: '新建简历', hint: '操作', icon: DocumentTextOutline, kw: 'jianli resume cv xinjian' },
  { id: 'polish-resume', label: 'AI 润色当前简历', hint: '操作', icon: SparklesOutline, kw: 'ai runse polish jianli' },
  { id: 'open-versions', label: '查看当前笔记版本历史', hint: '操作', icon: TimeOutline, kw: 'banben version history huigun' },
]);

const PAGES = computed(() => {
  const list = [
    { id: 'go-home', label: '活动流', hint: '页面', icon: StatsChartOutline, to: '/home', kw: 'huodong activity timeline' },
    { id: 'go-notes', label: '笔记', hint: '页面', icon: BookOutline, to: '/notes', kw: 'biji notes editor' },
    { id: 'go-projects', label: '项目', hint: '页面', icon: FolderOpenOutline, to: '/projects', kw: 'xiangmu project group' },
    { id: 'go-tags', label: '标签云', hint: '页面', icon: PricetagsOutline, to: '/tags', kw: 'biaoqian tag cloud' },
    { id: 'go-versions', label: '版本历史', hint: '页面', icon: TimeOutline, to: '/versions', kw: 'banben version diff rollback' },
    { id: 'go-resumes', label: '简历工作台', hint: '页面', icon: DocumentTextOutline, to: '/resumes', kw: 'jianli resume' },
    { id: 'go-tasks', label: '任务看板', hint: '页面', icon: CheckboxOutline, to: '/tasks', kw: 'renwu task kanban' },
    { id: 'go-profile', label: '个人中心', hint: '页面', icon: PersonOutline, to: '/profile', kw: 'geren profile me' },
  ];
  if (isAdmin.value) {
    list.push({ id: 'go-dashboard', label: '数据仪表盘', hint: '页面', icon: StatsChartOutline, to: '/dashboard', kw: 'shuju dashboard admin' });
  }
  return list;
});

const noteCountHint = computed(() => {
  if (!query.value.trim()) return '键盘驱动 · 输入即筛选';
  if (noteSearching.value) return '正在检索笔记…';
  return `笔记命中 ${noteHits.value.length} 条`;
});

function match(text, q) {
  if (!q) return true;
  return String(text).toLowerCase().includes(q);
}

const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  const out = [];

  const acts = ACTIONS.value.filter((a) => match(a.label, q) || match(a.kw, q));
  if (acts.length) {
    out.push({
      key: 'action',
      title: '操作',
      items: acts.map((a) => ({ uid: 'a:' + a.id, type: 'action', id: a.id, label: a.label, hint: a.hint, icon: a.icon })),
    });
  }

  const pages = PAGES.value.filter((p) => match(p.label, q) || match(p.kw, q));
  if (pages.length) {
    out.push({
      key: 'page',
      title: '跳转',
      items: pages.map((p) => ({ uid: 'p:' + p.id, type: 'page', id: p.id, to: p.to, label: p.label, hint: p.hint, icon: p.icon })),
    });
  }

  if (q && noteHits.value.length) {
    out.push({
      key: 'note',
      title: '笔记',
      items: noteHits.value.map((n) => ({
        uid: 'n:' + n.id,
        type: 'note',
        id: n.id,
        label: n.title || '无标题',
        hint: (n.tags && n.tags.length) ? n.tags.join(' · ') : '打开编辑',
        icon: CreateOutline,
      })),
    });
  }

  return out;
});

const flat = computed(() => groups.value.flatMap((g) => g.items));

watch(flat, (list) => {
  if (!list.length) { activeUid.value = ''; return; }
  if (!list.some((i) => i.uid === activeUid.value)) activeUid.value = list[0].uid;
  nextTick(scrollActiveIntoView);
});

function scrollActiveIntoView() {
  const el = listEl.value && listEl.value.querySelector('.item.active');
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
}

watch(query, (v) => {
  clearTimeout(searchTimer);
  const q = v.trim();
  if (!q) { noteHits.value = []; noteSearching.value = false; return; }
  noteSearching.value = true;
  searchTimer = setTimeout(async () => {
    try {
      const res = await api.notes({ page: 1, pageSize: 8, q });
      noteHits.value = res.notes || [];
    } catch {
      noteHits.value = [];
    } finally {
      noteSearching.value = false;
    }
  }, 220);
});

function move(delta) {
  const list = flat.value;
  if (!list.length) return;
  const idx = list.findIndex((i) => i.uid === activeUid.value);
  const next = (idx + delta + list.length) % list.length;
  activeUid.value = list[next].uid;
  nextTick(scrollActiveIntoView);
}

function onKeydown(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    const it = flat.value.find((i) => i.uid === activeUid.value);
    if (it) run(it);
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); close(); }
}

function run(it) {
  close();

  if (it.type === 'page') { router.push(it.to); return; }

  if (it.type === 'note') {
    router.push('/notes');
    emitRetry('cmd:open-note', { id: it.id });
    return;
  }

  const EVT = {
    'new-note': 'cmd:new-note',
    'new-task': 'cmd:new-task',
    'new-resume': 'cmd:new-resume',
    'polish-resume': 'cmd:polish-resume',
    'open-versions': 'cmd:open-versions',
  };
  const TARGET = {
    'new-note': '/notes',
    'new-task': '/tasks',
    'new-resume': '/resumes',
    'polish-resume': '/resumes',
    'open-versions': '/notes',
  };
  const evt = EVT[it.id];
  if (!evt) return;

  const target = TARGET[it.id];
  if (router.currentRoute.value.path !== target) router.push(target);
  emitRetry(evt, {});
}

function toggle() { open.value ? close() : show(); }

function show() {
  open.value = true;
  query.value = '';
  noteHits.value = [];
  nextTick(() => inputEl.value && inputEl.value.focus());
}

function close() {
  open.value = false;
  clearTimeout(searchTimer);
}

function onGlobalKey(e) {
  const k = e.key && e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'k') {
    e.preventDefault();
    toggle();
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKey, true));
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKey, true);
  clearTimeout(searchTimer);
});

defineExpose({ show, close, toggle });
</script>

<style scoped>
.mask {
  position: fixed; inset: 0; z-index: 4000;
  background: rgba(0, 0, 0, 0.32);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 12vh var(--sp-4) var(--sp-4);
}

.panel {
  width: min(620px, 100%);
  background: var(--bg-elevated);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-float);
  display: flex; flex-direction: column;
  max-height: 68vh;
  overflow: hidden;
  animation: cmdkIn var(--dur-base) var(--ease-standard);
}
@keyframes cmdkIn { from { opacity: 0; transform: scale(0.96) translateY(-6px); } to { opacity: 1; transform: none; } }

.head { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-4) var(--sp-5); }
.glass { color: var(--tint); flex: none; }

.input {
  flex: 1;
  border: none; outline: none; background: transparent;
  font-family: inherit;
  font-size: var(--fs-body);
  color: var(--label);
  min-width: 0;
}
.input::placeholder { color: var(--label-tertiary); }

.body { overflow-y: auto; padding: var(--sp-2) 0 var(--sp-3); }

.group {
  font-size: var(--fs-caption);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--label-tertiary);
  padding: var(--sp-3) var(--sp-5) var(--sp-1);
}

.item {
  display: flex; align-items: center; gap: var(--sp-3);
  width: 100%;
  border: none; background: transparent;
  text-align: left;
  padding: var(--sp-2) var(--sp-5);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--fs-subhead);
  color: var(--label);
  transition: background var(--dur-fast) var(--ease-standard);
}
.item.active { background: var(--tint-soft); }
.item-icon { color: var(--label-tertiary); flex: none; }
.item.active .item-icon { color: var(--tint); }
.item-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-hint {
  flex: none; max-width: 45%;
  font-size: var(--fs-caption);
  color: var(--label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.empty { padding: var(--sp-8) var(--sp-5); text-align: center; }

.foot { display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-3) var(--sp-5); }
.foot-txt { font-size: var(--fs-caption); color: var(--label-tertiary); margin-right: var(--sp-2); }
.spacer { flex: 1; }

.cmdk-fade-enter-active, .cmdk-fade-leave-active { transition: opacity var(--dur-fast) var(--ease-standard); }
.cmdk-fade-enter-from, .cmdk-fade-leave-to { opacity: 0; }

@media (max-width: 720px) {
  .mask { padding: 6vh var(--sp-3) var(--sp-3); }
}
</style>
