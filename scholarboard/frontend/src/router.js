import { createRouter, createWebHistory } from 'vue-router';
import { api } from './api';

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { public: true, title: '登录' } },
  {
    path: '/',
    component: () => import('./layout/AppLayout.vue'),
    children: [
      { path: 'home', name: 'home', component: () => import('./views/Home.vue'), meta: { title: '活动流' } },
      { path: 'notes', name: 'notes', component: () => import('./views/Notes.vue'), meta: { title: '笔记' } },
      { path: 'projects', name: 'projects', component: () => import('./views/Projects.vue'), meta: { title: '项目' } },
      { path: 'tags', name: 'tags', component: () => import('./views/Tags.vue'), meta: { title: '标签云' } },
      { path: 'versions', name: 'versions', component: () => import('./views/Versions.vue'), meta: { title: '版本历史' } },
      { path: 'resumes', name: 'resumes', component: () => import('./views/Resumes.vue'), meta: { title: '简历工作台' } },
      { path: 'tasks', name: 'tasks', component: () => import('./views/Tasks.vue'), meta: { title: '任务看板' } },
      { path: 'profile', name: 'profile', component: () => import('./views/Profile.vue'), meta: { title: '个人中心' } },
      { path: 'dashboard', name: 'dashboard', component: () => import('./views/Dashboard.vue'), meta: { title: '数据仪表盘', admin: true } },
    ],
  },
  { path: '/forbidden', name: 'forbidden', component: () => import('./views/Forbidden.vue'), meta: { public: true, title: '无权限' } },
  { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('./views/NotFound.vue'), meta: { public: true, title: '页面不存在' } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const authed = api.isAuthed();
  if (to.meta.public) {
    if (authed && to.name === 'login') return { name: 'home' };
    return true;
  }
  if (!authed) return { name: 'login' };

  if (to.meta.admin) {
    const user = api.getUser();
    if (!user || user.role !== 'admin') return { name: 'forbidden' };
  }
  return true;
});

router.afterEach((to) => {
  document.title = (to.meta.title ? to.meta.title + ' · ' : '') + 'ScholarBoard';
});

export default router;
