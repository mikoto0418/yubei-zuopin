# -*- coding: utf-8 -*-
"""MindCare 种子数据：账号 / 咨询师 / 情绪 / 测评 / 预约 / 危机预警 / 资源库。

独立成模块，供 app.init_db 调用；不反向 import app，避免循环依赖。
"""
import json
import random

from werkzeug.security import generate_password_hash

# ---------------------------------------------------------------- 内置情绪标签
BUILTIN_TAGS = [
    {"tag": "开心", "emoji": "😄", "color": "#34C759", "kind": "positive"},
    {"tag": "平静", "emoji": "😌", "color": "#007AFF", "kind": "positive"},
    {"tag": "放松", "emoji": "🌿", "color": "#5AC8FA", "kind": "positive"},
    {"tag": "焦虑", "emoji": "😟", "color": "#FF9500", "kind": "negative"},
    {"tag": "疲惫", "emoji": "🥱", "color": "#8E8E93", "kind": "negative"},
    {"tag": "倦怠", "emoji": "😪", "color": "#AF52DE", "kind": "negative"},
    {"tag": "难过", "emoji": "😢", "color": "#5AC8FA", "kind": "negative"},
    {"tag": "愤怒", "emoji": "😠", "color": "#FF3B30", "kind": "negative"},
]

# ---------------------------------------------------------------- 咨询师
COUNSELOR_SLOTS = [
    "周一 09:00-10:00", "周一 14:00-15:00", "周二 10:00-11:00", "周二 16:00-17:00",
    "周三 09:00-10:00", "周三 19:00-20:00", "周四 14:00-15:00", "周四 20:00-21:00",
    "周五 10:00-11:00", "周五 15:00-16:00", "周六 09:00-10:00", "周六 14:00-15:00",
]

COUNSELOR_SEED = [
    ("林知远", "国家二级心理咨询师", "🧑‍⚕️", "焦虑调节,学业压力,情绪管理",
     "从业 8 年，擅长用认知行为疗法帮助学生拆解考试焦虑与自我怀疑，风格温和而结构化。", 4.9, 126, 200),
    ("苏晚", "临床心理学硕士", "👩‍⚕️", "抑郁情绪,自我接纳,人际边界",
     "关注长期低落的情绪底色，陪伴来访者重建与自己的关系，相信改变从被看见开始。", 4.8, 98, 220),
    ("陈行", "注册心理师", "🧑‍⚕️", "睡眠障碍,拖延,时间管理",
     "把睡眠与拖延放在一起看，擅长用行为激活的方法帮学生重新找回节奏感。", 4.7, 74, 180),
    ("周雨桐", "家庭治疗方向", "👩‍⚕️", "原生家庭,亲密关系,沟通模式",
     "在关系里受伤，也在关系里修复。擅长梳理家庭互动模式带来的情绪困扰。", 4.9, 143, 240),
    ("许砚", "认知行为治疗师", "🧑‍⚕️", "强迫倾向,完美主义,自我要求过高",
     "见过太多被『必须更好』困住的年轻人，擅长陪来访者练习允许自己不够好。", 4.6, 61, 200),
    ("何清", "团体辅导带领者", "👩‍⚕️", "社交焦虑,孤独感,人际回避",
     "相信孤独不是缺陷而是信号。擅长用团体与个体结合的方式重建社交信心。", 4.8, 87, 160),
    ("邱亦", "正念减压 MBSR 认证", "🧑‍⚕️", "情绪波动,身心放松,创伤后成长",
     "以正念为底色，帮助来访者在情绪浪涌时找到可以落脚的呼吸与身体感受。", 4.9, 112, 260),
    ("白溪", "青少年心理方向", "👩‍⚕️", "学业倦怠,生涯迷茫,意义感缺失",
     "陪很多人在『不知道为什么要努力』的路口停留过，擅长一起找回内在动机。", 4.7, 69, 190),
]

APPT_TOPICS = [
    "考试焦虑，临近答辩睡不着", "和室友关系紧张，不知道怎么开口", "最近对什么都提不起兴趣",
    "拖延严重，论文一直没动", "总觉得自己不够好", "和家人通话后情绪很低落",
    "想聊聊未来的方向", "社交场合会紧张到发抖", "情绪起伏大，容易突然崩溃", "睡眠很浅，容易早醒",
]

APPT_REVIEWS = [
    "老师很耐心，帮我把乱糟糟的想法理出了头绪，下次还会再来。",
    "没有急着给建议，先听我说完，这一点让我很安心。",
    "给的方法很具体，回去试着做了几天，确实有帮助。",
    "聊完之后轻松了很多，谢谢老师的陪伴。",
]

