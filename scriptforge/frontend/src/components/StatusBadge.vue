<template>
  <span class="sf-badge" :class="`sf-badge--${value}`">{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue'
import { projectStatusLabel, sceneStatusLabel, NOTE_KIND_LABEL } from '../constants'

const props = defineProps({
  value: { type: String, default: '' },
  kind: { type: String, default: 'project' },   // project / scene / note
})

const label = computed(() => {
  if (props.kind === 'project') return projectStatusLabel(props.value)
  if (props.kind === 'scene') return sceneStatusLabel(props.value)
  if (props.kind === 'note') return NOTE_KIND_LABEL[props.value] || props.value
  return props.value
})
</script>
