<template>
  <div class="login">
    <div class="card sb-enter">
      <div class="brand">
        <span class="mark">S</span>
        <div>
          <h1 class="sb-section-title">ScholarBoard</h1>
          <p class="sb-footnote sb-secondary">学生智能工作台</p>
        </div>
      </div>

      <n-tabs v-model:value="mode" type="segment" class="tabs">
        <n-tab-pane name="login" tab="登录" />
        <n-tab-pane name="register" tab="注册" />
      </n-tabs>

      <n-form ref="formRef" label-placement="top" :show-require-mark="false" @submit.prevent="submit">
        <n-form-item label="用户名" :validation-status="error ? 'error' : undefined">
          <n-input v-model:value="form.username" placeholder="用户名" :disabled="busy" @keyup.enter="submit" />
        </n-form-item>

        <n-form-item v-if="mode === 'register'" label="昵称（可选）">
          <n-input v-model:value="form.nickname" placeholder="怎么称呼你" :disabled="busy" @keyup.enter="submit" />
        </n-form-item>

        <n-form-item label="密码" :feedback="error" :validation-status="error ? 'error' : undefined">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            placeholder="密码"
            :disabled="busy"
            @keyup.enter="submit"
          />
        </n-form-item>

        <n-button type="primary" block size="large" :loading="busy" @click="submit">
          {{ mode === 'login' ? '登录' : '注册并进入' }}
        </n-button>
      </n-form>

      <div class="demo">
        <span class="sb-caption sb-tertiary">演示账号</span>
        <div class="demo-list">
          <button v-for="d in demos" :key="d.u" type="button" class="demo-btn" @click="fillDemo(d)">
            {{ d.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { NForm, NFormItem, NInput, NButton, NTabs, NTabPane } from 'naive-ui';
import { api, toast } from '../api';

const router = useRouter();
const formRef = ref(null);
const mode = ref('login');
const busy = ref(false);
const error = ref('');
const form = ref({ username: '', password: '', nickname: '' });

const demos = [
  { u: 'admin', p: 'admin123', label: '管理员 admin' },
  { u: 'alice', p: '123456', label: '阿梨 alice' },
  { u: 'bob', p: '123456', label: '小博 bob' },
  { u: 'carol', p: '123456', label: '晓晴 carol' },
];

function fillDemo(d) {
  mode.value = 'login';
  form.value.username = d.u;
  form.value.password = d.p;
  error.value = '';
}

async function submit() {
  if (busy.value) return;
  error.value = '';
  const { username, password, nickname } = form.value;
  if (!username.trim()) { error.value = '请输入用户名'; return; }
  if (!password) { error.value = '请输入密码'; return; }

  busy.value = true;
  try {
    const res = mode.value === 'login'
      ? await api.login({ username: username.trim(), password })
      : await api.register({ username: username.trim(), password, nickname: nickname.trim() });
    api.setAuth(res.token, res.user);
    toast(mode.value === 'login' ? '欢迎回来' : '注册成功');
    router.push('/home');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.login {
  min-height: 100vh;
  display: grid; place-items: center;
  background: var(--bg-grouped);
  padding: var(--sp-6);
}

.card {
  width: min(400px, 100%);
  background: var(--bg-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-float);
  padding: var(--sp-8) var(--sp-6) var(--sp-6);
}

.brand { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-6); }
.mark {
  width: 44px; height: 44px;
  display: grid; place-items: center;
  background: var(--tint); color: #fff;
  border-radius: var(--radius-md);
  font-size: 22px; font-weight: 700;
}

.tabs { margin-bottom: var(--sp-5); }

.demo { margin-top: var(--sp-6); padding-top: var(--sp-4); border-top: 1px solid var(--separator); }
.demo-list { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); }
.demo-btn {
  border: none;
  background: var(--fill-secondary);
  color: var(--label-secondary);
  border-radius: var(--radius-full);
  padding: 4px var(--sp-3);
  font-family: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
.demo-btn:hover { background: var(--tint-soft); color: var(--tint); }
</style>
