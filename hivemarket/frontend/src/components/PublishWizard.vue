<template>
  <!-- 全屏发布向导：1 基本信息 → 2 价格成色 → 3 AI 生成描述 → 4 预览确认 → 5 发布 -->
  <Teleport to="body">
    <Transition name="wz">
      <div v-if="ui.publishOpen" class="wz-root">
        <!-- 顶部：品牌 + 步骤指示器 + 关闭 -->
        <header class="wz-top">
          <div class="wz-top-left">
            <span class="wz-brand">Hive<em>Market</em></span>
            <span class="wz-mode">发布闲置 · 全屏向导</span>
          </div>
          <ol class="wz-steps">
            <li v-for="(s, i) in steps" :key="s.key"
                :class="{ 'is-on': step === i, 'is-done': step > i }"
                @click="goto(i)">
              <span class="wz-stepnum">{{ step > i ? '✓' : i + 1 }}</span>
              <span class="wz-steplabel">{{ s.label }}</span>
            </li>
          </ol>
          <button class="wz-quit" title="退出向导" @click="quit"><i class="pi pi-times" /></button>
        </header>

        <!-- 步骤主体 -->
        <main class="wz-main">
          <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

          <!-- 1 基本信息 -->
          <section v-if="step === 0" class="wz-pane">
            <h2 class="wz-h">先说说你要卖什么</h2>
            <p class="wz-sub">标题写清楚，买家一眼就能看懂。</p>
            <label class="field"><span>商品标题 *</span>
              <InputText v-model="form.title" placeholder="如：九成新 iPad Air 5 64G 带原装笔" /></label>
            <label class="field"><span>所属分类</span>
              <Select v-model="form.category" :options="categories" /></label>
            <label class="field"><span>图片 URL（可多个，英文逗号分隔；留空显示分类占位图）</span>
              <InputText v-model="form.images" placeholder="https://…,https://…" /></label>
          </section>

          <!-- 2 价格成色 -->
          <section v-if="step === 1" class="wz-pane">
            <h2 class="wz-h">定个价，标个成色</h2>
            <p class="wz-sub">校园互淘，价格实在更容易出手。</p>
            <div class="row">
              <label class="field col"><span>价格（元）</span>
                <InputNumber v-model="form.price" :min="0" placeholder="如 88" /></label>
              <label class="field col"><span>成色</span>
                <Select v-model="form.condition" :options="conditions" /></label>
            </div>
            <div class="wz-chips">
              <span class="wz-chiplabel">快捷定价</span>
              <button v-for="p in quickPrices" :key="p" class="wz-chip" type="button"
                      @click="form.price = p">¥{{ p }}</button>
            </div>
          </section>

          <!-- 3 AI 生成描述 -->
          <section v-if="step === 2" class="wz-pane">
            <h2 class="wz-h"><i class="pi pi-sparkles" /> 让 AI 帮你写描述</h2>
            <p class="wz-sub">填几个卖点关键词，AI 生成一段吸引人的商品描述；也可以自己写。</p>
            <div class="wz-ai">
              <label class="field"><span>卖点关键词（逗号分隔，可空）</span>
                <InputText v-model="aiKeywords" placeholder="如：全新, 低价, 配件齐全" /></label>
              <Button severity="contrast" :label="aiLoading ? 'AI 生成中…' : '生成更吸引人的描述'"
                :loading="aiLoading" @click="genDesc" />
              <p class="muted" style="margin-top:8px;">
                未配置 LLM 密钥时使用本地文案模板，接入后实时调用大模型。
              </p>
            </div>
            <AIPolish :category="form.category" @apply="applyPolish" />

            <label class="field"><span>商品描述</span>
              <Textarea rows="7" v-model="form.description"
                placeholder="详细描述成色、使用情况、交易方式等" /></label>
          </section>

          <!-- 4 预览确认 -->
          <section v-if="step === 3" class="wz-pane">
            <h2 class="wz-h">确认一下，就要上架了</h2>
            <p class="wz-sub">右侧是买家看到的样子。</p>
            <div class="wz-preview">
              <div class="wz-pv-hero">
                <template v-if="!firstImage(form)">{{ iconFor(form.category) }}</template>
                <img v-else :src="form.images.split(',')[0]" alt="" />
                <span class="wz-pv-cat">{{ form.category }}</span>
              </div>
              <div class="wz-pv-body">
                <div class="wz-pv-price">¥{{ money(form.price) }}</div>
                <h3 class="wz-pv-title">{{ form.title || '（未填标题）' }}</h3>
                <div class="wz-pv-meta">{{ form.category }} · {{ form.condition }}</div>
                <div class="wz-pv-desc">
                  <Markdown :source="form.description || '_暂无描述_' " />
                </div>
              </div>
            </div>
            <ul class="wz-check">
              <li><b>标题</b>{{ form.title || '未填' }}</li>
              <li><b>价格</b>¥{{ money(form.price) }}</li>
              <li><b>成色</b>{{ form.condition }}</li>
              <li><b>图片</b>{{ imageCount }} 张</li>
            </ul>
          </section>

          <!-- 5 发布 -->
          <section v-if="step === 4" class="wz-pane wz-pane-final">
            <div v-if="!published" class="wz-final">
              <i class="pi pi-upload wz-final-icon" />
              <h2 class="wz-h">一切就绪</h2>
              <p class="wz-sub">点击下方按钮，把宝贝放进集市。</p>
            </div>
            <div v-else class="wz-final">
              <i class="pi pi-check-circle wz-final-icon wz-ok" />
              <h2 class="wz-h">发布成功！</h2>
              <p class="wz-sub">你的宝贝已经出现在集市里了。</p>
              <div class="wz-final-actions">
                <Button severity="danger" label="再发一件" @click="resetAll" />
                <Button severity="secondary" label="去看看" @click="quit" />
              </div>
            </div>
          </section>
        </main>

        <!-- 底部导航 -->
        <footer class="wz-foot">
          <Button severity="secondary" label="上一步" :disabled="step === 0 || published" @click="prev" />
          <span class="wz-foot-pos">第 {{ step + 1 }} / {{ steps.length }} 步</span>
          <Button v-if="step < steps.length - 1" severity="danger" label="下一步" @click="next" />
          <Button v-else severity="danger" :label="published ? '已发布' : (submitting ? '发布中…' : '发 布 上 架')"
            :disabled="published" :loading="submitting" @click="submit" />
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import Button from 'primevue/button';
import Message from 'primevue/message';
import api from '../api.js';
import { CONDITIONS, iconFor, money, firstImage } from '../util.js';
import { ui, closePublish } from '../ui.js';
import Markdown from './Markdown.vue';
import AIPolish from './AIPolish.vue';

