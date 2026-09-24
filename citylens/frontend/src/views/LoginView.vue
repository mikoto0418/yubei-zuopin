<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuth } from '../auth'

const router = useRouter()
const route = useRoute()
const { login, register } = useAuth()

const mode = ref('login')
const loading = ref(false)
const formRef = ref(null)

const form = reactive({ username: '', password: '', confirm: '', nickname: '', district: '' })

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度 3-20 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  confirm: [
    {
      validator: (_r, v, cb) => {
        if (mode.value !== 'register') return cb()
        if (v !== form.password) return cb(new Error('两次输入的密码不一致'))
        cb()
      },
      trigger: 'blur',
    },
  ],
}

const title = computed(() => (mode.value === 'login' ? '登录 CityLens' : '注册巡检账号'))

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  loading.value = true
  try {
    if (mode.value === 'login') {
      await login(form.username, form.password)
      ElMessage.success('登录成功')
    } else {
      await register({
        username: form.username,
        password: form.password,
        nickname: form.nickname,
        district: form.district,
      })
      ElMessage.success('注册成功，已自动登录')
    }
    router.replace(route.query.redirect || '/map')
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    loading.value = false
  }
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  formRef.value?.clearValidate()
}

const DEMO = [
  { label: '管理员', username: 'admin', password: 'admin123' },
  { label: '巡检员', username: 'inspector1', password: 'inspector123' },
  { label: '维修班组', username: 'team1', password: 'team123' },
]

function fillDemo(account) {
  mode.value = 'login'
  form.username = account.username
  form.password = account.password
}
</script>

<template>
  <div class="cl-login-wrap">
    <section class="cl-login-hero">
      <div class="cl-brand" style="gap: 12px">
        <div class="cl-brand-badge" style="width: 48px; height: 48px; font-size: 24px; border-radius: var(--radius-md)">
          <el-icon><Location /></el-icon>
        </div>
        <div>
          <h1 style="font-size: var(--fs-large-title); margin: 0">CityLens</h1>
          <div class="cl-page-sub">城市公共设施巡检与工单平台</div>
        </div>
      </div>

      <ul class="cl-feature-list">
        <li><span class="cl-feature-dot">●</span>全屏地图看全城设施，正常 / 待检修 / 故障一屏可辨</li>
        <li><span class="cl-feature-dot">●</span>故障上报即触发 AI 诊断，诊断结果落库并自动建单</li>
        <li><span class="cl-feature-dot">●</span>工单六状态流转：派单 → 维修 → 验收 → 关闭，全程留痕</li>
        <li><span class="cl-feature-dot">●</span>区域 / 类型 / 班组 / 巡检路线，一套主数据管到底</li>
        <li><span class="cl-feature-dot">●</span>离线可用：瓦片不可达时自动切换网格底图</li>
      </ul>
    </section>

    <section class="cl-login-form">
      <div class="cl-login-box">
        <h2 class="apple-title2">{{ title }}</h2>
        <p class="apple-subhead apple-secondary" style="margin: 6px 0 24px">
          {{ mode === 'login' ? '请使用巡检账号登录' : '填写信息以创建新的巡检账号' }}
        </p>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" size="large" placeholder="请输入用户名" />
          </el-form-item>

          <template v-if="mode === 'register'">
            <el-form-item label="昵称" prop="nickname">
              <el-input v-model="form.nickname" size="large" placeholder="如：王巡检" />
            </el-form-item>
            <el-form-item label="所属辖区" prop="district">
              <el-input v-model="form.district" size="large" placeholder="如：历下区" />
            </el-form-item>
          </template>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password" type="password" size="large" show-password
              placeholder="请输入密码" @keyup.enter="submit"
            />
          </el-form-item>

          <el-form-item v-if="mode === 'register'" label="确认密码" prop="confirm">
            <el-input
              v-model="form.confirm" type="password" size="large" show-password
              placeholder="请再次输入密码" @keyup.enter="submit"
            />
          </el-form-item>

          <el-button
            type="primary" size="large"
            style="width: 100%; margin-top: 6px; height: 44px"
            :loading="loading" @click="submit"
          >
            {{ mode === 'login' ? '登 录' : '注 册 并 登 录' }}
          </el-button>
        </el-form>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: var(--sp-4)">
          <el-button text type="primary" @click="switchMode">
            {{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}
          </el-button>
        </div>

        <div v-if="mode === 'login'" style="margin-top: var(--sp-5)">
          <div class="cl-field-label">演示账号（点击填入）</div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <button
              v-for="a in DEMO" :key="a.username"
              type="button" class="cl-chip" @click="fillDemo(a)"
            >
              {{ a.label }} · {{ a.username }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
