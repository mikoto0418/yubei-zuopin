<template>
  <div class="wrap" style="max-width: 460px; padding-top: 50px;">
    <div class="panel">
      <div class="title-bar"><h2><i class="pi pi-sign-in" /> 登录</h2><Tag value="WELCOME BACK" severity="danger" /></div>
      <Message v-if="error" severity="warn" :closable="false">{{ error }}</Message>
      <form @submit.prevent="submit">
        <label class="field"><span>用户名</span>
          <InputText v-model="form.username" placeholder="用户名" /></label>
        <label class="field"><span>密码</span>
          <InputText type="password" v-model="form.password" placeholder="密码" /></label>
        <Button type="submit" severity="danger" style="width:100%;"
          :label="loading ? '登录中…' : '登 录'" :loading="loading" />
      </form>
      <p style="margin-top:16px;">还没有账号？<router-link to="/register" style="font-weight:800;text-decoration:underline;">去注册</router-link></p>
      <p class="muted" style="margin-top:8px;">管理员体验账号：admin / admin123</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import api from '../api.js';
import store from '../store.js';

const router = useRouter();
const route = useRoute();
const loading = ref(false);
const error = ref('');
const form = reactive({ username: '', password: '' });

async function submit() {
  loading.value = true; error.value = '';
  try {
    const data = await api.post('/auth/login', form);
    store.setAuth(data);
    router.push(route.query.redirect || '/');
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
</script>
