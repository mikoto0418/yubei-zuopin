<template>
  <div class="wrap" style="padding-top: 30px;">
    <div class="title-bar">
      <h2><i class="pi pi-chart-bar" /> 管理后台 · 数据仪表盘</h2>
      <Tag value="ADMIN DASHBOARD" severity="danger" />
    </div>

    <!-- 统计卡片：改用 PrimeVue Card -->
    <div class="stat-cards">
      <Card v-for="c in statCards" :key="c.key" class="stat-card-pv">
        <template #content>
          <div class="num">{{ s.totals?.[c.key] ?? 0 }}</div>
          <div class="lbl">{{ c.label }}</div>
        </template>
      </Card>
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <div class="row">
      <Card class="col chart-card"><template #title>成交额趋势</template>
        <template #content><div ref="elLine" class="chart"></div></template>
      </Card>
      <Card class="col chart-card"><template #title>类目成交占比</template>
        <template #content><div ref="elPie" class="chart"></div></template>
      </Card>
    </div>
    <div class="row">
      <Card class="col chart-card"><template #title>类目成交量</template>
        <template #content><div ref="elBar" class="chart"></div></template>
      </Card>
      <Card class="col chart-card"><template #title>Top 活跃卖家</template>
        <template #content><div ref="elTop" class="chart"></div></template>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as echarts from 'echarts';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import api from '../api.js';

const s = ref({});
const error = ref('');
const elLine = ref(); const elPie = ref(); const elBar = ref(); const elTop = ref();
let charts = [];

// 统计卡定义（数据来源不变：全部来自 /admin/stats 的 totals）
const statCards = [
  { key: 'revenue', label: '累计成交额(元)' },
  { key: 'completedOrders', label: '已完成订单' },
  { key: 'totalOrders', label: '全量订单' },
  { key: 'onSaleCount', label: '在售商品' },
  { key: 'soldCount', label: '已售商品' },
  { key: 'offCount', label: '下架商品' },
  { key: 'totalItems', label: '商品总量' },
  { key: 'totalUsers', label: '注册用户' },
  { key: 'totalWants', label: '求购帖' },
];

function init(el) {
  const c = echarts.init(el);
  charts.push(c);
  return c;
}

async function load() {
  try {
    s.value = await api.get('/admin/stats');
  } catch (e) { error.value = e.message; return; }
  const st = s.value;

  // 折线：成交额趋势
  init(elLine.value).setOption({
    xAxis: { type: 'category', data: st.revenueTrend.map(r => r.day) },
    yAxis: { type: 'value' },
    series: [{ type: 'line', data: st.revenueTrend.map(r => r.amount), smooth: true, symbolSize: 8,
      lineStyle: { color: '#e63946', width: 3 }, itemStyle: { color: '#111' },
      areaStyle: { color: 'rgba(230,57,70,0.15)' } }],
    tooltip: { trigger: 'axis' },
  });

  // 饼图：类目成交占比
  init(elPie.value).setOption({
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie', radius: ['30%', '70%'],
      itemStyle: { borderColor: '#111', borderWidth: 2 },
      data: st.categoryRevenue.map(r => ({ name: r.category, value: r.amount })),
    }],
  });

  // 柱状：类目成交量
  init(elBar.value).setOption({
    xAxis: { type: 'category', data: st.categoryVolume.map(r => r.category) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', barWidth: '55%', itemStyle: { color: '#f4c430', borderColor: '#111', borderWidth: 2 },
      data: st.categoryVolume.map(r => r.count) }],
    tooltip: { trigger: 'axis' },
  });

  // 排名：Top 活跃卖家（横向条形）
  const top = st.topSellers.slice().reverse();
  init(elTop.value).setOption({
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: top.map(t => t.nickname) },
    series: [{ type: 'bar', barWidth: 14, itemStyle: { color: '#111' },
      data: top.map(t => t.deal_count) }],
    tooltip: { trigger: 'axis' },
  });
}

function onResize() { charts.forEach(c => c.resize()); }

onMounted(() => { load(); window.addEventListener('resize', onResize); });
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  charts.forEach(c => c.dispose());
});
</script>

<style scoped>
.stat-card-pv :deep(.p-card-body) { padding: 14px; }
.stat-card-pv :deep(.p-card-content) { padding: 0; }
.stat-card-pv .num { font-size: 30px; font-weight: 900; color: var(--red); }
.stat-card-pv .lbl { font-weight: 700; margin-top: 2px; }
.stat-card-pv { box-shadow: var(--shadow-sm) !important; }
.chart-card :deep(.p-card-title) { font-size: 18px; font-weight: 900; }
.chart-card { margin-bottom: 24px; }
</style>