const steps = [
  { key: 'basic', label: '基本信息' },
  { key: 'price', label: '价格成色' },
  { key: 'ai', label: 'AI 描述' },
  { key: 'preview', label: '预览确认' },
  { key: 'publish', label: '发布' },
];

const categories = ref([]);
const conditions = CONDITIONS;
const quickPrices = [9, 29, 59, 99, 199];

const step = ref(0);
const error = ref('');
const submitting = ref(false);
const published = ref(false);
const aiLoading = ref(false);
const aiKeywords = ref('');

const form = reactive({
  title: '', category: '数码电子', price: null,
  condition: '九成新', description: '', images: '',
});

const imageCount = computed(() => form.images.split(/[,，]/).map((s) => s.trim()).filter(Boolean).length);

function goto(i) { if (i <= step.value && !published.value) step.value = i; }
function prev() { if (step.value > 0) step.value--; }
function next() {
  error.value = '';
  if (step.value === 0 && !form.title.trim()) { error.value = '请先填写商品标题'; return; }
  if (step.value === 1 && (form.price === null || form.price === undefined)) {
    error.value = '请填写价格'; return;
  }
  if (step.value < steps.length - 1) step.value++;
}
function quit() { closePublish(); }
function resetAll() {
  form.title = ''; form.price = null; form.description = ''; form.images = '';
  form.category = '数码电子'; form.condition = '九成新';
  aiKeywords.value = '';
  published.value = false;
  error.value = '';
  step.value = 0;
}

// AI 一键润色（/ai/item-copy）：回填标题 + 卖点写入描述
function applyPolish(result) {
  if (result?.title) form.title = result.title;
  if (Array.isArray(result?.sellingPoints)) {
    const points = result.sellingPoints.map((s, i) => `${i + 1}. ${s}`).join('\n');
    form.description = form.description ? `${points}\n\n${form.description}` : points;
  }
}

async function genDesc() {
  aiLoading.value = true; error.value = '';
  try {
    const keywords = aiKeywords.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    const data = await api.post('/ai/item-desc', {
      title: form.title || '待上架商品',
      category: form.category,
      keywords,
      condition: form.condition,
      price: form.price,
    });
    form.description = data.description;
  } catch (e) { error.value = e.message; }
  finally { aiLoading.value = false; }
}

async function submit() {
  submitting.value = true; error.value = '';
  try {
    await api.post('/items', {
      title: form.title,
      description: form.description,
      price: form.price,
      category: form.category,
      condition: form.condition,
      images: form.images.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    });
    published.value = true;
  } catch (e) { error.value = e.message; }
  finally { submitting.value = false; }
}

onMounted(async () => {
  const c = await api.get('/items/categories');
  categories.value = c.categories;
});
</script>

<style scoped>
.wz-root {
  position: fixed; inset: 0; z-index: 100;
  background: var(--paper);
  display: flex; flex-direction: column;
}

/* 顶部条 */
.wz-top {
  flex: 0 0 auto; display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
  padding: 12px 20px; background: var(--black); color: #fff;
  border-bottom: 3px solid var(--yellow);
}
.wz-top-left { display: flex; align-items: baseline; gap: 12px; }
.wz-brand {
  font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;
  background: var(--yellow); color: var(--black); padding: 3px 9px; border: 2px solid #fff;
  box-shadow: 3px 3px 0 0 #fff;
}
.wz-brand em { color: var(--red); font-style: normal; }
.wz-mode { font-size: 12px; font-weight: 700; color: var(--yellow); text-transform: uppercase; letter-spacing: 1px; }

