<template>
  <!-- 路由 /publish 仍可达（path 未改动）：直接唤起全屏发布向导 -->
  <div class="wrap" style="padding-top: 40px;">
    <div class="panel">
      <div class="title-bar">
        <h2><i class="pi pi-plus" /> 正在打开发布向导…</h2>
        <Tag value="WIZARD" severity="danger" />
      </div>
      <p class="muted">发布已改为全屏分步向导，正在打开。若未自动打开，点下方按钮。</p>
      <div class="hm-actions">
        <Button severity="danger" label="打开发布向导" icon="pi pi-external-link" @click="reopen" />
        <Button severity="secondary" label="发求购" icon="pi pi-megaphone" @click="$router.push('/wants')" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { openPublish } from '../ui.js';

const router = useRouter();
function reopen() { openPublish('item'); }

onMounted(() => {
  openPublish('item');
  router.replace('/');
});
</script>
