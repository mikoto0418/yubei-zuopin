<template>
  <div class="pf sb-enter">
    <h1 class="sb-page-title">个人中心</h1>

    <div class="grid">
      <section class="card">
        <div class="avatar-row">
          <span class="avatar">{{ form.avatar || init }}</span>
          <div>
            <p class="name">{{ form.nickname || user?.username }}</p>
            <span class="role">{{ user?.role === 'admin' ? '管理员' : '普通用户' }}</span>
          </div>
        </div>

        <n-form label-placement="top" :show-require-mark="false">
          <n-form-item label="昵称">
            <n-input v-model:value="form.nickname" placeholder="怎么称呼你" maxlength="24" />
          </n-form-item>
          <n-form-item label="头像字符（一个汉字或 emoji）">
            <n-input v-model:value="form.avatar" placeholder="如：🌱 或 梨" maxlength="4" show-count />
          </n-form-item>
        </n-form>

        <div class="ops">
          <n-button type="primary" :loading="saving" @click="save">保存修改</n-button>
        </div>
      </section>

      <section class="card">
        <h2 class="sb-headline">账号信息</h2>
        <div class="kv">
          <span class="k">用户名</span><span class="v">@{{ user?.username }}</span>
        </div>
        <div class="kv">
          <span class="k">角色</span><span class="v">{{ user?.role === 'admin' ? '管理员' : '普通用户' }}</span>
        </div>
        <div class="kv">
          <span class="k">注册时间</span><span class="v">{{ user?.created_at || '—' }}</span>
        </div>

        <div class="sb-rule" style="margin: var(--sp-4) 0" />

        <h2 class="sb-headline">快捷操作</h2>
        <div class="links">
          <n-button quaternary size="small" @click="router.push('/home')">活动流</n-button>
          <n-button quaternary size="small" @click="router.push('/versions')">版本历史</n-button>
          <n-button quaternary size="small" @click="router.push('/tags')">标签云</n-button>
        </div>

        <p class="sb-footnote sb-secondary hint">
          按 ⌘/Ctrl + K 打开命令面板，可搜索笔记、跳转页面或直接执行操作。
          笔记支持语音输入与朗读，并会自动生成版本历史；简历支持 AI 润色与结构化亮点应用。
        </p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NForm, NFormItem, NInput, NButton } from 'naive-ui';
import { api, toast } from '../api';

const router = useRouter();
const user = api.getUser();
const form = ref({ nickname: user?.nickname || '', avatar: user?.avatar || '' });
const saving = ref(false);
const init = computed(() => (user ? (user.username || 'U').charAt(0).toUpperCase() : 'U'));

async function save() {
  saving.value = true;
  try {
    const res = await api.updateMe({ nickname: form.value.nickname, avatar: form.value.avatar });
    api.setAuth(api.token(), res.user);
    Object.assign(user, res.user);
    toast('已保存');
  } catch (e) { toast(e.message); } finally { saving.value = false; }
}
</script>

<style scoped>
.pf { display: flex; flex-direction: column; gap: var(--sp-5); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); align-items: start; }
.card {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--sp-5);
}

.avatar-row { display: flex; align-items: center; gap: var(--sp-4); margin-bottom: var(--sp-5); }
.avatar {
  width: 56px; height: 56px;
  display: grid; place-items: center;
  background: var(--tint); color: #fff;
  border-radius: var(--radius-full);
  font-size: 24px;
}
.name { font-size: var(--fs-headline); font-weight: 600; margin: 0 0 var(--sp-1); }
.role { font-size: var(--fs-caption); color: var(--label-secondary); }

.ops { display: flex; justify-content: flex-end; margin-top: var(--sp-4); }

.kv { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); padding: var(--sp-2) 0; border-bottom: 1px solid var(--separator); }
.kv:last-of-type { border-bottom: none; }
.k { font-size: var(--fs-footnote); color: var(--label-secondary); }
.v { font-size: var(--fs-subhead); color: var(--label); }

.links { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); }
.hint { margin-top: var(--sp-4); line-height: 1.7; }

@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
</style>
