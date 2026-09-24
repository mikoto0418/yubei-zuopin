import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/', component: () => import('./views/Home.vue'), meta: { title: '首页' } },
  { path: '/login', component: () => import('./views/Login.vue'), meta: { title: '登录' } },
  { path: '/register', component: () => import('./views/Register.vue'), meta: { title: '注册' } },
  { path: '/publish', component: () => import('./views/Publish.vue'), meta: { title: '发布', auth: true } },
  { path: '/item/:id', component: () => import('./views/ItemDetail.vue'), meta: { title: '商品详情' } },
  { path: '/item/:id/edit', component: () => import('./views/Edit.vue'), meta: { title: '编辑商品', auth: true } },
  { path: '/categories', component: () => import('./views/Categories.vue'), meta: { title: '分类浏览' } },
  { path: '/wants', component: () => import('./views/Wants.vue'), meta: { title: '求购' } },
  { path: '/orders', component: () => import('./views/Orders.vue'), meta: { title: '我的订单', auth: true } },
  { path: '/reviews', component: () => import('./views/Reviews.vue'), meta: { title: '评价中心', auth: true } },
  { path: '/reports', component: () => import('./views/Reports.vue'), meta: { title: '举报中心', auth: true } },
  { path: '/notifications', component: () => import('./views/Notifications.vue'), meta: { title: '通知中心', auth: true } },
  { path: '/chat', component: () => import('./views/Chat.vue'), meta: { title: '消息', auth: true } },
  { path: '/chat/:convId', component: () => import('./views/Chat.vue'), meta: { title: '消息', auth: true } },
  { path: '/mine', component: () => import('./views/Mine.vue'), meta: { title: '个人中心', auth: true } },
  { path: '/favorites', component: () => import('./views/Favorites.vue'), meta: { title: '我的收藏', auth: true } },
  { path: '/admin', component: () => import('./views/Admin.vue'), meta: { title: '管理后台', auth: true, admin: true } },
  { path: '/403', component: () => import('./views/Forbidden.vue'), meta: { title: '无权限' } },
  { path: '/:pathMatch(.*)*', component: () => import('./views/NotFound.vue'), meta: { title: '页面未找到' } },
];

const router = createRouter({ history: createWebHistory(), routes });

// 路由守卫：登录鉴权 + admin 权限（前端只做体验层，后端仍强校验）
router.beforeEach((to) => {
  const user = JSON.parse(localStorage.getItem('hm_user') || 'null');
  if (to.meta.auth && !user) return { path: '/login', query: { redirect: to.fullPath } };
  if (to.meta.admin && (!user || user.role !== 'admin')) return { path: '/403' };
  return true;
});

// 页面标题
router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · HiveMarket` : 'HiveMarket';
});

export default router;
