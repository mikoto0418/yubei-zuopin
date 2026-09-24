<template>
  <div class="wrap hm-page">
    <div class="hm-title">我的订单</div>
    <div class="hm-sub">交易全流程留痕，每一步都可在详情里看到时间轴。</div>

    <div class="ord-head">
      <div class="seg">
        <button class="seg-btn" :class="{ on: role === 'buy' }" @click="setRole('buy')">我买到的</button>
        <button class="seg-btn" :class="{ on: role === 'sell' }" @click="setRole('sell')">我卖出的</button>
      </div>
      <div class="cat-chips">
        <span class="chip" :class="{ on: !status }" @click="setStatus('')">全部</span>
        <span v-for="s in ORDER_STATUSES" :key="s" class="chip" :class="{ on: status === s }" @click="setStatus(s)">{{ s }}</span>
      </div>
    </div>

    <!-- 加载骨架 -->
    <div v-if="loading" class="hm-skeleton">
      <div v-for="i in 4" :key="i" class="hm-skel-row apple-skeleton"></div>
    </div>

    <!-- 错误态 -->
    <div v-else-if="error" class="hm-state">
      <div class="icon">⚠️</div>
      <div class="title">加载失败</div>
      <div class="desc">{{ error }}</div>
      <Button label="重试" icon="pi pi-refresh" @click="load" />
    </div>

    <!-- 空态 -->
    <div v-else-if="!orders.length" class="hm-state">
      <div class="icon">📦</div>
      <div class="title">{{ role === 'buy' ? '还没有买到的订单' : '还没有卖出的订单' }}</div>
      <div class="desc">去集市逛逛，或者把闲置发出来。</div>
      <Button label="去逛集市" icon="pi pi-compass" @click="$router.push('/')" />
    </div>

    <!-- 订单卡片列表 -->
    <div v-else class="hm-list">
      <div v-for="o in orders" :key="o.id" class="hm-item ord-card">
        <div class="ord-thumb">{{ iconFor(o.item_category) }}</div>

        <div class="hm-item-main">
          <div class="ord-top">
            <a class="hm-item-title ord-link" href="#" @click.prevent="openItem(o.item_id)">
              {{ o.item_title }}
            </a>
            <Tag :value="o.status" :severity="orderStatusSeverity(o.status)" />
          </div>

          <div class="hm-item-meta">
            <span>{{ role === 'buy' ? '卖家' : '买家' }}：{{ role === 'buy' ? o.seller_nickname : o.buyer_nickname }}</span>
            <span class="dot">·</span>
            <span>¥{{ money(o.amount) }}</span>
            <span class="dot">·</span>
            <span>{{ o.created_at }}</span>
          </div>

          <div class="ord-hint">{{ orderStatusHint(o.status, role) }}</div>

          <div class="ord-actions">
            <Button
              v-for="a in orderActions(o.status, role)"
              :key="a.to"
              :label="a.label"
              size="small"
              :severity="a.severity"
              @click="transit(o, a)"
            />
            <Button label="详情/时间轴" size="small" severity="secondary" @click="openDetail(o)" />
            <Button v-if="o.status === '已完成'" label="评价" size="small" severity="secondary" icon="pi pi-star"
              @click="$router.push('/reviews?order=' + o.id)" />
            <Button label="联系对方" size="small" severity="secondary" icon="pi pi-comments" @click="chat(o)" />
          </div>
        </div>
      </div>

      <div v-if="pages > 1" class="ord-pager">
        <Button label="上一页" size="small" severity="secondary" :disabled="page <= 1" @click="goto(page - 1)" />
        <span class="muted">{{ page }} / {{ pages }}</span>
        <Button label="下一页" size="small" severity="secondary" :disabled="page >= pages" @click="goto(page + 1)" />
      </div>
    </div>

    <!-- 订单详情抽屉：状态机时间轴 -->
    <Dialog v-model:visible="detailOpen" modal :header="'订单 #' + (detail?.order?.id || '')" :style="{ width: '480px' }">
      <div v-if="detailLoading" class="hm-skeleton"><div class="hm-skel-row apple-skeleton" /></div>
      <div v-else-if="detail">
        <div class="ord-detail-head">
          <div class="hm-item-title">{{ detail.order.item_title }}</div>
          <Tag :value="detail.order.status" :severity="orderStatusSeverity(detail.order.status)" />
        </div>
        <div class="hm-item-meta" style="margin-bottom:12px;">
          ¥{{ money(detail.order.amount) }} · 我{{ detail.relation === 'buyer' ? '买' : '卖' }} · 创建于 {{ detail.order.created_at }}
        </div>

        <div class="ord-sec-title">流转时间轴</div>
        <div class="hm-timeline">
          <div v-for="(l, i) in detail.logs" :key="l.id" class="hm-tl-row">
            <div class="hm-tl-rail">
              <span class="hm-tl-dot" />
              <span v-if="i < detail.logs.length - 1" class="hm-tl-line" />
            </div>
            <div class="hm-tl-body">
              <div class="hm-tl-status">{{ l.to_status }}</div>
              <div class="hm-tl-meta">{{ l.remark }} · {{ l.operator_nickname || '系统' }} · {{ l.created_at }}</div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import api from '../api.js';
