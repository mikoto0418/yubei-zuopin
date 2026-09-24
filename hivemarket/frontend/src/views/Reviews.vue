<template>
  <div class="wrap hm-page">
    <div class="hm-title">评价中心</div>
    <div class="hm-sub">交易完成后可互相评价，累计影响信用分。</div>

    <div class="seg" style="margin-bottom:20px;">
      <button class="seg-btn" :class="{ on: tab === 'given' }" @click="setTab('given')">我给出的</button>
      <button class="seg-btn" :class="{ on: tab === 'received' }" @click="setTab('received')">我收到的</button>
    </div>

    <!-- 概览 -->
    <div v-if="summary" class="stat-cards">
      <div class="stat-card"><div class="num">{{ summary.avg || '—' }}</div><div class="lbl">平均评分</div></div>
      <div class="stat-card"><div class="num">{{ summary.received || 0 }}</div><div class="lbl">收到评价</div></div>
      <div class="stat-card"><div class="num">{{ summary.given || 0 }}</div><div class="lbl">给出评价</div></div>
    </div>

    <!-- 待评价 -->
    <div v-if="pending.length" class="panel">
      <div class="title-bar"><h2 style="font-size:18px;">待我评价（{{ pending.length }}）</h2></div>
      <div class="hm-list">
        <div v-for="o in pending" :key="o.id" class="hm-item">
          <div class="hm-item-main">
            <div class="hm-item-title">{{ o.item_title }}</div>
            <div class="hm-item-meta">与 {{ o.reviewee_nickname }} 的交易 · {{ o.updated_at }}</div>
          </div>
          <Button label="去评价" size="small" @click="openForm(o)" />
        </div>
      </div>
    </div>

    <!-- 加载骨架 -->
    <div v-if="loading" class="hm-skeleton">
      <div v-for="i in 3" :key="i" class="hm-skel-row apple-skeleton"></div>
    </div>

    <!-- 无权限 -->
    <div v-else-if="needLogin" class="hm-state">
      <div class="icon">🔒</div>
      <div class="title">需要登录</div>
      <div class="desc">登录后即可查看你的评价记录。</div>
      <Button label="去登录" @click="$router.push({ path: '/login', query: { redirect: '/reviews' } })" />
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="hm-state">
      <div class="icon">⚠️</div>
      <div class="title">加载失败</div>
      <div class="desc">{{ error }}</div>
      <Button label="重试" icon="pi pi-refresh" @click="load" />
    </div>

    <!-- 空态 -->
    <div v-else-if="!reviews.length" class="hm-state">
      <div class="icon">⭐</div>
      <div class="title">{{ tab === 'given' ? '还没有给出过评价' : '还没有收到过评价' }}</div>
      <div class="desc">完成一笔交易后就能互相评价了。</div>
      <Button label="查看订单" @click="$router.push('/orders')" />
    </div>

    <!-- 评价列表 -->
    <div v-else class="hm-list">
      <div v-for="r in reviews" :key="r.id" class="hm-item">
        <div class="hm-item-main">
          <div class="hm-item-title">
            {{ tab === 'given' ? '我 → ' + r.reviewee_nickname : r.reviewer_nickname + ' → 我' }}
            <span class="hm-stars" style="margin-left:8px;">{{ stars(r.rating) }}</span>
            <span class="role-chip">{{ r.role === 'buyer' ? '买家评' : '卖家评' }}</span>
          </div>
          <div class="hm-item-meta">{{ r.item_title }} · {{ r.created_at }}</div>
          <div v-if="r.content" class="hm-item-body">{{ r.content }}</div>
        </div>
      </div>
    </div>

    <!-- 评价表单 -->
    <Dialog v-model:visible="formOpen" modal header="提交评价" :style="{ width: '440px' }">
      <div v-if="formTarget">
        <div class="hm-item-meta" style="margin-bottom:12px;">{{ formTarget.item_title }} · 与 {{ formTarget.reviewee_nickname }}</div>
        <div class="field-label">评分</div>
        <div class="rate-row">
          <span v-for="n in 5" :key="n" class="rate-star" :class="{ on: n <= form.rating }" @click="form.rating = n">★</span>
          <span class="muted" style="margin-left:8px;">{{ form.rating }} 分</span>
        </div>
        <div class="field-label" style="margin-top:14px;">评价内容（选填）</div>
        <Textarea v-model="form.content" rows="3" autoResize maxlength="500" placeholder="说说这次交易的体验…" />
        <Message v-if="formError" severity="error" :closable="false" style="margin-top:10px;">{{ formError }}</Message>
        <div class="hm-actions">
          <Button label="取消" severity="secondary" @click="formOpen = false" />
          <Button label="提交评价" :loading="submitting" @click="submit" />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import api from '../api.js';

