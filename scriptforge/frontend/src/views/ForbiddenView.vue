<template>
  <div class="fb">
    <div class="fb__card">
      <div class="fb__art">🔒</div>
      <h1 class="fb__title">403</h1>
      <p class="fb__sub">你没有访问这个页面的权限。</p>
      <p class="sf-caption fb__hint">审阅台仅责编与管理员可见；管理概览仅管理员可见。</p>
      <div class="fb__ops">
        <button class="apple-btn apple-btn--primary" @click="$router.push({ name: 'projects' })">回到我的作品</button>
        <button class="apple-btn apple-btn--secondary" @click="$router.back()">返回上一页</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fb { min-height: 100vh; display: grid; place-items: center; padding: var(--sp-6); background: var(--bg-grouped); }
.fb__card {
  text-align: center; max-width: 420px;
  background: var(--bg-surface); border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card); padding: var(--sp-10) var(--sp-8);
}
.fb__art {
  width: 64px; height: 64px; margin: 0 auto var(--sp-5);
  border-radius: var(--radius-lg); background: var(--fill-secondary);
  display: grid; place-items: center; font-size: 28px;
}
.fb__title { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; }
.fb__sub { font-size: var(--fs-body); color: var(--label-secondary); margin-top: var(--sp-2); }
.fb__hint { margin-top: var(--sp-3); }
.fb__ops { display: flex; gap: var(--sp-2); justify-content: center; margin-top: var(--sp-6); }
</style>
