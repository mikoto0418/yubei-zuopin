<template>
  <!-- 删除/确认类弹窗：沿用 Modal 封装，保留 open/message/confirmText 旧接口 -->
  <Modal :open="open" :title="title || '确认操作'" width="420px" @close="onCancel">
    <p class="msg">{{ message }}</p>

    <template #footer>
      <div class="foot">
        <n-button quaternary :disabled="busy" @click="onCancel">{{ cancelText }}</n-button>
        <n-button :type="danger ? 'error' : 'primary'" :loading="busy" @click="onConfirm">{{ confirmText }}</n-button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { NButton } from 'naive-ui';
import Modal from './Modal.vue';

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '确定' },
  cancelText: { type: String, default: '取消' },
  confirmBusyText: { type: String, default: '处理中…' },
  busy: { type: Boolean, default: false },
  danger: { type: Boolean, default: false },
});
const emit = defineEmits(['confirm', 'cancel']);
function onCancel() { emit('cancel'); }
function onConfirm() { emit('confirm'); }
</script>

<style scoped>
.msg { color: var(--label-secondary); font-size: var(--fs-subhead); line-height: 1.7; margin: 0; }
.foot { display: flex; justify-content: flex-end; gap: var(--sp-2); }
</style>
