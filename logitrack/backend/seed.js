// 种子数据：3 账号 + 8 网点 + 6 车 + 6 司机 + 30 运单（跨 10 天，覆盖 8 个状态）
//           + 对应包裹 / 节点 / 扫描 / 异常 / 通知。
//
// 关键点：每张运单的时间轴不是硬编码的，而是按状态机"走到哪一步就补哪几个节点"，
// 因此种子数据与真实流转产生的数据形状完全一致，前端时间轴无需为种子做特殊分支。
'use strict';
const { hashPassword } = require('./kernel').auth;

// 8 个网点：覆盖华东/华北/华南/西南/华中/西北
const WAREHOUSES = [
  { name: '上海青浦分拨中心', code: 'SH-QP', province: '上海市', city: '上海', district: '青浦区', address: '青浦区华新镇华志路 1688 号', lat: 31.1509, lng: 121.1136, coverage: '上海市全域 / 江浙沪次日达', manager: '周建国', phone: '021-6688-1001', capacity: 12000 },
  { name: '北京朝阳网点', code: 'BJ-CY', province: '北京市', city: '北京', district: '朝阳区', address: '朝阳区东坝南二街 15 号院', lat: 39.9643, lng: 116.5581, coverage: '朝阳 / 东城 / 通州部分', manager: '李海涛', phone: '010-8822-2002', capacity: 8000 },
  { name: '广州天河网点', code: 'GZ-TH', province: '广东省', city: '广州', district: '天河区', address: '天河区科韵路 32 号物流园 B 栋', lat: 23.1291, lng: 113.3612, coverage: '天河 / 越秀 / 海珠', manager: '陈嘉明', phone: '020-3388-3003', capacity: 9000 },
  { name: '深圳南山网点', code: 'SZ-NS', province: '广东省', city: '深圳', district: '南山区', address: '南山区西丽留仙大道 1001 号', lat: 22.5431, lng: 113.9344, coverage: '南山 / 福田 / 宝安部分', manager: '黄志远', phone: '0755-8899-4004', capacity: 10000 },
  { name: '杭州西湖网点', code: 'HZ-XH', province: '浙江省', city: '杭州', district: '西湖区', address: '西湖区文一西路 588 号', lat: 30.2741, lng: 120.0812, coverage: '西湖 / 拱墅 / 余杭部分', manager: '吴晓东', phone: '0571-8866-5005', capacity: 7500 },
  { name: '成都武侯网点', code: 'CD-WH', province: '四川省', city: '成都', district: '武侯区', address: '武侯区武科西五路 98 号', lat: 30.5723, lng: 104.0432, coverage: '武侯 / 高新 / 锦江部分', manager: '刘国栋', phone: '028-8877-6006', capacity: 7000 },
  { name: '武汉江汉网点', code: 'WH-JH', province: '湖北省', city: '武汉', district: '江汉区', address: '江汉区常青路 128 号', lat: 30.5928, lng: 114.2617, coverage: '江汉 / 江岸 / 硚口', manager: '徐文斌', phone: '027-8833-7007', capacity: 6500 },
  { name: '西安雁塔网点', code: 'XA-YT', province: '陕西省', city: '西安', district: '雁塔区', address: '雁塔区丈八东路 20 号', lat: 34.3416, lng: 108.9424, coverage: '雁塔 / 碑林 / 高新', manager: '马建军', phone: '029-8811-8008', capacity: 6000 },
];

