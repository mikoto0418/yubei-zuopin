// ScriptForge 种子数据：3 账号 / 2 部作品 / 每部 3 分集 / 每集 4 场景 /
// 8 个角色 / 10 条关系 / 30 条对白 / 3 条故事线 / 若干笔记与版本快照。
// 数据跨 2026-09-10 ~ 2026-09-22 共 13 个日期，仪表盘与列表页有真实内容可看。
'use strict';
const { db } = require('./db');
const { hashPassword } = require('./kernel').auth;

// —— 角色设定 ——
const P1_CHARS = [
  ['沈砚', '34', '港务局稽查员', '沉默克制，认死理，不擅表达', '查清父亲十五年前在雾港失踪的真相', '从相信制度到明白有些事只能自己动手'],
  ['林晚', '29', '晚报社会新闻记者', '锋利、直给、不设防', '拿到沉船案的独家报道', '从旁观者变成事件当事人'],
  ['陈伯', '61', '雾港老船工', '寡言，重情义，怕欠人情', '守住雾港那晚的秘密', '从守口如瓶到临终托付'],
  ['周慕', '41', '港务集团副总经理', '体面、克制、精于计算', '把十五年前的旧案彻底盖住', '从掌控全局到被自己布下的局反噬'],
];

const P2_CHARS = [
  ['苏黎', '27', '急诊科住院医师', '冷静、过度自持、报喜不报忧', '熬过这轮连续夜班，并决定是走是留', '从逃避选择到主动留下'],
  ['郑野', '30', '急救车司机', '话密、仗义、嘴上没正经', '攒够钱盘下一间修车铺', '从混日子到心里有了牵挂'],
  ['何静', '45', '急诊科护士长', '严厉、护短、刀子嘴', '保住科室仅剩的人手', '从铁面无私到愿意示弱'],
  ['陆星', '24', '急诊科规培生', '怯生、理论派、怕出错', '通过考核留下来', '从纸上谈兵到能扛住事'],
];

// —— 分集 / 场景 ——
// 每集 4 个场景；content 是场景正文，会被字数统计与版本快照使用。
const P1_EPISODES = [
  {
    title: '第一集 · 雾中来客',
    summary: '沈砚在例行稽查中登上一艘没有编号的货船，从船板下摸出一枚生锈的港务徽章。',
    scenes: [
      ['雾港三号泊位', '夜', 'final', '浓雾把码头吞成一片灰白。沈砚打着手电，踩上跳板。货船没有编号，船身吃水很深，不像空载。他弯腰掀开前舱松动的船板，指尖碰到一块冰凉的金属——一枚生锈的港务徽章，背面刻着「1998」。'],
      ['港务局档案室', '日', 'revised', '档案室的日光灯闪了两下。沈砚抽出十五年前的沉船卷宗，翻到第七页——那一页被整齐地撕走了，断口很新。他把徽章放在桌上，和卷宗封面上褪色的编号对照，编号只差一位。'],
      ['老船坞', '黄昏', 'drafted', '陈伯蹲在船底打磨一块朽木，听见脚步声也没抬头。沈砚蹲在他旁边，把徽章放在工具箱上。陈伯的手停了一瞬，随即继续推刨子，木屑一片片卷起来，落进昏黄的光里。'],
      ['周慕办公室', '日', 'drafted', '周慕给沈砚倒了半杯茶，语速很慢。他说稽查科下个月要提一个副科长，他说年轻人别总翻旧账，旧账翻不出一朵花来。沈砚看着茶杯里浮起的热气，没接话。'],
    ],
  },
  {
    title: '第二集 · 沉船名录',
    summary: '林晚收到一只匿名信封，里面是十五年前沉船的完整死者名单，人数与官方通报不符。',
    scenes: [
      ['晚报编辑部', '日', 'revised', '信封没有寄件人，邮戳来自城郊。林晚抽出里面的复印件，是一份手写的沉船人员名单，共四十一人。她记得官方通报写的是三十七人。四个没有名字的人，被谁抹掉了。'],
      ['防波堤', '夜', 'drafted', '海风把两个人的衣角吹得贴在身上。林晚把名单递给沈砚，沈砚用手机照了一遍，没说话。远处灯塔的光每十二秒扫过来一次，每次照亮他们之间的那半步距离。'],
      ['陈伯家', '夜', 'outline', '屋里只有一盏台灯。陈伯靠在床头，说话要停顿两次才接得上。他说那晚雾太大，他说港口里其实有第二艘船，他说完就闭上眼睛，像是把力气一次性用光了。'],
      ['港务集团会议室', '日', 'outline', '长桌尽头，周慕在讲安全生产。他提到近期有个别同志作风浮躁，热衷于翻检历史资料，影响很不好。会议室里没人抬头，只有投影仪的风扇在转。'],
    ],
  },
  {
    title: '第三集 · 潮水之下',
    summary: '潜水员在沉船残骸中发现被焊死的舱门，沈砚与周慕在防波堤上摊牌。',
    scenes: [
      ['沉船残骸', '晨', 'drafted', '水下能见度不足三米。潜水员的手电扫过锈迹斑斑的船体，停在一扇舱门上——门缝被电焊整个封死，焊缝很新，最多不超过五年。他举起相机，闪光灯在浑水里亮了一下。'],
      ['医院走廊', '夜', 'outline', '走廊尽头的红灯一直亮着。沈砚坐在塑料椅上，手里捏着那枚徽章，指腹把它磨得发亮。护士推着车经过两次，第二次看了他一眼，什么也没说。'],
      ['档案室', '夜', 'outline', '火是从第七排架子烧起来的。沈砚踹开门冲进去，烟把他呛得睁不开眼。他摸到那本硬壳名册，抱在怀里滚出来，封面边缘已经烧焦，里面的字还完整。'],
      ['防波堤', '夜', 'outline', '浪拍在混凝土上，溅起的水沫落在两个人肩上。周慕终于不装了，他说你父亲当年也是这么站着。沈砚摊开手，那枚徽章躺在掌心。远处灯塔的光扫过来，正好照在他们中间。'],
    ],
  },
];

