<template>
  <div class="rs">
    <!-- 左栏：简历列表 -->
    <aside class="side">
      <div class="side-head">
        <n-input v-model:value="query" size="small" clearable placeholder="搜索标题 / 岗位…" @input="onSearch">
          <template #prefix><n-icon><SearchOutline /></n-icon></template>
        </n-input>
        <n-select v-model:value="statusFilter" size="small" :options="statusFilterOptions" clearable placeholder="全部状态" @update:value="load" />
        <n-button type="primary" size="small" block @click="createNew">
          <template #icon><n-icon><AddOutline /></n-icon></template>
          新建简历
        </n-button>
      </div>

      <div class="side-body">
        <StateBlock v-if="loading" state="loading" />
        <StateBlock v-else-if="error" state="error" :description="error" retry @retry="load" />
        <StateBlock v-else-if="!resumes.length" state="empty" title="还没有简历" description="新建一份简历，AI 会帮你润色并生成结构化亮点。" action="新建简历" @action="createNew" />

        <button
          v-for="r in resumes"
          :key="r.id"
          class="ritem"
          :class="{ active: current && current.id === r.id }"
          type="button"
          @click="select(r.id)"
        >
          <span class="ritem-title">{{ r.title }}</span>
          <span class="ritem-sub">{{ r.target_job || '待定岗位' }}</span>
          <span class="ritem-tag" :class="'st-' + r.status">{{ r.status_label }}</span>
        </button>
      </div>
    </aside>

    <!-- 主体 -->
    <section class="main">
      <template v-if="current">
        <header class="main-head">
          <div class="mh-left">
            <h2 class="sb-section-title">{{ current.title }}</h2>
            <div class="mh-badges">
              <span class="st-badge" :class="'st-' + current.status">{{ current.status_label }}</span>
              <span v-if="current.status === 'final'" class="sb-footnote sb-secondary">已定稿锁定，如需修改请先回退</span>
            </div>
          </div>
          <div class="mh-ops">
            <n-button
              v-for="opt in statusActions"
              :key="opt.value"
              size="small"
              :type="opt.primary ? 'primary' : 'default'"
              :quaternary="!opt.primary"
              :loading="statusBusy === opt.value"
              @click="changeStatus(opt.value)"
            >{{ opt.label }}</n-button>
            <n-button size="small" quaternary @click="speakText(originalText)">
              <template #icon><n-icon><VolumeHighOutline /></n-icon></template>
            </n-button>
            <n-button size="small" quaternary @click="askDelete">
              <template #icon><n-icon color="var(--red)"><TrashOutline /></n-icon></template>
            </n-button>
          </div>
        </header>

        <div class="split">
          <!-- 原稿：可编辑 -->
          <div class="pane">
            <div class="pane-head">
              <span class="sb-headline">原稿</span>
              <span class="sb-caption sb-tertiary">可编辑 · 始终保留</span>
            </div>

            <div class="pane-body">
              <div class="locked" v-if="locked">
                <n-icon :size="15"><LockClosedOutline /></n-icon>
                简历已定稿并锁定编辑。先点上方「回退为已润色」即可继续修改。
              </div>

              <n-form label-placement="top" :show-require-mark="false">
                <n-form-item label="简历标题">
                  <n-input v-model:value="current.title" size="small" :disabled="locked" @blur="saveMeta" />
                </n-form-item>
                <n-form-item label="岗位意向">
                  <n-input v-model:value="current.target_job" size="small" :disabled="locked" placeholder="如：前端开发实习生" @blur="saveMeta" />
                </n-form-item>
                <n-form-item label="技能（回车添加）">
                  <n-dynamic-tags v-model:value="current.skills" size="small" :disabled="locked" @update:value="saveMeta" />
                </n-form-item>
              </n-form>

              <div class="sec-head">
                <span class="sb-headline">经历（{{ experiences.length }}）</span>
                <span class="sb-caption sb-tertiary">可拖拽调整顺序</span>
              </div>

              <div
                v-for="(e, i) in experiences"
                :key="e.id"
                class="exp"
                :class="{ dragging: dragIndex === i, over: overIndex === i }"
                draggable="true"
                @dragstart="onDragStart(i)"
                @dragover.prevent="overIndex = i"
                @dragend="onDragEnd"
                @drop.prevent="onDrop(i)"
              >
                <div class="exp-head">
                  <span class="grip" title="拖拽排序">
                    <n-icon :size="14"><ReorderTwoOutline /></n-icon>
                  </span>
                  <n-input v-model:value="e.org" size="small" :disabled="locked" placeholder="机构 / 项目" class="grow" @blur="saveExp(e)" />
                  <n-input v-model:value="e.role" size="small" :disabled="locked" placeholder="角色" class="grow" @blur="saveExp(e)" />
                  <n-button quaternary size="tiny" :disabled="locked" @click="removeExp(e)">
                    <template #icon><n-icon color="var(--red)"><TrashOutline /></n-icon></template>
                  </n-button>
                </div>

                <div class="exp-dates">
                  <n-input v-model:value="e.start_date" size="small" :disabled="locked" placeholder="开始（2025-01）" @blur="saveExp(e)" />
                  <span class="dash">–</span>
                  <n-input v-model:value="e.end_date" size="small" :disabled="locked" placeholder="结束（2025-06）" @blur="saveExp(e)" />
                </div>

                <n-input
                  v-model:value="e.description"
                  type="textarea"
                  size="small"
                  :disabled="locked"
                  :autosize="{ minRows: 2, maxRows: 6 }"
                  placeholder="描述这一经历"
                  @blur="saveExp(e)"
                />

                <div v-if="(e.highlights || []).length" class="hl">
                  <span class="hl-kicker">AI 亮点</span>
                  <ul class="hl-list">
                    <li v-for="(h, hi) in e.highlights" :key="hi">{{ h }}</li>
                  </ul>
                </div>
              </div>

              <div class="add-exp">
                <n-input v-model:value="newExp.org" size="small" :disabled="locked" placeholder="新增机构 / 项目" class="grow" />
                <n-input v-model:value="newExp.role" size="small" :disabled="locked" placeholder="角色" class="grow" />
                <n-button size="small" :disabled="locked" @click="addExp">
                  <template #icon><n-icon><AddOutline /></n-icon></template>
                  添加
                </n-button>
              </div>
            </div>
          </div>

          <!-- 润色稿：只读 + 应用 -->
          <div class="pane polished-pane">
            <div class="pane-head">
              <span class="sb-headline">AI 润色稿</span>
              <span class="sb-caption sb-tertiary">只读</span>
              <span class="spacer" />
              <n-button v-if="current.polished" quaternary size="tiny" @click="copyPolished">
                <template #icon><n-icon><CopyOutline /></n-icon></template>
              </n-button>
            </div>

            <div class="pane-body">
              <div class="polish-ops">
                <n-button type="primary" size="small" :loading="polishing" :disabled="locked" @click="polishCurrent">
                  <template #icon><n-icon><SparklesOutline /></n-icon></template>
                  {{ polishing ? '润色中…' : 'AI 润色' }}
                </n-button>
                <n-button
                  size="small"
                  :disabled="!current.polished || locked"
                  :loading="applying"
                  @click="askApply"
                >应用到原稿</n-button>
                <n-button v-if="current.polished" size="small" quaternary :disabled="locked" @click="clearPolish">清除</n-button>
              </div>

              <p v-if="polishSource" class="sb-caption sb-tertiary">
                来源：{{ polishSource === 'llm' ? 'AI 大模型' : '本地兜底（未配置 LLM_API_KEY）' }}
              </p>

              <div class="polished-body">
                <pre v-if="current.polished" class="polished-text">{{ current.polished }}</pre>
                <StateBlock v-else state="empty" title="还没有润色稿" description="点击上方「AI 润色」，结果会写入 polished 字段并生成结构化亮点。" />
              </div>
            </div>
          </div>
        </div>
      </template>

      <StateBlock v-else state="empty" title="选择一份简历" description="左侧列出你的全部简历，选中后进入编辑与润色。" action="新建简历" @action="createNew" />
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  NButton, NInput, NIcon, NSelect, NForm, NFormItem, NDynamicTags, useDialog,
} from 'naive-ui';
import {
  AddOutline, SearchOutline, VolumeHighOutline, TrashOutline, SparklesOutline,
  CopyOutline, LockClosedOutline, ReorderTwoOutline,
} from '@vicons/ionicons5';
import { api, toast } from '../api';
import StateBlock from '../components/StateBlock.vue';

