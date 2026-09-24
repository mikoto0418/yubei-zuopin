<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="cl-page" style="display: grid; place-items: center">
    <div class="cl-card cl-center-state" style="max-width: 420px">
      <el-icon class="cl-state-icon"><Compass /></el-icon>
      <div class="cl-state-title">404 · 页面不存在</div>
      <div class="cl-state-desc">
        你访问的地址 <code>{{ $route.fullPath }}</code> 不存在或已被移除。
      </div>
      <div style="display: flex; gap: 8px; justify-content: center">
        <el-button type="primary" @click="router.push('/map')">返回地图</el-button>
        <el-button @click="router.back()">返回上一页</el-button>
      </div>
    </div>
  </div>
</template>