const P2_EPISODES = [
  {
    title: '第一夜',
    summary: '连环车祸送来七名伤员，急诊科在缺人的夜里连轴转。',
    scenes: [
      ['急诊大厅', '夜', 'final', '自动门开合的间隙里灌进冷风。苏黎已经连续值班第十一小时，她一边给三床开医嘱，一边用肩膀夹着电话催血库。地上有水渍，被轮子碾出长长的痕迹。分诊台的屏幕上，红色条目还在往下滚。'],
      ['救护车', '夜', 'revised', '雨刮器摆到最快也刮不干净。郑野把警报拉到底，从后视镜里看一眼后车厢——担架上的年轻人还在喊疼，说明还清醒。他踩下油门，对讲机里又弹出一条新的派单。'],
      ['护士站', '夜', 'drafted', '何静把排班表从墙上撕下来，揉成一团扔进垃圾桶。原本该来的两个人一个发烧一个请假。她重新在空白表上写名字，写到一半笔没水了，她用力甩了两下，接着写。'],
      ['值班室', '晨', 'drafted', '陆星第一次独立缝合。针尖穿过皮肉的时候，他能听见自己的呼吸。何静站在他身后半步，没出声。缝到第四针，他的手不抖了。'],
    ],
  },
  {
    title: '第二夜',
    summary: '一名无名老人抢救无效，苏黎在死亡证明上签字；天台上的对话揭开各自的退路。',
    scenes: [
      ['抢救室', '夜', 'revised', '心电监护拉出一条直线。苏黎又按了两轮，看了表，才直起身。老人身上没有任何证件，只有口袋里一张揉皱的公交卡。她在死亡证明的姓名一栏停了很久，最后写下「无名」。'],
      ['天台风口', '夜', 'drafted', '风把烟吹得歪向一边。郑野说他其实早想走了，修车铺的转让费还差一半。苏黎说她导师在南方给她留了个位置，她一直没回话。两个人靠着水泥墙，谁也没看谁。'],
      ['走廊尽头', '夜', 'outline', '家属的嗓门越来越高，手指几乎戳到陆星脸上。陆星张了张嘴，没说出话。何静从旁边插进来，把陆星挡在身后，声音不高但很稳，她说有什么事冲我来。'],
      ['车里', '晨', 'outline', '天刚蒙蒙亮。郑野把车停在路边，掏出手机算那笔转让费，算到第三遍还是差七万。他把手机扣在方向盘上，看着前方空荡荡的路口，笑了一下。'],
    ],
  },
  {
    title: '破晓',
    summary: '一批食物中毒的学生涌入急诊；天亮时，三个人在天台上吃早饭。',
    scenes: [
      ['急诊大厅', '晨', 'drafted', '校车一辆接一辆停在门口。学生们捂着肚子排队，有的直接蹲在地上。苏黎在分诊台后面快速分级，声音哑了也没停。何静把库存的补液全推了出来。'],
      ['手术室门外', '日', 'outline', '灯灭了。苏黎摘掉手套，靠在墙上。导师的短信还躺在手机里，最后一条写着「想好了告诉我」。她盯着那行字看了很久，然后打字回复，删掉，再打，最后按了发送。'],
      ['停车场', '夜', 'outline', '郑野把一个存折塞进苏黎手里，说这是他全部的积蓄，先拿着。苏黎没接，他就一直举着。停车场的灯坏了一半，两个人在暗处站了很久。'],
      ['天台', '晨', 'outline', '天亮了，雾散得很干净。三个人坐在天台的水泥台阶上吃包子和豆浆。陆星说了个不好笑的笑话，郑野笑得最大声。苏黎低头喝豆浆，嘴角有一点没藏住。'],
    ],
  },
];

