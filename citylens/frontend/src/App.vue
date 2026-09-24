<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuth } from './auth'

const router = useRouter()
const { refresh, logout, state } = useAuth()

function onUnauthorized() {
  ElMessage.warning('登录已过期，请重新登录')
  logout()
  if (router.currentRoute.value.name !== 'login') {
    router.push({ name: 'login' })
  }
}

onMounted(() => {
  refresh()
  window.addEventListener('cl:unauthorized', onUnauthorized)
})
onUnmounted(() => {
  window.removeEventListener('cl:unauthorized', onUnauthorized)
})
</script>

<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" :key="state.user?.id || 'anon'" />
  </router-view>
</template>
