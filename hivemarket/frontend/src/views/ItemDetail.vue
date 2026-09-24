<template>
  <!-- 路由 /item/:id 仍可达（path 未改动）：直接以右侧抽屉形态呈现商品详情 -->
  <div class="wrap" style="padding-top: 40px;">
    <div class="panel">
      <div class="title-bar">
        <h2><i class="pi pi-shopping-bag" /> 正在打开宝贝详情…</h2>
        <Tag value="DRAWER" severity="danger" />
      </div>
      <p class="muted">商品详情已改为右侧抽屉形态，正在滑出。若未自动打开，点下方按钮。</p>
      <div class="hm-actions">
        <Button severity="danger" label="打开详情抽屉" icon="pi pi-external-link" @click="reopen" />
        <Button severity="secondary" label="回集市" icon="pi pi-th-large" @click="backHome" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { openItem } from '../ui.js';

const route = useRoute();
const router = useRouter();
const id = computed(() => route.params.id);

function reopen() { openItem(id.value); }
function backHome() { router.push('/'); }

function boot() {
  // 直链进入：抽屉呈现，同时把地址退回集市（避免抽屉与页面双份详情）
  openItem(id.value);
  router.replace('/');
}

onMounted(boot);
watch(id, (v) => { if (v) boot(); });
</script>
