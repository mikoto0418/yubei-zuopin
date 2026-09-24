<template>
  <div class="dash sb-enter">
    <div class="head">
      <div>
        <h1 class="sb-page-title">数据仪表盘</h1>
        <p class="sb-subhead sb-secondary">全站数据总览（仅管理员可见）。</p>
      </div>
      <n-button size="small" @click="load">刷新</n-button>
    </div>

    <StateBlock v-if="loading" state="loading" />
    <StateBlock v-else-if="error" state="error" :description="error" retry @retry="load" />

    <template v-else>
      <!-- 指标卡 -->
      <div class="stats">
        <div v-for="s in statCards" :key="s.key" class="stat">
          <span class="stat-label sb-footnote sb-secondary">{{ s.label }}</span>
          <span class="stat-value">{{ s.value }}</span>
          <span v-if="s.sub" class="stat-sub sb-caption sb-tertiary">{{ s.sub }}</span>
        </div>
      </div>

      <!-- 图表 -->
      <div class="charts">
        <div class="chart-card">
          <h2 class="sb-headline">笔记趋势（按月）</h2>
          <div ref="notesChart" class="chart" />
        </div>
        <div class="chart-card">
          <h2 class="sb-headline">任务完成度（按优先级）</h2>
          <div ref="taskChart" class="chart" />
        </div>
        <div class="chart-card">
          <h2 class="sb-headline">简历状态分布</h2>
          <div ref="resumeChart" class="chart" />
        </div>
        <div class="chart-card">
          <h2 class="sb-headline">活跃度趋势（按天）</h2>
          <div ref="activityChart" class="chart" />
        </div>
      </div>

      <!-- 活跃用户 -->
      <div class="chart-card">
        <h2 class="sb-headline">活跃用户 Top 8</h2>
        <StateBlock v-if="!topUsers.length" state="empty" title="暂无数据" description="还没有用户产生内容。" />
        <ul v-else class="users">
          <li v-for="u in topUsers" :key="u.username" class="user-row">
            <span class="uname">{{ u.nickname || u.username }}</span>
            <span class="sb-caption sb-tertiary">@{{ u.username }}</span>
            <span class="spacer" />
            <span class="metric">{{ u.notes }} 笔记</span>
            <span class="metric">{{ u.tasks }} 任务</span>
            <span class="metric">{{ u.resumes }} 简历</span>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, nextTick } from 'vue';
import { NButton } from 'naive-ui';
import * as echarts from 'echarts';
import { api } from '../api';
import { T, T_DARK, FONT_SANS } from '../theme';
import StateBlock from '../components/StateBlock.vue';

const loading = ref(false);
const error = ref('');
const stats = ref({});
const topUsers = ref([]);
const notesTrend = ref([]);
const taskCompletion = ref([]);
const resumeStatus = ref([]);
const activityTrend = ref([]);

const notesChart = ref(null);
const taskChart = ref(null);
const resumeChart = ref(null);
const activityChart = ref(null);
let charts = [];

const statCards = computed(() => {
  const s = stats.value || {};
  const cards = [
    { key: 'users', label: '用户', value: s.totalUsers || 0 },
    { key: 'projects', label: '项目', value: s.totalProjects || 0 },
    { key: 'notes', label: '笔记', value: s.totalNotes || 0 },
    { key: 'versions', label: '版本快照', value: s.totalVersions || 0 },
    { key: 'tags', label: '标签', value: s.totalTags || 0 },
    { key: 'tasks', label: '任务', value: s.totalTasks || 0, sub: `完成率 ${s.taskCompletion || 0}%` },
    { key: 'resumes', label: '简历', value: s.totalResumes || 0, sub: `已定稿 ${s.finalResumes || 0}` },
    { key: 'experiences', label: '结构化经历', value: s.totalExperiences || 0 },
    { key: 'activities', label: '活动记录', value: s.totalActivities || 0 },
  ];
  return cards;
});

// 图表配色：只取 Apple 系统色 + 当前主题中性色
function palette() {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    dark,
    text: dark ? T_DARK.labelSecondary : T.labelSecondary,
    line: dark ? T_DARK.separator : T.separator,
    series: [T.orange, T.blue, T.green, '#AF52DE', '#FF2D55', '#5AC8FA'],
  };
}

function baseOption(p, extra = {}) {
  return {
    textStyle: { fontFamily: FONT_SANS, color: p.text },
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    ...extra,
  };
}

