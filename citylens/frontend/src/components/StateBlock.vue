<!-- 五态占位：加载骨架 / 空态 / 错误重试 / 无权限 / 内容插槽。
     所有列表页共用，保证每页状态表现一致。 -->
<script setup>
defineProps({
  loading: Boolean,
  error: { type: String, default: '' },
  forbidden: Boolean,
  empty: Boolean,
  skeletonRows: { type: Number, default: 6 },
  emptyTitle: { type: String, default: '暂无数据' },
  emptyDesc: { type: String, default: '' },
  emptyAction: { type: String, default: '' },
})

const emit = defineEmits(['retry', 'action'])
</script>

<template>
  <!-- 加载：骨架屏，不用转圈 -->
  <div v-if="loading" class="cl-card">
    <div v-for="i in skeletonRows" :key="i" class="apple-skeleton cl-skeleton-row" />
  </div>

  <!-- 无权限 -->
  <div v-else-if="forbidden" class="cl-card cl-center-state">
    <el-icon class="cl-state-icon"><Lock /></el-icon>
    <div class="cl-state-title">没有访问权限</div>
    <div class="cl-state-desc">当前账号无权查看该模块，请联系管理员开通。</div>
    <el-button @click="$router.push('/map')">返回地图</el-button>
  </div>

  <!-- 错误重试 -->
  <div v-else-if="error" class="cl-card cl-center-state">
    <el-icon class="cl-state-icon"><CircleCloseFilled /></el-icon>
    <div class="cl-state-title">加载失败</div>
    <div class="cl-state-desc">{{ error }}</div>
    <el-button type="primary" @click="emit('retry')">重试</el-button>
  </div>

  <!-- 空态 -->
  <div v-else-if="empty" class="cl-card cl-center-state">
    <el-icon class="cl-state-icon"><DocumentRemove /></el-icon>
    <div class="cl-state-title">{{ emptyTitle }}</div>
    <div v-if="emptyDesc" class="cl-state-desc">{{ emptyDesc }}</div>
    <el-button v-if="emptyAction" type="primary" @click="emit('action')">{{ emptyAction }}</el-button>
  </div>

  <slot v-else />
</template>
