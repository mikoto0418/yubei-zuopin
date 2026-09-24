<template>
  <div class="wrap" style="max-width: 720px; padding-top: 30px;">
    <div class="panel">
      <div class="title-bar">
        <h2><i class="pi pi-pencil" /> 编辑商品</h2>
        <Tag value="EDIT" severity="danger" />
      </div>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <Message v-if="forbidden" severity="error" :closable="false">{{ forbidden }}</Message>
      <div class="empty" v-else-if="!item">加载中…</div>

      <form v-else @submit.prevent="submit">
        <label class="field"><span>标题 *</span>
          <InputText v-model="form.title" placeholder="一句话说清楚卖什么" /></label>

        <div class="row">
          <label class="field col"><span>分类</span>
            <Select v-model="form.category" :options="categories" /></label>
          <label class="field col"><span>成色</span>
            <Select v-model="form.condition" :options="conditions" /></label>
        </div>

        <label class="field"><span>价格（元）</span>
          <InputNumber v-model="form.price" :min="0" :minFractionDigits="2" :maxFractionDigits="2" /></label>

        <label class="field"><span>商品描述</span>
          <Textarea rows="5" v-model="form.description" placeholder="详细描述成色、使用情况、交易方式等" /></label>

        <label class="field"><span>图片 URL（可填多个，用英文逗号分隔；不填则自动显示分类占位图）</span>
          <InputText v-model="imagesText" placeholder="https://…,https://…" /></label>

        <div class="row">
          <Button type="submit" severity="danger" style="flex:1;"
            :label="submitting ? '保存中…' : '保 存 更 改'" :loading="submitting" />
          <Button type="button" label="返回我的发布" severity="secondary" @click="$router.push('/mine')" />
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Message from 'primevue/message';
import api from '../api.js';
import store from '../store.js';
import { CONDITIONS } from '../util.js';

const route = useRoute();
const router = useRouter();
const categories = ref([]);
const conditions = CONDITIONS;
const item = ref(null);
const error = ref('');
const forbidden = ref('');
const submitting = ref(false);
const imagesText = ref('');
const form = reactive({ title: '', category: '', condition: '', price: null, description: '' });

onMounted(async () => {
  const c = await api.get('/items/categories');
  categories.value = c.categories;
  if (!store.state.user) await store.refreshMe();
  try {
    const data = await api.get('/items/' + route.params.id);
    item.value = data.item;
    if (data.item.seller_id !== store.state.user?.id) {
      forbidden.value = '你无权编辑他人的商品。';
      return;
    }
    form.title = data.item.title;
    form.category = data.item.category;
    form.condition = data.item.condition;
    form.price = data.item.price;
    form.description = data.item.description || '';
    imagesText.value = data.item.images || '';
  } catch (e) { error.value = e.message; }
});

async function submit() {
  submitting.value = true; error.value = '';
  try {
    const images = imagesText.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    await api.put('/items/' + route.params.id, { ...form, images });
    router.push('/item/' + route.params.id);
  } catch (e) { error.value = e.message; }
  finally { submitting.value = false; }
}
</script>
