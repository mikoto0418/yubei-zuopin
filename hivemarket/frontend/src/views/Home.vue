<template>
  <div class="mkt">
    <!-- 集市头部：搜索 + 分类 -->
    <section class="mkt-bar">
      <div class="wrap mkt-bar-in">
        <div class="mkt-brand">
          <span class="mkt-stamp">今日好物 · LIMIT SELL</span>
          <h1>校园<em>二手</em>集市</h1>
        </div>
        <div class="mkt-search">
          <InputText v-model="keyword" placeholder="搜一搜：自行车 / iPad / 考研书…"
            @keyup.enter="reload" />
          <Button severity="danger" label="淘一淘" icon="pi pi-search" @click="reload" />
          <Button v-if="hasFilter" severity="secondary" label="清空" icon="pi pi-filter-slash" @click="reset" />
        </div>
      </div>
      <!-- 分类胶囊 -->
      <div class="wrap mkt-cats">
        <button class="mkt-cat" :class="{ 'is-on': !filters.category }" @click="pick('')">全部</button>
        <button v-for="c in categories" :key="c" class="mkt-cat"
                :class="{ 'is-on': filters.category === c }" @click="pick(c)">
          {{ iconFor(c) }} {{ c }}
        </button>
        <div class="mkt-price">
          <InputNumber v-model="filters.minPrice" placeholder="最低价" @keyup.enter="reload" />
          <span class="mkt-dash">—</span>
          <InputNumber v-model="filters.maxPrice" placeholder="最高价" @keyup.enter="reload" />
          <Button size="small" severity="contrast" label="筛" @click="reload" />
        </div>
      </div>
    </section>

    <div class="wrap">
      <!-- AI 推荐横条（保留 /ai/recommend） -->
      <section class="mkt-rail" v-if="recommend.items && recommend.items.length">
        <div class="mkt-rail-head">
          <h2><i class="pi pi-sparkles" /> AI 为你推荐</h2>
          <Tag value="SMART PICK" severity="danger" />
        </div>
        <p class="mkt-rail-sub" v-if="recommend.makeup">{{ recommend.makeup }}</p>
        <div class="mkt-rail-list">
          <div class="mkt-rail-card" v-for="it in recommend.items.slice(0, 4)" :key="'rec-' + it.id"
               @click="open(it)">
            <div class="mkt-rail-thumb">
              <template v-if="!firstImage(it)">{{ iconFor(it.category) }}</template>
              <img v-else :src="it.images.split(',')[0]" alt="" />
            </div>
            <div class="mkt-rail-body">
              <div class="mkt-rail-price">¥{{ money(it.price) }}</div>
              <div class="mkt-rail-title">{{ it.title }}</div>
              <div class="mkt-rail-meta">{{ it.seller_campus }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- 瀑布流集市 -->
      <div class="mkt-head">
        <h2><i class="pi pi-th-large" /> 集市 <span class="mkt-count">{{ pagination.total }} 件在淘</span></h2>
        <span class="mkt-hint">点击卡片滑出详情 · 可连续浏览</span>
      </div>

      <div class="masonry" v-if="items.length">
        <article class="m-card" v-for="(it, i) in items" :key="it.id"
                 :class="'m-card-h' + (i % 5)" @click="open(it)">
          <div class="m-thumb">
            <template v-if="!firstImage(it)">{{ iconFor(it.category) }}</template>
            <img v-else :src="it.images.split(',')[0]" alt="" loading="lazy" />
            <span class="m-cat">{{ it.category }}</span>
            <span class="m-stamp" v-if="it.status === '在售'">在售</span>
            <span class="m-stamp m-stamp-off" v-else>{{ it.status }}</span>
          </div>
          <div class="m-body">
            <h3 class="m-title">{{ it.title }}</h3>
            <div class="m-price">¥{{ money(it.price) }}</div>
            <div class="m-desc" v-if="it.description">{{ plain(it.description) }}</div>
            <div class="m-foot">
              <span class="m-seller">
                <i class="pi pi-user" /> {{ it.seller_nickname }}
              </span>
              <span class="m-view"><i class="pi pi-eye" /> {{ it.view_count || 0 }}</span>
            </div>
            <div class="m-tags">
              <span class="m-tag">{{ it.condition }}</span>
              <span class="m-tag">{{ it.seller_campus }}</span>
            </div>
          </div>
        </article>
      </div>

      <div class="empty" v-else-if="!loading">没有找到相关商品，换个条件试试～</div>
      <div class="empty" v-else>正在加载集市…</div>

      <!-- 滚动到底自动加载 -->
      <div ref="sentinel" class="mkt-sentinel">
        <span v-if="loadingMore"><i class="pi pi-spin pi-spinner" /> 正在淘更多宝贝…</span>
        <span v-else-if="!hasMore && items.length" class="mkt-end">— 集市到底了，就这些宝贝 —</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import api from '../api.js';
import { iconFor, money, firstImage } from '../util.js';
import { openItem } from '../ui.js';
import store from '../store.js';

const PAGE_SIZE = 20;

const items = ref([]);
const categories = ref([]);
const keyword = ref('');
const filters = ref({ category: '', minPrice: null, maxPrice: null });
const loading = ref(false);
const loadingMore = ref(false);
const recommend = ref({ items: [], makeup: '' });
const pagination = ref({ page: 1, pages: 1, total: 0, pageSize: PAGE_SIZE });
const sentinel = ref(null);
let io = null;

const hasFilter = computed(() =>
  !!keyword.value || !!filters.value.category || filters.value.minPrice != null || filters.value.maxPrice != null
);
const hasMore = computed(() => pagination.value.page < pagination.value.pages);

function plain(s) {
  return String(s || '').replace(/[#*`>\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 46);
}

// 点击卡片 → 滑出右侧抽屉（并把当前已加载列表交给抽屉做「连续浏览」）
function open(it) { openItem(it.id, items.value); }

function buildQuery(page) {
  const q = new URLSearchParams();
  if (keyword.value) q.set('keyword', keyword.value);
  if (filters.value.category) q.set('category', filters.value.category);
  if (filters.value.minPrice) q.set('minPrice', filters.value.minPrice);
  if (filters.value.maxPrice) q.set('maxPrice', filters.value.maxPrice);
  q.set('page', page);
  q.set('pageSize', PAGE_SIZE);
  return q.toString();
}

// 首屏 / 条件变化：重置为第 1 页
async function reload() {
  loading.value = true;
  pagination.value.page = 1;
  try {
    const data = await api.get('/items?' + buildQuery(1));
    items.value = data.items;
    pagination.value = { page: data.page, pages: data.pages, total: data.total, pageSize: data.pageSize };
  } finally { loading.value = false; }
}

// 滚动到底：追加下一页
async function loadMore() {
  if (loadingMore.value || loading.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const nextPage = pagination.value.page + 1;
    const data = await api.get('/items?' + buildQuery(nextPage));
    items.value = items.value.concat(data.items);
    pagination.value = { page: data.page, pages: data.pages, total: data.total, pageSize: data.pageSize };
  } finally { loadingMore.value = false; }
}

function pick(c) { filters.value.category = c; reload(); }
function reset() {
  keyword.value = '';
  filters.value = { category: '', minPrice: null, maxPrice: null };
  reload();
}

async function loadRecommend() {
  try { recommend.value = await api.get('/ai/recommend?limit=4'); } catch (e) { /* 忽略 */ }
}

onMounted(async () => {
  reload();
  loadRecommend();
  const c = await api.get('/items/categories');
  categories.value = c.categories;
  if (!store.state.user) store.refreshMe();

  await nextTick();
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '400px' });
    if (sentinel.value) io.observe(sentinel.value);
  } else {
    // 兜底：无 IntersectionObserver 时监听 scroll
    window.addEventListener('scroll', onScroll);
  }
});

