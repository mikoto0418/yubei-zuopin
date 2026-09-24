<template>
  <div class="wrap" style="padding-top: 30px;">
    <div class="panel">
      <div class="row" style="align-items:center;gap:18px;">
        <Avatar :label="(me?.nickname || me?.username || '?').slice(0,1)" shape="square" size="xlarge" />
        <div style="flex:1;">
          <h2>{{ me?.nickname || me?.username }}</h2>
          <p class="muted">
            校区：{{ me?.campus }} · 角色：{{ me?.role === 'admin' ? '管理员' : '普通用户' }} · 注册于 {{ me?.created_at }}
          </p>
        </div>
        <Button label="收藏夹" icon="pi pi-star" severity="secondary" @click="router.push('/favorites')" />
        <Button label="我的订单" icon="pi pi-box" severity="secondary" @click="router.push('/orders')" />
      </div>
    </div>

    <div class="title-bar"><h2><i class="pi pi-upload" /> 我的发布</h2><Tag value="MY ITEMS" severity="danger" /></div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

    <DataTable :value="myItems" :loading="loading" dataKey="id" stripedRows
      :paginator="myItems.length > 8" :rows="8" responsiveLayout="scroll">
      <template #empty>你还没有发布过商品，去「发闲置」上架第一件宝贝吧～</template>

      <Column header="商品" style="width:110px;">
        <template #body="{ data }">
          <div class="mini-thumb" @click="open(data)">
            <template v-if="!firstImage(data)">{{ iconFor(data.category) }}</template>
            <img v-else :src="data.images.split(',')[0]" alt="" />
          </div>
        </template>
      </Column>

      <Column header="标题">
        <template #body="{ data }">
          <a href="#" style="text-decoration:underline;font-weight:900;" @click.prevent="open(data)">
            {{ data.title }}
          </a>
          <div class="muted">{{ data.category }} · {{ data.condition }}</div>
        </template>
      </Column>

      <Column header="价格" style="width:120px;">
        <template #body="{ data }"><span class="card-price">¥{{ money(data.price) }}</span></template>
      </Column>

      <Column header="状态" style="width:110px;">
        <template #body="{ data }">
          <Tag :value="data.status" :severity="itemStatusSeverity(data.status)" />
        </template>
      </Column>

      <Column header="浏览" style="width:90px;">
        <template #body="{ data }"><i class="pi pi-eye" /> {{ data.view_count || 0 }}</template>
      </Column>

      <Column header="操作" style="width:220px;">
        <template #body="{ data }">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <Button size="small" severity="contrast" :disabled="data.status === '已售'"
              :label="data.status === '在售' ? '下架' : (data.status === '下架' ? '重新上架' : '已售不可改')"
              @click="toggleStatus(data)" />
            <Button v-if="data.status !== '已售'" size="small" severity="secondary" label="编辑"
              @click="router.push('/item/' + data.id + '/edit')" />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import Message from 'primevue/message';
import api from '../api.js';
import store from '../store.js';
import { iconFor, money, firstImage, itemStatusSeverity } from '../util.js';
import { openItem } from '../ui.js';

const router = useRouter();
const myItems = ref([]);
// 我的发布里看详情 → 同样走右侧抽屉
function open(it) { openItem(it.id, myItems.value); }
const loading = ref(false);
const error = ref('');
const me = computed(() => store.state.user);

async function load() {
  loading.value = true;
  try {
    const data = await api.get('/items/mine');
    myItems.value = data.items;
  } finally { loading.value = false; }
}

async function toggleStatus(it) {
  error.value = '';
  const next = it.status === '在售' ? '下架' : '在售';
  try {
    await api.patch('/items/' + it.id + '/status', { status: next });
    load();
  } catch (e) { error.value = e.message; }
}

onMounted(async () => { await store.refreshMe(); load(); });
</script>

<style scoped>
.mini-thumb {
  width: 68px; height: 52px; border: 2px solid var(--black); background: var(--yellow);
  display: flex; align-items: center; justify-content: center; font-size: 24px;
  cursor: pointer; overflow: hidden;
}
.mini-thumb img { width: 100%; height: 100%; object-fit: cover; }
</style>