function renderCharts() {
  charts.forEach((c) => c.dispose());
  charts = [];
  const p = palette();

  if (notesChart.value) {
    const c = echarts.init(notesChart.value);
    c.setOption(baseOption(p, {
      xAxis: { type: 'category', data: notesTrend.value.map((r) => r.month), axisLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.text } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.text } },
      series: [{ type: 'bar', data: notesTrend.value.map((r) => r.cnt), itemStyle: { color: T.orange, borderRadius: [6, 6, 0, 0] }, barMaxWidth: 32 }],
    }));
    charts.push(c);
  }

  if (taskChart.value) {
    const label = { high: '高', medium: '中', low: '低' };
    const c = echarts.init(taskChart.value);
    c.setOption(baseOption(p, {
      legend: { textStyle: { color: p.text } },
      xAxis: { type: 'category', data: taskCompletion.value.map((r) => label[r.priority] || r.priority), axisLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.text } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.text } },
      series: [
        { name: '已完成', type: 'bar', stack: 't', data: taskCompletion.value.map((r) => r.done || 0), itemStyle: { color: T.green, borderRadius: [0, 0, 0, 0] }, barMaxWidth: 40 },
        { name: '未完成', type: 'bar', stack: 't', data: taskCompletion.value.map((r) => (r.total || 0) - (r.done || 0)), itemStyle: { color: T.orange, borderRadius: [6, 6, 0, 0] }, barMaxWidth: 40 },
      ],
    }));
    charts.push(c);
  }

  if (resumeChart.value) {
    const label = { draft: '草稿', polished: '已润色', final: '已定稿', ready: '已润色' };
    const c = echarts.init(resumeChart.value);
    c.setOption(baseOption(p, {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: p.text } },
      series: [{
        type: 'pie',
        radius: ['48%', '70%'],
        avoidLabelOverlap: true,
        itemStyle: { borderWidth: 0 },
        label: { color: p.text },
        data: resumeStatus.value.map((r, i) => ({
          name: label[r.status] || r.status,
          value: r.cnt,
          itemStyle: { color: p.series[i % p.series.length] },
        })),
      }],
    }));
    charts.push(c);
  }

  if (activityChart.value) {
    const c = echarts.init(activityChart.value);
    c.setOption(baseOption(p, {
      xAxis: { type: 'category', data: activityTrend.value.map((r) => String(r.day).slice(5)), axisLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.text } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: p.line } }, axisLabel: { color: p.text } },
      series: [{ type: 'line', smooth: true, data: activityTrend.value.map((r) => r.cnt), itemStyle: { color: T.blue }, areaStyle: { color: 'rgba(0,122,255,0.12)' }, symbolSize: 6 }],
    }));
    charts.push(c);
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [overview, growth, tasks, notes, resumes, activity, top] = await Promise.all([
      api.adminOverview(),
      api.adminUsersGrowth(),
      api.adminTaskCompletion(),
      api.adminNotesTrend(),
      api.adminResumeStatus(),
      api.adminActivityTrend(),
      api.adminTopUsers(),
    ]);
    stats.value = overview.stats || {};
    notesTrend.value = notes.data || [];
    taskCompletion.value = tasks.data || [];
    resumeStatus.value = resumes.data || [];
    activityTrend.value = activity.data || [];
    topUsers.value = top.data || [];
    void growth;
    await nextTick();
    renderCharts();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function onResize() { charts.forEach((c) => c.resize()); }
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function onScheme() { if (!loading.value) renderCharts(); }

onMounted(() => {
  load();
  window.addEventListener('resize', onResize);
  if (mq && mq.addEventListener) mq.addEventListener('change', onScheme);
});
onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  if (mq && mq.removeEventListener) mq.removeEventListener('change', onScheme);
  charts.forEach((c) => c.dispose());
});
</script>

<style scoped>
.dash { display: flex; flex-direction: column; gap: var(--sp-5); }
.head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }

.stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--sp-3); }
.stat {
  display: flex; flex-direction: column; gap: 2px;
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--sp-4);
}
.stat-label { }
.stat-value { font-size: var(--fs-title2); font-weight: 600; letter-spacing: -0.02em; }
.stat-sub { }

.charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: var(--sp-4); }
.chart-card {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--sp-5);
}
.chart { height: 240px; margin-top: var(--sp-3); }

.users { list-style: none; margin: var(--sp-3) 0 0; padding: 0; }
.user-row { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) 0; border-bottom: 1px solid var(--separator); }
.user-row:last-child { border-bottom: none; }
.uname { font-size: var(--fs-subhead); }
.spacer { flex: 1; }
.metric { font-size: var(--fs-caption); color: var(--label-secondary); }
</style>
