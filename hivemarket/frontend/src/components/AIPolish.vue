<template>
  <div class="ai-polish">
    <div class="title-bar" style="margin-bottom:8px;">
      <h3 style="font-size:18px;"><i class="pi pi-sparkles" /> AI 一键润色标题 + 卖点</h3>
      <span class="stripe">BEE COPY</span>
    </div>
    <label class="field"><span>商品背景（分类 + 一句话描述）</span>
      <Textarea rows="2" v-model="background" autoResize
        :placeholder="defaultHint" @keydown.enter.exact.prevent="generate" /></label>
    <Button type="button" severity="contrast" :label="loading ? 'AI 生成中…' : '生成精炼标题 + 3 条卖点'"
      :loading="loading" @click="generate" />
    <p class="muted" style="margin-top:8px;">云端大模型生成，失败自动回退本地模板。</p>

    <Dialog :visible="previewOpen" header="AI 润色预览" :modal="true" :draggable="false"
      :style="{ width: '480px', maxWidth: '94vw' }" @update:visible="previewOpen = false">
      <p class="muted">确认后回填到表单：标题 + 卖点（写入描述）。</p>
      <div class="ai-preview">
        <div class="ai-title"><i class="pi pi-tag" /> {{ result?.title }}</div>
        <ul v-if="result?.sellingPoints?.length">
          <li v-for="(s, i) in result.sellingPoints" :key="i">{{ s }}</li>
        </ul>
        <div class="ai-src">引擎：{{ result?.source === 'llm' ? '云端大模型' : '本地模板' }}</div>
      </div>
      <div class="hm-actions">
        <Button label="重新生成" severity="secondary" @click="previewOpen = false" />
        <Button label="应用到我上面表单" severity="danger" @click="apply" />
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Dialog from 'primevue/dialog';
import api from '../api.js';

const props = defineProps({
  category: { type: String, default: '其他' },
  defaultHint: { type: String, default: '如：毕业急出 9 成新苹果 iPad，带原装笔和壳' },
});
const emit = defineEmits(['apply']);

const background = ref('');
const loading = ref(false);
const previewOpen = ref(false);
const result = ref(null);

async function generate() {
  if (!background.value.trim()) { alert('请先填一句商品背景描述'); return; }
  loading.value = true;
  try {
    result.value = await api.post('/ai/item-copy', { category: props.category, background: background.value });
    previewOpen.value = true;
  } catch (e) {
    alert('AI 润色失败：' + e.message);
  } finally { loading.value = false; }
}

function apply() {
  previewOpen.value = false;
  emit('apply', result.value);
}
</script>

<style scoped>
.ai-polish {
  background: var(--yellow);
  border: var(--border);
  box-shadow: var(--shadow-sm);
  padding: 16px;
  margin-bottom: 16px;
}
</style>
