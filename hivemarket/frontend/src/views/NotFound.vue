<template>
  <div class="wrap" style="max-width: 560px; padding-top: 70px; text-align:center;">
    <div class="panel" style="padding:50px 30px;">
      <i class="pi pi-file-excel" style="font-size:72px;color:var(--red);"></i>
      <h1 style="font-size:40px;margin:10px 0;">404 页面未找到</h1>
      <p class="muted" style="margin-bottom:24px;">你访问的页面不存在或已被删除。</p>
      <Button label="回到首页" severity="danger" @click="$router.push('/')" />
    </div>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
</script>
