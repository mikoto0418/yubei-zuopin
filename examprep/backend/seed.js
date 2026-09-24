// 手动重置种子数据：node seed.js
// 清空全部业务数据后，重建 admin / demo / student1 账号及完整演示备考数据（幂等可重复执行）
require('dotenv').config();
const { db, seedIfNeeded } = require('./db');

// 清空旧数据（注意外键顺序：先子后父），再执行幂等 seed
db.exec(`
  DELETE FROM reminders;
  DELETE FROM study_materials;
  DELETE FROM wrong_questions;
  DELETE FROM mock_exams;
  DELETE FROM tasks;
  DELETE FROM plan_blocks;
  DELETE FROM plans;
  DELETE FROM goals;
  DELETE FROM knowledge_points;
  DELETE FROM subjects;
  DELETE FROM stats;
  DELETE FROM users;
`);
seedIfNeeded();
console.log('seed 完成：已重建 admin / demo / student1 账号与完整备考演示数据');
process.exit(0);
