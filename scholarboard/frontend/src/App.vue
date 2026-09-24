<template>
  <!-- 全局 Provider：Apple 令牌主题（跟随系统深浅色） + 消息/对话框/加载条 -->
  <n-config-provider
    :theme="isDark ? darkTheme : null"
    :theme-overrides="isDark ? appleDarkOverrides : appleLightOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
    inline-theme-disabled
  >
    <n-message-provider :max="3" placement="top">
      <n-dialog-provider>
        <n-loading-bar-provider>
          <message-bridge />
          <RouterView />
        </n-loading-bar-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { computed, defineComponent } from 'vue';
import {
  NConfigProvider, NMessageProvider, NDialogProvider, NLoadingBarProvider,
  useMessage, useOsTheme, darkTheme, zhCN, dateZhCN,
} from 'naive-ui';
import { appleLightOverrides, appleDarkOverrides } from './theme';
import { bindMessage } from './api';

// 深色模式：跟随系统 prefers-color-scheme，无闪烁
const osTheme = useOsTheme();
const isDark = computed(() => osTheme.value === 'dark');

const MessageBridge = defineComponent({
  name: 'MessageBridge',
  setup() {
    bindMessage(useMessage());
    return () => null;
  },
});
</script>
