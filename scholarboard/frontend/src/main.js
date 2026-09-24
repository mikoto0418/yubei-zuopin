import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
// Apple 设计语言基底令牌（必须在业务样式之前引入）
import './apple-tokens.css';
import './assets/base.css';

createApp(App).use(router).mount('#app');
