<template>
  <div class="wrap" style="max-width: 480px; padding-top: 40px;">
    <div class="panel">
      <div class="title-bar"><h2><i class="pi pi-user-plus" /> 注册</h2><Tag value="NEW BEE" severity="danger" /></div>
      <Message v-if="error" severity="warn" :closable="false">{{ error }}</Message>
      <form @submit.prevent="submit">
        <label class="field"><span>用户名（3-20位字母/数字/下划线）</span>
          <InputText v-model="form.username" placeholder="用户名" /></label>
        <label class="field"><span>昵称</span>
          <InputText v-model="form.nickname" placeholder="昵称（留空则用用户名）" /></label>
        <label class="field"><span>我的校区</span>
          <Select v-model="form.campus" :options="campuses" /></label>
        <label class="field"><span>密码（至少6位）</span>
          <InputText type="password" v-model="form.password" placeholder="密码" /></label>
        <label class="field"><span>确认密码</span>
          <InputText type="password" v-model="form.confirm" placeholder="再次输入密码" /></label>
        <Button type="submit" severity="danger" style="width:100%;"
          :label="loading ? '注册中…' : '注 册'" :loading="loading" />
      </form>
      <p style="margin-top:16px;">已有账号？<router-link to="/login" style="font-weight:800;text-decoration:underline;">去登录</router-link></p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import api from '../api.js';
import store from '../store.js';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const campuses = ['东区', '西区', '南区', '北区', '未填写'];
const form = reactive({ username: '', nickname: '', campus: '东区', password: '', confirm: '' });

async function submit() {
  if (form.password !== form.confirm) { error.value = '两次输入的密码不一致'; return; }
  loading.value = true; error.value = '';
  try {
    const data = await api.post('/auth/register', {
      username: form.username, nickname: form.nickname, campus: form.campus, password: form.password,
    });
    store.setAuth(data);
    router.push('/');
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
</script>
