// ScriptForge 领域常量：状态机标签、类型、题材、情绪提示。
// 与后端 db.js 的 PROJECT_FLOW / SCENE_FLOW 保持一致，前端据此渲染可选项。

export const PROJECT_STATUS = ['draft', 'reviewing', 'revising', 'approved', 'archived']
export const SCENE_STATUS = ['outline', 'drafted', 'revised', 'final']

export const PROJECT_STATUS_LABEL = {
  draft: '草稿',
  reviewing: '送审中',
  revising: '返修中',
  approved: '已过审',
  archived: '已归档',
}

export const SCENE_STATUS_LABEL = {
  outline: '大纲',
  drafted: '初稿',
  revised: '修订',
  final: '定稿',
}

// 与后端 PROJECT_FLOW / SCENE_FLOW 一一对应的合法流转，用于禁用非法选项
export const PROJECT_FLOW = {
  draft: ['reviewing', 'archived'],
  reviewing: ['revising', 'approved', 'draft'],
  revising: ['reviewing', 'approved', 'draft'],
  approved: ['archived', 'revising'],
  archived: ['draft'],
}

export const SCENE_FLOW = {
  outline: ['drafted'],
  drafted: ['revised', 'outline'],
  revised: ['final', 'drafted'],
  final: ['revised'],
}

export const PROJECT_TYPES = ['电影', '网剧', '小说']
export const GENRES = ['悬疑', '科幻', '都市', '历史', '爱情', '犯罪', '家庭', '奇幻']
export const TIME_OF_DAY = ['日', '夜', '晨', '黄昏']

export const RELATION_KINDS = ['父子', '母女', '恋人', '夫妻', '敌对', '师徒', '上下级', '搭档', '兄弟', '旧识', '忘年交', '旧恋人', '旧上下级']

export const NOTE_KINDS = ['idea', 'setting', 'reference', 'todo']
export const NOTE_KIND_LABEL = {
  idea: '灵感',
  setting: '设定',
  reference: '参考',
  todo: '待办',
}

export function projectStatusLabel(s) {
  return PROJECT_STATUS_LABEL[s] || s
}

export function sceneStatusLabel(s) {
  return SCENE_STATUS_LABEL[s] || s
}
