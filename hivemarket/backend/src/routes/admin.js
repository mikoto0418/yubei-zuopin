const express = require('express');
const db = require('../db');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.use(auth, adminOnly);

// 数据仪表盘汇总
router.get('/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const totalItems = db.prepare('SELECT COUNT(*) AS c FROM items').get().c;
  const onSaleCount = db.prepare("SELECT COUNT(*) AS c FROM items WHERE status = '在售'").get().c;
  const soldCount = db.prepare("SELECT COUNT(*) AS c FROM items WHERE status = '已售'").get().c;
  const offCount = db.prepare("SELECT COUNT(*) AS c FROM items WHERE status = '下架'").get().c;
  const totalOrders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  const completedOrders = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = '已完成'").get().c;
  const revenueRaw = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM orders WHERE status = '已完成'").get().s;
  const totalWants = db.prepare('SELECT COUNT(*) AS c FROM wants').get().c;

  // 成交额趋势（按天）
  const revenueTrend = db.prepare(
    `SELECT substr(created_at,1,10) AS day, COALESCE(SUM(amount),0) AS amount
     FROM orders WHERE status = '已完成'
     GROUP BY substr(created_at,1,10) ORDER BY day`
  ).all();

  // 各类目成交占比（饼图）与成交量（柱状）
  const categoryRevenue = db.prepare(
    `SELECT it.category, COALESCE(SUM(o.amount),0) AS amount, COUNT(o.id) AS volume
     FROM orders o JOIN items it ON o.item_id = it.id
     WHERE o.status = '已完成'
     GROUP BY it.category`
  ).all();
  const categoryVolume = db.prepare(
    `SELECT it.category, COUNT(*) AS count
     FROM orders o JOIN items it ON o.item_id = it.id
     WHERE o.status = '已完成'
     GROUP BY it.category`
  ).all();

  // Top 活跃卖家（按成交笔数）
  const topSellers = db.prepare(
    `SELECT u.id, u.nickname, u.campus, COUNT(o.id) AS deal_count,
        COALESCE(SUM(o.amount),0) AS amount
     FROM orders o JOIN users u ON o.seller_id = u.id
     WHERE o.status = '已完成'
     GROUP BY o.seller_id ORDER BY deal_count DESC LIMIT 10`
  ).all();

  // 新增模块统计
  const totalReviews = db.prepare('SELECT COUNT(*) AS c FROM reviews').get().c;
  const avgRating = db.prepare('SELECT ROUND(AVG(rating), 2) AS a FROM reviews').get().a || 0;
  const reportPending = db.prepare("SELECT COUNT(*) AS c FROM reports WHERE status = 'pending'").get().c;
  const reportTotal = db.prepare('SELECT COUNT(*) AS c FROM reports').get().c;
  const totalNotifications = db.prepare('SELECT COUNT(*) AS c FROM notifications').get().c;
  const totalCategories = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  const orderStatusRows = db.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status').all();
  const categoryTree = db.prepare(
    `SELECT c.name, c.parent_id, COUNT(it.id) AS item_count
     FROM categories c LEFT JOIN items it ON it.category_id = c.id
     GROUP BY c.id ORDER BY c.parent_id IS NOT NULL, c.sort, c.id`
  ).all();

  res.json({
    totals: {
      totalUsers, totalItems, onSaleCount, soldCount, offCount, totalOrders, completedOrders,
      revenue: revenueRaw, totalWants,
      totalReviews, avgRating, reportPending, reportTotal, totalNotifications, totalCategories,
    },
    revenueTrend,
    categoryRevenue,
    categoryVolume,
    topSellers,
    orderStatusRows,
    categoryTree,
  });
});

// 上架/下架统计（按状态的数量，供卡片展示）
router.get('/item-status', (req, res) => {
  const rows = db.prepare('SELECT status, COUNT(*) AS count FROM items GROUP BY status').all();
  res.json({ rows });
});

// 用户列表（分页+关键词）
router.get('/users', (req, res) => {
  const { keyword = '' } = req.query;
  const users = db.prepare(
    `SELECT id, username, role, nickname, campus, created_at FROM users
     WHERE username LIKE ? OR nickname LIKE ? ORDER BY created_at DESC LIMIT 200`
  ).all(`%${keyword}%`, `%${keyword}%`);
  res.json({ users });
});

// 商品全量列表（含下架/已售，管理用）
router.get('/items', (req, res) => {
  const items = db.prepare(
    `SELECT it.*, u.nickname AS seller_nickname
     FROM items it JOIN users u ON it.seller_id = u.id ORDER BY it.created_at DESC LIMIT 500`
  ).all();
  res.json({ items });
});

module.exports = router;