<template>
  <!-- 右侧抽屉式商品详情：点击集市卡片滑出，支持连续浏览，不跳页 -->
  <Teleport to="body">
    <Transition name="dr">
      <div v-if="ui.drawerOpen" class="dr-root">
        <div class="dr-scrim" @click="close" />
        <aside class="dr-panel" role="dialog" aria-label="商品详情">
          <!-- 抽屉头部：关闭 + 连续浏览 -->
          <header class="dr-head">
            <span class="dr-head-title"><i class="pi pi-shopping-bag" /> 宝贝详情</span>
            <div class="dr-nav">
              <button class="dr-navbtn" :disabled="!canPrev" title="上一个" @click="step(-1)">
                <i class="pi pi-angle-up" />
              </button>
              <span class="dr-navpos">{{ posLabel }}</span>
              <button class="dr-navbtn" :disabled="!canNext" title="下一个" @click="step(1)">
                <i class="pi pi-angle-down" />
              </button>
              <button class="dr-navbtn dr-close" title="关闭抽屉" @click="close">
                <i class="pi pi-times" />
              </button>
            </div>
          </header>

          <div class="dr-body" v-if="item">
            <!-- 主图 -->
            <div class="dr-hero">
              <template v-if="!firstImage(item)">{{ iconFor(item.category) }}</template>
              <img v-else :src="item.images.split(',')[0]" alt="" />
              <span class="dr-cat">{{ item.category }}</span>
              <span class="dr-stamp" v-if="item.status === '在售'">在售</span>
            </div>

            <!-- 多图缩略 -->
            <div class="dr-thumbs" v-if="gallery.length > 1">
              <img v-for="(g, i) in gallery" :key="i" :src="g" alt=""
                   :class="{ 'is-on': i === activeImg }" @click="activeImg = i" />
            </div>

            <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
            <Message v-if="success" severity="success" :closable="false">{{ success }}</Message>

            <!-- 标题价格 -->
            <div class="dr-titleblock">
              <div class="dr-tags">
                <Tag :value="item.status" :severity="itemStatusSeverity(item.status)" />
                <Tag :value="item.condition" severity="warn" />
              </div>
              <h2 class="dr-title">{{ item.title }}</h2>
              <div class="dr-price"><b>¥{{ money(item.price) }}</b></div>
              <p class="muted">
                发布于 {{ item.created_at }} ·
                <i class="pi pi-eye" /> {{ item.view_count || 0 }} 次浏览
              </p>
            </div>

            <!-- 操作区：下单 / 收藏 / 聊一聊 -->
            <div class="dr-actions">
              <Button severity="danger" :label="canBuy ? '立即下单' : '不能购买'"
                icon="pi pi-shopping-cart" :disabled="!canBuy" @click="placeOrder" />
              <Button :severity="favorited ? 'warn' : 'secondary'"
                :label="favorited ? '已收藏' : '收藏宝贝'"
                :icon="favorited ? 'pi pi-heart-fill' : 'pi pi-heart'" @click="toggleFav" />
              <Button v-if="isLogin && item.seller_id !== me?.id" severity="contrast"
                label="聊一聊" icon="pi pi-comments" @click="startChat" />
            </div>

            <!-- 卖家 -->
            <div class="dr-seller">
              <Avatar :label="(item.seller_nickname || '?').slice(0, 1)" shape="square" size="large" />
              <div>
                <div class="dr-seller-name">{{ item.seller_nickname }}</div>
                <div class="muted">校区：{{ item.seller_campus }}</div>
              </div>
            </div>

            <!-- 描述 -->
            <section class="dr-section">
              <h3><i class="pi pi-file-edit" /> 宝贝详情</h3>
              <Markdown :source="item.description || '卖家没有填写更多描述，可私聊问细节～'" />
            </section>

            <!-- 交易状态机（保留） -->
            <section class="fsm">
              <h4><i class="pi pi-sitemap" /> 交易流程</h4>
              <Steps :model="orderSteps" :activeStep="0" :readonly="true" />
              <ol>
                <li>买家下单</li>
                <li>卖家确认（确认后进入「待完成」）</li>
                <li>买家确认完成（交易结束）</li>
                <li>任意阶段买家可取消（已确认后需双方协商）</li>
              </ol>
            </section>

            <!-- 抽屉内联浏览：批次里的其它宝贝 -->
            <section class="dr-section" v-if="siblings.length">
              <h3><i class="pi pi-th-large" /> 同一批集市 · 接着逛</h3>
              <div class="dr-siblings">
                <div class="dr-sib" v-for="s in siblings" :key="s.id" @click="jump(s.id)">
                  <div class="dr-sib-thumb">
                    <template v-if="!firstImage(s)">{{ iconFor(s.category) }}</template>
                    <img v-else :src="s.images.split(',')[0]" alt="" />
                  </div>
                  <div class="dr-sib-title">{{ s.title }}</div>
                  <div class="dr-sib-price">¥{{ money(s.price) }}</div>
                </div>
              </div>
            </section>
          </div>

          <div class="dr-loading" v-else><i class="pi pi-spin pi-spinner" /> 加载中…</div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Avatar from 'primevue/avatar';
