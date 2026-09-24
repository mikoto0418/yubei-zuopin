<template>
  <div class="nf">
    <div class="nf__card">
      <div class="nf__art">📄</div>
      <h1 class="nf__title">404</h1>
      <p class="nf__sub">这个页面不存在。</p>
      <p class="sf-caption nf__hint">你要找的页面可能已被移动或删除。</p>
      <div class="nf__ops">
        <button class="apple-btn apple-btn--primary" @click="$router.push({ name: 'projects' })">回到我的作品</button>
        <button class="apple-btn apple-btn--secondary" @click="$router.back()">返回上一页</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nf { min-height: 100vh; display: grid; place-items: center; padding: var(--sp-6); background: var(--bg-grouped); }
.nf__card {
  text-align: center; max-width: 420px;
  background: var(--bg-surface); border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card); padding: var(--sp-10) var(--sp-8);
}
.nf__art {
  width: 64px; height: 64px; margin: 0 auto var(--sp-5);
  border-radius: var(--radius-lg); background: var(--fill-secondary);
  display: grid; place-items: center; font-size: 28px;
}
.nf__title { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; }
.nf__sub { font-size: var(--fs-body); color: var(--label-secondary); margin-top: var(--sp-2); }
.nf__hint { margin-top: var(--sp-3); }
.nf__ops { display: flex; gap: var(--sp-2); justify-content: center; margin-top: var(--sp-6); }
</style>
