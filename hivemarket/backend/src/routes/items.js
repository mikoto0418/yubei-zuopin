const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// 兼容旧前端的扁平分类名
const LEGACY_CATEGORIES = ['数码电子', '书籍教材', '生活百货', '交通工具', '服饰鞋帽', '运动户外', '美妆个护', '其他'];

function imagesOf(itemId) {
  return db.prepare('SELECT id, url, sort FROM item_images WHERE item_id = ? ORDER BY sort ASC, id ASC').all(itemId);
}

// 分类：优先返回分类树，同时保留 categories 扁平数组（旧前端兼容）
router.get('/categories', (req, res) => {
  const rows = db.prepare('SELECT id, name, parent_id, icon, sort FROM categories ORDER BY sort, id').all();
  const roots = rows.filter((r) => !r.parent_id);
  const tree = roots.map((r) => ({
    ...r,
    children: rows.filter((c) => c.parent_id === r.id),
  }));
  res.json({ categories: LEGACY_CATEGORIES, tree, flat: rows });
});

// 浏览/搜索/筛选商品
// ?keyword=&category=&category_id=&includeChildren=&minPrice=&maxPrice=&status=&page=&pageSize=
router.get('/', (req, res) => {
  const { keyword = '', category = '', minPrice, maxPrice, status = '在售' } = req.query;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 12, 1), 60);

  const where = [];
  const params = [];
  if (status && status !== 'all') { where.push('it.status = ?'); params.push(status); }
  if (category) { where.push('it.category = ?'); params.push(category); }

  // 分类树筛选：给一级分类 id 时自动包含其所有二级子分类
  const cid = Number(req.query.category_id) || 0;
  if (cid) {
    const children = db.prepare('SELECT id FROM categories WHERE parent_id = ?').all(cid).map((r) => r.id);
    const ids = [cid, ...children];
    where.push(`it.category_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }

  if (keyword) { where.push('(it.title LIKE ? OR it.description LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
  if (minPrice !== undefined && minPrice !== '') { where.push('it.price >= ?'); params.push(Number(minPrice)); }
  if (maxPrice !== undefined && maxPrice !== '') { where.push('it.price <= ?'); params.push(Number(maxPrice)); }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM items it${whereSql}`).get(...params).c;
  const items = db.prepare(
    `SELECT it.*, u.nickname AS seller_nickname, u.campus AS seller_campus, u.credit_score AS seller_credit
     FROM items it JOIN users u ON it.seller_id = u.id${whereSql}
     ORDER BY it.created_at DESC, it.id DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize);

  res.json({ items, total, page, pageSize, pages: Math.ceil(total / pageSize) || 1 });
});

// 我发布的商品（所有状态）
router.get('/mine', auth, (req, res) => {
  const items = db.prepare(
    'SELECT * FROM items WHERE seller_id = ? ORDER BY created_at DESC'
  ).all(req.userId);
  res.json({ items });
});

// 商品详情（浏览计数 +1；附多图、卖家信用、评价摘要）
router.get('/:id', (req, res) => {
  const item = db.prepare(
    `SELECT it.*, u.nickname AS seller_nickname, u.campus AS seller_campus,
            u.avatar AS seller_avatar, u.credit_score AS seller_credit
     FROM items it JOIN users u ON it.seller_id = u.id WHERE it.id = ?`
  ).get(req.params.id);
  if (!item) return res.status(404).json({ message: '商品不存在' });
  db.prepare('UPDATE items SET view_count = view_count + 1 WHERE id = ?').run(item.id);
  item.view_count = (item.view_count || 0) + 1;

  const images = imagesOf(item.id);
  const sellerStat = db.prepare(
    'SELECT COUNT(*) AS count, ROUND(AVG(rating), 2) AS avg FROM reviews WHERE reviewee_id = ?'
  ).get(item.seller_id);

  res.json({
    item,
    images,
    seller: { review_count: sellerStat.count, review_avg: sellerStat.avg || 0 },
  });
});

// 发布商品（登录）
router.post('/', auth, (req, res) => {
  const { title, description, price, category, category_id, condition, images } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ message: '标题不能为空' });
  if (title.trim().length > 50) return res.status(400).json({ message: '标题过长（不超过 50 字）' });
  const priceN = Number(price);
  if (price === undefined || price === null || price === '' || Number.isNaN(priceN) || priceN < 0) {
    return res.status(400).json({ message: '请填写有效的价格' });
  }

  // 分类：category_id 优先，缺失时按名称回查
  let cid = Number(category_id) || null;
  let catName = category || '其他';
  if (cid) {
    const cat = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(cid);
    if (!cat) return res.status(400).json({ message: '分类不存在' });
    catName = cat.name;
  } else {
    const cat = db.prepare('SELECT id, name FROM categories WHERE name = ?').get(catName);
    if (cat) cid = cat.id;
  }
  // 兜底：分类名不在分类树中时挂到任意叶子分类，保证 category_id 非空
  if (!cid) {
    const leaf = db.prepare('SELECT id, name FROM categories WHERE parent_id IS NOT NULL ORDER BY sort, id LIMIT 1').get();
    if (leaf) { cid = leaf.id; catName = leaf.name; }
  }

  const info = db.prepare(
    'INSERT INTO items (title, description, price, category, category_id, condition, images, seller_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    title.trim(), description || '', priceN, catName, cid,
    condition || '九成新', Array.isArray(images) ? images.filter(Boolean).join(',') : (images || ''), req.userId, '在售'
  );

  // 所有图片按顺序写入 item_images，保证多图表与老字段一致
  const urlList = (Array.isArray(images) ? images : String(images || '').split(','))
    .map((u) => String(u || '').trim()).filter(Boolean);
  if (urlList.length) {
    const insImg = db.prepare('INSERT INTO item_images (item_id, url, sort) VALUES (?, ?, ?)');
    db.transaction(() => {
      urlList.forEach((u, i) => insImg.run(info.lastInsertRowid, u, i));
    })();
  }

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid);
  res.json({ message: '发布成功', item, images: imagesOf(item.id) });
});

// 追加商品多图
router.post('/:id/images', auth, (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ message: '商品不存在' });
  if (item.seller_id !== req.userId) return res.status(403).json({ message: '只能修改自己的商品' });

  const raw = (req.body || {}).images;
  const urls = (Array.isArray(raw) ? raw : [raw]).map((u) => String(u || '').trim()).filter(Boolean);
  if (!urls.length) return res.status(400).json({ message: '请提供至少一张图片地址' });
  if (urls.length > 9) return res.status(400).json({ message: '单次最多追加 9 张图片' });

  const maxRow = db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM item_images WHERE item_id = ?').get(item.id);
  let sort = maxRow.m + 1;
  const ins = db.prepare('INSERT INTO item_images (item_id, url, sort) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (const u of urls) { ins.run(item.id, u, sort); sort++; }
    // 同步回 items.images 逗号串，保证旧页面也能看到图
    const all = imagesOf(item.id).map((r) => r.url);
    db.prepare('UPDATE items SET images = ? WHERE id = ?').run(all.join(','), item.id);
  })();

  res.json({ message: `已添加 ${urls.length} 张图片`, images: imagesOf(item.id) });
});

// 修改商品（发布者本人）
router.put('/:id', auth, (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ message: '商品不存在' });
  if (item.seller_id !== req.userId) return res.status(403).json({ message: '只能修改自己的商品' });
  const { title, description, price, category, category_id, condition, status, images } = req.body || {};
  const newTitle = title !== undefined && title !== null ? String(title).trim() : item.title;
  if (!newTitle) return res.status(400).json({ message: '标题不能为空' });
  let newPrice = item.price;
  if (price !== undefined && price !== null && price !== '') {
    const p = Number(price);
    if (Number.isNaN(p) || p < 0) return res.status(400).json({ message: '价格不合法' });
    newPrice = p;
  }
  if (status !== undefined && !['在售', '已售', '下架'].includes(status)) {
    return res.status(400).json({ message: '状态不合法' });
  }

  let newCid = item.category_id;
  let newCatName = category ?? item.category;
  const incomingCid = Number(category_id) || 0;
  if (incomingCid) {
    const cat = db.prepare('SELECT id, name FROM categories WHERE id = ?').get(incomingCid);
    if (!cat) return res.status(400).json({ message: '分类不存在' });
    newCid = cat.id; newCatName = cat.name;
  } else if (category) {
    const cat = db.prepare('SELECT id, name FROM categories WHERE name = ?').get(category);
    if (cat) newCid = cat.id;
  }

  db.prepare('UPDATE items SET title=?, description=?, price=?, category=?, category_id=?, condition=?, status=?, images=? WHERE id=?').run(
    newTitle, description ?? item.description,
    newPrice, newCatName, newCid,
    condition ?? item.condition, status ?? item.status,
    images !== undefined ? (Array.isArray(images) ? images.filter(Boolean).join(',') : images) : item.images,
    item.id
  );
  const updated = db.prepare('SELECT * FROM items WHERE id = ?').get(item.id);
  res.json({ message: '已保存', item: updated });
});

// 下架/重新上架
router.patch('/:id/status', auth, (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ message: '商品不存在' });
  if (item.seller_id !== req.userId && req.role !== 'admin') return res.status(403).json({ message: '无权限' });
  const { status } = req.body || {};
  if (!['在售', '已售', '下架'].includes(status)) return res.status(400).json({ message: '状态不合法' });
  db.prepare('UPDATE items SET status = ? WHERE id = ?').run(status, item.id);
  res.json({ message: `已${status === '在售' ? '上架' : status}` });
});

// 删除商品（发布者本人或管理员），级联清理相关业务数据
router.delete('/:id', auth, (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ message: '商品不存在' });
  if (item.seller_id !== req.userId && req.role !== 'admin') {
    return res.status(403).json({ message: '只能删除自己的商品' });
  }
  db.transaction(() => {
    db.prepare('DELETE FROM item_images WHERE item_id = ?').run(item.id);
    db.prepare('DELETE FROM favorites WHERE item_id = ?').run(item.id);
    const orderIds = db.prepare('SELECT id FROM orders WHERE item_id = ?').all(item.id).map((o) => o.id);
    for (const oid of orderIds) {
      db.prepare('DELETE FROM order_logs WHERE order_id = ?').run(oid);
      db.prepare('DELETE FROM reviews WHERE order_id = ?').run(oid);
    }
    db.prepare('DELETE FROM orders WHERE item_id = ?').run(item.id);
    db.prepare('DELETE FROM reports WHERE target_type = ? AND target_id = ?').run('item', item.id);
    const convs = db.prepare('SELECT id FROM conversations WHERE item_id = ?').all(item.id);
    for (const c of convs) db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(c.id);
    db.prepare('DELETE FROM conversations WHERE item_id = ?').run(item.id);
    db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
  })();
  res.json({ message: '已删除' });
});

module.exports = router;