function onScroll() {
  const el = sentinel.value;
  if (!el) return;
  if (el.getBoundingClientRect().top < window.innerHeight + 400) loadMore();
}

onBeforeUnmount(() => {
  if (io) io.disconnect();
  window.removeEventListener('scroll', onScroll);
});
</script>

<style scoped>
/* ===== 集市头部：Apple Large Title + 毛玻璃搜索区 ===== */
.mkt-bar {
  background: transparent; color: var(--label);
  border-bottom: 1px solid var(--separator);
  padding: var(--sp-6) 0 var(--sp-4);
}
.mkt-bar-in { display: flex; align-items: flex-end; gap: var(--sp-5); flex-wrap: wrap; }
.mkt-brand { flex: 0 0 auto; }
.mkt-stamp {
  display: inline-block; background: var(--tint-soft); color: var(--tint);
  border: none; box-shadow: none; border-radius: var(--radius-full);
  padding: 4px 12px; font-weight: 600; font-size: var(--fs-caption);
  letter-spacing: .2px; margin-bottom: var(--sp-3);
}
.mkt-brand h1 { font-size: var(--fs-large-title); font-weight: 700; letter-spacing: -0.02em; }
.mkt-brand h1 em { color: var(--tint); font-style: normal; }

.mkt-search { flex: 1 1 380px; display: flex; gap: var(--sp-2); align-items: stretch; }
.mkt-search :deep(.p-inputtext) { flex: 1; }
.mkt-search :deep(.p-button) { flex: 0 0 auto; }

