const express = require('express');
const db = require('../db');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// 分类树：一级分类带 children（二级）
router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT c.id, c.name, c.parent_id, c.icon, c.sort,
            (SELECT COUNT(*) FROM items it WHERE it.category_id = c.id AND it.status = '在售') AS item_count
     FROM categories c ORDER BY c.sort ASC, c.id ASC`
  ).all();
  const countById = new Map(rows.map((r) => [r.id, r.item_count]));
  const roots = rows.filter((r) => !r.parent_id);
  const tree = roots.map((r) => {
    const children = rows.filter((c) => c.parent_id === r.id).map((c) => ({ ...c, children: [] }));
    // 一级分类的在售数 = 自身 + 所有二级子分类
    const total = children.reduce((n, c) => n + (c.item_count || 0), countById.get(r.id) || 0);
    return { ...r, item_count: total, children };
  });
  res.json({ categories: tree, flat: rows });
});

// 单个分类及其子孙分类 id（用于按一级分类筛选商品）
router.get('/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ message: '分类不存在' });
  const children = db.prepare('SELECT * FROM categories WHERE parent_id = ? ORDER BY sort, id').all(cat.id);
  res.json({ category: { ...cat, children } });
});

// 新建分类（管理员）
router.post('/', auth, adminOnly, (req, res) => {
  const { name, parent_id = null, icon = '', sort = 0 } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ message: '分类名不能为空' });
  if (parent_id) {
    const parent = db.prepare('SELECT id FROM categories WHERE id = ?').get(parent_id);
    if (!parent) return res.status(400).json({ message: '父分类不存在' });
  }
  const info = db.prepare(
    'INSERT INTO categories (name, parent_id, icon, sort) VALUES (?, ?, ?, ?)'
  ).run(String(name).trim(), parent_id || null, icon, Number(sort) || 0);
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
  res.json({ message: '分类已创建', category: cat });
});

module.exports = router;
