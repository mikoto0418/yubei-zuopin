const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'hivemarket.db');

// 确保数据目录存在
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- 建表（13 张） ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  nickname TEXT,
  campus TEXT,
  avatar TEXT DEFAULT '',
  credit_score INTEGER NOT NULL DEFAULT 100,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER,
  icon TEXT DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (parent_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  category TEXT DEFAULT '其他',
  category_id INTEGER,
  condition TEXT DEFAULT '九成新',
  images TEXT DEFAULT '',
  seller_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '在售',
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (seller_id) REFERENCES users(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS item_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS wants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  budget REAL DEFAULT 0,
  buyer_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT '求购中',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (buyer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '待确认',
  remark TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS order_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  operator_id INTEGER,
  remark TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(user_id, item_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  reviewer_id INTEGER NOT NULL,
  reviewee_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  content TEXT DEFAULT '',
  role TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(order_id, reviewer_id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  handled_by INTEGER,
  handle_note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  handled_at TEXT,
  FOREIGN KEY (reporter_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

// ---------- 轻量迁移：给旧库补充新增列（幂等） ----------
function addColumn(table, colDef) {
  const name = colDef.trim().split(/\s+/)[0];
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
  }
}
addColumn('items', 'view_count INTEGER NOT NULL DEFAULT 0');
addColumn('items', 'category_id INTEGER');
addColumn('messages', 'is_read INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'credit_score INTEGER NOT NULL DEFAULT 100');
addColumn('orders', 'remark TEXT DEFAULT \'\'');
addColumn('orders', 'updated_at TEXT');

// 旧库订单状态迁移：待卖家确认 -> 待确认，待完成 -> 待收货
db.prepare("UPDATE orders SET status = '待确认' WHERE status = '待卖家确认'").run();
db.prepare("UPDATE orders SET status = '待收货' WHERE status = '待完成'").run();
db.prepare("UPDATE orders SET updated_at = created_at WHERE updated_at IS NULL").run();

// ---------- 索引 ----------
db.exec(`
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_category_id ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_seller ON items(seller_id);
CREATE INDEX IF NOT EXISTS idx_item_images_item ON item_images(item_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_logs_order ON order_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants ON conversations(buyer_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
`);

// ---------- 种子时间助手：以 2026-09-24 为基准向前回溯，跨度 ≥14 天 ----------
const BASE_DAY = new Date('2026-09-24T00:00:00');
function day(n, time = '10:00:00') {
  const d = new Date(BASE_DAY.getTime() - n * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd} ${time}`;
}

// ---------- 种子（分段幂等：每段独立判空，旧库也能补齐新表数据） ----------
function seed() {
  const hash = (pw) => bcrypt.hashSync(pw, 10);

  // --- 1. 用户 ---
  let users = db.prepare('SELECT id, username FROM users').all();
  if (users.length === 0) {
    const insUser = db.prepare(
      'INSERT INTO users (username, password, role, nickname, campus, credit_score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    insUser.run('admin', hash('admin123'), 'admin', '管理员', '总务处', 120, day(30, '09:00:00'));
    insUser.run('zhangsan', hash('123456'), 'user', '张三', '东区', 105, day(28, '09:10:00'));
    insUser.run('lisi', hash('123456'), 'user', '李四', '西区', 98, day(26, '09:20:00'));
    insUser.run('wangwu', hash('123456'), 'user', '王五', '南区', 112, day(24, '09:30:00'));
    users = db.prepare('SELECT id, username FROM users').all();
    console.log('[seed] 已写入 4 个演示账号（admin/admin123，其余 123456）');
  }
  const uid = (name) => (users.find((u) => u.username === name) || users[0]).id;
  const adminId = uid('admin');
  const zhangId = uid('zhangsan');
  const lisiId = uid('lisi');
  const wangId = uid('wangwu');
  const USER_IDS = [zhangId, lisiId, wangId];

  // --- 2. 分类树（5 个一级 + 15 个二级） ---
  const CATEGORY_TREE = [
    ['数码电子', '📱', ['手机通讯', '电脑办公', '影音配件']],
    ['书籍教材', '📚', ['考研考证', '专业教材', '课外读物']],
    ['生活百货', '🧺', ['宿舍电器', '厨具餐具', '日用清洁']],
    ['运动户外', '🏀', ['球类器材', '健身装备', '骑行滑板']],
    ['服饰鞋帽', '👕', ['男装', '女装', '鞋靴']],
  ];
  let catRows = db.prepare('SELECT id, name, parent_id FROM categories').all();
  if (catRows.length === 0) {
    const insCat = db.prepare('INSERT INTO categories (name, parent_id, icon, sort) VALUES (?, ?, ?, ?)');
    CATEGORY_TREE.forEach(([name, icon, subs], i) => {
      const pid = insCat.run(name, null, icon, i).lastInsertRowid;
      subs.forEach((s, j) => insCat.run(s, pid, '', j));
    });
    catRows = db.prepare('SELECT id, name, parent_id FROM categories').all();
    console.log('[seed] 已写入分类树：5 个一级 + 15 个二级');
  }
  const catByName = new Map(catRows.map((c) => [c.name, c]));
  const leafId = (name) => (catByName.get(name) || {}).id || null;

  // --- 3. 商品（40 件，挂叶子分类） ---
  // [标题, 描述, 价格, 叶子分类, 成色, 卖家下标, 几天前, 状态, 浏览量]
  const ITEMS = [
    ['小米手环 7 代', '小米手环 7 标准版，黑色表带，去年双十一购入，因换了 Watch 才出。戴了不到一个月，屏幕无划痕、触控灵敏，心率/睡眠监测都正常，防水淋浴无压力。原盒、磁吸充电线、备用表带齐全。', 120, '手机通讯', '九成新', 0, 20, '已售', 88],
    ['iPhone 12 128G 国行', '国行双卡 128G 白色，电池健康 88%，无维修无拆修，屏幕无划痕（一直贴膜带壳）。附原装充电线与非原装壳膜，支持当面验机，东门自提。', 2100, '手机通讯', '八成新', 1, 19, '已售', 231],
    ['华为 MatePad 10.4 平板', '上网课买的平板，6+128G WiFi 版，含原装磁吸保护套与手写笔。屏幕无坏点，边框一处轻微磕碰不影响使用。适合刷题看剧，南区可面交。', 950, '手机通讯', '八成新', 2, 18, '已售', 143],
    ['红米 Note 11 备用机', '当备用机用了半年，6+128G，功能一切正常，无锁无 ID。后盖有细微使用痕迹，屏幕完好。可当老人机/骑行导航机，价格好商量。', 480, '手机通讯', '八成新', 0, 17, '已售', 96],
    ['联想小新 Air14 笔记本', 'i5-1135G7 / 16G / 512G 固态，2023 年入手，仅用于写论文与网课。键盘无油光，屏幕无亮点，电池健康 90%。原装电源适配器+内胆包一起出。', 2600, '电脑办公', '九成新', 1, 16, '已售', 312],
    ['罗技无线键鼠套装', '罗技 MK275 无线键鼠套装，全键无失灵，鼠标滚轮顺滑。因换了机械键盘闲置，接收器与电池都在，即插即用。', 85, '电脑办公', '九成新', 2, 15, '已售', 74],
    ['AOC 24 寸显示器', '24 寸 IPS 屏，1080P 75Hz，接口 HDMI+VGA。毕业带不走，屏幕无坏点无亮点，附 HDMI 线一根。宿舍自提优先。', 420, '电脑办公', '九成新', 0, 14, '已售', 118],
    ['机械键盘 青轴 87 键', '87 键青轴机械键盘，键帽无打油，轴体手感清脆一致。带可拆 Type-C 线，因换静音轴出掉。适合宿舍之外的办公位。', 150, '电脑办公', '八成新', 1, 13, '已售', 67],
    ['索尼 WH-1000XM3 降噪耳机', '索尼头戴降噪，耳罩无脱皮，降噪依旧能打。附收纳包、音频线与充电线。图书馆自习神器，现场试听满意再付款。', 780, '影音配件', '八成新', 2, 12, '在售', 205],
    ['JBL GO3 蓝牙音箱', 'JBL GO3 便携蓝牙音箱，防水防尘，音质在小体积里很能打。买了更大的音箱所以出，充电口无锈。', 160, '影音配件', '九成新', 0, 11, '在售', 91],
    ['AirPods 2 代', 'AirPods 2 代，左右耳与充电盒电池都健康，连接稳定。耳机本体无磕碰，充电盒有轻微使用划痕。已酒精擦拭消毒。', 320, '影音配件', '八成新', 1, 10, '在售', 158],
    ['罗马仕 20000mAh 充电宝', '罗马仕 20000mAh 双向快充充电宝，可给手机充满 3 次以上，支持同时输出两口。带原装数据线，外观无鼓包。', 65, '影音配件', '八成新', 2, 9, '在售', 52],
    ['考研数学复习全书 2025', '《考研数学复习全书 2025》（李永乐团队），正版、纸质厚实无味。只翻了高数前半本，内页无笔记无划痕，赠配套线性代数小册子。', 35, '考研考证', '八成新', 0, 20, '在售', 41],
    ['考研英语真题（近十年）', '近十年英语一真题，含解析，做过的部分用铅笔标注已擦干净。适合二刷三刷，纸质完好无缺页。', 28, '考研考证', '八成新', 1, 12, '在售', 63],
    ['教资笔试教材（三科）', '教师资格证笔试三科教材+真题卷，综合素质/教育知识/学科知识齐全。只在书上做过少量笔记，不影响阅读。', 45, '考研考证', '七成新', 2, 8, '在售', 37],
    ['大学英语六级真题卷', '六级真题卷（含听力二维码），做过前五套，后面全新。附一本高频词汇小册子，便宜出。', 15, '专业教材', '八成新', 0, 7, '在售', 44],
    ['《数据结构》C 语言版', '严蔚敏《数据结构》C 语言版，考研 408 指定教材之一。内页有少量铅笔笔记，可擦除。书角轻微卷边。', 22, '专业教材', '八成新', 1, 6, '在售', 58],
    ['高等数学 上下册', '同济版《高等数学》上下册，两本一起出。上册有笔记，下册几乎全新。适合大一新生提前预习。', 30, '专业教材', '七成新', 2, 21, '在售', 49],
    ['计算机网络 自顶向下', '《计算机网络：自顶向下方法》第 7 版中文版，正版。只翻过前四章，内页干净，适合考研与期末复习。', 48, '专业教材', '九成新', 0, 5, '在售', 71],
    ['《三体》全集三册', '《三体》全集三册（地球往事/黑暗森林/死神永生），重庆出版社正版胶版纸。除扉页签名外无笔记无折角，近乎全新。', 25, '课外读物', '九成新', 1, 22, '在售', 19],
    ['《活着》余华', '余华《活着》精装版，读过一遍，内页干净无笔记。书脊完好，适合收藏或送人。', 12, '课外读物', '九成新', 2, 4, '在售', 26],
    ['《人类简史》', '《人类简史》中信出版社正版，厚厚一本。只读了三分之一，其余全新。书角略有压痕。', 20, '课外读物', '八成新', 0, 3, '在售', 33],
    ['安克 USB 护眼台灯', '安克智充 USB 护眼台灯，白光/暖光三档可调、长按无极调光。灯体无划痕，USB 供电，插充电头或充电宝就能亮。', 20, '宿舍电器', '七成新', 1, 23, '在售', 33],
    ['小米电吹风', '小米水离子电吹风，冷热风三档，风力足。宿舍限电也能用，线材完好无破损。因换了新款闲置。', 55, '宿舍电器', '八成新', 2, 2, '在售', 47],
    ['静音小风扇', 'USB 静音小风扇，三档风速，夹床夹桌都行。夏天宿舍必备，运转无异响，附一根 Type-C 线。', 18, '宿舍电器', '八成新', 0, 24, '在售', 39],
    ['宿舍电煮锅（1.5L）', '1.5L 小电煮锅，蒸煮炖一体，宿舍煮面煮粥神器。内胆不粘、无糊底，附蒸笼与电源线。注意部分宿舍限电，请先确认。', 45, '厨具餐具', '八成新', 1, 1, '在售', 84],
    ['膳魔师保温杯 500ml', '膳魔师 500ml 保温杯，保温效果依旧（热水 12 小时仍温热）。杯身有一处小磕痕，不影响密封与使用。', 60, '厨具餐具', '八成新', 2, 10, '在售', 29],
    ['陶瓷碗盘套装（6 件）', '陶瓷碗盘 6 件套，釉面完好无缺口，洗净即可用。毕业打包出，太重只支持校内自提。', 25, '厨具餐具', '九成新', 0, 9, '在售', 21],
    ['蓝月亮洗衣液 大瓶', '蓝月亮洗衣液 3kg 大瓶，开封用过两三次，剩余九成以上。因毕业离校便宜出，西区宿舍楼下自提。', 20, '日用清洁', '九成新', 1, 8, '在售', 17],
    ['透明收纳箱 60L', '60L 加厚透明收纳箱，带滑轮与卡扣盖，装被子衣服都合适。无裂纹无破损，仅箱底有轻微划痕。', 35, '日用清洁', '八成新', 2, 18, '在售', 43],
    ['不锈钢晾衣架', '落地不锈钢晾衣架，可伸缩，承重好不变形。宿舍晒被子神器，拆装方便，带走不占地方。', 28, '日用清洁', '八成新', 0, 7, '在售', 31],
    ['斯伯丁 7 号篮球', '斯伯丁 7 号比赛用球（真皮面手感），气密性完好，只打过不到十场。刚补过气，南操场可现场试拍。', 60, '球类器材', '九成新', 1, 25, '已售', 27],
    ['尤尼克斯羽毛球拍（双拍）', '尤尼克斯入门双拍套装，含拍套与三只羽毛球。拍线完好，握把胶略旧可自行更换。适合新手对打。', 130, '球类器材', '八成新', 2, 6, '在售', 55],
    ['5 号足球', '标准 5 号足球，脚感正常、无漏气，只在草地踢过几次。表面有轻微脏污，擦洗即可。', 40, '球类器材', '八成新', 0, 5, '在售', 22],
    ['加厚瑜伽垫', '加厚 10mm 瑜伽垫，防滑纹理，附收纳背带。练了两个月减脂，垫面无破损，已清洁消毒。', 45, '健身装备', '九成新', 1, 4, '在售', 61],
    ['可调节哑铃一对（5kg）', '一对可调节哑铃，单只 2.5-5kg 可调，宿舍力量训练够用。配重片齐全，螺母锁紧无松动。', 90, '健身装备', '八成新', 2, 3, '在售', 78],
    ['捷安特 ATX 山地自行车', '毕业清仓的捷安特 ATX 26 寸山地车，禧玛诺 21 速变速+前后碟刹，制动灵敏、链条润滑无卡顿。去年 4 月入手，外胎九成新无鼓包，原厂车灯、水壶架、后座托架都在，赠 U 型锁。整车不好快递，只支持东门自提。', 450, '骑行滑板', '九成新', 0, 26, '已售', 62],
    ['双翘滑板（含护具）', '双翘滑板，砂纸抓脚，轮子顺滑无卡顿。附护膝护肘各一副，适合新手入门。板面有正常使用划痕。', 110, '骑行滑板', '七成新', 1, 2, '在售', 48],
    ['优衣库卫衣 L 码', '优衣库基础款连帽卫衣，L 码，深灰色。洗过两次无起球无变形，因尺码偏大出掉。', 60, '男装', '九成新', 2, 20, '在售', 35],
    ['李维斯牛仔裤 32 码', '李维斯 511 修身牛仔裤，32 码，深蓝色。穿过一季，无破损无明显褪色，腰围略紧所以出。', 120, '男装', '八成新', 0, 1, '在售', 42],
  ];

  let itemRows = db.prepare('SELECT id, title FROM items').all();
  if (itemRows.length === 0) {
    const insItem = db.prepare(
      'INSERT INTO items (title, description, price, category, category_id, condition, images, seller_id, status, view_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insImg = db.prepare('INSERT INTO item_images (item_id, url, sort) VALUES (?, ?, ?)');
    ITEMS.forEach((it, i) => {
      const [title, desc, price, leaf, cond, sellerIdx, daysAgo, status, views] = it;
      const seller = USER_IDS[sellerIdx];
      const iid = insItem.run(
        title, desc, price, leaf, leafId(leaf), cond, '', seller, status, views, day(daysAgo, '10:00:00')
      ).lastInsertRowid;
      // 多图：以占位图 URL 记录，前端按 emoji 兜底渲染
      insImg.run(iid, `/uploads/items/${iid}/cover.png`, 0);
      insImg.run(iid, `/uploads/items/${iid}/detail-1.png`, 1);
    });
    itemRows = db.prepare('SELECT id, title FROM items').all();
    console.log(`[seed] 已写入 ${ITEMS.length} 件商品与多图记录`);
  } else {
    // 旧库回填：把老 items.category 文本映射到叶子分类 id
    const backfill = db.prepare('UPDATE items SET category_id = ? WHERE id = ? AND (category_id IS NULL OR category_id = 0)');
    const legacyMap = { 数码电子: '手机通讯', 书籍教材: '专业教材', 生活百货: '宿舍电器', 交通工具: '骑行滑板', 运动户外: '球类器材', 服饰鞋帽: '男装' };
    for (const r of itemRows) {
      const full = db.prepare('SELECT category FROM items WHERE id = ?').get(r.id);
      const leaf = legacyMap[full.category] || '专业教材';
      backfill.run(leafId(leaf), r.id);
    }
  }
  const itemIdByTitle = new Map(itemRows.map((r) => [r.title, r.id]));
  const itemId = (title) => itemIdByTitle.get(title);

  // --- 4. 求购 ---
  if (db.prepare('SELECT COUNT(*) AS c FROM wants').get().c === 0) {
    const insWant = db.prepare('INSERT INTO wants (title, description, budget, buyer_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    insWant.run('求一台八五新以上笔记本电脑', '日常办公上网课用，屏幕别太差，价格好商量。', 3000, wangId, '求购中', day(11, '11:00:00'));
    insWant.run('求二手吉他一把', '民谣吉他，初学者款即可，成色无所谓。', 400, zhangId, '求购中', day(9, '15:20:00'));
    insWant.run('求考研英语真题', '近五年真题，最好带解析，便宜点最好。', 30, lisiId, '求购中', day(6, '19:40:00'));
  }

  // --- 5. 收藏 ---
  if (db.prepare('SELECT COUNT(*) AS c FROM favorites').get().c === 0) {
    const insFav = db.prepare('INSERT OR IGNORE INTO favorites (user_id, item_id, created_at) VALUES (?, ?, ?)');
    const favTargets = ['小米手环 7 代', '索尼 WH-1000XM3 降噪耳机', '考研数学复习全书 2025', '斯伯丁 7 号篮球'];
    favTargets.forEach((t, i) => {
      const iid = itemId(t);
      if (iid) insFav.run(zhangId, iid, day(12 - i, '20:00:00'));
    });
  }

  // --- 6. 订单 + 订单日志（25 单覆盖 6 状态） ---
  if (db.prepare('SELECT COUNT(*) AS c FROM orders').get().c === 0) {
    const insOrder = db.prepare(
      'INSERT INTO orders (item_id, buyer_id, seller_id, amount, status, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insLog = db.prepare(
      'INSERT INTO order_logs (order_id, from_status, to_status, operator_id, remark, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const FLOW = {
      待确认: ['待确认'],
      待发货: ['待确认', '待发货'],
      待收货: ['待确认', '待发货', '待收货'],
      已完成: ['待确认', '待发货', '待收货', '已完成'],
      已取消: ['待确认', '已取消'],
      退款中: ['待确认', '待发货', '退款中'],
    };
    const LOG_REMARK = {
      待确认: '买家提交订单',
      待发货: '卖家确认订单，等待发货',
      待收货: '卖家已发货，等待买家收货',
      已完成: '买家确认收货，交易完成',
      已取消: '订单已取消',
      退款中: '买家发起退款申请',
    };
    // [商品标题, 买家下标, 卖家下标, 状态, 几天前]
    const ORDER_PLAN = [
      ['小米手环 7 代', 2, 1, '已完成', 20],
      ['iPhone 12 128G 国行', 0, 1, '已完成', 19],
      ['华为 MatePad 10.4 平板', 1, 2, '已完成', 18],
      ['红米 Note 11 备用机', 1, 0, '已完成', 17],
      ['联想小新 Air14 笔记本', 2, 1, '已完成', 16],
      ['罗技无线键鼠套装', 0, 2, '已完成', 15],
      ['AOC 24 寸显示器', 2, 0, '已完成', 14],
      ['机械键盘 青轴 87 键', 0, 1, '已完成', 13],
      ['索尼 WH-1000XM3 降噪耳机', 1, 2, '待确认', 4],
      ['JBL GO3 蓝牙音箱', 2, 0, '待确认', 3],
      ['AirPods 2 代', 0, 1, '待确认', 3],
      ['罗马仕 20000mAh 充电宝', 1, 2, '待确认', 2],
      ['考研数学复习全书 2025', 1, 0, '待发货', 5],
      ['考研英语真题（近十年）', 2, 1, '待发货', 4],
      ['教资笔试教材（三科）', 0, 2, '待发货', 4],
      ['大学英语六级真题卷', 1, 0, '待发货', 3],
      ['《数据结构》C 语言版', 2, 1, '待收货', 6],
      ['高等数学 上下册', 0, 2, '待收货', 5],
      ['计算机网络 自顶向下', 1, 0, '待收货', 5],
      ['《三体》全集三册', 2, 1, '待收货', 4],
      ['《活着》余华', 0, 2, '已取消', 8],
      ['《人类简史》', 1, 0, '已取消', 7],
      ['安克 USB 护眼台灯', 2, 1, '已取消', 6],
      ['小米电吹风', 0, 2, '退款中', 9],
      ['静音小风扇', 1, 0, '退款中', 7],
    ];
    let logCount = 0;
    let orderIdx = 0;
    for (const [title, bi, si, status, daysAgo] of ORDER_PLAN) {
      const iid = itemId(title);
      if (!iid) continue;
      const row = db.prepare('SELECT price, seller_id FROM items WHERE id = ?').get(iid);
      const buyer = USER_IDS[bi];
      let seller = row.seller_id;
      if (seller === buyer) seller = USER_IDS[si] === buyer ? USER_IDS[(si + 1) % 3] : USER_IDS[si];
      const path = FLOW[status];
      const created = day(daysAgo, `${String(9 + (orderIdx % 8)).padStart(2, '0')}:${String((orderIdx * 7) % 60).padStart(2, '0')}:00`);
      const updated = day(Math.max(daysAgo - path.length + 1, 1), '18:30:00');
      const oid = insOrder.run(iid, buyer, seller, row.price, status, '', created, updated).lastInsertRowid;
      let prev = null;
      path.forEach((st, k) => {
        const op = st === '待确认' ? buyer : st === '已取消' ? buyer : st === '退款中' ? buyer : seller;
        insLog.run(oid, prev, st, op, LOG_REMARK[st], k === 0 ? created : day(Math.max(daysAgo - k, 1), `${String(10 + k).padStart(2, '0')}:15:00`));
        prev = st;
        logCount++;
      });
      orderIdx++;
    }
    console.log(`[seed] 已写入 ${orderIdx} 笔订单（覆盖 6 种状态）与 ${logCount} 条订单日志`);
  }

  // --- 7. 评价（15 条，仅针对已完成订单） ---
  if (db.prepare('SELECT COUNT(*) AS c FROM reviews').get().c === 0) {
    const done = db.prepare("SELECT * FROM orders WHERE status = '已完成' ORDER BY id").all();
    const insReview = db.prepare(
      'INSERT INTO reviews (order_id, reviewer_id, reviewee_id, rating, content, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const BUYER_SAY = ['东西和描述一致，卖家人很好，面交很顺利。', '成色比想象中还好，包装仔细，推荐！', '价格实在，沟通愉快，会再来的。', '发货很快，物品完好无损，满意。', '描述真实，卖家还送了小配件，好评。', '交易过程顺利，卖家守时，值得信赖。', '物品功能正常，性价比很高，谢谢卖家。', '东西不错，就是约时间稍微费了点劲。'];
    const SELLER_SAY = ['买家很爽快，付款及时，交易愉快。', '沟通顺畅，按时面交，好买家。', '很礼貌的同学，过程零摩擦。', '买家验货仔细，人很好说话。', '下单及时，值得再次交易。', '守时守信，推荐给其他卖家。', '买家很nice，祝学业顺利。'];
    let rCount = 0;
    done.forEach((o, i) => {
      insReview.run(o.id, o.buyer_id, o.seller_id, i === 7 ? 4 : 5, BUYER_SAY[i % BUYER_SAY.length], 'buyer', day(12 - i, '20:10:00'));
      rCount++;
      if (i < SELLER_SAY.length) {
        insReview.run(o.id, o.seller_id, o.buyer_id, 5, SELLER_SAY[i], 'seller', day(12 - i, '21:05:00'));
        rCount++;
      }
    });
    // 依据评价校准信用分
    db.prepare(`UPDATE users SET credit_score = 100 + COALESCE((
      SELECT SUM(CASE WHEN rating >= 4 THEN 2 WHEN rating = 3 THEN 0 ELSE -3 END)
      FROM reviews WHERE reviewee_id = users.id), 0)`).run();
    console.log(`[seed] 已写入 ${rCount} 条双向评价`);
  }

  // --- 8. 举报（10 条，覆盖 pending/approved/rejected） ---
  if (db.prepare('SELECT COUNT(*) AS c FROM reports').get().c === 0) {
    const insReport = db.prepare(
      'INSERT INTO reports (reporter_id, target_type, target_id, reason, detail, status, handled_by, handle_note, created_at, handled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const allItems = db.prepare('SELECT id, title FROM items ORDER BY id').all();
    const pick = (i) => (allItems[i % allItems.length] || {}).id || 1;
    const PLAN = [
      [zhangId, 'item', pick(3), '虚假描述', '实物和图片差距较大，屏幕有划痕但描述说无划痕。', 'pending', null, null, 6],
      [lisiId, 'item', pick(9), '价格欺诈', '同一商品在别的帖子挂更低价格，疑似钓鱼。', 'pending', null, null, 5],
      [wangId, 'user', lisiId, '恶意骚扰', '连续发无关消息，影响正常交易。', 'pending', null, null, 5],
      [zhangId, 'item', pick(14), '违禁物品', '疑似售卖违规电器，请平台核实。', 'approved', adminId, '已核实违规，商品已下架。', 8],
      [lisiId, 'item', pick(20), '虚假描述', '书籍缺页，与描述不符。', 'approved', adminId, '情况属实，已警告卖家。', 9],
      [wangId, 'item', pick(25), '重复发布', '同一件商品重复发了三次，占用列表。', 'rejected', adminId, '核实为不同成色的同类商品，不构成重复。', 10],
      [zhangId, 'user', wangId, '交易不履约', '约好面交后失联两次。', 'pending', null, null, 4],
      [lisiId, 'item', pick(30), '虚假描述', '描述说九成新，实际有明显使用痕迹。', 'rejected', adminId, '成色判断主观，建议双方协商。', 11],
      [wangId, 'item', pick(35), '违禁物品', '疑似盗版教材。', 'approved', adminId, '已要求卖家提供购买凭证，暂下架处理。', 12],
      [zhangId, 'item', pick(7), '价格欺诈', '先涨价再打折，涉嫌虚假促销。', 'pending', null, null, 3],
    ];
    PLAN.forEach(([rep, tt, tid, reason, detail, status, handler, note, daysAgo]) => {
      insReport.run(rep, tt, tid, reason, detail, status, handler, note, day(daysAgo, '14:20:00'), status === 'pending' ? null : day(daysAgo - 1, '10:05:00'));
    });
    console.log(`[seed] 已写入 ${PLAN.length} 条举报记录`);
  }

  // --- 9. 通知（30 条） ---
  if (db.prepare('SELECT COUNT(*) AS c FROM notifications').get().c === 0) {
    const insNotif = db.prepare(
      'INSERT INTO notifications (user_id, type, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 14').all();
    let n = 0;
    recentOrders.forEach((o, i) => {
      const item = db.prepare('SELECT title FROM items WHERE id = ?').get(o.item_id);
      const title = item ? item.title : '商品';
      insNotif.run(o.seller_id, 'order', '你有新的订单', `买家已下单「${title}」，请及时确认。`, `/orders`, i < 5 ? 0 : 1, day(i % 10, '11:30:00'));
      n++;
      if (o.status !== '待确认') {
        insNotif.run(o.buyer_id, 'order', '订单状态更新', `「${title}」当前状态：${o.status}`, `/orders`, i < 4 ? 0 : 1, day(i % 10, '16:45:00'));
        n++;
      }
    });
    insNotif.run(wangId, 'message', '收到新消息', '张三 给你发来一条消息，快去看看吧。', '/chat', 0, day(1, '20:12:00'));
    n++;
    insNotif.run(lisiId, 'review', '你收到一条新评价', '买家给了你 5 星好评：东西和描述一致，卖家人很好。', '/reviews', 0, day(2, '21:10:00'));
    n++;
    insNotif.run(lisiId, 'report', '你的举报已处理', '对「机械键盘 青轴 87 键」的举报已核实，感谢你的反馈。', '/reports', 1, day(3, '09:40:00'));
    n++;
    insNotif.run(zhangId, 'system', '欢迎来到 HiveMarket', '完善个人资料可提升信用分，交易更顺畅。', '/mine', 1, day(15, '10:00:00'));
    n++;
    const fill = db.prepare('SELECT id FROM users WHERE role = ?').get('user');
    let k = 0;
    while (n < 30) {
      const uidTarget = USER_IDS[k % 3];
      insNotif.run(uidTarget, 'system', '平台公告', `校园二手交易诚信公约更新（第 ${k + 1} 期），请留意交易安全。`, '/notifications', k % 2, day(13 - (k % 12), '08:30:00'));
      n++; k++;
    }
    void fill;
    console.log(`[seed] 已写入 ${n} 条通知`);
  }
}

seed();

module.exports = db;