.mkt-cats {
  display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; margin-top: var(--sp-4);
}
.mkt-cat {
  background: var(--fill-secondary); color: var(--label); border: none;
  border-radius: var(--radius-full);
  padding: 6px 14px; font-weight: 500; font-size: var(--fs-footnote); cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-standard),
              color var(--dur-fast) var(--ease-standard);
}
.mkt-cat:hover { background: var(--fill-primary); }
.mkt-cat.is-on { background: var(--tint); color: #fff; font-weight: 600; }
.mkt-price { display: flex; align-items: center; gap: var(--sp-1); margin-left: auto; }
.mkt-price :deep(.p-inputnumber) { width: 104px; }
.mkt-dash { color: var(--label-tertiary); font-weight: 400; }

/* ===== AI 推荐横条：Apple 卡片组 ===== */
.mkt-rail {
  margin-top: var(--sp-6); padding: var(--sp-5);
  background: var(--bg-surface); border: none;
  border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
}
.mkt-rail-head { display: flex; align-items: center; gap: var(--sp-3); }
.mkt-rail-head h2 { font-size: var(--fs-title2); font-weight: 600; }
.mkt-rail-sub { font-weight: 400; font-size: var(--fs-footnote); color: var(--label-secondary); margin: 4px 0 var(--sp-3); }
.mkt-rail-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--sp-3); }
.mkt-rail-card {
  display: flex; gap: var(--sp-2); background: var(--fill-tertiary);
  border: none; border-radius: var(--radius-md); cursor: pointer; overflow: hidden;
  transition: transform var(--dur-base) var(--ease-standard), background-color var(--dur-base) var(--ease-standard);
}
.mkt-rail-card:hover { transform: translateY(-2px); background: var(--fill-secondary); }
.mkt-rail-thumb {
  flex: 0 0 64px; background: var(--bg-surface); display: flex; align-items: center;
  justify-content: center; font-size: 28px; overflow: hidden;
}
.mkt-rail-thumb img { width: 100%; height: 100%; object-fit: cover; }
.mkt-rail-body { padding: 8px 10px 8px 0; min-width: 0; }
.mkt-rail-price { font-weight: 700; color: var(--red); font-size: var(--fs-subhead); }
.mkt-rail-title {
  font-weight: 600; font-size: var(--fs-footnote); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.mkt-rail-meta { font-size: var(--fs-caption); color: var(--label-secondary); }

/* ===== 集市标题行 ===== */
.mkt-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--sp-3); flex-wrap: wrap; margin: var(--sp-8) 0 var(--sp-4);
}
.mkt-head h2 { font-size: var(--fs-title2); font-weight: 600; }
.mkt-count { font-size: var(--fs-footnote); color: var(--label-secondary); font-weight: 400; letter-spacing: 0; }
.mkt-hint { font-size: var(--fs-caption); color: var(--label-secondary); font-weight: 400; }

