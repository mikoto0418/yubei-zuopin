<template>
  <!-- 加载态：骨架屏（Apple 规范要求用骨架，不用转圈） -->
  <div v-if="state === 'loading'" class="sf-card">
    <div v-for="i in rows" :key="i" class="sf-skeleton-row" :style="{ width: i % 3 === 0 ? '60%' : '100%' }"></div>
  </div>

  <!-- 空态：插图 + 一句说明 + 一个行动按钮 -->
  <div v-else-if="state === 'empty'" class="sf-empty">
    <div class="sf-empty__art">{{ art }}</div>
    <div class="apple-headline">{{ title }}</div>
    <div class="apple-subhead">{{ description }}</div>
    <button v-if="actionText" class="apple-btn apple-btn--primary" @click="$emit('action')">
      {{ actionText }}
    </button>
  </div>

  <!-- 错误态：说明 + 重试 -->
  <div v-else-if="state === 'error'" class="sf-empty">
    <div class="sf-empty__art">!</div>
    <div class="apple-headline">出错了</div>
    <div class="apple-subhead">{{ error || '请求失败，请稍后重试' }}</div>
    <button class="apple-btn apple-btn--primary" @click="$emit('retry')">重试</button>
  </div>

  <!-- 无权限态 -->
  <div v-else-if="state === 'forbidden'" class="sf-empty">
    <div class="sf-empty__art">🔒</div>
    <div class="apple-headline">无访问权限</div>
    <div class="apple-subhead">{{ description || '当前账号没有查看这部分内容的权限。' }}</div>
  </div>

  <slot v-else />
</template>

<script setup>
defineProps({
  state: { type: String, default: 'ready' },   // loading / empty / error / forbidden / ready
  rows: { type: Number, default: 4 },
  art: { type: String, default: '📄' },
  title: { type: String, default: '这里还是空的' },
  description: { type: String, default: '还没有内容，先创建一条吧。' },
  actionText: { type: String, default: '' },
  error: { type: String, default: '' },
})
defineEmits(['action', 'retry'])
</script>
