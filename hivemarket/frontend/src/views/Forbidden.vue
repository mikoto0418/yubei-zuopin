<template>
  <div class="wrap" style="max-width: 560px; padding-top: 70px; text-align:center;">
    <div class="panel" style="padding:50px 30px;">
      <i class="pi pi-ban" style="font-size:72px;color:var(--red);"></i>
      <h1 style="font-size:40px;margin:10px 0;">403 无权限</h1>
      <p class="muted" style="margin-bottom:24px;">这个页面仅管理员可访问，你没有权限进入。</p>
      <Button label="回到首页" severity="danger" @click="$router.push('/')" />
    </div>
  </div>
</template>

<script setup>
import Button from 'primevue/button';
</script>
