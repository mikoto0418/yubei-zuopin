<template>
  <!-- 通用弹窗外壳：内部使用 PrimeVue Dialog，保持粗野主义外观 -->
  <Dialog
    :visible="open"
    :header="title"
    :modal="true"
    :draggable="false"
    :style="{ width: widthPx, maxWidth: '94vw' }"
    :pt="{ root: { class: 'hm-dialog' } }"
    @update:visible="onClose"
  >
    <slot />
  </Dialog>
</template>

<script setup>
import { computed } from 'vue';
import Dialog from 'primevue/dialog';

const props = defineProps({
  open: Boolean,
  title: String,
  width: { type: [Number, String], default: 560 },
});
const emit = defineEmits(['close']);

const widthPx = computed(() => (typeof props.width === 'number' ? props.width + 'px' : props.width));

function onClose() { emit('close'); }
</script>
