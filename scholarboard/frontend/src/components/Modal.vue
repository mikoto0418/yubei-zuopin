<template>
  <!-- 通用弹窗：Apple 基底（--radius-xl、极浅阴影、无边框） -->
  <n-modal
    :show="open"
    :mask-closable="true"
    transform-origin="center"
    @update:show="onUpdateShow"
    @mask-click="close"
  >
    <n-card
      class="modal-card"
      :title="title"
      :style="width ? { width } : null"
      :class="{ wide }"
      :bordered="false"
      closable
      @close="close"
    >
      <slot />
      <template v-if="$slots.footer" #footer>
        <slot name="footer" />
      </template>
    </n-card>
  </n-modal>
</template>

<script setup>
import { NModal, NCard } from 'naive-ui';

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: '' },
  wide: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

function close() { emit('close'); }
function onUpdateShow(v) { if (!v) close(); }
</script>

<style scoped>
.modal-card {
  width: min(600px, 92vw);
  max-height: 88vh;
  overflow: auto;
  border-radius: var(--radius-xl);
}
.modal-card.wide { width: min(800px, 92vw); }
</style>
