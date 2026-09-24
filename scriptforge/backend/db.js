// ScriptForge 数据层：建表 + 索引 + 幂等种子。
// 领域：影视剧本 / 长篇小说创作工作台 —— 作品 → 分集 → 场景 → 对白 四级结构，
// 外加角色、角色关系、故事线、创作笔记与版本快照。
'use strict';
require('dotenv').config();
const path = require('path');
const { openDatabase, ensureIndexes } = require('./kernel').db;
const { hashPassword } = require('./kernel').auth;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'scriptforge.db');
const db = openDatabase(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'writer',       -- admin / writer（编剧）/ editor（责编）
  nickname TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT DEFAULT '电影',                   -- 电影 / 网剧 / 小说
  genre TEXT DEFAULT '',                      -- 题材：悬疑 / 科幻 / 都市 ...
  logline TEXT DEFAULT '',                    -- 一句话故事
  synopsis TEXT DEFAULT '',                   -- 故事梗概
  cover TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',       -- draft/reviewing/revising/approved/archived
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  seq INTEGER DEFAULT 1,
  summary TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  episode_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  seq INTEGER DEFAULT 1,
  location TEXT DEFAULT '',                   -- 地点
  time_of_day TEXT DEFAULT '日',               -- 日 / 夜 / 晨 / 黄昏
  content TEXT DEFAULT '',                    -- 场景正文（衬线纸张编辑区）
  status TEXT NOT NULL DEFAULT 'outline',     -- outline/drafted/revised/final
  word_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  age TEXT DEFAULT '',
  identity TEXT DEFAULT '',                   -- 身份 / 职业
  personality TEXT DEFAULT '',                -- 性格
  goal TEXT DEFAULT '',                       -- 目标 / 欲望
  arc TEXT DEFAULT '',                        -- 人物弧光
  avatar TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS character_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  relation TEXT NOT NULL,                     -- 父子 / 恋人 / 敌对 / 师徒 ...
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (from_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scene_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  UNIQUE (scene_id, character_id),
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dialogues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  scene_id INTEGER NOT NULL,
  character_id INTEGER,
  seq INTEGER DEFAULT 1,
  line TEXT NOT NULL,
  emotion TEXT DEFAULT '',                    -- 情绪提示，如（压低声音）
  parenthetical TEXT DEFAULT '',              -- 动作提示
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS storylines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  code TEXT DEFAULT 'A',                      -- A 线 / B 线 / C 线
  title TEXT NOT NULL,
  kind TEXT DEFAULT 'main',                   -- main（主线）/ sub（支线）
  summary TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS storyline_scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storyline_id INTEGER NOT NULL,
  scene_id INTEGER NOT NULL,
  note TEXT DEFAULT '',
  UNIQUE (storyline_id, scene_id),
  FOREIGN KEY (storyline_id) REFERENCES storylines(id) ON DELETE CASCADE,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  project_id INTEGER,
  scene_id INTEGER,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  kind TEXT DEFAULT 'idea',                   -- idea（灵感）/ setting（设定）/ reference（参考）/ todo（待办）
  status TEXT DEFAULT 'open',                 -- open / done
  source TEXT DEFAULT 'manual',               -- manual / ai
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  scene_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  summary TEXT DEFAULT '',
  snapshot TEXT NOT NULL,                     -- 场景字段的 JSON 快照
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
);
`);

ensureIndexes(db, `
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_episode ON scenes(episode_id);
CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_scenes_status ON scenes(status);
CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);
CREATE INDEX IF NOT EXISTS idx_relations_project ON character_relations(project_id);
CREATE INDEX IF NOT EXISTS idx_dialogues_scene ON dialogues(scene_id);
CREATE INDEX IF NOT EXISTS idx_storylines_project ON storylines(project_id);
CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id);
CREATE INDEX IF NOT EXISTS idx_revisions_scene ON revisions(scene_id);
`);

// —— 状态机定义：非法流转一律 400 ——
const PROJECT_FLOW = {
  draft: ['reviewing', 'archived'],
  reviewing: ['revising', 'approved', 'draft'],
  revising: ['reviewing', 'approved', 'draft'],
  approved: ['archived', 'revising'],
  archived: ['draft'],
};

const SCENE_FLOW = {
  outline: ['drafted'],
  drafted: ['revised', 'outline'],
  revised: ['final', 'drafted'],
  final: ['revised'],
};

function canTransition(flow, from, to) {
  if (from === to) return false;
  const allowed = flow[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

module.exports = { db, DB_PATH, PROJECT_FLOW, SCENE_FLOW, canTransition };
