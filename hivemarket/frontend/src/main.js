import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import Tooltip from 'primevue/tooltip';
import Aura from '@primeuix/themes/aura';

import App from './App.vue';
import router from './router';
import { HivePreset } from './theme.js';

import 'primeicons/primeicons.css';
import './apple-tokens.css';
import './styles.css';

const app = createApp(App);

app.use(router);
app.use(PrimeVue, {
  theme: {
    preset: HivePreset,
    options: {
      darkModeSelector: '.hm-dark', // 深色模式：给 <html> 加 .hm-dark 即生效
      cssLayer: false,
    },
  },
  ripple: false,
  locale: {
    firstDayOfWeek: 1,
    dateFormat: 'yy-mm-dd',
    accept: '确定',
    reject: '取消',
    choose: '选择',
    upload: '上传',
    cancel: '取消',
    clear: '清空',
    today: '今天',
    weekHeader: '周',
    monthNames: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
    monthNamesShort: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    dayNames: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
    dayNamesShort: ['日', '一', '二', '三', '四', '五', '六'],
    dayNamesMin: ['日', '一', '二', '三', '四', '五', '六'],
  },
});
app.use(ToastService);
app.use(ConfirmationService);
app.directive('tooltip', Tooltip);

app.mount('#app');

// 兼容：让非组件模块也能弹 PrimeVue Toast（由 App.vue 注册到全局）
export { Aura };
