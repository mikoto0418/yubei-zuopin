<template>
  <div class="wrap hm-page">
    <div class="hm-title">分类浏览</div>
    <div class="hm-sub">按一级分类进入，或直接点二级分类精确筛选。</div>

    <!-- 加载骨架 -->
    <div v-if="loading" class="hm-skeleton">
      <div v-for="i in 4" :key="i" class="hm-skel-row apple-skeleton"></div>
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="hm-state">
      <div class="icon">⚠️</div>
      <div class="title">加载失败</div>
      <div class="desc">{{ error }}</div>
      <Button label="重试" icon="pi pi-refresh" @click="load" />
    </div>

    <!-- 空态 -->
    <div v-else-if="!tree.length" class="hm-state">
      <div class="icon">🗂️</div>
      <div class="title">暂无分类</div>
      <div class="desc">平台还没有配置分类。</div>
    </div>

    <template v-else>
      <!-- 一级分类卡片 -->
      <div class="cat-grid">
        <div
          v-for="c in tree" :key="c.id"
          class="cat-card" :class="{ on: activeRoot === c.id }"
          @click="selectRoot(c)"
        >
          <div class="ico">{{ c.icon || '🗂️' }}</div>
          <div class="nm">{{ c.name }}</div>
          <div class="ct">{{ countOf(c) }} 件在售</div>
          <div class="cat-chips">
            <span
              v-for="s in c.children" :key="s.id"
              class="chip" :class="{ on: activeChild === s.id }"
              @click.stop="selectChild(c, s)"
            >{{ s.name }}</span>
          </div>
        </div>
      </div>

      <!-- 筛选结果 -->
      <div class="cat-result">
        <div class="title-bar">
          <h2 style="font-size:18px;">
            {{ activeLabel }}
            <span class="muted" style="font-weight:400;">（{{ total }} 件）</span>
          </h2>
          <Button v-if="activeRoot || activeChild" label="清除筛选" size="small" severity="secondary" @click="clearFilter" />
        </div>

        <div v-if="itemsLoading" class="hm-skeleton">
          <div v-for="i in 3" :key="i" class="hm-skel-row apple-skeleton"></div>
        </div>

        <div v-else-if="itemsError" class="hm-state">
          <div class="icon">⚠️</div>
          <div class="title">加载商品失败</div>
          <div class="desc">{{ itemsError }}</div>
          <Button label="重试" icon="pi pi-refresh" @click="loadItems" />
        </div>

        <div v-else-if="!items.length" class="hm-state">
          <div class="icon">📦</div>
          <div class="title">该分类下暂无在售商品</div>
          <div class="desc">换个分类看看，或者过几天再来。</div>
        </div>

        <div v-else class="grid">
          <div v-for="it in items" :key="it.id" class="card" @click="open(it)">
            <div class="card-thumbwrap">
              <div class="thumb">{{ iconFor(it.category) }}</div>
              <span class="cat-tag">{{ it.category }}</span>
              <span v-if="it.status !== '在售'" class="stamp-badge">{{ it.status }}</span>
            </div>
            <div class="card-body">
              <div class="card-title">{{ it.title }}</div>
              <div class="card-meta">{{ it.condition }} · {{ it.seller_campus || '校内' }}</div>
              <div class="card-price"><b>¥</b>{{ money(it.price) }}</div>
              <div class="card-bottom">{{ it.seller_nickname }} · {{ it.view_count }} 次浏览</div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import api from '../api.js';
import { iconFor, money } from '../util.js';
import { openItem } from '../ui.js';

const route = useRoute();
const router = useRouter();

const tree = ref([]);
const loading = ref(false);
const error = ref('');

const activeRoot = ref(0);
const activeChild = ref(0);
const activeLabel = ref('全部在售商品');

const items = ref([]);
const total = ref(0);
const itemsLoading = ref(false);
const itemsError = ref('');

function countOf(c) {
  // 由后端 tree 附带的 item_count 可选；缺失时用 0 兜底
  if (typeof c.item_count === 'number') return c.item_count;
  return (c.children || []).reduce((n, s) => n + (s.item_count || 0), 0);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.get('/categories');
    tree.value = data.categories || [];
    // 从 URL 恢复筛选（?root=&child=）
    const r = Number(route.query.root) || 0;
    const c = Number(route.query.child) || 0;
    if (r) activeRoot.value = r;
    if (c) activeChild.value = c;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function selectRoot(c) {
  activeRoot.value = c.id;
  activeChild.value = 0;
  activeLabel.value = c.name;
  loadItems();
  router.replace({ query: { root: c.id } });
}

function selectChild(root, child) {
  activeRoot.value = root.id;
  activeChild.value = child.id;
  activeLabel.value = `${root.name} · ${child.name}`;
  loadItems();
  router.replace({ query: { root: root.id, child: child.id } });
}

function clearFilter() {
  activeRoot.value = 0;
  activeChild.value = 0;
  activeLabel.value = '全部在售商品';
  loadItems();
  router.replace({ query: {} });
}

async function loadItems() {
  itemsLoading.value = true;
  itemsError.value = '';
  try {
    const qs = new URLSearchParams({ pageSize: '24', status: '在售' });
    // 二级优先，一级会由后端自动包含其所有子分类
    const cid = activeChild.value || activeRoot.value;
    if (cid) qs.set('category_id', String(cid));
    const data = await api.get('/items?' + qs.toString());
    items.value = data.items;
    total.value = data.total;
  } catch (e) {
    itemsError.value = e.message;
  } finally {
    itemsLoading.value = false;
  }
}

function open(it) {
  openItem(it.id, items.value.map((x) => ({ id: x.id, title: x.title })));
}

onMounted(async () => {
  await load();
  if (activeChild.value) {
    const root = tree.value.find((c) => (c.children || []).some((s) => s.id === activeChild.value));
    const child = root?.children.find((s) => s.id === activeChild.value);
    if (root && child) activeLabel.value = `${root.name} · ${child.name}`;
  } else if (activeRoot.value) {
    const root = tree.value.find((c) => c.id === activeRoot.value);
    if (root) activeLabel.value = root.name;
  }
  loadItems();
});
</script>

<style scoped>
.cat-card.on { box-shadow: 0 0 0 2px var(--tint), var(--shadow-card); }
.cat-result { margin-top: var(--sp-8); }
</style>
