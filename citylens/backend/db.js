// CityLens 数据层：11 张表 + 迁移 + 索引 + 幂等种子。
'use strict';
require('dotenv').config();
const path = require('path');
const { openDatabase, addColumn, ensureIndexes } = require('./kernel').db;
const { hashPassword } = require('./kernel').auth;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'citylens.db');
const db = openDatabase(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  nickname TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  district TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS districts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  center_lat REAL DEFAULT 0,
  center_lng REAL DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS facility_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '',
  default_cycle_days INTEGER DEFAULT 30,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS maintenance_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  leader TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  specialties TEXT DEFAULT '',
  active_jobs INTEGER DEFAULT 0,
  capacity INTEGER DEFAULT 8,
  active INTEGER DEFAULT 1,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  district_id INTEGER,
  type_id INTEGER,
  name TEXT NOT NULL,
  category TEXT DEFAULT '路灯',
  address TEXT DEFAULT '',
  lat REAL DEFAULT 0,
  lng REAL DEFAULT 0,
  status TEXT DEFAULT '正常',
  installed_at TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  facility_id INTEGER NOT NULL,
  route_id INTEGER,
  result TEXT DEFAULT '正常',
  inspector TEXT DEFAULT '',
  note TEXT DEFAULT '',
  inspected_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS faults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  facility_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  severity TEXT DEFAULT '一般',
  status TEXT DEFAULT '待处理',
  reporter TEXT DEFAULT '',
  diagnosis TEXT DEFAULT '',
  diagnosed_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  fault_id INTEGER,
  facility_id INTEGER,
  team_id INTEGER,
  status TEXT NOT NULL DEFAULT 'created',
  priority TEXT NOT NULL DEFAULT 'normal',
  created_by INTEGER,
  assigned_at TEXT DEFAULT '',
  resolved_at TEXT DEFAULT '',
  verified_at TEXT DEFAULT '',
  closed_at TEXT DEFAULT '',
  description TEXT DEFAULT '',
  resolution TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS work_order_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  operator_id INTEGER,
  remark TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (order_id) REFERENCES work_orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inspection_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  district_id INTEGER,
  facility_ids TEXT DEFAULT '[]',
  created_by INTEGER,
  cycle TEXT DEFAULT '每周',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

// 旧库升级：补齐新增列（幂等）
addColumn(db, 'facilities', 'district_id INTEGER');
addColumn(db, 'facilities', 'type_id INTEGER');
addColumn(db, 'faults', 'diagnosis TEXT DEFAULT \'\'');
addColumn(db, 'faults', 'diagnosed_at TEXT DEFAULT \'\'');
addColumn(db, 'inspections', 'route_id INTEGER');
addColumn(db, 'users', 'phone TEXT DEFAULT \'\'');

ensureIndexes(db, `
CREATE INDEX IF NOT EXISTS idx_facilities_status ON facilities(status);
CREATE INDEX IF NOT EXISTS idx_facilities_category ON facilities(category);
CREATE INDEX IF NOT EXISTS idx_facilities_district ON facilities(district_id);
CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type_id);
CREATE INDEX IF NOT EXISTS idx_inspections_facility ON inspections(facility_id);
CREATE INDEX IF NOT EXISTS idx_faults_facility ON faults(facility_id);
CREATE INDEX IF NOT EXISTS idx_faults_status ON faults(status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_team ON work_orders(team_id);
CREATE INDEX IF NOT EXISTS idx_orders_facility ON work_orders(facility_id);
CREATE INDEX IF NOT EXISTS idx_logs_order ON work_order_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
`);

// ---------------------------------------------------------------- 种子数据
const BASE_DAY = '2026-09-14';
function day(offset, hhmm = '09:00:00') {
  const d = new Date(BASE_DAY + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10) + ' ' + hhmm;
}

const DISTRICT_SEED = [
  ['历下区', 'LXA', 36.666, 117.038, '老城核心区，设施密度最高'],
  ['市中区', 'SZA', 36.651, 117.0, '商业与居住混合区'],
  ['槐荫区', 'HYA', 36.652, 116.93, '西部新城，含高铁片区'],
  ['天桥区', 'TQA', 36.68, 116.99, '北部交通枢纽区'],
  ['历城区', 'LCA', 36.68, 117.1, '东部高校聚集区'],
];

const TYPE_SEED = [
  ['路灯', '💡', 15, '含灯杆、灯头与配电箱'],
  ['垃圾箱', '🗑️', 7, '分类垃圾箱与果皮箱'],
  ['监控', '📷', 30, '治安与交通监控杆'],
  ['消防栓', '🧯', 90, '市政消防供水设施'],
  ['公交站牌', '🚏', 30, '含灯箱与电子站牌'],
  ['井盖', '⭕', 60, '雨水、污水、电力井盖'],
  ['排水', '🌊', 45, '雨水篦子与排水口'],
  ['健身器材', '🏋️', 30, '社区公共健身设施'],
];

const TEAM_SEED = [
  ['照明维修一班', '张建国', '13805310001', '照明,电气', 8, '主责路灯与灯箱'],
  ['弱电监控班', '李卫东', '13805310002', '弱电,监控', 6, '主责监控与信号链路'],
  ['市政道路班', '王海涛', '13805310003', '市政,道路', 10, '主责井盖与路面'],
  ['给排水抢修班', '赵强', '13805310004', '给水,排水,管道', 6, '主责消防栓与排水'],
  ['环卫设施班', '刘敏', '13805310005', '环卫', 8, '主责垃圾箱与清运'],
];

const FACILITY_SEED = [
  [0, 0, '经十路 001 号路灯', '经十路与历山路交叉口东 50 米', 36.6652, 117.0401, '正常', '2023-04-12', 'LED 灯头，功率 120W'],
  [0, 1, '泉城路东段垃圾箱', '泉城路 128 号门前', 36.6672, 117.0288, '正常', '2022-09-01', '双分类，容量 120L'],
  [0, 2, '历山路监控杆', '历山路与文化东路交口', 36.664, 117.0462, '待检修', '2022-11-20', '摄像头画面偶发卡顿'],
  [0, 4, '解放路公交站牌', '解放路与历山路交口西', 36.6598, 117.0456, '待检修', '2023-01-08', '站牌灯箱不亮'],
  [0, 3, '山大路消防栓', '山大路 21 号对面', 36.6702, 117.051, '正常', '2021-06-15', '去年年检合格'],
  [0, 5, '文化东路井盖 03', '文化东路与山师东路交口', 36.6628, 117.0538, '正常', '2020-03-22', '重型铸铁，无异响'],
  [1, 0, '经十路 002 号路灯', '经十路与山师东路交口', 36.652, 117.0235, '待检修', '2023-04-12', '近期闪烁，疑似接触不良'],
  [1, 1, '英雄山路垃圾箱', '英雄山路 105 号旁', 36.6312, 117.0223, '待检修', '2022-05-18', '箱体破损，需更换'],
  [1, 5, '舜耕路井盖 07', '舜耕路与会展路交口', 36.6421, 117.0398, '正常', '2020-03-22', '重型铸铁，无异响'],
  [1, 2, '建设路监控杆', '建设路 66 号路口', 36.6489, 116.9982, '正常', '2022-11-20', '在线率 100%'],
  [1, 3, '民生大街消防栓', '民生大街 8 号门前', 36.6543, 117.0012, '正常', '2021-06-15', '压力正常无渗漏'],
  [1, 4, '经四路公交站牌', '经四路万达广场西侧', 36.6588, 116.9942, '正常', '2023-01-08', '电子站牌显示正常'],
  [2, 0, '经十西路 011 号路灯', '经十西路与二环西路交口', 36.6488, 116.921, '正常', '2023-07-01', '太阳能+市电双路'],
  [2, 1, '张庄路垃圾箱', '张庄路 88 号旁', 36.6612, 116.9288, '正常', '2022-09-01', '箱体完好'],
  [2, 2, '纬十二路监控杆', '纬十二路与经一路交口', 36.6645, 116.9402, '故障', '2022-11-20', '摄像机离线超过 24 小时'],
  [2, 6, '兴济河排水口', '兴济河桥西侧', 36.6472, 116.9335, '正常', '2021-08-10', '汛期前已清淤'],
  [2, 5, '经二路井盖 12', '经二路与纬九路交口', 36.6602, 116.9455, '待检修', '2020-03-22', '行车有异响'],
  [2, 7, '槐村街健身器材', '槐村街社区广场', 36.6558, 116.9272, '正常', '2023-03-15', '单杠与漫步机各 1 组'],
  [3, 0, '北园大街 021 号路灯', '北园大街与济泺路交口', 36.6822, 116.9888, '正常', '2023-04-12', 'LED 灯头，功率 150W'],
  [3, 1, '济泺路垃圾箱', '济泺路长途汽车站前', 36.6788, 116.9932, '正常', '2022-09-01', '大容量 240L'],
  [3, 2, '明湖北路监控杆', '明湖北路 5 号', 36.6745, 117.0085, '正常', '2022-11-20', '在线率 100%'],
  [3, 3, '少年路消防栓', '少年路 12 号门前', 36.6845, 116.9842, '待检修', '2021-06-15', '阀杆轻微渗水'],
  [3, 6, '无影山排水口', '无影山中路南侧', 36.6872, 116.9755, '正常', '2021-08-10', '排水通畅'],
  [3, 7, '堤口路健身器材', '堤口路社区公园', 36.6802, 116.9708, '正常', '2023-03-15', '扭腰器与太极推手各 1 组'],
  [4, 0, '花园路 031 号路灯', '花园路与洪家楼南路交口', 36.6788, 117.0955, '正常', '2023-07-01', '太阳能+市电双路'],
  [4, 1, '洪家楼垃圾箱', '洪家楼广场北侧', 36.6812, 117.101, '正常', '2022-09-01', '双分类，容量 120L'],
  [4, 2, '华龙路监控杆', '华龙路与花园路交口', 36.6845, 117.0928, '待检修', '2022-11-20', '夜间红外成像模糊'],
  [4, 5, '山大北路井盖 19', '山大北路与洪楼西路交口', 36.6762, 117.1048, '正常', '2020-03-22', '无沉降'],
  [4, 6, '祝舜路排水口', '祝舜路东段', 36.6895, 117.1102, '故障', '2021-08-10', '篦子堵塞导致积水'],
  [4, 7, '洪楼广场健身器材', '洪楼广场东南角', 36.6795, 117.0988, '正常', '2023-03-15', '全套 6 件，使用率高'],
];

const INSPECTION_SEED = [
  [0, '正常', '王巡检', '灯头亮度正常，灯杆无倾斜', 0, '09:20:00'],
  [1, '正常', '李巡检', '箱体完好，分类标识清晰', 1, '10:10:00'],
  [2, '异常', '王巡检', '监控画面卡顿，已记录待复检', 1, '10:40:00'],
  [3, '异常', '李巡检', '站牌灯箱不亮，需电工处理', 2, '15:20:00'],
  [4, '正常', '王巡检', '消防栓压力正常，无渗漏', 2, '14:00:00'],
  [5, '正常', '李巡检', '井盖无沉降无异响', 3, '09:05:00'],
  [6, '异常', '王巡检', '发现灯头闪烁，标记待检修', 3, '09:35:00'],
  [7, '异常', '李巡检', '箱体侧面开裂，存在划伤风险', 4, '11:15:00'],
  [8, '正常', '王巡检', '井盖完好', 4, '11:40:00'],
  [9, '正常', '李巡检', '监控在线，画面清晰', 5, '08:50:00'],
  [10, '正常', '王巡检', '消防栓外观完好', 5, '09:30:00'],
  [11, '正常', '李巡检', '站牌显示正常', 6, '16:00:00'],
  [12, '正常', '王巡检', '灯杆无锈蚀', 6, '10:20:00'],
  [13, '正常', '李巡检', '垃圾箱已清运', 7, '08:40:00'],
  [14, '异常', '王巡检', '摄像机离线，已上报故障', 7, '14:20:00'],
  [15, '正常', '李巡检', '排水口通畅', 8, '09:10:00'],
  [16, '异常', '王巡检', '井盖行车有异响，需加固', 8, '10:05:00'],
  [17, '正常', '李巡检', '健身器材螺栓紧固', 9, '15:30:00'],
  [18, '正常', '王巡检', '灯头亮度正常', 9, '09:45:00'],
  [19, '正常', '李巡检', '垃圾箱完好', 9, '10:25:00'],
  [20, '正常', '王巡检', '监控在线', 8, '11:00:00'],
  [21, '异常', '李巡检', '消防栓阀杆渗水，已上报', 7, '14:45:00'],
  [22, '正常', '王巡检', '排水口无淤积', 5, '15:10:00'],
  [23, '正常', '李巡检', '器材完好，无松动', 4, '16:20:00'],
  [24, '正常', '王巡检', '灯杆无倾斜', 3, '08:30:00'],
  [25, '正常', '李巡检', '垃圾箱标识清晰', 2, '09:50:00'],
  [26, '异常', '王巡检', '夜间成像模糊，建议更换镜头', 1, '20:15:00'],
];

const FAULT_SEED = [
  [14, '监控摄像头离线', '纬十二路监控杆摄像机离线超过 24 小时，后台无画面', '严重', '处理中', '王巡检', 7, 'yes'],
  [6, '路灯灯头闪烁', '经十路 002 号路灯夜间持续闪烁，影响照明', '一般', '处理中', '王巡检', 3, 'yes'],
  [3, '公交站牌灯箱不亮', '解放路公交站牌灯箱不亮，夜间乘客看不清线路', '一般', '处理中', '李巡检', 2, 'yes'],
  [7, '垃圾箱箱体破损', '英雄山路垃圾箱侧面开裂，存在划伤风险', '轻微', '已解决', '王巡检', 4, 'yes'],
  [2, '监控画面卡顿', '历山路监控杆摄像头画面偶发卡顿，录像丢帧', '一般', '待处理', '王巡检', 1, ''],
  [21, '消防栓阀杆渗水', '少年路消防栓阀杆处持续渗水，地面已有积水', '严重', '处理中', '李巡检', 7, 'yes'],
  [16, '井盖行车异响', '经二路井盖车辆碾压时发出明显异响，疑似座圈松动', '一般', '处理中', '王巡检', 8, 'yes'],
  [29, '排水口篦子堵塞', '祝舜路排水口篦子被落叶与杂物堵塞，雨天易积水', '一般', '处理中', '李巡检', 5, 'yes'],
  [26, '监控夜间成像模糊', '华龙路监控杆夜间红外成像模糊，无法识别车牌', '轻微', '待处理', '王巡检', 1, ''],
  [19, '垃圾箱满溢', '济泺路垃圾箱连续两日满溢，清运频次不足', '轻微', '已解决', '李巡检', 6, 'yes'],
  [1, '垃圾箱分类标识脱落', '泉城路垃圾箱分类标识贴纸脱落，市民投放不便', '轻微', '待处理', '李巡检', 2, ''],
  [23, '健身器材螺栓松动', '堤口路健身器材漫步机螺栓松动，存在安全隐患', '一般', '处理中', '王巡检', 9, 'yes'],
  [9, '监控存储异常', '建设路监控杆录像存储服务异常，历史回放不可用', '一般', '待处理', '王巡检', 0, ''],
  [13, '垃圾箱门锁损坏', '张庄路垃圾箱投放门锁损坏，无法闭合', '轻微', '待处理', '李巡检', 0, ''],
  [25, '路灯灯罩破损', '洪家楼路灯灯罩被外力击裂，存在进水风险', '一般', '待处理', '王巡检', 1, ''],
];

// 工单：[故障索引, 班组索引, 状态, 优先级, 描述, 天偏移, 处理说明]
const ORDER_SEED = [
  [0, 1, 'closed', 'high', '纬十二路监控离线，链路排查与设备更换', 7, '更换 PoE 供电模块并重做水晶头，画面已恢复'],
  [1, 0, 'closed', 'normal', '经十路 002 号路灯闪烁，检修驱动电源', 3, '更换驱动电源，闪烁消除'],
  [2, 0, 'verified', 'normal', '解放路站牌灯箱不亮，检修内部线路', 2, '更换电源适配器并做防水处理'],
  [3, 4, 'verified', 'low', '英雄山路垃圾箱箱体更换', 4, '更换箱体，现场清理完毕'],
  [5, 3, 'resolved', 'high', '少年路消防栓阀杆渗水抢修', 7, '更换密封圈与填料，试压合格'],
  [6, 2, 'resolved', 'normal', '经二路井盖座圈加固', 8, '加装橡胶垫片并复位座圈'],
  [7, 3, 'in_progress', 'normal', '祝舜路排水口疏通', 5, '已疏通主篦子，正在清理支管'],
  [11, 4, 'in_progress', 'normal', '堤口路健身器材紧固与安全检查', 9, '已紧固漫步机，其余器材排查中'],
  [10, 4, 'assigned', 'low', '泉城路垃圾箱分类标识补贴', 2, ''],
  [8, 1, 'assigned', 'normal', '华龙路监控镜头更换评估', 1, ''],
  [12, 1, 'created', 'normal', '建设路监控存储服务异常排查', 0, ''],
  [14, 0, 'created', 'normal', '洪家楼路灯灯罩更换', 1, ''],
];

const ROUTE_SEED = [
  ['历下区主干道晨检线', 0, [0, 1, 2, 3, 4, 5], '每日', '覆盖经十路与泉城路核心段'],
  ['市中区商圈巡检线', 1, [6, 7, 8, 9, 10, 11], '每周', '商圈人流密集，重点看站牌与垃圾箱'],
  ['槐荫区西部干线巡检线', 2, [12, 13, 14, 15, 16, 17], '每周', '含高铁片区，监控为重点'],
  ['天桥区交通枢纽巡检线', 3, [18, 19, 20, 21, 22, 23], '每周', '车站周边，消防栓必查'],
  ['历城区高校片区巡检线', 4, [24, 25, 26, 27, 28, 29], '每旬', '开学季加密巡查'],
];

const DIAGNOSIS_TEXT = {
  0: '【诊断结论】监控类故障，初步判定为：网络链路中断 / 摄像机电源适配器损坏\n【风险等级】高\n【所需工具】网线测试仪、PoE 供电模块、笔记本\n【预计工时】2 小时\n【临时处置】立即设置安全围挡并安排 2 人小组当日处置',
  1: '【诊断结论】路灯类故障，初步判定为：灯具光源老化 / 驱动电源故障\n【风险等级】中\n【所需工具】万用表、绝缘胶带、备用 LED 灯头、升降梯\n【预计工时】1.5 小时\n【临时处置】设置警示标识，纳入 48 小时内计划处理',
  2: '【诊断结论】站牌类故障，初步判定为：灯箱内部线路短路 / 电源适配器故障\n【风险等级】中\n【所需工具】绝缘工具、备用适配器、密封胶\n【预计工时】1.5 小时\n【临时处置】设置警示标识，纳入 48 小时内计划处理',
  3: '【诊断结论】垃圾箱类故障，初步判定为：箱体受外力碰撞开裂\n【风险等级】低\n【所需工具】扳手套装、替换箱体\n【预计工时】1 小时\n【临时处置】设置警示标识，48 小时内更换',
  5: '【诊断结论】消防栓类故障，初步判定为：阀杆填料失效 / 密封圈老化\n【风险等级】高\n【所需工具】专用消防扳手、生料带、密封圈\n【预计工时】2 小时\n【临时处置】立即设置安全围挡并安排 2 人小组当日处置',
  6: '【诊断结论】井盖类故障，初步判定为：井盖座圈沉降导致松动\n【风险等级】中\n【所需工具】撬棍、警示围栏、橡胶垫片\n【预计工时】2 小时\n【临时处置】设置警示标识，纳入 48 小时内计划处理',
  7: '【诊断结论】排水类故障，初步判定为：雨水篦子堵塞\n【风险等级】中\n【所需工具】高压疏通机、抓斗、警示标志\n【预计工时】3 小时\n【临时处置】设置警示标识，纳入 48 小时内计划处理',
  9: '【诊断结论】垃圾箱类故障，初步判定为：清运频次不足\n【风险等级】低\n【所需工具】清洁用具\n【预计工时】0.5 小时\n【临时处置】增加清运班次',
  11: '【诊断结论】健身器材类故障，初步判定为：长期使用导致螺栓松动\n【风险等级】中\n【所需工具】扳手套装、螺纹胶\n【预计工时】1 小时\n【临时处置】暂停使用并设置警示标识',
};

const CHAIN = {
  created: ['created'],
  assigned: ['created', 'assigned'],
  in_progress: ['created', 'assigned', 'in_progress'],
  resolved: ['created', 'assigned', 'in_progress', 'resolved'],
  verified: ['created', 'assigned', 'in_progress', 'resolved', 'verified'],
  closed: ['created', 'assigned', 'in_progress', 'resolved', 'verified', 'closed'],
};
const REMARKS = {
  created: '工单创建，等待派单',
  assigned: '已派单至维修班组',
  in_progress: '班组已到场，开始维修',
  resolved: '维修完成，提交验收',
  verified: '验收通过',
  closed: '工单关闭，归档完成',
};

function seedIfNeeded() {
  const count = (t) => { try { return db.prepare('SELECT COUNT(*) AS c FROM ' + t).get().c; } catch { return 0; } };
  if (count('users') > 0 && count('work_orders') > 0) return;
  if (count('users') > 0) {
    db.exec('DELETE FROM notifications; DELETE FROM work_order_logs; DELETE FROM work_orders; DELETE FROM inspection_routes; DELETE FROM inspections; DELETE FROM faults; DELETE FROM facilities; DELETE FROM maintenance_teams; DELETE FROM facility_types; DELETE FROM districts; DELETE FROM users;');
  }

  const insUser = db.prepare('INSERT INTO users (username,password,role,nickname,district,phone) VALUES (?,?,?,?,?,?)');
  const adminId = insUser.run('admin', hashPassword('admin123'), 'admin', '城管局管理员', '历下区', '13800000001').lastInsertRowid;
  const insp1 = insUser.run('inspector1', hashPassword('inspector123'), 'user', '王巡检', '历下区', '13800000002').lastInsertRowid;
  const insp2 = insUser.run('inspector2', hashPassword('inspector123'), 'user', '李巡检', '市中区', '13800000003').lastInsertRowid;
  insUser.run('team1', hashPassword('team123'), 'user', '张建国（照明一班）', '天桥区', '13800000004');
  insUser.run('team2', hashPassword('team123'), 'user', '李卫东（弱电监控班）', '槐荫区', '13800000005');

  const insDistrict = db.prepare('INSERT INTO districts (name,code,center_lat,center_lng,note) VALUES (?,?,?,?,?)');
  const districtIds = DISTRICT_SEED.map((d) => insDistrict.run(...d).lastInsertRowid);

  const insType = db.prepare('INSERT INTO facility_types (name,icon,default_cycle_days,note) VALUES (?,?,?,?)');
  const typeIds = TYPE_SEED.map((t) => insType.run(...t).lastInsertRowid);

  const insTeam = db.prepare('INSERT INTO maintenance_teams (name,leader,phone,specialties,capacity,note) VALUES (?,?,?,?,?,?)');
  const teamIds = TEAM_SEED.map((t) => insTeam.run(...t).lastInsertRowid);

  const insFacility = db.prepare('INSERT INTO facilities (user_id,district_id,type_id,name,category,address,lat,lng,status,installed_at,note) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const facilityIds = FACILITY_SEED.map((f) => insFacility.run(
    adminId, districtIds[f[0]], typeIds[f[1]], f[2], TYPE_SEED[f[1]][0], f[3], f[4], f[5], f[6], f[7], f[8]
  ).lastInsertRowid);

  const insInspection = db.prepare('INSERT INTO inspections (user_id,facility_id,result,inspector,note,inspected_at) VALUES (?,?,?,?,?,?)');
  INSPECTION_SEED.forEach((r) => insInspection.run(adminId, facilityIds[r[0]], r[1], r[2], r[3], day(r[4], r[5])));

  const insFault = db.prepare('INSERT INTO faults (user_id,facility_id,title,description,severity,status,reporter,diagnosis,diagnosed_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const faultIds = FAULT_SEED.map((f, i) => {
    const diag = f[7] ? (DIAGNOSIS_TEXT[i] || '') : '';
    return insFault.run(adminId, facilityIds[f[0]], f[1], f[2], f[3], f[4], f[5], diag, diag ? day(f[6], '09:15:00') : '', day(f[6], '08:30:00')).lastInsertRowid;
  });

  const insOrder = db.prepare('INSERT INTO work_orders (code,fault_id,facility_id,team_id,status,priority,created_by,assigned_at,resolved_at,verified_at,closed_at,description,resolution,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const insLog = db.prepare('INSERT INTO work_order_logs (order_id,from_status,to_status,operator_id,remark,created_at) VALUES (?,?,?,?,?,?)');
  const operators = [adminId, insp1, insp2];
  const TIMES = ['08:40:00', '10:20:00', '14:10:00', '16:30:00', '09:30:00', '11:50:00'];

  ORDER_SEED.forEach((o, idx) => {
    const status = o[2];
    const chain = CHAIN[status];
    const base = o[5];
    const at = (step) => day(base + Math.floor(step / 3), TIMES[step % 6]);
    const orderId = insOrder.run(
      'WO2026' + (900 + idx), faultIds[o[0]], facilityIds[FAULT_SEED[o[0]][0]], chain.includes('assigned') ? teamIds[o[1]] : null,
      status, o[3], adminId,
      chain.includes('assigned') ? at(1) : '', chain.includes('resolved') ? at(3) : '',
      chain.includes('verified') ? at(4) : '', chain.includes('closed') ? at(5) : '',
      o[4], chain.includes('resolved') ? o[6] : '', at(0)
    ).lastInsertRowid;
    let prev = null;
    chain.forEach((st, step) => {
      insLog.run(orderId, prev, st, operators[step % operators.length], REMARKS[st], at(step));
      prev = st;
    });
  });

  // 班组负载按在途工单重算，避免手写数字与工单不一致。
  db.exec("UPDATE maintenance_teams SET active_jobs = (SELECT COUNT(*) FROM work_orders WHERE work_orders.team_id = maintenance_teams.id AND work_orders.status IN ('assigned','in_progress','resolved'))");

  const insRoute = db.prepare('INSERT INTO inspection_routes (name,district_id,facility_ids,created_by,cycle,note) VALUES (?,?,?,?,?,?)');
  ROUTE_SEED.forEach((r) => insRoute.run(r[0], districtIds[r[1]], JSON.stringify(r[2].map((i) => facilityIds[i])), adminId, r[3], r[4]));

  const insNotice = db.prepare('INSERT INTO notifications (user_id,type,title,body,read,created_at) VALUES (?,?,?,?,?,?)');
  const NOTICE_SEED = [
    [adminId, 'work_order', '工单 WO2026900 已关闭', '纬十二路监控离线工单已完成验收并关闭', 1, 7],
    [adminId, 'work_order', '工单 WO2026901 已关闭', '经十路 002 号路灯闪烁工单已完成验收并关闭', 1, 3],
    [adminId, 'work_order', '工单 WO2026902 待验收', '解放路站牌灯箱检修已提交验收', 0, 2],
    [adminId, 'work_order', '工单 WO2026903 待验收', '英雄山路垃圾箱箱体更换已提交验收', 0, 4],
    [adminId, 'fault', '新增严重故障', '少年路消防栓阀杆渗水，已判定为严重', 0, 7],
    [adminId, 'fault', '新增严重故障', '纬十二路监控摄像头离线，已判定为严重', 1, 7],
    [adminId, 'system', '巡检计划提醒', '历下区主干道晨检线今日待执行', 0, 0],
    [adminId, 'system', '班组负载预警', '给排水抢修班在途工单已达 2 单，请关注排期', 0, 7],
    [insp1, 'work_order', '工单已派单', '您上报的经十路 002 号路灯故障已派单至照明维修一班', 1, 3],
    [insp1, 'work_order', '工单已关闭', '您上报的监控离线工单已关闭', 1, 7],
    [insp1, 'fault', '故障已诊断', '历山路监控画面卡顿已完成 AI 诊断', 0, 1],
    [insp1, 'system', '巡检路线提醒', '历下区主干道晨检线共 6 个打卡点', 0, 1],
    [insp2, 'work_order', '工单已派单', '您上报的解放路站牌灯箱故障已派单', 1, 2],
    [insp2, 'work_order', '工单待验收', '英雄山路垃圾箱更换已提交验收', 0, 4],
    [insp2, 'fault', '故障已诊断', '少年路消防栓渗水已完成 AI 诊断', 0, 7],
    [insp2, 'system', '巡检路线提醒', '市中区商圈巡检线本周待执行', 0, 3],
    [adminId, 'work_order', '工单已派单', '祝舜路排水口疏通已派单至给排水抢修班', 1, 5],
    [adminId, 'work_order', '工单已派单', '堤口路健身器材紧固已派单至环卫设施班', 1, 9],
    [insp2, 'system', '汛期提示', '本周有降雨，请重点关注排水口与井盖', 0, 5],
    [insp1, 'system', '账号安全提醒', '建议定期修改登录密码', 0, 6],
  ];
  NOTICE_SEED.forEach((n) => insNotice.run(n[0], n[1], n[2], n[3], n[4], day(n[5], '12:00:00')));

  console.log('[seed] CityLens 演示数据已就绪：11 张表 / 5 区域 / 8 类型 / 30 设施 / 12 工单');
}

seedIfNeeded();

module.exports = { db, seedIfNeeded, DB_PATH };