/* ===== 瀑布流（CSS columns，保留不等高错落） ===== */
.masonry { column-count: 4; column-gap: var(--sp-4); }
@media (max-width: 1080px) { .masonry { column-count: 3; } }
@media (max-width: 760px) { .masonry { column-count: 2; column-gap: var(--sp-3); } }

.m-card {
  break-inside: avoid; -webkit-column-break-inside: avoid;
  margin-bottom: var(--sp-4); background: var(--bg-surface);
  border: none; border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
  cursor: pointer; display: block; overflow: hidden;
  transition: transform var(--dur-base) var(--ease-standard), box-shadow var(--dur-base) var(--ease-standard);
}
.m-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-float); }

.m-thumb {
  position: relative; display: flex; align-items: center; justify-content: center;
  background: var(--fill-tertiary);
  font-size: 56px; overflow: hidden;
}
.m-thumb img { width: 100%; height: 100%; object-fit: cover; }
/* 高度错落：瀑布流的关键 */
.m-card-h0 .m-thumb { height: 180px; }
.m-card-h1 .m-thumb { height: 240px; }
.m-card-h2 .m-thumb { height: 150px; }
.m-card-h3 .m-thumb { height: 210px; }
.m-card-h4 .m-thumb { height: 195px; }

.m-cat {
  position: absolute; top: var(--sp-2); left: var(--sp-2);
  background: var(--glass-bg);
  -webkit-backdrop-filter: var(--glass-blur);
  backdrop-filter: var(--glass-blur);
  color: var(--label); border: none; border-radius: var(--radius-full);
  padding: 2px 9px; font-size: var(--fs-caption); font-weight: 600;
}
.m-stamp {
  position: absolute; top: var(--sp-2); right: var(--sp-2);
  background: var(--red); color: #fff; border: none;
  border-radius: var(--radius-full); padding: 2px 9px;
  font-size: var(--fs-caption); font-weight: 600;
}
.m-stamp-off { background: var(--fill-primary); color: var(--label-secondary); }

.m-body { padding: var(--sp-3); }
.m-title { font-size: var(--fs-subhead); font-weight: 600; line-height: 1.35; margin-bottom: var(--sp-2); }
.m-price {
  display: inline-block; background: transparent; border: none; box-shadow: none;
  padding: 0; font-size: 19px; font-weight: 700; color: var(--red);
  margin-bottom: var(--sp-2); letter-spacing: -0.01em;
}
.m-desc {
  font-size: var(--fs-caption); color: var(--label-secondary); font-weight: 400; line-height: 1.45;
  margin-bottom: var(--sp-2);
}
.m-foot {
  display: flex; justify-content: space-between; align-items: center; gap: var(--sp-2);
  border-top: 1px solid var(--separator); padding-top: var(--sp-2);
  font-size: var(--fs-caption); font-weight: 400; color: var(--label-secondary);
}
.m-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.m-tag {
  font-size: var(--fs-caption); font-weight: 500; padding: 2px 8px;
  border: none; border-radius: var(--radius-sm);
  background: var(--fill-secondary); color: var(--label-secondary);
}

/* ===== 无限滚动哨兵 ===== */
.mkt-sentinel {
  text-align: center; padding: var(--sp-6) 0 var(--sp-3); color: var(--label-secondary);
  font-weight: 400; font-size: var(--fs-footnote);
}
.mkt-end { color: var(--label-secondary); }
</style>