const dialog = useDialog();
const route = useRoute();

const resumes = ref([]);
const current = ref(null);
const experiences = ref([]);
const query = ref('');
const statusFilter = ref(null);
const loading = ref(false);
const error = ref('');
const newExp = ref({ org: '', role: '' });
const polishing = ref(false);
const applying = ref(false);
const polishSource = ref('');
const statusBusy = ref('');
let searchTimer = null;

const statusFilterOptions = [
  { label: '草稿', value: 'draft' },
  { label: '已润色', value: 'polished' },
  { label: '已定稿', value: 'final' },
];

const locked = computed(() => current.value && current.value.status === 'final');

// 状态机：按当前状态给出合法的下一步操作
const statusActions = computed(() => {
  const s = current.value ? current.value.status : '';
  if (s === 'draft') return [{ label: '标记为已润色', value: 'polished', primary: true }];
  if (s === 'polished') return [
    { label: '回退为草稿', value: 'draft' },
    { label: '标记为已定稿', value: 'final', primary: true },
  ];
  if (s === 'final') return [{ label: '回退为已润色', value: 'polished', primary: true }];
  return [];
});

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

const originalText = computed(() => {
  const r = current.value;
  if (!r) return '';
  const parts = [r.title, '岗位意向', r.target_job, '技能', (r.skills || []).join('、')];
  experiences.value.forEach((e) => parts.push(`${e.org}，${e.role}，${e.description || ''}`));
  return parts.join('。');
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.resumes({ page: 1, pageSize: 100, q: query.value.trim(), status: statusFilter.value || '' });
    resumes.value = res.resumes || [];
    if (resumes.value.length) {
      const wanted = route.query.resume ? resumes.value.find((r) => String(r.id) === String(route.query.resume)) : null;
      await select((wanted || resumes.value[0]).id);
    } else {
      current.value = null;
      experiences.value = [];
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { current.value = null; load(); }, 350);
}

async function select(id) {
  try {
    const res = await api.resume(id);
    current.value = res.resume;
    experiences.value = res.resume.experiences || [];
    polishSource.value = '';
  } catch (e) {
    toast(e.message);
  }
}

async function createNew() {
  try {
    const res = await api.createResume({ title: '我的简历', target_job: '', skills: [] });
    resumes.value.unshift(res.resume);
    current.value = res.resume;
    experiences.value = [];
    toast('已创建简历草稿');
  } catch (e) { toast(e.message); }
}

async function saveMeta() {
  if (!current.value || locked.value) return;
  try {
    await api.updateResume(current.value.id, {
      title: current.value.title,
      target_job: current.value.target_job,
      skills: current.value.skills,
    });
  } catch (e) { toast(e.message); }
}

async function saveExp(e) {
  if (!current.value || locked.value || !e.id) return;
  try {
    await api.updateExperience(current.value.id, e.id, {
      org: e.org, role: e.role,
      start_date: e.start_date, end_date: e.end_date,
      description: e.description,
    });
  } catch (err) { toast(err.message); }
}

async function addExp() {
  const org = newExp.value.org.trim();
  if (!org) return toast('请填写机构 / 项目');
  if (locked.value) return toast('简历已定稿并锁定');
  try {
    const res = await api.createExperience(current.value.id, { org, role: newExp.value.role.trim() });
    experiences.value.push(res.experience);
    newExp.value = { org: '', role: '' };
    toast('已添加经历');
  } catch (e) { toast(e.message); }
}

async function removeExp(e) {
  if (locked.value) return;
  try {
    await api.deleteExperience(current.value.id, e.id);
    experiences.value = experiences.value.filter((x) => x.id !== e.id);
    toast('已删除');
  } catch (err) { toast(err.message); }
}

// ---- 拖拽排序 ----
const dragIndex = ref(-1);
const overIndex = ref(-1);

function onDragStart(i) {
  if (locked.value) return;
  dragIndex.value = i;
}
function onDragEnd() {
  dragIndex.value = -1;
  overIndex.value = -1;
}
async function onDrop(target) {
  const from = dragIndex.value;
  onDragEnd();
  if (from < 0 || from === target) return;
  const list = [...experiences.value];
  const [moved] = list.splice(from, 1);
  list.splice(target, 0, moved);
  experiences.value = list;
  try {
    await api.reorderExperiences(current.value.id, list.map((x) => x.id));
    toast('顺序已保存');
  } catch (e) {
    toast(e.message);
    await select(current.value.id);
  }
}

async function polishCurrent() {
  if (!current.value) return;
  polishing.value = true;
  polishSource.value = '';
  try {
    const res = await api.resumePolish(current.value.id);
    polishSource.value = res.source;
    current.value = res.resume;
    experiences.value = res.resume.experiences || [];
    toast('润色完成，原稿已保留');
    const list = await api.resumes({ page: 1, pageSize: 100, q: query.value.trim(), status: statusFilter.value || '' });
    resumes.value = list.resumes || [];
  } catch (e) {
    toast(e.message);
  } finally {
    polishing.value = false;
  }
}

function askApply() {
  if (!current.value || !current.value.polished) return;
  const withHl = experiences.value.filter((e) => (e.highlights || []).length);
  if (!withHl.length) { toast('润色稿尚未生成结构化亮点，请先执行 AI 润色'); return; }
  dialog.warning({
    title: '应用润色结果到原稿',
    content: `将把 ${withHl.length} 条经历的 AI 亮点写回原稿描述。原稿的其他字段保持不变。`,
    positiveText: '确认应用',
    negativeText: '取消',
    onPositiveClick: () => applyPolished(true),
  });
}

async function applyPolished(overwrite) {
  applying.value = true;
  try {
    const res = await api.resumeApplyPolish(current.value.id, { overwrite });
    current.value = res.resume;
    experiences.value = res.resume.experiences || [];
    toast(`已应用 ${res.applied} 条经历`);
  } catch (e) {
    toast(e.message);
  } finally {
    applying.value = false;
  }
}

async function clearPolish() {
  if (!current.value) return;
  try {
    await api.updateResume(current.value.id, { polished: '' });
    current.value.polished = '';
    polishSource.value = '';
    toast('已清除润色结果');
  } catch (e) { toast(e.message); }
}

async function changeStatus(next) {
  if (!current.value) return;
  statusBusy.value = next;
  try {
    const res = await api.updateResume(current.value.id, { status: next });
    current.value = res.resume;
    toast(`状态已切换为「${res.resume.status_label}」`);
    const list = await api.resumes({ page: 1, pageSize: 100, q: query.value.trim(), status: statusFilter.value || '' });
    resumes.value = list.resumes || [];
  } catch (e) {
    toast(e.message); // 非法流转 → 后端 400，消息直接透出
  } finally {
    statusBusy.value = '';
  }
}

function askDelete() {
  dialog.warning({
    title: '删除简历',
    content: '确定删除这份简历吗？删除后不可恢复。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.deleteResume(current.value.id);
        resumes.value = resumes.value.filter((r) => r.id !== current.value.id);
        current.value = null;
        experiences.value = [];
        toast('已删除');
      } catch (e) { toast(e.message); }
    },
  });
}