import { iconFor, money, orderStatusSeverity, orderStatusHint, orderActions, STATUS_CONFIRM_TEXT, ORDER_STATUSES } from '../util.js';
import { openItem } from '../ui.js';

const router = useRouter();
const confirm = useConfirm();
const toast = useToast();

const role = ref('buy');
const status = ref('');
const orders = ref([]);
const loading = ref(false);
const error = ref('');
const page = ref(1);
const pages = ref(1);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref(null);

// 订单里的商品 → 抽屉详情（当前订单列表作为连续浏览批次）
function open(id) { openItem(id, orders.value.map((o) => ({ id: o.item_id, title: o.item_title }))); }

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const qs = new URLSearchParams({ role: role.value, page: String(page.value), pageSize: '20' });
    if (status.value) qs.set('status', status.value);
    const data = await api.get('/orders/mine?' + qs.toString());
    orders.value = data.orders;
    pages.value = data.pages || 1;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function setRole(r) { role.value = r; page.value = 1; load(); }
function setStatus(s) { status.value = s; page.value = 1; load(); }
function goto(p) { page.value = p; load(); }

// 状态流转：走统一状态机接口，确认后提交
function transit(o, action) {
  confirm.require({
    message: STATUS_CONFIRM_TEXT[action.to] || `确认将订单变更为「${action.to}」？`,
    header: action.label,
    icon: 'pi pi-exclamation-circle',
    rejectLabel: '再想想',
    acceptLabel: action.label,
    accept: async () => {
      try {
        await api.patch(`/orders/${o.id}/status`, { status: action.to });
        toast.add({ severity: 'success', summary: '已更新', detail: `订单状态：${action.to}`, life: 2400 });
        load();
      } catch (e) {
        toast.add({ severity: 'error', summary: '操作失败', detail: e.message, life: 3200 });
      }
    },
  });
}

async function openDetail(o) {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await api.get('/orders/' + o.id);
  } catch (e) {
    toast.add({ severity: 'error', summary: '加载失败', detail: e.message, life: 3200 });
    detailOpen.value = false;
  } finally {
    detailLoading.value = false;
  }
}

async function chat(o) {
  const otherId = role.value === 'buy' ? o.seller_id : o.buyer_id;
  try {
    const data = await api.post('/messages/start', { item_id: o.item_id, seller_id: otherId });
    router.push('/chat/' + data.conversation.id);
  } catch (e) {
    toast.add({ severity: 'error', summary: '打开会话失败', detail: e.message, life: 3200 });
  }
}

onMounted(load);
</script>

<style scoped>
.ord-head { display: flex; align-items: center; gap: var(--sp-4); flex-wrap: wrap; margin-bottom: var(--sp-5); }

/* Apple 分段控件 */
.seg { display: inline-flex; background: var(--fill-secondary); border-radius: var(--radius-md); padding: 2px; }
.seg-btn {
  border: none; background: transparent; cursor: pointer;
  padding: 6px 16px; border-radius: 10px;
  font-family: inherit; font-size: var(--fs-subhead); font-weight: 500; color: var(--label-secondary);
  transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
.seg-btn.on { background: var(--bg-surface); color: var(--label); font-weight: 600; box-shadow: var(--shadow-card); }

.ord-card { align-items: stretch; }
.ord-thumb {
  width: 64px; height: 64px; flex: none; border-radius: var(--radius-md);
  background: var(--fill-tertiary); display: flex; align-items: center; justify-content: center; font-size: 30px;
}
.ord-top { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.ord-link { color: var(--label); }
.ord-link:hover { color: var(--tint); }
.ord-hint { margin-top: 6px; font-size: var(--fs-footnote); color: var(--label-secondary); }
.ord-actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-top: var(--sp-3); }
.ord-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-3); margin-top: var(--sp-5); }

.ord-detail-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
.ord-sec-title { font-size: var(--fs-footnote); font-weight: 600; color: var(--label-secondary); margin: var(--sp-4) 0 var(--sp-2); }
.dot { margin: 0 4px; opacity: .5; }
</style>