CRISIS_HANDLE_ACTIONS = [
    ("contact", "已电话联系该生，情绪平稳，约定下周三面谈。"),
    ("refer", "已转介至校心理中心，安排下周初始访谈。"),
    ("dismiss", "经核实为测评时误选，学生本人确认状态良好，解除预警。"),
    ("contact", "辅导员已约谈，学生表示近期考试压力较大，已提供放松训练资源。"),
    ("refer", "建议转介至专业机构进一步评估，已告知学生及辅导员。"),
    ("dismiss", "学生主动反馈情绪已回升，连续记录显示评分回到 6 分以上。"),
]

# ---------------------------------------------------------------- 科普资源
RESOURCE_SEED = [
    ("情绪管理", "情绪不是敌人：先学会给感受命名",
     "当你把『我很烦』拆成『我有点被忽视，也有点累』，情绪就已经开始降温。",
     "很多同学会说『我最近很烦』，但『烦』其实是一个太笼统的词。心理学上把这种能力叫做情绪颗粒度：能越精细地描述自己的感受，越容易调节它。\n\n"
     "试着做一个小练习：下次情绪上来时，不要急着压下去，先在心里问三句话——\n"
     "1. 现在的身体感觉是什么？（胸口发紧？肩膀僵？）\n"
     "2. 如果给这个感受起个名字，它是什么？（委屈、失望、被否定、还是累？）\n"
     "3. 它想告诉我什么需求？（我想被理解？我想休息？我想被认可？）\n\n"
     "命名本身就是一种调节。当混沌的难受变成具体的词，大脑的警报就会降一级。你不需要马上解决它，先让它被准确地看见。"),
    ("情绪管理", "焦虑的时候，把担心写成两列清单",
     "左边写『我能影响的』，右边写『我影响不了的』，然后只处理左边。",
     "焦虑的核心往往不是事情本身，而是失控感。一个非常实用的做法是拿出一张纸，中间画一条竖线。\n\n"
     "左列：我能影响的部分。比如「明天汇报的PPT我还能再改一页」「我可以今晚11点前睡」。\n"
     "右列：我影响不了的部分。比如「老师对我的印象」「别人准备得怎么样」「结果会不会出意外」。\n\n"
     "写完之后，给自己一个规则：今天只做左列的事，右列的事允许它先待在那里。\n\n"
     "你会发现右列往往比左列长得多——而这正是焦虑被放大的原因。把注意力收回到左列，哪怕只有一件小事，掌控感就会回来一点。"),
    ("情绪管理", "允许自己低电量：休息不是奖励，是前提",
     "把休息当成『做完才配拥有』的东西，是最常见的自我消耗。",
     "我们常被教育成：先完成任务，才配休息。于是休息变成了需要挣来的奖励，而人永远觉得自己不够格。\n\n"
     "但生理上，休息是注意力和情绪调节能力的前提，不是结果。睡眠不足的人对负面信息的敏感度会显著上升，同样一件事，睡好和没睡好时的反应完全不同。\n\n"
     "试着把休息从『奖励制』改成『配给制』：每天固定留出 20 分钟，什么都不产出，散步、发呆、听歌都可以。不要等『忙完这阵』——这阵永远不会完。\n\n"
     "如果你觉得愧疚，可以这样想：这 20 分钟不是从学习时间里偷来的，而是为了让剩下的时间真的有效。"),
    ("人际", "不会拒绝的人，最后会连自己都照顾不好",
     "拒绝一件事，不代表拒绝一个人。",
     "很多同学很难说出『这次不行』。怕对方失望，怕关系变差，怕被贴上『不好相处』的标签。\n\n"
     "但关系里的边界不是墙，是门。有门的关系才安全——你可以选择开，也可以选择关，而对方知道门在哪里。\n\n"
     "练习一个温和的三段式拒绝：\n"
     "1. 先接住对方的情绪：「我知道你现在确实需要人帮忙。」\n"
     "2. 说明自己的限制：「但我这周有三个 deadline，实在接不住。」\n"
     "3. 给一个替代：「要不我帮你问问 XX？或者下周三之后我可以。」\n\n"
     "你不需要为拒绝编一个足够悲惨的理由。『我不想』本身就是完整的理由。"),
    ("人际", "社交焦虑：别人其实没有你想的那么在意你",
     "聚光灯效应：你以为自己是全场焦点，其实每个人都在忙着担心自己。",
     "心理学里有个著名的『聚光灯效应』：实验让被试穿着尴尬的 T 恤走进房间，被试估计有一半人注意到了，实际只有约四分之一，而且很快就不记得了。\n\n"
     "社交焦虑的核心假设是『大家都在评判我』。但真相是——每个人都在被自己的聚光灯照着，没空一直看你。\n\n"
     "一个可以尝试的小实验：下次社交场合，把注意力从『我表现得怎么样』切换到『对方在说什么、他是什么感受』。焦虑往往在自我监控中膨胀，在真实的好奇心里缩小。\n\n"
     "如果你说错了话，也不用急着补救。大多数尴尬在别人那里只停留三秒。"),
    ("人际", "孤独不是你的问题，是一个需要行动的信号",
     "孤独感提示的是连接不足，而不是你不够好。",
     "孤独感常常带着一个错误的结论：『一定是我有问题，所以才没人靠近我。』但孤独更像饥饿——它提示的是需求，不是缺陷。\n\n"
     "研究发现，孤独会让人进入一种防御状态：更警惕、更容易把中性表情读成拒绝。于是越孤独，越难主动，形成循环。\n\n"
     "打破循环的往往是很小的动作：给一个久没联系的朋友发一句「突然想起你」，去参加一个固定时间的社团活动（重复见面比一次性社交更容易建立连接），或者只是在食堂和同桌的人搭一句话。\n\n"
     "不需要一次就找到知己。先让连接的数量回来，质量会慢慢跟上。"),
    ("人际", "如何安慰一个难过的人：先别急着给建议",
     "大多数时候，人需要的是被理解，不是被解决。",
     "当朋友说『我好难受』，我们的第一反应常常是给方案：『你应该……』『要不你试试……』。但对处于情绪中的人来说，建议往往会被听成『你的感受不重要，快把它解决掉』。\n\n"
     "有效的安慰通常是这个顺序：\n"
     "1. 承认感受：「听起来这段时间你真的很难熬。」\n"
     "2. 不评判地追问：「最让你难受的是哪一部分？」\n"
     "3. 表达在场：「我在，你想说的时候我都在。」\n"
     "4. 最后才问：「你希望我听你说说，还是一起想想办法？」\n\n"
     "第 4 步是关键——把选择权还给对方。很多时候，人被好好地听完，就已经好了一半。"),
    ("学业压力", "拖延不是懒，是情绪回避",
     "你不是不想做，是一想到做就难受。",
     "把拖延理解成『懒』，几乎永远解决不了它。拖延的本质通常是：任务引发了某种不舒服的情绪（怕做不好、不知道从哪开始、觉得无意义），于是大脑选择用短期舒适来回避它。\n\n"
     "所以对付拖延，靠『下决心』基本无效，要靠降低启动难度：\n"
     "- 两分钟法则：只承诺做两分钟。写第一行字、打开文件、列出三个要点。启动之后继续往往比想象中容易。\n"
     "- 拆到荒唐地小：不是「写完论文」，而是「找出三篇参考文献的标题」。\n"
     "- 允许烂初稿：把标准从「做好」降到「做完」，修改是第二步的事。\n\n"
     "每一次微小的启动，都在削弱「这件事很可怕」的联结。"),
    ("学业压力", "考试焦虑：把『我必须』换成『我选择』",
     "语言会改变你对压力的体感。",
     "考试前的自我对话常常长这样：「我必须考好，不然就完了。」这种绝对化语言会直接拉高生理唤醒，让人心跳加快、手心出汗，反而影响发挥。\n\n"
     "试着做两处替换：\n"
     "1. 把『必须』换成『我想要』——「我想要考好」，压力从威胁变成目标。\n"
     "2. 把『完了』换成具体后果——「如果没考好，我需要重修/需要调整计划」。当后果变得具体，它就不再是无边界的灾难。\n\n"
     "另外，考前紧张本身不是敌人。研究发现，把心跳加速解读为「身体在为我调动能量」，比试图让自己冷静下来更有效。你不需要不紧张，你需要的是带着紧张也能动。"),
    ("学业压力", "倦怠期：不是所有停滞都需要更努力",
     "当你对什么都提不起劲，缺的可能是意义，不是意志力。",
     "学业倦怠有三个典型信号：情绪耗竭、对学习冷漠、成就感降低。这时候继续加码往往只会加速耗尽。\n\n"
     "倦怠常常来自长期的『外部动机驱动』——为了不落后、为了不让父母失望、为了别人的期待。当外部压力持续太久，内在动机会被挤空，人就变成了一台空转的机器。\n\n"
     "恢复的起点通常是重新接触『我为什么开始』：当初选这个专业，有哪个瞬间是真的好奇过？有没有哪个部分，是你做起来会忘记时间的？\n\n"
     "哪怕答案很小，也值得被认真对待。意义感不需要宏大，它只需要是真的。"),
    ("学业压力", "完美主义：把标准从 100 分调到 85 分",
     "完成度 85 分的作品，比永远停在 60 分的完美草稿有价值。",
     "完美主义看起来像高标准，实际上常常是回避失败的另一种形式：因为只要没做到最好，就等于失败，所以干脆不交、不开始、不结束。\n\n"
     "一个反直觉的建议：主动练习『够好就行』。选一件低风险的事（一次作业、一份周报），刻意在 85 分时交付，然后观察结果。你多半会发现——没有人像你一样盯着那 15 分。\n\n"
     "另一个有用的区分是：区分『高标准』和『高标准 + 自我惩罚』。前者推动成长，后者制造内耗。你可以对自己有要求，同时不因为没达到就否定整个人。"),
    ("学业压力", "如何在 25 分钟里真正专注",
     "番茄工作法的核心不是计时，是『只做一件事』的承诺。",
     "很多人试过番茄钟但觉得没用，通常是因为只学了形式（计时 25 分钟），没学到核心（在这 25 分钟里只做一件事，且允许自己做得不好）。\n\n"
     "几个让它真正起作用的细节：\n"
     "- 开始前写下这一轮的唯一目标，具体到可完成的程度（如『写完引言的第一段』）。\n"
     "- 手机放到视线之外，不是静音——是物理距离。仅仅手机在桌上就会占用认知资源。\n"
     "- 中途想到别的事，写在旁边的纸上，不要立刻去做。\n"
     "- 25 分钟结束后真的休息 5 分钟，离开座位。\n\n"
     "如果 25 分钟太长，就从 10 分钟开始。可持续的节奏比理想化的强度重要。"),
    ("自我成长", "自我接纳不等于放弃改变",
     "先允许自己是这样的人，改变才有落脚的地方。",
     "很多人抗拒『自我接纳』，因为听起来像躺平。但接纳的对立面从来不是改变，而是否定——是把当下的自己当成需要被修好的残次品。\n\n"
     "当你把全部力气用在否定自己上，就没有力气去改变了。接纳的意思是：我承认我现在就是这样，焦虑、拖延、不够自信，同时我不因此判定自己没有价值。\n\n"
     "可以试着把句子改写一下：\n"
     "❌「我怎么这么没用，连这个都做不好。」\n"
     "✅「这件事我做得不理想，我现在有点沮丧，我想知道卡在哪里。」\n\n"
     "第二句里没有自我攻击，但同样指向改进。区别在于——它保留了你的能量。"),
    ("自我成长", "写日记为什么有用：把情绪从脑子里搬到纸上",
     "书写会强制大脑把混沌的体验组织成语言。",
     "表达性书写是被反复验证有效的方法。研究让被试连续几天每天写 15-20 分钟关于情绪困扰的内容，结果发现不仅情绪改善，甚至免疫指标也有提升。\n\n"
     "原因之一是：情绪在脑子里是网状的、发散的、不断互相触发的；而写下来必须变成线性的、有顺序的语言。这个过程本身就完成了整理。\n\n"
     "不需要写得好，也不需要给别人看。可以试试这个模板：\n"
     "- 今天发生了什么？\n- 我当时的感受是什么？\n- 我脑子里冒出的想法是什么？\n- 有没有别的解释？\n\n"
     "十五分钟，比在心里反复想三个小时更有效。"),
    ("自我成长", "比较是偷走快乐的贼，但你可以换个比法",
     "和昨天的自己比，是唯一有意义的赛道。",
     "社交媒体的时代，我们每天都在和别人的高光时刻比较：别人的实习、别人的绩点、别人的旅行。而你拿来比较的，是自己最狼狈的日常。\n\n"
     "这种比较的问题不只是不公平，更是信息不对称——你看到的是别人的结果，看不到过程；看到的是精选，看不到全貌。\n\n"
     "一个可操作的办法：把比较对象换成三个月前的自己。问问自己：那时候我卡在哪里？现在还会卡在同一个地方吗？\n\n"
     "如果一定要横向比较，就比『投入』而不是『结果』。结果里有太多运气和起点，而投入是你真正能控制的那部分。"),
    ("自我成长", "低谷期的最低生存清单",
     "状态很差的时候，不要靠意志力，要靠清单。",
     "情绪低到一定程度时，做决定会变得非常困难，连『今天吃什么』都像一座山。这时候靠『振作起来』是没用的，你需要一份提前写好的清单。\n\n"
     "最低生存清单示例（按优先级）：\n"
     "1. 喝一杯水\n2. 吃一顿热的饭（哪怕是便利店的）\n3. 出门走 10 分钟，见到自然光\n"
     "4. 洗一个热水澡\n5. 睡够 7 小时\n6. 给一个人发一条消息，哪怕只是「在吗」\n\n"
     "这份清单的意义在于：它把『照顾好自己』从抽象要求变成了可以打勾的具体动作。低谷期不要求成长，只要求维持。"),
    ("情绪管理", "呼吸是最快的情绪开关",
     "4-7-8 呼吸法：吸气 4 秒，屏息 7 秒，呼气 8 秒。",
     "情绪激动时，交感神经处于高度激活状态。而呼吸是少数可以由意识直接影响的自主神经功能——换句话说，它是你随身携带的情绪开关。\n\n"
     "4-7-8 呼吸法：\n"
     "- 用鼻子吸气 4 秒\n- 屏住呼吸 7 秒\n- 用嘴缓慢呼气 8 秒\n- 重复 4 轮\n\n"
     "关键在于呼气比吸气长。延长的呼气会激活副交感神经，让心率下降。\n\n"
     "如果屏息让你不适，可以改成 4-6：吸 4 秒，呼 6 秒。\n\n"
     "这个方法不会让问题消失，但它能在你和问题之间争取出三十秒的缓冲——而三十秒往往足够让你不做冲动的决定。"),
    ("自我成长", "当情绪低落到影响生活，请寻求专业帮助",
     "求助不是软弱，是对自己负责的一种方式。",
     "自我调节的方法有边界。如果出现以下情况，请尽快联系学校心理中心或专业机构：\n"
     "- 情绪低落持续两周以上，且几乎每天大部分时间都如此\n"
     "- 对以前感兴趣的事完全失去兴趣\n"
     "- 睡眠、食欲出现明显改变\n"
     "- 难以完成日常的学习和生活任务\n"
     "- 出现伤害自己的念头\n\n"
     "这些信号不是『想太多』，而是需要专业支持的状态，就像骨折需要看骨科一样自然。\n\n"
     "如果你现在就有伤害自己的冲动，请立刻联系身边的人，或拨打心理援助热线（如全国 24 小时心理援助热线 400-161-9995）。\n\n"
     "MindCare 的预约功能可以帮你连接到校内的咨询师。你不需要一个人扛。"),
]