.wz-steps { display: flex; gap: 6px; flex-wrap: wrap; list-style: none; margin: 0 auto 0 0; }
.wz-steps li {
  display: flex; align-items: center; gap: 7px; padding: 5px 11px;
  border: 2px solid #555; color: #bbb; font-weight: 900; font-size: 12px;
  text-transform: uppercase; letter-spacing: .4px; cursor: default;
}
.wz-steps li.is-done { border-color: var(--yellow); color: var(--yellow); cursor: pointer; }
.wz-steps li.is-on { background: var(--red); border-color: #fff; color: #fff; box-shadow: 3px 3px 0 0 var(--yellow); transform: rotate(-1deg); }
.wz-stepnum {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border: 2px solid currentColor; font-size: 11px;
}
.wz-quit {
  width: 34px; height: 34px; border: 2px solid #fff; background: var(--red); color: #fff;
  box-shadow: 3px 3px 0 0 #fff; cursor: pointer; font-weight: 900;
  display: inline-flex; align-items: center; justify-content: center;
}
.wz-quit:hover { transform: translate(1px, 1px); box-shadow: 2px 2px 0 0 #fff; }

/* 主体 */
.wz-main { flex: 1; overflow-y: auto; padding: 30px 20px 110px; }
.wz-pane { max-width: 720px; margin: 0 auto; }
.wz-h { font-size: 30px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: -.5px; }
.wz-sub { color: var(--muted); font-weight: 700; margin-bottom: 22px; }

.wz-chips { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
.wz-chiplabel { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); }
.wz-chip {
  border: 2px solid var(--black); background: #fff; color: var(--black);
  box-shadow: 2px 2px 0 0 var(--black); padding: 4px 10px; font-weight: 900;
  cursor: pointer; font-size: 13px;
}
.wz-chip:hover { background: var(--yellow); transform: translate(1px, 1px); box-shadow: 1px 1px 0 0 var(--black); }

.wz-ai {
  background: var(--yellow); border: var(--border); box-shadow: var(--shadow-sm);
  padding: 16px; margin-bottom: 18px;
}

/* 预览 */
.wz-preview {
  display: flex; gap: 0; border: var(--border); background: #fff;
  box-shadow: var(--shadow); overflow: hidden; margin-bottom: 18px;
}
.wz-pv-hero {
  position: relative; flex: 0 0 240px; min-height: 220px; background: var(--yellow);
  border-right: var(--border); display: flex; align-items: center; justify-content: center;
  font-size: 70px; overflow: hidden;
}
.wz-pv-hero img { width: 100%; height: 100%; object-fit: cover; }
.wz-pv-cat {
  position: absolute; top: 8px; left: 8px; background: var(--black); color: var(--yellow);
  border: 2px solid var(--yellow); padding: 2px 8px; font-size: 12px; font-weight: 900;
  box-shadow: 2px 2px 0 0 var(--yellow);
}
.wz-pv-body { flex: 1; padding: 18px; min-width: 0; }
.wz-pv-price {
  display: inline-block; background: var(--yellow); border: 3px solid var(--black);
  box-shadow: 3px 3px 0 0 var(--black); padding: 3px 11px; font-size: 24px; font-weight: 900;
  color: var(--red); transform: rotate(-3deg); margin-bottom: 12px;
}
.wz-pv-title { font-size: 21px; margin-bottom: 6px; }
.wz-pv-meta { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 10px; }
.wz-pv-desc { border-top: 2px dashed var(--black); padding-top: 10px; }

.wz-check { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.wz-check li {
  border: 2px solid var(--black); background: #fff; padding: 9px 12px;
  font-weight: 700; display: flex; gap: 12px; box-shadow: 2px 2px 0 0 var(--black);
}
.wz-check b { flex: 0 0 60px; text-transform: uppercase; font-size: 12px; color: var(--red); letter-spacing: .5px; }

.wz-pane-final { text-align: center; }
.wz-final { padding: 60px 0; }
.wz-final-icon { font-size: 74px; color: var(--red); display: block; margin-bottom: 18px; }
.wz-final-icon.wz-ok { color: #2f9e44; }
.wz-final-actions { display: flex; gap: 12px; justify-content: center; margin-top: 22px; }

/* 底部导航 */
.wz-foot {
  position: fixed; left: 0; right: 0; bottom: 0;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 22px; background: var(--black); border-top: 3px solid var(--yellow);
}
.wz-foot-pos { color: var(--yellow); font-weight: 900; text-transform: uppercase; letter-spacing: 1px; font-size: 13px; }

/* 进出场 */
.wz-enter-active, .wz-leave-active { transition: opacity .2s ease, transform .25s cubic-bezier(.2,.8,.3,1); }
.wz-enter-from, .wz-leave-to { opacity: 0; transform: translateY(18px); }

@media (max-width: 720px) {
  .wz-steps { display: none; }
  .wz-preview { flex-direction: column; }
  .wz-pv-hero { flex: 0 0 180px; border-right: none; border-bottom: var(--border); }
}
</style>