async function copyPolished() {
  const text = current.value?.polished || '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast('润色稿已复制到剪贴板');
  } catch {
    toast('当前浏览器不允许自动复制，请手动选中');
  }
}

onMounted(load);
onUnmounted(() => { synth && synth.cancel(); clearTimeout(searchTimer); });
</script>

<style scoped>
.rs { display: grid; grid-template-columns: 272px 1fr; height: 100%; min-height: 0; background: var(--bg-grouped); }

/* 左栏 */
.side { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--separator); background: var(--bg-surface); }
.side-head { flex: none; padding: var(--sp-3); border-bottom: 1px solid var(--separator); display: flex; flex-direction: column; gap: var(--sp-2); }
.side-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-2); }

.ritem {
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
.ritem:hover { background: var(--fill-secondary); }
.ritem.active { background: var(--tint-soft); }
.ritem-title { font-size: var(--fs-footnote); font-weight: 600; color: var(--label); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ritem-sub { font-size: var(--fs-caption); color: var(--label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ritem-tag { align-self: flex-start; margin-top: 2px; font-size: var(--fs-caption); padding: 1px var(--sp-2); border-radius: var(--radius-sm); background: var(--fill-secondary); color: var(--label-secondary); }

/* 状态语义色 */
.st-draft { color: var(--label-secondary); }
.st-polished { color: var(--blue); background: rgba(0, 122, 255, 0.12); }
.st-final { color: var(--green); background: rgba(52, 199, 89, 0.14); }

/* 主体 */
.main { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.main-head {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-5);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--separator);
}
.mh-left { display: flex; flex-direction: column; gap: var(--sp-1); min-width: 0; }
.mh-badges { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.st-badge { font-size: var(--fs-caption); padding: 2px var(--sp-2); border-radius: var(--radius-sm); }
.mh-ops { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }

.split { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; }
.pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--bg-surface); }
.pane:first-child { border-right: 1px solid var(--separator); }
.polished-pane { background: var(--bg-grouped); }

.pane-head {
  flex: none; display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-5);
  border-bottom: 1px solid var(--separator);
}
.pane-head .spacer { flex: 1; }
.pane-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-5); }