# ---------------------------------------------------------------- 情绪备注池
MOOD_NOTE_POOL = {
    "开心": [
        "和室友一起去图书馆占了靠窗的位子，复习完一起去吃了麻辣烫，很解压",
        "今天实验终于跑通了，发给导师还被夸了一句",
        "和家里视频，妈妈说我瘦了，明明没有，但我心里暖暖的",
        "晨跑完喝到热豆浆，早八课居然不困",
        "社团活动结束大家一起拍了合照，笑得停不下来",
    ],
    "平静": [
        "下午在湖边坐了一会儿，风很舒服，什么都没想",
        "把本周计划列好，一项项勾掉的感觉很踏实",
        "睡前阅读了半小时，睡得很安稳",
        "一个人吃了顿安静的晚饭，散步回来恰好看到晚霞",
        "整理了桌面和电脑文件夹，整个人都清爽了",
    ],
    "疲惫": [
        "连着三天赶大作业，今天到图书馆眼睛都快睁不开",
        "一整天满课加社团例会，回来只想躺着不动",
        "实验数据反复出错，改到十一点才回宿舍",
        "白天一直在跑操和实验，累到不想说话",
        "赶了一整天进度，晚饭都是随便对付的",
    ],
    "焦虑": [
        "下周要答辩，看到同组进度都比我快，心里有点慌",
        "考研报名临近，复习进度却比预期慢，越想越急",
        "投的实习没回音，开始怀疑是不是自己不够好",
        "跟朋友聊天发现大家都准备了 plan B，我还在犹豫",
        "导师临时加了一个任务，感觉时间完全排不开",
    ],
    "倦怠": [
        "最近每天重复上课、刷题、吃饭，感觉做什么都提不起劲",
        "明明没做什么，却觉得好累，什么都不想碰",
        "对很多事情都淡淡的，连喜欢的游戏也不想打开",
        "一周里总是熬到深夜，第二天醒来仍然很空",
        "坐在自习室两小时，一个字也没看进去",
    ],
    "难过": [
        "和好朋友闹了别扭，谁也没先低头，心里堵得慌",
        "给家里打电话，听到妈妈咳嗽的声音，突然很想回家",
        "努力准备了很久的比赛没进复赛，有点想哭",
    ],
}

