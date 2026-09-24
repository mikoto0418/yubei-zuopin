<template>
  <!-- 五态统一封装：loading / empty / error / forbidden / notfound
       用法：<StateBlock state="empty" title="还没有笔记" action="新建" @action="fn" /> -->
  <div class="sb-state" :class="'is-' + state">
    <!-- 加载：骨架屏（不用转圈） -->
    <template v-if="state === 'loading'">
      <div class="sk">
        <div class="sk-line w60 sb-skeleton" />
        <div class="sk-line w90 sb-skeleton" />
        <div class="sk-line w80 sb-skeleton" />
        <div class="sk-line w40 sb-skeleton" />
      </div>
    </template>

    <template v-else>
      <div class="icon" :class="'ic-' + state">
        <n-icon :size="34"><component :is="iconComp" /></n-icon>
      </div>
      <h3 class="title">{{ title || defaultTitle }}</h3>
      <p v-if="description || defaultDesc" class="desc">{{ description || defaultDesc }}</p>
      <div class="ops">
        <n-button v-if="action" type="primary" @click="$emit('action')">{{ action }}</n-button>
        <n-button v-if="retry" quaternary @click="$emit('retry')">重试</n-button>
        <slot name="extra" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { NButton, NIcon } from 'naive-ui';
import {
  DocumentTextOutline, LockClosedOutline, CompassOutline, AlertCircleOutline,
} from '@vicons/ionicons5';

const props = defineProps({
  state: { type: String, default: 'empty' }, // loading | empty | error | forbidden | notfound
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  action: { type: String, default: '' },
  retry: { type: Boolean, default: false },
});
defineEmits(['action', 'retry']);

const DEFAULT_TITLE = {
  empty: '这里还是空的',
  error: '加载失败了',
  forbidden: '无访问权限',
  notfound: '页面不存在',
};
const DEFAULT_DESC = {
  empty: '从右下角的按钮开始，创建第一条内容。',
  error: '请检查网络或后端服务，然后重试。',
  forbidden: '当前账号没有访问这个页面的权限。',
  notfound: '你访问的地址可能已被移动或删除。',
};
const ICONS = {
  empty: DocumentTextOutline,
  error: AlertCircleOutline,
  forbidden: LockClosedOutline,
  notfound: CompassOutline,
};

const defaultTitle = computed(() => DEFAULT_TITLE[props.state] || DEFAULT_TITLE.empty);
const defaultDesc = computed(() => DEFAULT_DESC[props.state] || '');
const iconComp = computed(() => ICONS[props.state] || DocumentTextOutline);
</script>

<style scoped>
.sb-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--sp-3);
  padding: var(--sp-10) var(--sp-6);
  text-align: center;
  min-height: 240px;
}
.icon {
  width: 64px; height: 64px;
  display: grid; place-items: center;
  border-radius: var(--radius-full);
  background: var(--fill-secondary);
  color: var(--label-tertiary);
}
.ic-error { color: var(--red); background: rgba(255, 59, 48, 0.1); }
.ic-forbidden { color: var(--orange); background: var(--tint-soft); }
.ic-notfound { color: var(--label-secondary); }
.title { font-size: var(--fs-headline); font-weight: 600; margin: 0; color: var(--label); }
.desc { font-size: var(--fs-subhead); color: var(--label-secondary); margin: 0; max-width: 420px; line-height: 1.5; }
.ops { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }

.sk { width: min(420px, 90%); display: flex; flex-direction: column; gap: var(--sp-3); }
.sk-line { height: 14px; }
.w60 { width: 60%; } .w90 { width: 90%; } .w80 { width: 80%; } .w40 { width: 40%; }
</style>
