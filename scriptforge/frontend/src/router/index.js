import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '../api'
import { useAuth } from '../store'

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true, title: '登录' } },
  { path: '/', redirect: '/projects' },
  { path: '/projects', name: 'projects', component: () => import('../views/ProjectsView.vue'), meta: { title: '我的作品' } },
  { path: '/studio/:id', name: 'studio', component: () => import('../views/StudioView.vue'), meta: { title: '创作工作台' } },
  { path: '/characters', name: 'characters', component: () => import('../views/CharactersView.vue'), meta: { title: '角色管理' } },
  { path: '/dialogues', name: 'dialogues', component: () => import('../views/DialoguesView.vue'), meta: { title: '对白编辑' } },
  { path: '/storylines', name: 'storylines', component: () => import('../views/StorylinesView.vue'), meta: { title: '故事线' } },
  { path: '/revisions', name: 'revisions', component: () => import('../views/RevisionsView.vue'), meta: { title: '版本历史' } },
  { path: '/notes', name: 'notes', component: () => import('../views/NotesView.vue'), meta: { title: '创作笔记' } },
  { path: '/review', name: 'review', component: () => import('../views/ReviewView.vue'), meta: { title: '审阅台', review: true } },
  { path: '/admin', name: 'admin', component: () => import('../views/AdminView.vue'), meta: { title: '管理概览', admin: true } },
  { path: '/403', name: 'forbidden', component: () => import('../views/ForbiddenView.vue'), meta: { public: true, title: '无权限' } },
  { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('../views/NotFoundView.vue'), meta: { public: true, title: '页面不存在' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const logged = !!getToken()
  if (!to.meta.public && !logged) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && logged) return { name: 'projects' }
  const { isAdmin, canReview } = useAuth()
  if (to.meta.admin && !isAdmin.value) return { name: 'forbidden' }
  if (to.meta.review && !canReview.value) return { name: 'forbidden' }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · ScriptForge` : 'ScriptForge · 剧本创作工作台'
})

export default router