SDS_QUESTIONS = [
    "我觉得闷闷不乐，情绪低沉", "我觉得一天之中早晨最好", "我一阵阵哭出来或觉得想哭",
    "我晚上睡眠不好", "我吃得跟平常一样多", "我与异性密切接触时和以往一样感到愉快",
    "我发觉我的体重在下降", "我有便秘的苦恼", "我心跳比平时快",
    "我无缘无故地感到疲乏", "我的头脑跟平常一样清楚", "我觉得经常做的事情并没有困难",
    "我觉得不安而平静不下来", "我对将来抱有希望", "我比平常容易生气激动",
    "我觉得作出决定是容易的", "我觉得自己是个有用的人，有人需要我", "我的生活过得很有意思",
    "我认为如果我死了别人会生活得好些", "平常感兴趣的事我仍然照样感兴趣",
]

WEEKLY_REPORTS = [
    (6, "这一周你的情绪平均 5.8 分，整体在中位区间缓缓起伏，出现最多的情绪是「疲惫」。"
        "从记录看，周一到周三的评分明显偏低（3-4 分），对应你写下的「连着三天赶大作业」「改到十一点才回宿舍」。"
        "周四之后回升到 7 分左右，和「实验跑通了」「和朋友吃了顿好的」吻合。\n\n"
        "值得留意的是：你的低分几乎都出现在睡眠不足的第二天。这不是巧合——睡眠不足会直接降低情绪调节能力。\n\n"
        "下周可以试一件事：把「十一点前离开图书馆」当成一条硬规则，而不是「早点做完就早回」。先保睡眠，再看效率。"),
    (13, "上周你留下了 14 条记录，平均 6.2 分，比前一周的 5.8 分略有回升，主要情绪是「焦虑」。"
         "焦虑集中在两段：答辩前的两天，以及投实习没回音的那几天。\n\n"
         "不过有一个积极的变化——你开始把焦虑写下来了，而不只是记一个分数。"
         "「看到同组进度都比我快」「开始怀疑是不是自己不够好」这些具体的句子，比「焦虑」两个字更有价值，"
         "因为它们是可以被回应的。\n\n"
         "下周建议：挑一条最具体的担心，写下它最坏的结果、最可能的结果，以及你现在能做的一件小事。"
         "焦虑怕的不是被解决，是被看清。"),
]