const VEHICLES = [
  { plate_no: '沪A·L2896', vtype: '厢式货车', load_capacity: 8, volume_capacity: 45, status: 'in_use', mileage: 126800, next_service: '2026-10-15' },
  { plate_no: '京N·F7712', vtype: '厢式货车', load_capacity: 5, volume_capacity: 28, status: 'idle', mileage: 88420, next_service: '2026-11-02' },
  { plate_no: '粤B·H3305', vtype: '冷藏车', load_capacity: 3.5, volume_capacity: 18, status: 'in_use', mileage: 54120, next_service: '2026-10-08' },
  { plate_no: '粤B·M6618', vtype: '电动三轮车', load_capacity: 0.8, volume_capacity: 4, status: 'idle', mileage: 21300, next_service: '2026-12-01' },
  { plate_no: '浙A·Q9042', vtype: '厢式货车', load_capacity: 6, volume_capacity: 34, status: 'maintenance', mileage: 97310, next_service: '2026-09-30' },
  { plate_no: '川A·W5580', vtype: '高栏车', load_capacity: 12, volume_capacity: 60, status: 'idle', mileage: 158940, next_service: '2026-10-21' },
];

const DRIVERS = [
  { name: '王力强', phone: '13801234567', license_no: 'A2-310104198705121234', status: 'on_task', rating: 4.9, completed_count: 1284 },
  { name: '张卫东', phone: '13902345678', license_no: 'B2-110105199001234567', status: 'available', rating: 4.8, completed_count: 962 },
  { name: '刘海峰', phone: '13703456789', license_no: 'A2-440106198811203344', status: 'on_task', rating: 4.9, completed_count: 1531 },
  { name: '赵明亮', phone: '13604567890', license_no: 'C1-440305199503157788', status: 'available', rating: 4.7, completed_count: 618 },
  { name: '孙建军', phone: '13505678901', license_no: 'B2-330106198209094455', status: 'available', rating: 4.8, completed_count: 1107 },
  { name: '李文博', phone: '13406789012', license_no: 'A2-510107199107226699', status: 'resting', rating: 4.6, completed_count: 843 },
];

// 收寄件人池（真实感姓名 + 手机号 + 城市坐标）
const PEOPLE = [
  { name: '陈思远', phone: '13812345678', company: '远景科技' },
  { name: '林晓雯', phone: '13923456789', company: '' },
  { name: '周浩然', phone: '13734567890', company: '浩然贸易' },
  { name: '吴佳怡', phone: '13645678901', company: '' },
  { name: '郑一鸣', phone: '13556789012', company: '一鸣电子' },
  { name: '何雨晴', phone: '13467890123', company: '' },
  { name: '许志豪', phone: '13378901234', company: '志豪服饰' },
  { name: '曹雪琳', phone: '13289012345', company: '' },
  { name: '邓伟民', phone: '13190123456', company: '伟民五金' },
  { name: '冯雅静', phone: '13001234567', company: '' },
  { name: '宋志强', phone: '15812345678', company: '志强物流' },
  { name: '唐嘉慧', phone: '15923456789', company: '' },
  { name: '袁俊杰', phone: '15734567890', company: '俊杰数码' },
  { name: '谢明轩', phone: '15645678901', company: '' },
  { name: '钟丽华', phone: '15556789012', company: '丽华食品' },
  { name: '罗文涛', phone: '15467890123', company: '' },
];

// 详细地址模板：城市 + 街道 + 门牌
const STREET = ['中山北路', '人民大道', '解放路', '建设大街', '科技园路', '滨江大道', '文化路', '新华街', '长江路', '黄河大道'];
const BUILDING = ['国际大厦', '创业中心', '科技园 A 座', '写字楼', '产业园 3 号楼', '生活广场', '公寓 2 期', '商业中心'];

const GOODS = ['日用品', '服装鞋帽', '数码产品', '食品', '文件资料', '家具配件', '医药用品', '化妆品', '汽车配件', '图书'];
const PAY_METHODS = ['寄付', '到付', '月结'];

const EX_TYPES = ['拒收', '破损', '地址错误', '超时'];