const route = useRoute();
const toast = useToast();

const tab = ref('given');
const reviews = ref([]);
const summary = ref(null);
const pending = ref([]);
const loading = ref(false);
const error = ref('');
const needLogin = ref(false);

const formOpen = ref(false);
const formTarget = ref(null);
const form = reactive({ rating: 5, content: '' });
const formError = ref('');
const submitting = ref(false);

function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

async function load() {
  loading.value = true;
  error.value = '';
  needLogin.value = false;
  try {
    const data = await api.get('/reviews/mine?role=' + tab.value);
    reviews.value = data.reviews;
    summary.value = data.summary;
  } catch (e) {
    if (e.status === 401) needLogin.value = true;
    else error.value = e.message;
  } finally {
    loading.value = false;
  }
  // 待评价列表（失败不阻塞主列表）
  try {
    const p = await api.get('/reviews/pending');
    pending.value = p.orders || [];
  } catch (e) { pending.value = []; }
}

function setTab(t) { tab.value = t; load(); }

function openForm(o) {
  formTarget.value = o;
  form.rating = 5;
  form.content = '';
  formError.value = '';
  formOpen.value = true;
}

async function submit() {
  formError.value = '';
  submitting.value = true;
  try {
    await api.post('/reviews', {
      order_id: formTarget.value.id, rating: form.rating, content: form.content,
    });
    toast.add({ severity: 'success', summary: '评价已提交', detail: '感谢你的反馈', life: 2400 });
    formOpen.value = false;
    load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  load();
  // 从订单页「评价」按钮跳转时，直接打开对应订单的评价表单
  const oid = Number(route.query.order) || 0;
  if (oid) {
    api.get('/orders/' + oid).then((d) => {
      if (d.canReview) openForm({ id: oid, item_title: d.order.item_title, reviewee_nickname: d.order.seller_nickname });
    }).catch(() => {});
  }
});
</script>

<style scoped>
.seg { display: inline-flex; background: var(--fill-secondary); border-radius: var(--radius-md); padding: 2px; }
.seg-btn {
  border: none; background: transparent; cursor: pointer;
  padding: 6px 16px; border-radius: 10px;
  font-family: inherit; font-size: var(--fs-subhead); font-weight: 500; color: var(--label-secondary);
  transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
.seg-btn.on { background: var(--bg-surface); color: var(--label); font-weight: 600; box-shadow: var(--shadow-card); }

.role-chip {
  margin-left: 8px; padding: 2px 8px; border-radius: var(--radius-sm);
  background: var(--fill-secondary); color: var(--label-secondary);
  font-size: var(--fs-caption); font-weight: 500; vertical-align: 2px;
}
.field-label { font-size: var(--fs-footnote); color: var(--label-secondary); margin-bottom: 6px; }
.rate-row { display: flex; align-items: center; }
.rate-star { font-size: 30px; line-height: 1; color: var(--separator-opaque); cursor: pointer; margin-right: 2px;
  transition: color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard); }
.rate-star:hover { transform: scale(1.08); }
.rate-star.on { color: var(--orange); }
</style>