# ---------------------------------------------------------------- 各表 seed
def _seed_users(db):
    accounts = [
        ("admin", "admin123", "admin", "系统管理员"),
        ("xiaolan", "xiaolan123", "user", "小兰"),
        ("counselor1", "counselor123", "counselor", "林知远"),
    ]
    for username, pwd, role, nick in accounts:
        if not db.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
            db.execute(
                "INSERT INTO users(username,password_hash,role,nickname) VALUES(?,?,?,?)",
                (username, generate_password_hash(pwd), role, nick),
            )
    return {r[1]: r[0] for r in db.execute("SELECT id, username FROM users").fetchall()}


def _seed_builtin_tags_raw(db, uid):
    if db.execute("SELECT 1 FROM user_prefs WHERE user_id=? AND key='builtin_seeded'", (uid,)).fetchone():
        return
    for t in BUILTIN_TAGS:
        try:
            db.execute(
                "INSERT INTO mood_tags(user_id,tag,color,emoji,kind,is_builtin) VALUES(?,?,?,?,?,1)",
                (uid, t["tag"], t["color"], t["emoji"], t["kind"]),
            )
        except Exception:
            pass
    try:
        db.execute("INSERT INTO user_prefs(user_id,key,value) VALUES(?, 'builtin_seeded', '1')", (uid,))
    except Exception:
        pass