.locked {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3);
  margin-bottom: var(--sp-4);
  background: var(--tint-soft);
  border-radius: var(--radius-md);
  font-size: var(--fs-footnote);
  color: var(--label);
}

.sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); margin: var(--sp-5) 0 var(--sp-3); padding-bottom: var(--sp-2); border-bottom: 1px solid var(--separator); }

.exp {
  padding: var(--sp-3);
  border-radius: var(--radius-md);
  background: var(--fill-tertiary);
  margin-bottom: var(--sp-3);
  display: flex; flex-direction: column; gap: var(--sp-2);
  transition: opacity var(--dur-fast) var(--ease-standard), outline-color var(--dur-fast) var(--ease-standard);
  outline: 2px solid transparent;
}
.exp.dragging { opacity: 0.45; }
.exp.over { outline-color: var(--tint); }

.exp-head { display: flex; align-items: center; gap: var(--sp-2); }
.grip { color: var(--label-tertiary); cursor: grab; flex: none; display: inline-flex; }
.grow { flex: 1; min-width: 100px; }
.exp-dates { display: flex; align-items: center; gap: var(--sp-2); }
.dash { color: var(--label-tertiary); flex: none; }

.hl { border-top: 1px solid var(--separator); padding-top: var(--sp-2); }
.hl-kicker { display: block; font-size: var(--fs-caption); font-weight: 600; color: var(--tint); margin-bottom: var(--sp-1); }
.hl-list { margin: 0; padding-left: var(--sp-4); }
.hl-list li { font-size: var(--fs-footnote); color: var(--label-secondary); line-height: 1.6; }

.add-exp { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-3); flex-wrap: wrap; }

.polish-ops { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-3); }
.polished-body { margin-top: var(--sp-3); }
.polished-text {
  margin: 0; white-space: pre-wrap; word-break: break-word;
  font-family: inherit; font-size: var(--fs-subhead); line-height: 1.7; color: var(--label);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  padding: var(--sp-4);
}

@media (max-width: 1080px) {
  .split { grid-template-columns: 1fr; grid-template-rows: auto auto; }
  .pane:first-child { border-right: none; border-bottom: 1px solid var(--separator); }
}
@media (max-width: 780px) {
  .rs { grid-template-columns: 1fr; grid-template-rows: 200px 1fr; }
  .side { border-right: none; border-bottom: 1px solid var(--separator); }
}
</style>
