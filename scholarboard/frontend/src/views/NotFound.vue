<template>
  <div class="page">
    <StateBlock
      state="notfound"
      title="页面不存在"
      description="你访问的地址可能已被移动或删除。"
      action="返回工作台"
      @action="router.push('/home')"
    />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import StateBlock from '../components/StateBlock.vue';

const router = useRouter();
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: grid; place-items: center;
  background: var(--bg-grouped);
}
</style>