def _seed_counselors(db, uid):
    if db.execute("SELECT COUNT(*) FROM counselors").fetchone()[0]:
        return
    rnd = random.Random(11)
    for i, (name, title, avatar, spec, intro, rating, rcount, price) in enumerate(COUNSELOR_SEED):
        slots = sorted(rnd.sample(COUNSELOR_SLOTS, 4))
        db.execute(
            "INSERT INTO counselors(user_id,name,title,avatar,specialties,intro,slots,rating,rating_count,price)"
            " VALUES(?,?,?,?,?,?,?,?,?,?)",
            (uid.get("counselor1") if i == 0 else None, name, title, avatar, spec, intro,
             json.dumps(slots, ensure_ascii=False), rating, rcount, price),
        )


def _seed_demo_data(db, uid):
    """小兰：30 条情绪（跨 14 天）+ 10 次测评（含逐题作答）+ 冥想记录。"""
    xid = uid.get("xiaolan")
    if not xid:
        return
    if db.execute("SELECT COUNT(*) FROM mood_entries WHERE user_id=?", (xid,)).fetchone()[0]:
        return
    rnd = random.Random(7)

    # 30 条情绪记录，跨 14 天：前两天各 3 条，其余每天 2 条
    idx = 0
    for day in range(14):
        for j in range(3 if day < 2 else 2):
            if idx >= 30:
                break
            emo = rnd.choice(["平静", "疲惫", "焦虑", "开心", "倦怠"])
            notes = MOOD_NOTE_POOL.get(emo, ["这一天平平常常，也说不上好坏"])
            note = notes[(idx + j) % len(notes)]
            db.execute(
                "INSERT INTO mood_entries(user_id,mood_score,emotion,note,created_at)"
                " VALUES(?,?,?,?,datetime('now','localtime','-%d day','+%d hour'))" % (day, 9 + j * 6),
                (xid, rnd.randint(3, 8), emo, note),
            )
            idx += 1

    # 10 次测评，跨 14 天；含 2 次中度以上（触发危机预警）
    scores = [68, 55, 61, 52, 47, 44, 50, 41, 46, 39]
    for i, total in enumerate(scores):
        level = "正常" if total < 53 else ("轻度抑郁" if total < 63 else ("中度抑郁" if total < 73 else "重度抑郁"))
        days_ago = 13 - i
        cur = db.execute(
            "INSERT INTO assessments(user_id,total_score,level,created_at)"
            " VALUES(?,?,?,datetime('now','localtime','-%d day'))" % days_ago,
            (xid, total, level),
        )
        aid = cur.lastrowid
        base, rem = divmod(total, len(SDS_QUESTIONS))
        for qi, q in enumerate(SDS_QUESTIONS):
            ans = base + (1 if qi < rem else 0)
            db.execute(
                "INSERT INTO assessment_answers(assessment_id,user_id,question_no,question,answer_score,created_at)"
                " VALUES(?,?,?,?,?,datetime('now','localtime','-%d day'))" % days_ago,
                (aid, xid, qi + 1, q, max(1, min(4, ans))),
            )

    for _ in range(8):
        db.execute(
            "INSERT INTO meditation_sessions(user_id,duration,created_at)"
            " VALUES(?,?,datetime('now','localtime','-%d day'))" % rnd.randint(0, 13),
            (xid, rnd.randint(120, 900)),
        )


