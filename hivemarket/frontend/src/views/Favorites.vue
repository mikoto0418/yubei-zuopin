<template>
  <div class="wrap" style="padding-top: 30px;">
    <div class="title-bar">
      <h2><i class="pi pi-star-fill" /> 我的收藏</h2>
      <Tag value="FAVORITES" severity="danger" />
    </div>

    <div v-if="items.length" class="grid">
      <Card v-for="it in items" :key="it.id" class="fav-card" @click="open(it)">
        <template #header>
          <div class="thumb" style="border-bottom:var(--border);">
            <template v-if="!firstImage(it)">{{ iconFor(it.category) }}</template>
            <img v-else :src="it.images.split(',')[0]" alt="" style="height:100%;width:100%;object-fit:cover;" />
          </div>
        </template>
        <template #content>
          <div class="row" style="justify-content:space-between;align-items:baseline;">
            <span class="card-price">¥{{ money(it.price) }}</span>
            <Tag :value="it.status" :severity="itemStatusSeverity(it.status)" />
          </div>
          <div style="font-weight:800;margin:6px 0;">{{ it.title }}</div>
          <div class="card-meta">{{ it.category }} · {{ it.seller_nickname }}@{{ it.seller_campus }}</div>
        </template>
      </Card>
    </div>
    <div class="empty" v-else>收藏夹是空的，去逛逛喜欢的宝贝吧～</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import api from '../api.js';
import { iconFor, money, firstImage, itemStatusSeverity } from '../util.js';
import { openItem } from '../ui.js';

const items = ref([]);
// 点击收藏卡片 → 滑出右侧抽屉（并交出列表供连续浏览）
function open(it) { openItem(it.id, items.value); }
onMounted(async () => {
  const data = await api.get('/favorites/mine');
  items.value = data.items;
});
</script>

<style scoped>
.fav-card { cursor: pointer; }
.fav-card:hover { transform: translate(-2px,-4px); box-shadow: 8px 8px 0 0 var(--black) !important; }
.fav-card :deep(.p-card-body) { padding: 14px; }
.fav-card :deep(.p-card-content) { padding: 0; }
:deep(.fav-card .thumb) { height: 160px; }
</style>
