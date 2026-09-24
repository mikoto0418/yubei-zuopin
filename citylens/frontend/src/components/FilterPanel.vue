<script setup>
import { CATEGORIES, STATUSES, STATUS_COLOR } from '../constants'

defineProps({
  filters: { type: Object, required: true },
  statusCount: { type: Object, default: () => ({}) },
  categoryCount: { type: Object, default: () => ({}) },
  visibleCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  collapsed: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle-category', 'toggle-status', 'reset', 'plan-route'])
</script>

<template>
  <aside class="cl-panel cl-float cl-filter" :class="{ 'is-collapsed': collapsed }">
    <div class="cl-filter-head">
      <span>筛选设施</span>
      <el-button link size="small" @click="emit('reset')">重置</el-button>
    </div>

    <div class="cl-filter-body">
      <div class="cl-field">
        <div class="cl-field-label">
          <span>设施类别</span>
          <el-tag v-if="filters.categories.length" size="small" type="primary">
            已选 {{ filters.categories.length }}
          </el-tag>
        </div>
        <div class="cl-chips">
          <span
            v-for="c in CATEGORIES"
            :key="c"
            class="cl-chip"
            :class="{ 'is-active': filters.categories.includes(c) }"
            @click="emit('toggle-category', c)"
          >
            {{ c }}
            <b style="opacity: 0.6; font-weight: 500">{{ categoryCount[c] || 0 }}</b>
          </span>
        </div>
      </div>

      <div class="cl-field">
        <div class="cl-field-label">
          <span>运行状态</span>
          <el-tag v-if="filters.statuses.length" size="small" type="primary">
            已选 {{ filters.statuses.length }}
          </el-tag>
        </div>
        <div
          v-for="s in STATUSES"
          :key="s"
          class="cl-status-row"
          @click="emit('toggle-status', s)"
        >
          <el-checkbox
            :model-value="filters.statuses.includes(s)"
            @click.stop
            @change="emit('toggle-status', s)"
          />
          <span class="cl-dot" :style="{ background: STATUS_COLOR[s] }" />
          <span style="font-size: var(--fs-subhead)">{{ s }}</span>
          <span class="cl-status-count">{{ statusCount[s] || 0 }}</span>
        </div>
      </div>

      <el-divider style="margin: 4px 0 16px" />

      <div class="cl-field" style="margin-bottom: 12px">
        <div class="cl-field-label"><span>显示结果</span></div>
        <div style="font-size: var(--fs-subhead); color: var(--label-secondary)">
          当前显示
          <b style="color: var(--tint); font-size: 16px">{{ visibleCount }}</b>
          / {{ totalCount }} 个设施
        </div>
      </div>

      <el-button
        type="primary"
        plain
        style="width: 100%"
        :disabled="!visibleCount"
        @click="emit('plan-route')"
      >
        <el-icon style="margin-right: 4px"><MagicStick /></el-icon>
        AI 规划巡检路线
      </el-button>

      <div style="margin-top: 14px; font-size: var(--fs-caption); color: var(--label-secondary); line-height: 1.8">
        <div><span class="cl-dot" :style="{ background: STATUS_COLOR['正常'], display: 'inline-block' }" /> 正常</div>
        <div><span class="cl-dot" :style="{ background: STATUS_COLOR['待检修'], display: 'inline-block' }" /> 待检修</div>
        <div><span class="cl-dot" :style="{ background: STATUS_COLOR['故障'], display: 'inline-block' }" /> 故障</div>
      </div>
    </div>
  </aside>
</template>
