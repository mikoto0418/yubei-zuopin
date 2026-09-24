import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from './api'
import { useAuth } from './auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true, title: '登录' } },
  { path: '/', redirect: '/map' },
  { path: '/map', name: 'map', component: () => import('./views/MapHomeView.vue'), meta: { title: '设施地图' } },
  { path: '/facilities', name: 'facilities', component: () => import('./views/FacilitiesListView.vue'), meta: { title: '设施台账' } },
  { path: '/work-orders', name: 'workOrders', component: () => import('./views/WorkOrdersView.vue'), meta: { title: '工单管理' } },
  { path: '/districts', name: 'districts', component: () => import('./views/DistrictsView.vue'), meta: { title: '区域管理' } },
  { path: '/facility-types', name: 'facilityTypes', component: () => import('./views/FacilityTypesView.vue'), meta: { title: '设施类型' } },
  { path: '/routes', name: 'inspectionRoutes', component: () => import('./views/InspectionRoutesView.vue'), meta: { title: '巡检路线' } },
  { path: '/teams', name: 'teams', component: () => import('./views/TeamsView.vue'), meta: { title: '班组管理' } },
  { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { title: '管理概览', admin: true } },
  { path: '/403', name: 'forbidden', component: () => import('./views/ForbiddenView.vue'), meta: { public: true, title: '无权限' } },
  { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('./views/NotFoundView.vue'), meta: { public: true, title: '页面不存在' } },
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
  if (to.name === 'login' && logged) {
    return { name: 'map' }
  }
  if (to.meta.admin && useAuth().state.user?.role !== 'admin') {
    return { name: 'forbidden' }
  }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · CityLens` : 'CityLens · 城市设施巡检'
})

export default router
