<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="cl-page" style="display: grid; place-items: center">
    <div class="cl-card cl-center-state" style="max-width: 420px">
      <el-icon class="cl-state-icon"><Lock /></el-icon>
      <div class="cl-state-title">403 · 无权限访问</div>
      <div class="cl-state-desc">
        当前账号（{{ $route.query.from || '普通用户' }}）没有访问该页面的权限，请联系管理员开通。
      </div>
      <div style="display: flex; gap: 8px; justify-content: center">
        <el-button type="primary" @click="router.push('/map')">返回地图</el-button>
        <el-button @click="router.back()">返回上一页</el-button>
      </div>
    </div>
  </div>
</template>