import Steps from 'primevue/steps';
import Message from 'primevue/message';
import api from '../api.js';
import store from '../store.js';
import { iconFor, money, firstImage, itemStatusSeverity, ORDER_STEPS } from '../util.js';
import { ui, closeItem, stepItem, openChatDock } from '../ui.js';
import Markdown from './Markdown.vue';

const router = useRouter();
const item = ref(null);
const error = ref('');
const success = ref('');
const favorited = ref(false);
const activeImg = ref(0);
const orderSteps = ORDER_STEPS;

const me = computed(() => store.state.user);
const isLogin = computed(() => !!store.state.user);
const gallery = computed(() => {
  const imgs = item.value?.images?.split(',').map((s) => s.trim()).filter(Boolean) || [];
  return imgs;
});
const canBuy = computed(
  () => item.value && item.value.status === '在售' && isLogin.value && item.value.seller_id !== me.value?.id
);
const canPrev = computed(() => ui.drawerIndex > 0);
const canNext = computed(() => ui.drawerIndex >= 0 && ui.drawerIndex < ui.drawerList.length - 1);
const posLabel = computed(() =>
  ui.drawerIndex >= 0 ? `${ui.drawerIndex + 1}/${ui.drawerList.length}` : '—'
);
// 同批集市里的其它宝贝（最多 6 个）
const siblings = computed(() =>
  ui.drawerList.filter((it) => String(it.id) !== String(ui.drawerItemId)).slice(0, 6)
);

async function load() {
  if (!ui.drawerItemId) return;
  item.value = null;
  error.value = '';
  success.value = '';
  favorited.value = false;
  activeImg.value = 0;
  try {
    const data = await api.get('/items/' + ui.drawerItemId);
    item.value = data.item;
    if (isLogin.value && item.value.seller_id !== me.value?.id) {
      try {
        const f = await api.get('/favorites/check?item_id=' + item.value.id);
        favorited.value = f.favorited;
      } catch (e) { /* 未登录忽略 */ }
    }
  } catch (e) {
    error.value = e.message;
  }
}

function close() { closeItem(); }
function step(d) { if (stepItem(d)) load(); }
function jump(id) {
  ui.drawerItemId = id;
  ui.drawerIndex = ui.drawerList.findIndex((it) => String(it.id) === String(id));
  load();
}

async function placeOrder() {
  try {
    await api.post('/orders', { item_id: item.value.id });
    success.value = '下单成功！等待卖家确认。';
    setTimeout(() => (success.value = ''), 3000);
  } catch (e) { error.value = e.message; }
}

async function toggleFav() {
  if (!isLogin.value) { closeItem(); router.push('/login'); return; }
  try {
    const data = await api.post('/favorites/toggle', { item_id: item.value.id });
    favorited.value = data.favorited;
  } catch (e) { error.value = e.message; }
}

async function startChat() {
  try {
    const data = await api.post('/messages/start', { item_id: item.value.id, seller_id: item.value.seller_id });
    openChatDock(data.conversation.id);
  } catch (e) { error.value = e.message; }
}

// 抽屉打开时锁定页面滚动
watch(() => ui.drawerOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : '';
});
watch(() => ui.drawerItemId, (id) => { if (id) load(); }, { immediate: true });

// Esc 关闭抽屉
function onKey(e) { if (e.key === 'Escape' && ui.drawerOpen) close(); }
window.addEventListener('keydown', onKey);
</script>