function seedIfNeeded() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (c > 0) return;

  // —— 账号 ——
  const insUser = db.prepare('INSERT INTO users (username,password,role,nickname,bio,created_at) VALUES (?,?,?,?,?,?)');
  const adminId = insUser.run('admin', hashPassword('admin123'), 'admin', '平台管理员', '负责账号与全局统计', '2026-09-01 09:00:00').lastInsertRowid;
  const writerId = insUser.run('writer1', hashPassword('writer123'), 'writer', '编剧 · 顾一舟', '写悬疑，也写医院走廊里的普通人', '2026-09-02 10:30:00').lastInsertRowid;
  const editorId = insUser.run('editor1', hashPassword('editor123'), 'editor', '责编 · 韩疏', '看故事结构，也看人物有没有立住', '2026-09-03 14:20:00').lastInsertRowid;

  // —— 作品 ——
  const insProject = db.prepare(`INSERT INTO projects
    (user_id,title,type,genre,logline,synopsis,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`);

  const pid1 = insProject.run(
    writerId, '雾港', '电影', '悬疑',
    '一名港务稽查员在雾夜摸到一枚旧徽章，从此把自己十五年前的旧案重新拖回水面。',
    '十五年前，雾港发生一起沉船事故，官方通报三十七人遇难。稽查员沈砚在例行检查中意外发现一枚旧徽章与一份被撕走的档案，随后与记者林晚、老船工陈伯一步步逼近被焊死的舱门。港务集团副总周慕试图把一切压回水下。',
    'reviewing', '2026-09-05 09:12:00', '2026-09-21 16:40:00'
  ).lastInsertRowid;

  const pid2 = insProject.run(
    writerId, '长夜将尽', '网剧', '都市',
    '急诊科的三个夜里，一个想走的医生、一个想留的司机和一个不肯认输的护士长。',
    '连续三个夜班，急诊科经历了连环车祸、无名老人抢救无效和一起学生食物中毒。住院医师苏黎在留下与离开之间摇摆，急救车司机郑野在攒钱和牵挂之间摇摆，护士长何静用最硬的方式护住科室。天亮时，有些选择已经做完了。',
    'revising', '2026-09-08 20:05:00', '2026-09-22 11:15:00'
  ).lastInsertRowid;

  // —— 分集与场景 ——
  const insEpisode = db.prepare('INSERT INTO episodes (user_id,project_id,title,seq,summary,created_at) VALUES (?,?,?,?,?,?)');
  const insScene = db.prepare(`INSERT INTO scenes
    (user_id,project_id,episode_id,title,seq,location,time_of_day,content,status,word_count,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);

  // 场景创建日期：从 2026-09-10 起每场景推一天，覆盖 13 个不同日期
  let dayCursor = 10;
  const nextDate = () => {
    const d = `2026-09-${String(dayCursor).padStart(2, '0')}`;
    dayCursor = dayCursor >= 22 ? 10 : dayCursor + 1;
    return d;
  };

  const sceneIds = { [pid1]: [], [pid2]: [] };
  const sceneMeta = {};   // sceneId -> { location, time_of_day, title }

  function buildProject(projectId, episodes) {
    episodes.forEach((ep, ei) => {
      const created = nextDate();
      const epId = insEpisode.run(writerId, projectId, ep.title, ei + 1, ep.summary, `${created} 09:00:00`).lastInsertRowid;
      ep.scenes.forEach((s, si) => {
        const [location, timeOfDay, status, content] = s;
        const title = `${String(ei + 1).padStart(2, '0')}-${String(si + 1).padStart(2, '0')} ${location}`;
        const d = nextDate();
        const sceneId = insScene.run(
          writerId, projectId, epId, title, si + 1, location, timeOfDay, content, status,
          content.replace(/\s/g, '').length, `${d} 10:00:00`, `${d} 18:30:00`
        ).lastInsertRowid;
        sceneIds[projectId].push(sceneId);
        sceneMeta[sceneId] = { title, location, time_of_day: timeOfDay, project_id: projectId };
      });
    });
  }

  buildProject(pid1, P1_EPISODES);
  buildProject(pid2, P2_EPISODES);

  // —— 角色 ——
  const insChar = db.prepare(`INSERT INTO characters
    (user_id,project_id,name,age,identity,personality,goal,arc,bio,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);

  const charIds = {};
  function buildChars(projectId, list, baseDay) {
    charIds[projectId] = list.map(([name, age, identity, personality, goal, arc], i) => {
      const d = `2026-09-${String(baseDay + i).padStart(2, '0')}`;
      return insChar.run(
        writerId, projectId, name, age, identity, personality, goal, arc,
        `${name}，${age} 岁，${identity}。`, `${d} 11:20:00`
      ).lastInsertRowid;
    });
  }
  buildChars(pid1, P1_CHARS, 9);   // 09-09 ~ 09-12
  buildChars(pid2, P2_CHARS, 13);  // 09-13 ~ 09-16

  // —— 角色关系 ——
  const insRel = db.prepare('INSERT INTO character_relations (user_id,project_id,from_id,to_id,relation,note,created_at) VALUES (?,?,?,?,?,?,?)');
  const C1 = charIds[pid1];
  const C2 = charIds[pid2];
  const relations = [
    [pid1, C1[0], C1[2], '师徒', '陈伯带沈砚入行，教他看水纹辨船'],
    [pid1, C1[0], C1[1], '旧恋人', '三年前分手，因为沈砚不肯说自己在查什么'],
    [pid1, C1[3], C1[0], '敌对', '周慕视沈砚为必须处理掉的变量'],
    [pid1, C1[3], C1[2], '旧上下级', '陈伯当年是周慕手下的船队工长'],
    [pid1, C1[1], C1[2], '忘年交', '林晚曾为陈伯做过一期口述史'],
    [pid2, C2[0], C2[1], '搭档', '同一辆急救车，一个开车一个抢救'],
    [pid2, C2[0], C2[2], '上下级', '何静是苏黎的护士长，也是她唯一怕的人'],
    [pid2, C2[3], C2[0], '师徒', '陆星的带教是苏黎'],
    [pid2, C2[1], C2[3], '兄弟', '郑野把陆星当弟弟，总替他挡事'],
    [pid2, C2[2], C2[1], '旧识', '何静认识郑野的父亲'],
  ];
  relations.forEach(([pid, from, to, rel, note], i) => {
    const d = `2026-09-${String(11 + (i % 8)).padStart(2, '0')}`;
    insRel.run(writerId, pid, from, to, rel, note, `${d} 15:00:00`);
  });

  // —— 对白（30 条）——
  const insDlg = db.prepare('INSERT INTO dialogues (user_id,scene_id,character_id,seq,line,emotion,created_at) VALUES (?,?,?,?,?,?,?)');
  const S1 = sceneIds[pid1];
  const S2 = sceneIds[pid2];

  const lines1 = [
    [0, C1[0], '这里吃水不对。', '低声自语'],
    [0, C1[2], '别掀了，雾大，看不见底下。', '劝阻'],
    [1, C1[1], '三十七个人，名单上写着四十一个。', '压着火'],
    [1, C1[0], '那就先找出那四个是谁。', '平静'],
    [2, C1[0], '陈伯，那晚有几条船？', '试探'],
    [2, C1[2], '雾太大，记不清了。', '回避'],
    [3, C1[3], '旧账翻不出一朵花来。', '温和'],
    [3, C1[0], '我不种花。', '平静'],
    [4, C1[1], '匿名信，没有寄件人。', '直接'],
    [4, C1[0], '那说明寄信的人还活着。', '笃定'],
    [5, C1[1], '你到底在查什么？', '追问'],
    [5, C1[0], '我在查我父亲为什么没回来。', '停顿'],
    [6, C1[2], '那晚……港口里有第二条船。', '气若游丝'],
    [7, C1[3], '个别同志作风浮躁。', '敲打'],
    [9, C1[0], '他会挺过去的。', '自我说服'],
  ];
  lines1.forEach(([si, cid, line, emotion], i) => {
    const d = `2026-09-${String(12 + (i % 9)).padStart(2, '0')}`;
    insDlg.run(writerId, S1[si], cid, i + 1, line, emotion, `${d} 16:${String(10 + i).padStart(2, '0')}:00`);
  });

  const lines2 = [
    [0, C2[0], '血库还有多少？', '急促'],
    [0, C2[1], '路上堵死了，我绕高架。', '喊'],
    [1, C2[1], '后车厢那个还在喊疼，好事。', '喘着气'],
    [2, C2[2], '排班表别看了，来不了就是来不了。', '咬牙'],
    [3, C2[3], '我……我手抖。', '发虚'],
    [3, C2[2], '抖就慢一点，没人催你。', '压低声音'],
    [4, C2[0], '姓名一栏，我写什么？', '疲惫'],
    [5, C2[1], '我早想走了，真的。', '笑了一下'],
    [5, C2[0], '那你怎么还不走。', '轻声'],
    [6, C2[2], '有什么事冲我来。', '挡在前面'],
    [7, C2[1], '还差七万。', '自嘲'],
    [8, C2[2], '补液全推出来，不够就现配。', '果断'],
    [9, C2[0], '老师，我留下。', '打字声'],
    [10, C2[1], '先拿着，别问。', '硬塞'],
    [11, C2[3], '这个笑话不好笑。', '含着包子'],
  ];
  lines2.forEach(([si, cid, line, emotion], i) => {
    const d = `2026-09-${String(13 + (i % 9)).padStart(2, '0')}`;
    insDlg.run(writerId, S2[si], cid, i + 1, line, emotion, `${d} 17:${String(10 + i).padStart(2, '0')}:00`);
  });

  // —— 出场角色（scene_characters）——
  const insSC = db.prepare('INSERT OR IGNORE INTO scene_characters (scene_id,character_id) VALUES (?,?)');
  // 沈砚几乎每场都在；按场景轮换其他角色
  S1.forEach((sid, i) => {
    insSC.run(sid, C1[0]);
    if (i % 3 !== 2) insSC.run(sid, C1[1]);
    if (i % 4 === 0 || i === 6) insSC.run(sid, C1[2]);
    if (i % 4 === 3 || i === 11) insSC.run(sid, C1[3]);
  });
  S2.forEach((sid, i) => {
    insSC.run(sid, C2[0]);
    if (i % 3 === 1) insSC.run(sid, C2[1]);
    if (i % 3 === 2) insSC.run(sid, C2[2]);
    if (i % 4 === 3 || i === 6) insSC.run(sid, C2[3]);
  });

  // —— 故事线 ——
  const insLine = db.prepare('INSERT INTO storylines (user_id,project_id,code,title,kind,summary,created_at) VALUES (?,?,?,?,?,?,?)');
  const insLS = db.prepare('INSERT OR IGNORE INTO storyline_scenes (storyline_id,scene_id,note) VALUES (?,?,?)');

  const line1 = insLine.run(writerId, pid1, 'A', '沈砚追查父亲失踪', 'main', '从一枚徽章到被焊死的舱门，主角主动逼近真相。', '2026-09-17 10:00:00').lastInsertRowid;
  const line2 = insLine.run(writerId, pid1, 'B', '林晚的独家与代价', 'sub', '记者线：从拿到名单到成为事件的一部分。', '2026-09-17 10:20:00').lastInsertRowid;
  const line3 = insLine.run(writerId, pid2, 'A', '苏黎的去与留', 'main', '从想走到主动留下，贯穿三个夜班。', '2026-09-18 10:00:00').lastInsertRowid;

  [0, 1, 3, 4, 6, 8, 11].forEach((i, k) => insLS.run(line1, S1[i], k === 0 ? '开场钩子' : ''));
  [4, 5, 8, 9].forEach((i) => insLS.run(line2, S1[i], ''));
  [0, 4, 6, 8, 9, 10, 11].forEach((i, k) => insLS.run(line3, S2[i], k === 0 ? '开场钩子' : ''));

  // —— 创作笔记 ——
  const insNote = db.prepare('INSERT INTO notes (user_id,project_id,scene_id,title,content,kind,status,source,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
  const notes = [
    [pid1, S1[0], '徽章背面的年份', '徽章刻的 1998 与沉船档案的 2011 差了十三年，需要补一段中间史。', 'setting', 'open', 'manual', '2026-09-14 09:30:00'],
    [pid1, S1[1], '档案被撕走的那一页', '第七页是关键：它决定周慕是在掩盖还是也在被骗。', 'idea', 'open', 'manual', '2026-09-15 14:00:00'],
    [pid1, S1[6], '陈伯的病', '陈伯必须在第三集前病危，否则他不会开口。', 'setting', 'done', 'manual', '2026-09-16 11:00:00'],
    [pid1, null, '雾港参考影像', '参考《海边的曼彻斯特》的冷调，别拍成类型片。', 'reference', 'open', 'manual', '2026-09-17 20:10:00'],
    [pid1, S1[11], '结尾不要和解', '防波堤这场戏，周慕不能认输，也不能赢。', 'idea', 'open', 'manual', '2026-09-19 22:40:00'],
    [pid2, S2[0], '第十一小时', '苏黎的疲惫要靠动作写，不要靠台词。', 'setting', 'done', 'manual', '2026-09-15 08:20:00'],
    [pid2, S2[4], '无名老人', '这一场是苏黎的转折点，公交卡要给特写。', 'idea', 'open', 'manual', '2026-09-18 23:00:00'],
    [pid2, null, '急诊科口述史', '找三位急诊医生聊过一次，何静的原型来自其中一位。', 'reference', 'open', 'manual', '2026-09-20 10:30:00'],
    [pid2, S2[10], '存折这场戏的分寸', '郑野不能煽情，塞完就走。', 'idea', 'open', 'manual', '2026-09-21 21:15:00'],
    [pid2, S2[11], '结尾天亮', '三个人的早饭要拍得平常，越平常越有力量。', 'setting', 'open', 'manual', '2026-09-22 07:50:00'],
  ];
  notes.forEach((n) => insNote.run(writerId, ...n));

  // —— 版本快照 ——
  const insRev = db.prepare('INSERT INTO revisions (user_id,scene_id,version,summary,snapshot,created_at) VALUES (?,?,?,?,?,?)');
  const snap = (sceneId, extra = {}) => {
    const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(sceneId);
    return JSON.stringify({ ...row, ...extra });
  };
  const revPlan = [
    [S1[0], 1, '初稿：雾中登船', '2026-09-12 20:00:00'],
    [S1[0], 2, '定稿：补徽章细节与年份', '2026-09-18 20:00:00'],
    [S1[1], 1, '初稿：档案室', '2026-09-13 20:00:00'],
    [S1[1], 2, '修订：断口改新，暗示近期被动过', '2026-09-19 20:00:00'],
    [S1[4], 1, '初稿：匿名信封', '2026-09-14 20:00:00'],
    [S2[0], 1, '初稿：急诊大厅', '2026-09-15 20:00:00'],
    [S2[0], 2, '定稿：去掉一句解释性台词', '2026-09-21 20:00:00'],
    [S2[4], 1, '修订：无名老人的签字时刻', '2026-09-22 20:00:00'],
  ];
  revPlan.forEach(([sid, ver, summary, at]) => {
    insRev.run(writerId, sid, ver, summary, snap(sid), at);
  });

  console.log(`[seed] 账号 3 / 作品 2 / 分集 6 / 场景 ${S1.length + S2.length} / 角色 8 / 关系 10 / 对白 30 / 故事线 3 / 笔记 ${notes.length} / 版本 ${revPlan.length}`);
}

module.exports = { seedIfNeeded };

if (require.main === module) {
  seedIfNeeded();
  console.log('[seed] 完成');
}