def _seed_appointments(db, uid):
    """20 条预约：pending 5 / confirmed 5 / completed 6 / cancelled 4，其中 4 条已评价。"""
    if db.execute("SELECT COUNT(*) FROM appointments").fetchone()[0]:
        return
    xid = uid.get("xiaolan")
    cids = [r[0] for r in db.execute("SELECT id FROM counselors ORDER BY id").fetchall()]
    if not xid or not cids:
        return
    rnd = random.Random(13)
    plan = ["pending"] * 5 + ["confirmed"] * 5 + ["completed"] * 6 + ["cancelled"] * 4
    # 每位咨询师的排班表，预约只能落在该咨询师自己的时段内（保证前后端一致）
    roster = {}
    for row in db.execute("SELECT id, slots FROM counselors ORDER BY id").fetchall():
        try:
            roster[row[0]] = json.loads(row[1] or "[]")
        except Exception:
            roster[row[0]] = list(COUNSELOR_SLOTS)
    # 已被占用的 (counselor_id, slot)，避免同段重复
    used = set()
    reviewed_left = 4
    for i, status in enumerate(plan):
        days_ago = rnd.randint(0, 13)
        created = "-%d day" % days_ago
        updated = "-%d day" % max(0, days_ago - 1)
        cid = cids[i % len(cids)]
        options = [s for s in roster.get(cid, []) if (cid, s) not in used]
        if not options:
            continue
        slot = rnd.choice(options)
        used.add((cid, slot))
        rscore = rtext = reviewed_at = None
        if status == "completed" and reviewed_left > 0:
            reviewed_left -= 1
            rscore = rnd.choice([4, 5, 5, 5])
            rtext = APPT_REVIEWS[(4 - reviewed_left) % len(APPT_REVIEWS)]
            reviewed_at = updated
        if reviewed_at:
            db.execute(
                "INSERT INTO appointments(user_id,counselor_id,slot,topic,note,status,review_score,review_text,"
                "reviewed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,"
                "datetime('now','localtime',?),datetime('now','localtime',?),datetime('now','localtime',?))",
                (xid, cid, slot, APPT_TOPICS[i % len(APPT_TOPICS)],
                 "希望能聊聊最近的状态，谢谢。" if i % 3 == 0 else None,
                 status, rscore, rtext, reviewed_at, created, updated),
            )
        else:
            db.execute(
                "INSERT INTO appointments(user_id,counselor_id,slot,topic,note,status,created_at,updated_at)"
                " VALUES(?,?,?,?,?,?,datetime('now','localtime',?),datetime('now','localtime',?))",
                (xid, cid, slot, APPT_TOPICS[i % len(APPT_TOPICS)],
                 "希望能聊聊最近的状态，谢谢。" if i % 3 == 0 else None, status, created, updated),
            )


