import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import 'leaflet/dist/leaflet.css'

import App from './App.vue'
import router from './router'
// Apple 设计基底：令牌层必须先于项目样式加载，项目样式才能覆盖组件库默认值
import './apple-tokens.css'
import './styles.css'

const app = createApp(App)

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus, { locale: zhCn })
app.use(router)
app.mount('#app')