function ts(base, addHours) {
  const d = new Date(base.getTime() + addHours * 3600000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 主链路顺序（异常分支另行处理）
const CHAIN = ['picked_up', 'in_transit', 'arrived_hub', 'out_for_delivery', 'delivered'];

const STATUS_LABEL = {
  created: '已下单', picked_up: '已揽收', in_transit: '运输中', arrived_hub: '到达分拨',
  out_for_delivery: '派送中', delivered: '已签收', exception: '异常', returned: '已退回',
};

const NODE_META = {
  created: { node_type: 'created', suffix: '下单', scan: 'create' },
  picked_up: { node_type: 'pickup', suffix: '揽收', scan: 'pickup' },
  in_transit: { node_type: 'transit', suffix: '运输中', scan: 'transit' },
  arrived_hub: { node_type: 'hub', suffix: '分拨中心', scan: 'inbound' },
  out_for_delivery: { node_type: 'delivery', suffix: '派送', scan: 'outbound' },
  delivered: { node_type: 'signed', suffix: '签收', scan: 'signed' },
  exception: { node_type: 'exception', suffix: '异常', scan: 'exception' },
  returned: { node_type: 'returned', suffix: '退回', scan: 'return' },
};

function runSeed(db) {
  const insUser = db.prepare('INSERT INTO users (username, password, role, nickname, phone, warehouse_id) VALUES (?,?,?,?,?,?)');
  const adminId = insUser.run('admin', hashPassword('admin123'), 'admin', '总部管理员', '400-800-1234', 1).lastInsertRowid;
  const dispId = insUser.run('dispatcher1', hashPassword('dispatcher123'), 'dispatcher', '调度员 · 周敏', '13800001111', 1).lastInsertRowid;
  const courId = insUser.run('courier1', hashPassword('courier123'), 'courier', '快递员 · 王力强', '13801234567', 2).lastInsertRowid;

  // ---- 网点 ----
  const insWh = db.prepare(`INSERT INTO warehouses (user_id, name, code, province, city, district, address, lat, lng, coverage, manager, phone, capacity, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const whIds = WAREHOUSES.map((w) => insWh.run(
    adminId, w.name, w.code, w.province, w.city, w.district, w.address, w.lat, w.lng,
    w.coverage, w.manager, w.phone, w.capacity, 'active',
  ).lastInsertRowid);

  // ---- 车辆 ----
  const insVeh = db.prepare(`INSERT INTO vehicles (user_id, plate_no, vtype, load_capacity, volume_capacity, warehouse_id, status, mileage, next_service, note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const vehIds = VEHICLES.map((v, i) => insVeh.run(
    adminId, v.plate_no, v.vtype, v.load_capacity, v.volume_capacity,
    whIds[i % whIds.length], v.status, v.mileage, v.next_service, '',
  ).lastInsertRowid);

  // ---- 司机 ----
  const insDrv = db.prepare(`INSERT INTO drivers (user_id, name, phone, license_no, warehouse_id, vehicle_id, status, rating, completed_count, note)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const drvIds = DRIVERS.map((d, i) => insDrv.run(
    adminId, d.name, d.phone, d.license_no, whIds[i % whIds.length],
    vehIds[i % vehIds.length], d.status, d.rating, d.completed_count, '',
  ).lastInsertRowid);

  // 车辆 ↔ 司机 互指
  DRIVERS.forEach((d, i) => {
    db.prepare('UPDATE vehicles SET driver_id = ? WHERE id = ?').run(drvIds[i], vehIds[i]);
  });

  // ---- 收寄件人档案 ----
  const insCust = db.prepare(`INSERT INTO customers (user_id, name, phone, role_type, province, city, district, address, lat, lng, company, note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const custIds = [];
  PEOPLE.forEach((p, i) => {
    const w = WAREHOUSES[i % WAREHOUSES.length];
    const addr = `${w.province}${w.city}${w.district}${STREET[i % STREET.length]}${100 + i * 7} 号 ${BUILDING[i % BUILDING.length]}`;
    const jitter = (n) => Number((n + ((i * 13) % 40 - 20) / 1000).toFixed(4));
    custIds.push(insCust.run(
      adminId, p.name, p.phone, i % 2 === 0 ? 'sender' : 'receiver',
      w.province, w.city, w.district, addr, jitter(w.lat), jitter(w.lng), p.company, '',
    ).lastInsertRowid);
  });

  // ---- 运单：30 张，跨 10 天，覆盖 8 个状态 ----
  // 状态分布：created 3 / picked_up 3 / in_transit 5 / arrived_hub 4 /
  //           out_for_delivery 4 / delivered 6 / exception 3 / returned 2
  const PLAN = [
    ...Array(3).fill('created'),
    ...Array(3).fill('picked_up'),
    ...Array(5).fill('in_transit'),
    ...Array(4).fill('arrived_hub'),
    ...Array(4).fill('out_for_delivery'),
    ...Array(6).fill('delivered'),
    ...Array(3).fill('exception'),
    ...Array(2).fill('returned'),
  ];

  const insWb = db.prepare(`INSERT INTO waybills (
    user_id, waybill_no, sender_id, receiver_id, sender_name, sender_phone, sender_address, sender_lat, sender_lng,
    receiver_name, receiver_phone, receiver_address, receiver_lat, receiver_lng,
    origin_warehouse_id, dest_warehouse_id, origin_city, dest_city, status, goods_type,
    weight, volume, insured, insured_value, freight, payment_method, driver_id, vehicle_id,
    current_warehouse_id, estimated_delivery, actual_delivery, signed_by, exception_flag, remark, created_at, updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const insPkg = db.prepare(`INSERT INTO packages (user_id, waybill_id, name, quantity, weight, volume, goods_type, note) VALUES (?,?,?,?,?,?,?,?)`);
  const insNode = db.prepare(`INSERT INTO route_nodes (user_id, waybill_id, seq, node_type, warehouse_id, name, city, lat, lng, node_status, operator, arrived_at, departed_at, remark)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insScan = db.prepare(`INSERT INTO scan_records (user_id, waybill_id, node_id, warehouse_id, scan_type, status_snapshot, operator, location, lat, lng, note, scanned_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insLog = db.prepare(`INSERT INTO status_logs (user_id, waybill_id, from_status, to_status, operator, note, created_at) VALUES (?,?,?,?,?,?,?)`);
  const insEx = db.prepare(`INSERT INTO exceptions (user_id, waybill_id, waybill_no, ex_type, description, severity, ex_status, handler, resolution, source, resolved_at, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);

  const NOW = new Date();
  const wbIds = [];
  let seqNo = 0;

  PLAN.forEach((target, idx) => {
    // 每张运单的下单时间：向前推 0-9 天，使数据横跨 10 天
    const dayBack = Math.floor(idx / 3);            // 0..9
    const hourOfDay = 8 + (idx * 3) % 11;           // 8..18 点
    const base = new Date(NOW.getTime() - dayBack * 86400000);
    base.setHours(hourOfDay, (idx * 7) % 60, 0, 0);

    const oi = idx % WAREHOUSES.length;
    const di = (idx * 3 + 4) % WAREHOUSES.length;
    const origin = WAREHOUSES[oi];
    const dest = WAREHOUSES[di];

    const sender = PEOPLE[(idx * 2) % PEOPLE.length];
    const receiver = PEOPLE[(idx * 2 + 5) % PEOPLE.length];
    const senderAddr = `${origin.province}${origin.city}${origin.district}${STREET[(idx + 3) % STREET.length]}${200 + idx * 5} 号 ${BUILDING[(idx + 1) % BUILDING.length]}`;
    const receiverAddr = `${dest.province}${dest.city}${dest.district}${STREET[(idx + 6) % STREET.length]}${300 + idx * 3} 号 ${BUILDING[(idx + 4) % BUILDING.length]}`;
    const jit = (n, k) => Number((n + (((idx * 17 + k * 11) % 40) - 20) / 1000).toFixed(4));

    const weight = Number((0.5 + ((idx * 13) % 180) / 10).toFixed(2));
    const volume = Number((0.01 + ((idx * 7) % 90) / 1000).toFixed(3));
    const insured = idx % 3 === 0 ? 1 : 0;
    const insuredValue = insured ? Number((500 + ((idx * 137) % 4500)).toFixed(2)) : 0;
    const freight = Number((12 + weight * 3.5 + volume * 120 + (insured ? insuredValue * 0.003 : 0)).toFixed(2));
    const goods = GOODS[idx % GOODS.length];
    const pay = PAY_METHODS[idx % PAY_METHODS.length];

    const estDelivery = ts(base, 36 + (idx % 5) * 6);
    const waybillNo = `LT${ts(base, 0).slice(0, 10).replace(/-/g, '')}${String(++seqNo).padStart(4, '0')}`;

    // 异常分支决定"走到哪一步掉头"
    const isException = target === 'exception' || target === 'returned';
    const lastMain = target === 'exception' || target === 'returned' ? 'in_transit' : target;
    const chainEnd = CHAIN.indexOf(lastMain); // -1 表示只到 created

    // 有司机/车辆的运单：派送中的一定有，已签收的保留
    const needDriver = ['out_for_delivery', 'delivered', 'exception', 'returned'].includes(target) || idx % 2 === 0;
    const drvIdx = idx % drvIds.length;
    const driverId = needDriver ? drvIds[drvIdx] : 0;
    const vehicleId = needDriver ? vehIds[drvIdx] : 0;

    const isDelivered = target === 'delivered';
    const actualDelivery = isDelivered ? ts(base, 30 + (idx % 7) * 5) : '';

    const wbId = insWb.run(
      adminId, waybillNo,
      custIds[(idx * 2) % custIds.length], custIds[(idx * 2 + 5) % custIds.length],
      sender.name, sender.phone, senderAddr, jit(origin.lat, 1), jit(origin.lng, 2),
      receiver.name, receiver.phone, receiverAddr, jit(dest.lat, 3), jit(dest.lng, 4),
      whIds[oi], whIds[di], origin.city, dest.city, target, goods,
      weight, volume, insured, insuredValue, freight, pay,
      driverId, vehicleId,
      whIds[oi], estDelivery, actualDelivery,
      isDelivered ? receiver.name : '',
      isException ? 1 : 0,
      '', ts(base, 0), ts(base, chainEnd >= 0 ? chainEnd * 8 + 2 : 1),
    ).lastInsertRowid;
    wbIds.push(wbId);

    // 包裹明细 1-3 条
    const pkgCount = 1 + (idx % 3);
    for (let p = 0; p < pkgCount; p += 1) {
      insPkg.run(
        adminId, wbId,
        p === 0 ? `${goods}（主件）` : `${goods}（配件 ${p}）`,
        1 + ((idx + p) % 3),
        Number((weight / pkgCount).toFixed(2)),
        Number((volume / pkgCount).toFixed(3)),
        goods, '',
      );
    }

    // 时间轴节点：从 created 起按状态机逐站推进
    let seq = 0;
    let cursor = 0; // 小时偏移
    const pushNode = (statusKey, hoursIn, hoursOut, warehouseIdx, nodeStatus, operator, remark, coords) => {
      const meta = NODE_META[statusKey];
      const w = WAREHOUSES[warehouseIdx % WAREHOUSES.length];
      const isTerminal = statusKey === 'delivered' || statusKey === 'returned';
      const name = statusKey === 'created'
        ? `${origin.city} · 下单`
        : isTerminal
          ? `${dest.city} · ${meta.suffix}`
          : `${w.city} · ${meta.suffix}`;
      const lat = coords?.lat ?? (isTerminal ? dest.lat : w.lat);
      const lng = coords?.lng ?? (isTerminal ? dest.lng : w.lng);
      const nodeId = insNode.run(
        adminId, wbId, ++seq, meta.node_type,
        statusKey === 'created' ? whIds[oi] : isTerminal ? whIds[di] : whIds[warehouseIdx % whIds.length],
        name, isTerminal ? dest.city : w.city, lat, lng, nodeStatus, operator,
        ts(base, hoursIn), hoursOut === null ? '' : ts(base, hoursOut), remark,
      ).lastInsertRowid;

      insScan.run(
        adminId, wbId, nodeId,
        statusKey === 'created' ? whIds[oi] : whIds[warehouseIdx % whIds.length],
        meta.scan, statusKey, operator, name, lat, lng, remark, ts(base, hoursIn),
      );
      return nodeId;
    };

    // 第 0 站：下单（一定存在）
    pushNode('created', 0, null, oi, chainEnd >= 0 ? 'done' : 'active', '系统', '运单创建成功');

    // 主链路推进
    const stops = chainEnd < 0 ? [] : CHAIN.slice(0, chainEnd + 1);
    stops.forEach((st, i) => {
      cursor += 3 + ((idx + i) % 6);          // 每站间隔 3-8 小时
      const isLast = i === stops.length - 1 && !isException;
      const wIdx = st === 'delivered' ? di : (oi + i + 1) % WAREHOUSES.length;
      const nodeStatus = isLast && st !== 'delivered' ? 'active' : 'done';
      pushNode(st, cursor, isLast ? null : cursor + 2, wIdx, nodeStatus, DRIVERS[(idx + i) % DRIVERS.length].name, '');
      cursor += 2;
      insLog.run(adminId, wbId, i === 0 ? 'created' : stops[i - 1], st, DRIVERS[(idx + i) % DRIVERS.length].name, '', ts(base, cursor));
    });

    // 异常分支：补异常节点（+ 退回节点）
    if (isException) {
      cursor += 4;
      const exType = EX_TYPES[idx % EX_TYPES.length];
      const exDesc = {
        拒收: '收件人当场拒收，货物原路带回网点暂存',
        破损: '外包装有明显破损，内件待开箱核验',
        地址错误: '收件地址门牌号不存在，多次联系收件人未果',
        超时: '超过承诺时效仍未完成派送，系统自动标记',
      }[exType];
      const exNodeId = pushNode('exception', cursor, null, (oi + 2) % WAREHOUSES.length, 'exception', '王力强', exDesc);
      insLog.run(adminId, wbId, 'in_transit', 'exception', '王力强', exDesc, ts(base, cursor));
      cursor += 2;

      const resolved = target === 'returned';
      insEx.run(
        adminId, wbId, waybillNo, exType, exDesc,
        idx % 3 === 0 ? '严重' : '一般',
        resolved ? 'resolved' : 'open',
        resolved ? '周敏' : '',
        resolved ? '已安排原路退回发件网点，运费按协议退还' : '',
        'manual',
        resolved ? ts(base, cursor) : '',
        ts(base, cursor - 2),
      );

      if (resolved) {
        const backIdx = (oi + 1) % WAREHOUSES.length;
        pushNode('returned', cursor, null, backIdx, 'done', '张卫东', '货物已退回发件网点，等待寄件人自提');
        insLog.run(adminId, wbId, 'exception', 'returned', '张卫东', '原路退回', ts(base, cursor));
      }
      // 异常节点被后续节点覆盖为 done 时保持一致性
      db.prepare("UPDATE route_nodes SET node_status = 'done' WHERE waybill_id = ? AND node_status = 'active' AND id != (SELECT id FROM route_nodes WHERE waybill_id = ? ORDER BY seq DESC LIMIT 1)")
        .run(wbId, wbId);
    }

    // 最终态修正：把最后一个节点标为 active（未完成的单），完成的都标 done
    const lastNode = db.prepare('SELECT id, node_type FROM route_nodes WHERE waybill_id = ? ORDER BY seq DESC LIMIT 1').get(wbId);
    const terminal = ['delivered', 'returned', 'exception'].includes(target);
    if (lastNode) {
      db.prepare('UPDATE route_nodes SET node_status = ? WHERE id = ?')
        .run(terminal ? (target === 'exception' ? 'exception' : 'done') : 'active', lastNode.id);
    }

    // 已签收但签收时间早于最后节点的边界情况，统一回填
    if (isDelivered && !actualDelivery) {
      db.prepare("UPDATE waybills SET actual_delivery = datetime('now','localtime') WHERE id = ?").run(wbId);
    }
  });

  // ---- 历史异常归档 ----
  // 上面每张异常运单只产生 1 条"当前未解决"的异常记录（共 5 条）。
  // 真实的物流后台还会有大量"已处理完毕"的历史异常——它们不影响运单当前状态，
  // 但构成异常率统计与类型分布的数据基础。这里补一批归档记录。
  const HISTORY_TYPES = ['超时', '破损', '地址错误', '拒收'];
  const HISTORY_RESOLUTIONS = [
    '已联系收件人重新约定派送时间，当日完成签收',
    '外包装破损已开箱核验，内件完好，重新加固包装后派送',
    '地址核对后更正门牌号，次日完成派送',
    '收件人拒收后已按寄件人要求改寄新地址，产生二次派送费用 18 元',
    '网点滞留超 48 小时，已升级处理并补偿运费券',
    '分拨中心错分导致绕行，已纠正路由并记录考核',
  ];
  const allWb = db.prepare('SELECT id, user_id, waybill_no, status, created_at FROM waybills ORDER BY id ASC').all();
  let historyAdded = 0;
  for (let i = 0; i < 14; i += 1) {
    const w = allWb[(i * 5 + 3) % allWb.length];
    // 避免为"当前正处异常/退回"的运单伪造已解决记录，造成状态语义冲突
    if (w.status === 'exception') continue;
    const base = new Date(String(w.created_at).replace(' ', 'T'));
    const type = HISTORY_TYPES[i % HISTORY_TYPES.length];
    const created = ts(base, 8 + (i % 12));
    insEx.run(
      adminId, w.id, w.waybill_no, type,
      `${type}：${['超出承诺时效 12 小时', '外箱有明显挤压痕迹', '收件地址门牌号不存在', '收件人当场表示不需要'][i % 4]}`,
      i % 5 === 0 ? '严重' : '一般',
      i % 3 === 0 ? 'closed' : 'resolved',
      DRIVERS[i % DRIVERS.length].name,
      HISTORY_RESOLUTIONS[i % HISTORY_RESOLUTIONS.length],
      i % 4 === 0 ? 'ai' : 'manual',
      ts(base, 20 + (i % 10)),
      created,
    );
    historyAdded += 1;
  }

  // ---- 通知 ----
  const insNotif = db.prepare('INSERT INTO notifications (user_id, waybill_id, title, body, ntype, is_read, created_at) VALUES (?,?,?,?,?,?,?)');
  const recent = db.prepare('SELECT id, waybill_no, status, created_at FROM waybills ORDER BY id DESC LIMIT 14').all();
  recent.forEach((w, i) => {
    insNotif.run(
      adminId, w.id,
      `${w.waybill_no} ${STATUS_LABEL[w.status] || w.status}`,
      `运单状态更新为「${STATUS_LABEL[w.status] || w.status}」`,
      w.status === 'exception' ? 'alert' : 'status',
      i > 5 ? 1 : 0,
      w.created_at,
    );
  });
  insNotif.run(dispId, 0, '待分配运单提醒', `当前有 ${db.prepare("SELECT COUNT(*) AS c FROM waybills WHERE driver_id = 0").get().c} 张运单尚未指派司机`, 'system', 0, ts(NOW, -3));
  insNotif.run(courId, 0, '今日派送任务', '您有 3 张运单处于派送中，请及时更新签收状态', 'system', 0, ts(NOW, -5));

  console.log(`[seed] LogiTrack 已初始化：3 账号 / ${WAREHOUSES.length} 网点 / ${VEHICLES.length} 车辆 / ${DRIVERS.length} 司机 / ${PLAN.length} 运单`);
}

// `npm run seed` 直接执行时：加载 db（其内部会调用 runSeed）后打印结果。
if (require.main === module) {
  const { db } = require('./db');
  const n = db.prepare('SELECT COUNT(*) AS c FROM waybills').get().c;
  console.log(`[seed] 当前库中运单数：${n}`);
}

module.exports = { runSeed, WAREHOUSES, VEHICLES, DRIVERS };
