const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { notify } = require('../services/notify');

const router = express.Router();

// 打开(或复用)一个关于某商品的会话，返回 conversation_id
// 买家发起，seller 为目标卖家
function getOrCreateConversation(itemId, buyerId, sellerId) {
  let conv = db.prepare('SELECT id FROM conversations WHERE item_id = ? AND buyer_id = ? AND seller_id = ?').get(itemId, buyerId, sellerId);
  if (!conv) {
    const info = db.prepare('INSERT INTO conversations (item_id, buyer_id, seller_id) VALUES (?, ?, ?)').run(itemId, buyerId, sellerId);
    conv = { id: info.lastInsertRowid };
  }
  return conv.id;
}

// 已登录用户的会话列表
router.get('/conversations', auth, (req, res) => {
  const convs = db.prepare(
    `SELECT c.*, it.title AS item_title, it.price,
        buyer.nickname AS buyer_nickname, seller.nickname AS seller_nickname,
        (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
        (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_time,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.is_read = 0) AS unread
     FROM conversations c
     JOIN items it ON c.item_id = it.id
     JOIN users buyer ON c.buyer_id = buyer.id
     JOIN users seller ON c.seller_id = seller.id
     WHERE c.buyer_id = ? OR c.seller_id = ?
     ORDER BY last_time DESC`
  ).all(req.userId, req.userId, req.userId);
  res.json({ conversations: convs });
});

// 获取某会话的消息（先确保该用户属于会话；同时把对方发给我的消息标记为已读）
router.get('/conversations/:convId/messages', auth, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.convId);
  if (!conv) return res.status(404).json({ message: '会话不存在' });
  if (conv.buyer_id !== req.userId && conv.seller_id !== req.userId) return res.status(403).json({ message: '无权访问该会话' });
  db.prepare('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0')
    .run(conv.id, req.userId);
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(conv.id);
  res.json({ conversation: conv, messages });
});

// 向某会话发送消息
router.post('/conversations/:convId/messages', auth, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.convId);
  if (!conv) return res.status(404).json({ message: '会话不存在' });
  if (conv.buyer_id !== req.userId && conv.seller_id !== req.userId) return res.status(403).json({ message: '无权访问该会话' });
  const { content } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ message: '内容不能为空' });
  const info = db.prepare('INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)').run(conv.id, req.userId, content.trim());
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);

  // 通知对方（站内消息 -> 通知中心）
  const peerId = conv.buyer_id === req.userId ? conv.seller_id : conv.buyer_id;
  const sender = db.prepare('SELECT nickname, username FROM users WHERE id = ?').get(req.userId);
  notify(peerId, {
    type: 'message',
    title: '收到新消息',
    body: `${(sender && (sender.nickname || sender.username)) || '对方'}：${content.trim().slice(0, 40)}`,
    link: `/chat/${conv.id}`,
  });

  res.json({ message });
});

// 就某商品给对方开一个会话并发送第一条消息
router.post('/start', auth, (req, res) => {
  const { item_id, seller_id, content } = req.body || {};
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ message: '商品不存在' });
  const convId = getOrCreateConversation(item.id, req.userId, seller_id);
  const text = (content && content.trim()) || `你好，我对「${item.title}」感兴趣，还在吗？`;
  db.prepare('INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)').run(convId, req.userId, text);

  const sender = db.prepare('SELECT nickname, username FROM users WHERE id = ?').get(req.userId);
  notify(seller_id, {
    type: 'message',
    title: '收到新消息',
    body: `${(sender && (sender.nickname || sender.username)) || '对方'}：${text.slice(0, 40)}`,
    link: `/chat/${convId}`,
  });

  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(convId);
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  res.json({ conversation: conv, messages });
});

module.exports = router;