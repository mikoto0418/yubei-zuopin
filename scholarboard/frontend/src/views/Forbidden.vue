<template>
  <div class="page">
    <StateBlock
      state="forbidden"
      title="无访问权限"
      description="这个页面仅管理员可见，当前账号没有权限。"
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