<style scoped>
.dr-root { position: fixed; inset: 0; z-index: 90; }
.dr-scrim { position: absolute; inset: 0; background: rgba(17, 17, 17, .45); }
.dr-panel {
  position: absolute; top: 0; right: 0; bottom: 0;
  width: min(560px, 94vw);
  background: var(--paper);
  border-left: var(--border);
  box-shadow: -10px 0 0 0 var(--black);
  display: flex; flex-direction: column;
}
.dr-head {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
  gap: 10px; padding: 12px 14px; background: var(--black); color: #fff;
  border-bottom: var(--border);
}
.dr-head-title { font-weight: 900; text-transform: uppercase; letter-spacing: .5px; font-size: 14px; }
.dr-nav { display: flex; align-items: center; gap: 6px; }
.dr-navbtn {
  background: var(--yellow); color: var(--black); border: 2px solid #fff;
  box-shadow: 2px 2px 0 0 #fff; width: 30px; height: 30px;
  font-weight: 900; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
}
.dr-navbtn:hover:not(:disabled) { transform: translate(1px, 1px); box-shadow: 1px 1px 0 0 #fff; }
.dr-navbtn:disabled { opacity: .35; cursor: not-allowed; }
.dr-close { background: var(--red); color: #fff; }
.dr-navpos { font-weight: 900; font-size: 12px; color: var(--yellow); min-width: 34px; text-align: center; }
.dr-body { flex: 1; overflow-y: auto; padding: 16px; }
.dr-loading { margin: auto; font-weight: 700; color: var(--muted); }

.dr-hero {
  position: relative; height: 250px; border: var(--border); background: var(--yellow);
  box-shadow: var(--shadow); display: flex; align-items: center; justify-content: center;
  font-size: 90px; overflow: hidden; margin-bottom: 12px;
}
.dr-hero img { width: 100%; height: 100%; object-fit: cover; }
.dr-cat {
  position: absolute; top: 8px; left: 8px; background: var(--black); color: var(--yellow);
  border: 2px solid var(--yellow); padding: 2px 8px; font-size: 12px; font-weight: 900;
  text-transform: uppercase; box-shadow: 2px 2px 0 0 var(--yellow);
}
.dr-stamp {
  position: absolute; top: 8px; right: 8px; background: var(--red); color: #fff;
  border: 2px solid #fff; padding: 2px 8px; font-size: 11px; font-weight: 900;
  transform: rotate(2deg); box-shadow: 2px 2px 0 0 var(--black);
}
.dr-thumbs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.dr-thumbs img {
  width: 56px; height: 56px; object-fit: cover; border: 2px solid var(--black);
  cursor: pointer; opacity: .6;
}
.dr-thumbs img.is-on { opacity: 1; box-shadow: 2px 2px 0 0 var(--red); }

.dr-titleblock { margin-bottom: 14px; }
.dr-tags { display: flex; gap: 8px; margin-bottom: 8px; }
.dr-title { font-size: 24px; margin-bottom: 8px; }
.dr-price {
  display: inline-block; background: var(--yellow); color: var(--black);
  border: 3px solid var(--black); box-shadow: 3px 3px 0 0 var(--black);
  padding: 4px 12px 4px 8px; font-size: 28px; font-weight: 900;
  transform: rotate(-3deg); line-height: 1; margin: 6px 0 10px;
}
.dr-price b { color: var(--red); }

.dr-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.dr-actions :deep(.p-button) { flex: 1 1 140px; }

.dr-seller {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  background: #fff; border: var(--border); box-shadow: var(--shadow-sm); margin-bottom: 16px;
}
.dr-seller-name { font-weight: 900; }

.dr-section {
  background: #fff; border: var(--border); box-shadow: var(--shadow-sm);
  padding: 16px; margin-bottom: 16px;
}
.dr-section h3 { font-size: 16px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: .5px; }

.dr-siblings { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
.dr-sib { border: 2px solid var(--black); background: var(--paper); cursor: pointer; box-shadow: 2px 2px 0 0 var(--black); }
.dr-sib:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 0 var(--black); }
.dr-sib-thumb {
  height: 74px; display: flex; align-items: center; justify-content: center;
  font-size: 30px; background: var(--yellow); border-bottom: 2px solid var(--black); overflow: hidden;
}
.dr-sib-thumb img { width: 100%; height: 100%; object-fit: cover; }
.dr-sib-title {
  font-size: 11px; font-weight: 800; padding: 5px 6px 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dr-sib-price { font-size: 13px; font-weight: 900; color: var(--red); padding: 2px 6px 6px; }

/* 抽屉滑入滑出 */
.dr-enter-active, .dr-leave-active { transition: opacity .18s ease; }
.dr-enter-active .dr-panel, .dr-leave-active .dr-panel { transition: transform .26s cubic-bezier(.2,.8,.3,1); }
.dr-enter-from, .dr-leave-to { opacity: 0; }
.dr-enter-from .dr-panel, .dr-leave-to .dr-panel { transform: translateX(100%); }
</style>
