<template>
  <div class="login">
    <div class="login__panel">
      <div class="login__brand">
        <span class="login__mark">SF</span>
        <div>
          <h1 class="login__title">ScriptForge</h1>
          <p class="sf-caption">剧本 · 小说创作工作台</p>
        </div>
      </div>

      <div class="login__switch">
        <button class="login__tab" :class="{ 'login__tab--active': mode === 'login' }" @click="mode = 'login'">登录</button>
        <button class="login__tab" :class="{ 'login__tab--active': mode === 'register' }" @click="mode = 'register'">注册</button>
      </div>

      <form class="login__form" @submit.prevent="onSubmit">
        <label class="login__field">
          <span class="sf-caption">用户名</span>
          <input v-model.trim="form.username" class="apple-input" autocomplete="username" placeholder="至少 3 位" />
        </label>

        <label class="login__field">
          <span class="sf-caption">密码</span>
          <input v-model="form.password" type="password" class="apple-input" autocomplete="current-password" placeholder="至少 6 位" />
        </label>

        <template v-if="mode === 'register'">
          <label class="login__field">
            <span class="sf-caption">昵称</span>
            <input v-model.trim="form.nickname" class="apple-input" placeholder="选填" />
          </label>
          <label class="login__field">
            <span class="sf-caption">身份</span>
            <select v-model="form.role" class="apple-input">
              <option value="writer">编剧（写自己的作品）</option>
              <option value="editor">责编（可审阅所有作品）</option>
            </select>
          </label>
        </template>

        <p v-if="error" class="login__error">{{ error }}</p>

        <button type="submit" class="apple-btn apple-btn--primary login__submit" :disabled="submitting">
          {{ submitting ? '处理中…' : mode === 'login' ? '登录' : '注册并进入' }}
        </button>
      </form>

      <div class="login__hint">
        <div class="sf-caption">演示账号（点击填入）</div>
        <div class="login__accounts">
          <button class="login__account" @click="fill('admin', 'admin123')">admin / admin123 · 管理员</button>
          <button class="login__account" @click="fill('writer1', 'writer123')">writer1 / writer123 · 编剧</button>
          <button class="login__account" @click="fill('editor1', 'editor123')">editor1 / editor123 · 责编</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../store'

const router = useRouter()
const route = useRoute()
const { login, register } = useAuth()

const mode = ref('login')
const submitting = ref(false)
const error = ref('')
const form = reactive({ username: '', password: '', nickname: '', role: 'writer' })

function fill(u, p) {
  form.username = u
  form.password = p
  error.value = ''
}

async function onSubmit() {
  error.value = ''
  if (!form.username || !form.password) {
    error.value = '请填写用户名与密码'
    return
  }
  submitting.value = true
  try {
    if (mode.value === 'login') {
      await login(form.username, form.password)
    } else {
      await register({ username: form.username, password: form.password, nickname: form.nickname, role: form.role })
    }
    router.push(route.query.redirect || { name: 'projects' })
  } catch (e) {
    error.value = e.message
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.login { min-height: 100vh; display: grid; place-items: center; padding: var(--sp-6); background: var(--bg-grouped); }

.login__panel {
  width: 100%; max-width: 420px;
  background: var(--bg-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-float);
  padding: var(--sp-8);
}

.login__brand { display: flex; align-items: center; gap: var(--sp-4); margin-bottom: var(--sp-6); }
.login__mark {
  width: 48px; height: 48px;
  border-radius: var(--radius-lg);
  background: var(--tint);
  color: #fff;
  display: grid; place-items: center;
  font-size: 17px; font-weight: 700; letter-spacing: -0.02em;
}
.login__title { font-size: var(--fs-title2); font-weight: 600; letter-spacing: -0.02em; }

.login__switch {
  display: flex; gap: var(--sp-1);
  padding: 3px; background: var(--fill-secondary);
  border-radius: var(--radius-full);
  margin-bottom: var(--sp-6);
}
.login__tab {
  flex: 1; height: 32px;
  border: none; border-radius: var(--radius-full);
  background: transparent;
  font-family: inherit; font-size: var(--fs-subhead);
  color: var(--label-secondary); cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.login__tab--active { background: var(--bg-surface); color: var(--label); font-weight: 600; box-shadow: var(--shadow-card); }

.login__form { display: flex; flex-direction: column; gap: var(--sp-4); }
.login__field { display: flex; flex-direction: column; gap: var(--sp-2); }
.login__field .apple-input { height: 44px; }
.login__field select.apple-input { cursor: pointer; }

.login__error {
  font-size: var(--fs-footnote);
  color: var(--red);
  background: rgba(255, 59, 48, 0.08);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-sm);
}

.login__submit { height: 44px; width: 100%; }

.login__hint { margin-top: var(--sp-6); padding-top: var(--sp-5); border-top: 1px solid var(--separator); }
.login__accounts { display: flex; flex-direction: column; gap: var(--sp-1); margin-top: var(--sp-2); }
.login__account {
  text-align: left; border: none; background: transparent;
  padding: var(--sp-1) 0; font-size: var(--fs-footnote);
  color: var(--tint); cursor: pointer; font-family: var(--font-mono);
}
.login__account:hover { text-decoration: underline; }
</style>
