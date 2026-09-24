<template>
  <div class="wrap hm-page">
    <div class="hm-title">举报中心</div>
    <div class="hm-sub">发现虚假描述、违禁物品或恶意行为，可以在这里提交举报。</div>

    <div class="seg" style="margin-bottom:20px;">
      <button class="seg-btn" :class="{ on: tab === 'mine' }" @click="tab = 'mine'">我的举报</button>
      <button v-if="isAdmin" class="seg-btn" :class="{ on: tab === 'admin' }" @click="tab = 'admin'; load()">审核队列</button>
    </div>

    <!-- 提交举报 -->
    <div class="panel">
      <div class="title-bar"><h2 style="font-size:18px;">提交举报</h2></div>
      <div class="rep-form">
        <label class="field">
          <span>举报对象类型</span>
          <Select v-model="form.target_type" :options="typeOptions" optionLabel="label" optionValue="value" />
        </label>
        <label class="field">
          <span>对象 ID</span>
          <InputText v-model="form.target_id" placeholder="商品 ID 或用户 ID" />
        </label>
        <label class="field">
          <span>举报原因</span>
          <Select v-model="form.reason" :options="reasons" placeholder="请选择" />
        </label>
        <label class="field" style="grid-column: 1 / -1;">
          <span>补充说明（选填）</span>
          <Textarea v-model="form.detail" rows="3" autoResize maxlength="500" placeholder="请描述具体情况，便于平台核实…" />
        </label>
      </div>
      <Message v-if="formError" severity="error" :closable="false" style="margin-bottom:12px;">{{ formError }}</Message>
      <Message v-if="formOk" severity="success" :closable="false" style="margin-bottom:12px;">{{ formOk }}</Message>
      <Button label="提交举报" icon="pi pi-flag" :loading="submitting" @click="submit" />
    </div>

    <!-- 统计 -->
    <div v-if="counts" class="stat-cards">
      <div class="stat-card"><div class="num">{{ counts.pending }}</div><div class="lbl">待处理</div></div>
      <div class="stat-card"><div class="num">{{ counts.approved }}</div><div class="lbl">已通过</div></div>
      <div class="stat-card"><div class="num">{{ counts.rejected }}</div><div class="lbl">已驳回</div></div>
    </div>

    <!-- 加载骨架 -->
    <div v-if="loading" class="hm-skeleton">
      <div v-for="i in 3" :key="i" class="hm-skel-row apple-skeleton"></div>
    </div>

    <!-- 无权限 -->
    <div v-else-if="needLogin" class="hm-state">
      <div class="icon">🔒</div>
      <div class="title">需要登录</div>
      <div class="desc">登录后才能提交和查看举报。</div>
      <Button label="去登录" @click="$router.push({ path: '/login', query: { redirect: '/reports' } })" />
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="hm-state">
      <div class="icon">⚠️</div>
      <div class="title">加载失败</div>
      <div class="desc">{{ error }}</div>
      <Button label="重试" icon="pi pi-refresh" @click="load" />
    </div>

    <!-- 空态 -->
    <div v-else-if="!reports.length" class="hm-state">
      <div class="icon">🛡️</div>
      <div class="title">{{ tab === 'admin' ? '审核队列已清空' : '还没有提交过举报' }}</div>
      <div class="desc">{{ tab === 'admin' ? '所有举报都已处理完毕。' : '遇到问题商品或用户时，可在上方提交举报。' }}</div>
    </div>

    <!-- 举报列表 -->
    <div v-else class="hm-list">
      <div v-for="r in reports" :key="r.id" class="hm-item">
        <div class="hm-item-main">
          <div class="rep-top">
            <div class="hm-item-title">{{ r.reason }}
              <span class="rep-target">{{ r.target_type === 'item' ? '商品' : '用户' }}：{{ r.target_name || ('#' + r.target_id) }}</span>
            </div>
            <Tag :value="statusText(r.status)" :severity="statusSeverity(r.status)" />
          </div>
          <div class="hm-item-meta">
            举报人：{{ r.reporter_nickname || '我' }} · {{ r.created_at }}
            <template v-if="r.handler_nickname"> · 处理人：{{ r.handler_nickname }}</template>
          </div>
          <div v-if="r.detail" class="hm-item-body">{{ r.detail }}</div>
          <div v-if="r.handle_note" class="rep-note">处理说明：{{ r.handle_note }}</div>

          <div v-if="isAdmin && r.status === 'pending'" class="rep-actions">
            <Button label="通过并处理" size="small" @click="review(r, 'approved')" />
            <Button label="驳回" size="small" severity="secondary" @click="review(r, 'rejected')" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import api from '../api.js';
import store from '../store.js';

const toast = useToast();
const isAdmin = computed(() => store.state.user?.role === 'admin');

const tab = ref('mine');
const reports = ref([]);
const counts = ref(null);
const reasons = ref([]);
const loading = ref(false);
const error = ref('');
const needLogin = ref(false);

const form = reactive({ target_type: 'item', target_id: '', reason: '', detail: '' });
const typeOptions = [
  { label: '商品', value: 'item' },
  { label: '用户', value: 'user' },
];
const submitting = ref(false);
const formError = ref('');
const formOk = ref('');

function statusText(s) {
  return s === 'pending' ? '待处理' : s === 'approved' ? '已通过' : '已驳回';
}
function statusSeverity(s) {
  return s === 'pending' ? 'warn' : s === 'approved' ? 'success' : 'secondary';
}

async function load() {
  loading.value = true;
  error.value = '';
  needLogin.value = false;
  try {
    const qs = tab.value === 'admin' ? '?all=1' : '';
    const data = await api.get('/reports' + qs);
    reports.value = data.reports;
    counts.value = data.counts;
    if (data.reasons?.length) reasons.value = data.reasons;
  } catch (e) {
    if (e.status === 401) needLogin.value = true;
    else error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function submit() {
  formError.value = '';
  formOk.value = '';
  if (!form.target_id) { formError.value = '请填写举报对象的 ID'; return; }
  if (!form.reason) { formError.value = '请选择举报原因'; return; }
  submitting.value = true;
  try {
    await api.post('/reports', {
      target_type: form.target_type,
      target_id: Number(form.target_id),
      reason: form.reason,
      detail: form.detail,
    });
    formOk.value = '举报已提交，平台会尽快处理。';
    form.target_id = '';
    form.reason = '';
    form.detail = '';
    tab.value = 'mine';
    load();
  } catch (e) {
    formError.value = e.message;
  } finally {
    submitting.value = false;
  }
}

async function review(r, status) {
  try {
    await api.patch('/reports/' + r.id, { status, handle_note: status === 'approved' ? '管理员已核实并处理' : '经核实不构成违规' });
    toast.add({ severity: 'success', summary: status === 'approved' ? '已通过' : '已驳回', life: 2200 });
    load();
  } catch (e) {
    toast.add({ severity: 'error', summary: '操作失败', detail: e.message, life: 3200 });
  }
}

onMounted(load);
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

.rep-form { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--sp-3); margin-bottom: var(--sp-4); }
.rep-top { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.rep-target { margin-left: 8px; font-size: var(--fs-footnote); font-weight: 500; color: var(--label-secondary); }
.rep-note { margin-top: 6px; font-size: var(--fs-footnote); color: var(--label-secondary);
  background: var(--fill-tertiary); padding: 8px 10px; border-radius: var(--radius-sm); }
.rep-actions { display: flex; gap: var(--sp-2); margin-top: var(--sp-3); }

@media (max-width: 720px) { .rep-form { grid-template-columns: 1fr; } }
</style>
