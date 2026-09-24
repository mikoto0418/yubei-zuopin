<template>
  <div class="wrap" style="padding-top: 30px;">
    <div class="hero" style="border:none; margin-bottom:24px;">
      <div class="wrap" style="padding:0;">
        <h1 style="font-size:34px;"><i class="pi pi-megaphone" /> 求购广场</h1>
        <p>还没找到想要的？发个求购贴，让卖家来找你。</p>
      </div>
    </div>

    <div class="panel">
      <div class="title-bar"><h2>发一条求购</h2><Tag value="WANTED" severity="danger" /></div>
      <Message v-if="success" severity="success" :closable="false">{{ success }}</Message>
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <form @submit.prevent="submit" class="row" style="align-items:flex-end;">
        <label class="field" style="flex:2;"><span>求购标题 *</span>
          <InputText v-model="form.title" placeholder="如：求一台成色新的 iPad" /></label>
        <label class="field" style="flex:1;"><span>预算（元，可空）</span>
          <InputNumber v-model="form.budget" :min="0" placeholder="如 2000" /></label>
        <Button type="submit" severity="danger" label="发布求购" :loading="submitting" />
      </form>
      <label class="field" style="margin-top:10px;"><span>期望说明</span>
        <Textarea rows="2" v-model="form.description" placeholder="品牌型号、成色、报价区间等" /></label>
    </div>

    <div class="grid">
      <div class="card" v-for="w in wants" :key="w.id">
        <div class="thumb">{{ w.budget ? '💰' : '🔍' }}</div>
        <div class="card-body">
          <div style="font-weight:800;">{{ w.title }}</div>
          <div class="card-meta">
            {{ w.buyer_nickname }}@{{ w.buyer_campus }} · {{ w.status }}
          </div>
          <div class="row" style="justify-content:space-between;align-items:center;">
            <span class="card-price" v-if="w.budget">预算 ¥{{ money(w.budget) }}</span>
            <span v-else class="muted">预算面议</span>
            <Button v-if="isMine(w)" label="删除" size="small" severity="contrast" @click="del(w.id)" />
          </div>
        </div>
      </div>
    </div>
    <div class="empty" v-if="!wants.length">还没有求购贴，发一条试试～</div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import api from '../api.js';
import store from '../store.js';
import { money } from '../util.js';

const wants = ref([]);
const submitting = ref(false);
const success = ref('');
const error = ref('');
const form = reactive({ title: '', budget: null, description: '' });

function isMine(w) { return store.state.user && w.buyer_id === store.state.user.id; }

async function load() {
  const data = await api.get('/wants');
  wants.value = data.wants;
}

async function submit() {
  submitting.value = true; error.value = '';
  try {
    await api.post('/wants', { title: form.title, description: form.description, budget: form.budget });
    form.title = ''; form.description = ''; form.budget = null;
    success.value = '求购发布成功！';
    setTimeout(() => (success.value = ''), 2500);
    load();
  } catch (e) { error.value = e.message; }
  finally { submitting.value = false; }
}

async function del(id) {
  if (!window.confirm('确定删除这条求购吗？')) return;
  try {
    await api.delete('/wants/' + id);
    load();
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(() => { if (!store.state.user) store.refreshMe(); load(); });
</script>