def _seed_crisis_alerts(db, uid):
    """15 条危机预警：open 9 / handled+dismissed 6，含测评与情绪两种触发来源。"""
    if db.execute("SELECT COUNT(*) FROM crisis_alerts").fetchone()[0]:
        return
    xid = uid.get("xiaolan")
    if not xid:
        return
    rnd = random.Random(17)
    for i in range(15):
        ttype = "assessment" if i % 3 != 2 else "mood"
        level = "high" if i % 5 == 0 else ("medium" if i % 3 == 0 else "low")
        days_ago = rnd.randint(0, 13)
        created = "-%d day" % days_ago
        if ttype == "assessment":
            score = rnd.choice([63, 66, 68, 70, 72, 74])
            level_txt = "中度抑郁" if score < 73 else "重度抑郁"
            detail = "SDS 测评得分 %d，评定为%s（中度及以上）" % (score, level_txt)
        else:
            detail = "情绪记录连续 3 天评分 ≤ 3 分（3/2/3）"
        if i < 9:
            db.execute(
                "INSERT INTO crisis_alerts(user_id,trigger_type,level,detail,status,created_at)"
                " VALUES(?,?,?,?, 'open', datetime('now','localtime',?))",
                (xid, ttype, level, detail, created),
            )
        else:
            action, note = CRISIS_HANDLE_ACTIONS[i % len(CRISIS_HANDLE_ACTIONS)]
            status = "dismissed" if action == "dismiss" else "handled"
            db.execute(
                "INSERT INTO crisis_alerts(user_id,trigger_type,level,detail,status,handler_id,handle_action,"
                "handle_note,handled_at,created_at) VALUES(?,?,?,?,?,?,?,?,datetime('now','localtime',?),"
                "datetime('now','localtime',?))",
                (xid, ttype, level, detail, status, uid.get("counselor1"), action, note,
                 "-%d day" % max(0, days_ago - 1), created),
            )


def _seed_resources(db, uid):
    """18 篇公共科普文章 + 2 篇小兰的 AI 周报 = 20 条。"""
    if db.execute("SELECT COUNT(*) FROM resources").fetchone()[0]:
        return
    for i, (cat, title, summary, content) in enumerate(RESOURCE_SEED):
        db.execute(
            "INSERT INTO resources(user_id,kind,category,title,summary,content,source,read_minutes,created_at)"
            " VALUES(NULL,'article',?,?,?,?,'local',?,datetime('now','localtime',?))",
            (cat, title, summary, content, max(2, len(content) // 350), "-%d day" % (i % 13)),
        )
    xid = uid.get("xiaolan")
    if xid:
        for days_ago, body in WEEKLY_REPORTS:
            db.execute(
                "INSERT INTO resources(user_id,kind,category,title,summary,content,source,read_minutes,created_at)"
                " VALUES(?,'weekly_report','AI 周报',?,?,?,'local',3,datetime('now','localtime',?))",
                (xid, "情绪周报 · %d 天前" % days_ago, body[:58].replace("\n", " ") + "…", body,
                 "-%d day" % days_ago),
            )


def seed_all(db):
    """统一入口：账号 → 咨询师 → 演示数据 → 预约 → 危机预警 → 资源 → 标签。"""
    uid = _seed_users(db)
    _seed_counselors(db, uid)
    _seed_demo_data(db, uid)
    _seed_appointments(db, uid)
    _seed_crisis_alerts(db, uid)
    _seed_resources(db, uid)
    for uname in ("admin", "xiaolan", "counselor1"):
        if uid.get(uname):
            _seed_builtin_tags_raw(db, uid[uname])
    db.commit()
