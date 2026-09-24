# =============================================
# EduPulse 数据初始化（12 表全量种子）
# =============================================
"""
用法：
    python seed.py            # 若库为空则写入演示数据
    python seed.py --fresh    # 重建数据库后再写入

种子规模：
    3 账号 / 6 学科 / 40 知识点 / 60 题 / 20 笔记
    80 答题记录 / 15 错题 / 30 学习记录(跨14天)
    8 目标 / 12 成就 / 10 AI 洞察
"""
import json
import random
import sys
from datetime import date, datetime, timedelta

from app import app
from models import (
    ACHIEVEMENT_DEFS, AiInsight, db, KnowledgePoint, Note, Quiz, QuizOption,
    QuizRecord, StudyGoal, StudySession, Subject, User, WrongBook,
)
from services import evaluate_achievements, goal_window, refresh_goal

random.seed(20260924)  # 固定随机种子，保证种子数据可复现

# ============================================================
# 基础字典
# ============================================================

SUBJECT_SEED = [
    {"name": "数学", "code": "math", "color": "#007AFF", "description": "函数、几何、概率与统计"},
    {"name": "英语", "code": "english", "color": "#34C759", "description": "词汇、语法、阅读与写作"},
    {"name": "语文", "code": "chinese", "color": "#FF9500", "description": "古诗文、现代文阅读与写作"},
    {"name": "物理", "code": "physics", "color": "#5856D6", "description": "力学、电学、光学与能量"},
    {"name": "化学", "code": "chemistry", "color": "#AF52DE", "description": "物质、反应、方程式与实验"},
    {"name": "生物", "code": "biology", "color": "#FF2D55", "description": "细胞、遗传、生态与人体"},
]

# 知识点：学科 -> [(名称, 难度)]
POINT_SEED = {
    "数学": [("函数概念", 2), ("函数单调性", 2), ("二次函数", 2), ("指数与对数", 3),
             ("三角函数", 3), ("数列", 3), ("导数与极值", 3), ("平面向量", 2),
             ("立体几何", 3), ("解析几何", 3), ("概率初步", 2)],
    "英语": [("核心词汇", 1), ("一般现在时", 1), ("现在完成时", 2), ("被动语态", 2),
             ("定语从句", 3), ("非谓语动词", 3), ("阅读理解", 2), ("书面表达", 3)],
    "语文": [("古诗文默写", 1), ("文言实词", 2), ("文言虚词", 3), ("修辞手法", 1),
             ("现代文阅读", 2), ("作文结构", 2)],
    "物理": [("受力分析", 2), ("牛顿运动定律", 3), ("功与能", 3), ("电学基础", 2),
             ("光的折射", 2), ("能量守恒", 2)],
    "化学": [("化学式与化合价", 1), ("化学方程式配平", 2), ("酸碱盐", 2),
             ("氧化还原", 3), ("实验基本操作", 1)],
    "生物": [("细胞结构", 1), ("遗传规律", 3), ("生态系统", 2), ("人体生理", 2)],
}  # 合计 40 个知识点

# 题目：知识点 -> [(题干, [选项], 正确下标, 解析, 难度)]
QUIZ_SEED = {
    "集合与逻辑": [
        ("已知集合 A={1,2,3}, B={2,3,4}, 则 A∩B = ?", ["{1,2}", "{2,3}", "{3,4}", "{1,4}"], 1,
         "交集取两集合共有的元素，A∩B={2,3}。", 1),
        ("命题 p 的否定与原命题的关系是？", ["同真同假", "真假相反", "必然都为真", "无确定关系"], 1,
         "命题与其否定互为矛盾关系，真假必然相反。", 1),
    ],
    "函数概念": [
        ("函数 f(x)=2x+1，则 f(3) = ?", ["5", "6", "7", "8"], 2,
         "代入 x=3：f(3)=2×3+1=7。", 1),
        ("下列哪个关系不是函数？", ["y=x²", "y=√x", "x²+y²=1 中的 y", "y=2x"], 2,
         "x²+y²=1 中一个 x 可对应两个 y，不满足函数定义。", 2),
    ],
    "函数单调性": [
        ("f'(x) > 0 时，函数 f(x) 在该区间上？", ["单调递减", "单调递增", "恒为常数", "无法判断"], 1,
         "导数大于零说明函数在该区间单调递增。", 2),
        ("函数 f(x)=-x² 在 x>0 时？", ["单调递增", "单调递减", "先增后减", "先减后增"], 1,
         "f'(x)=-2x，当 x>0 时 f'(x)<0，故单调递减。", 2),
    ],
    "二次函数": [
        ("二次函数 f(x)=x² 在 x=0 处的最值特性是？", ["有最大值", "有最小值", "无极值", "既无最大也无最小"], 1,
         "开口向上，顶点处取得最小值 0。", 2),
        ("抛物线 y=ax²+bx+c 的对称轴是？", ["x=-b/(2a)", "x=b/(2a)", "x=-c/(2a)", "x=c/(2a)"], 0,
         "对称轴公式 x=-b/(2a)。", 2),
    ],
    "指数与对数": [
        ("log₂8 的值是？", ["2", "3", "4", "8"], 1,
         "2³=8，故 log₂8=3。", 2),
        ("a^m · a^n = ?", ["a^(m+n)", "a^(mn)", "a^(m-n)", "a^(m/n)"], 0,
         "同底数幂相乘，指数相加。", 1),
    ],
    "三角函数": [
        ("sin²θ + cos²θ = ?", ["0", "1", "2", "sin2θ"], 1,
         "这是三角恒等式，恒等于 1。", 1),
        ("sin30° 的值是？", ["1/2", "√2/2", "√3/2", "1"], 0,
         "特殊角三角函数值，sin30°=1/2。", 1),
        ("函数 y=sinx 的最小正周期是？", ["π/2", "π", "2π", "4π"], 2,
         "正弦函数最小正周期 T=2π。", 2),
    ],
    "数列": [
        ("等差数列 2,5,8,11… 的公差是？", ["2", "3", "4", "5"], 1,
         "相邻两项差为 3，公差 d=3。", 1),
        ("等差数列通项公式 aₙ = ?", ["a₁+(n-1)d", "a₁+nd", "a₁·d^n", "a₁·d^(n-1)"], 0,
         "等差数列通项 aₙ=a₁+(n-1)d。", 2),
    ],
    "导数与极值": [
        ("导数 f(x)=x³ 的导函数是？", ["3x²", "x²", "3x", "x²/3"], 0,
         "幂函数求导：系数乘指数、指数减一，得 3x²。", 2),
        ("求函数极值的第一步通常是？", ["求二阶导", "求 f'(x)=0 的驻点", "直接代入端点", "画图像"], 1,
         "先求驻点，再判断驻点两侧导数符号变化。", 2),
    ],
    "平面向量": [
        ("向量 a=(1,2), b=(3,4)，则 a+b = ?", ["(4,6)", "(3,8)", "(2,2)", "(4,8)"], 0,
         "向量加法按分量相加：(1+3, 2+4)=(4,6)。", 1),
        ("两向量垂直的条件是？", ["数量积为 0", "模相等", "方向相同", "数量积为 1"], 0,
         "a·b=0 是向量垂直的充要条件。", 2),
    ],
    "立体几何": [
        ("正方体的体积公式是？", ["a²", "a³", "6a²", "4a³"], 1,
         "棱长为 a 的正方体体积 V=a³。", 1),
        ("球的体积公式是？", ["4πr²", "(4/3)πr³", "πr²h", "2πr³"], 1,
         "球体积 V=(4/3)πr³，表面积 S=4πr²。", 3),
    ],
    "解析几何": [
        ("圆 x²+y²=9 的半径是？", ["3", "9", "6", "√3"], 0,
         "标准式 x²+y²=r² 中 r²=9，故 r=3。", 1),
        ("直线 y=2x+1 的斜率是？", ["1", "2", "-2", "1/2"], 1,
         "斜截式 y=kx+b 中 k 即斜率，k=2。", 1),
    ],
    "概率初步": [
        ("掷一枚均匀硬币，正面朝上的概率是？", ["1/4", "1/3", "1/2", "1"], 2,
         "等可能事件，正反各占一半，概率为 1/2。", 1),
        ("从 1-10 中随机取一个数，取到偶数的概率是？", ["1/2", "1/5", "2/5", "3/5"], 0,
         "偶数有 5 个（2,4,6,8,10），概率 5/10=1/2。", 2),
    ],
    "统计初步": [
        ("一组数据 2,4,4,6,9 的中位数是？", ["4", "4.5", "5", "6"], 0,
         "排序后中间位置（第 3 个）的数是 4。", 1),
        ("平均数反映数据的什么特征？", ["离散程度", "集中趋势", "最大值", "分布形状"], 1,
         "平均数、中位数、众数都是描述集中趋势的统计量。", 2),
    ],
    "不等式": [
        ("不等式 x-3>0 的解集是？", ["x>3", "x<3", "x>0", "x<0"], 0,
         "移项得 x>3。", 1),
        ("基本不等式 a+b ≥ 2√(ab) 成立的条件是？", ["a,b 任意", "a,b>0", "a,b<0", "a=b"], 1,
         "基本不等式要求 a,b 均为正数。", 2),
    ],
    "核心词汇": [
        ("单词 'environment' 的意思是？", ["社区", "环境", "设备", "经济"], 1,
         "environment 意为“环境”。", 1),
        ("单词 'achieve' 的意思是？", ["放弃", "实现、达成", "怀疑", "重复"], 1,
         "achieve 意为“实现、达成”。", 1),
        ("单词 'significant' 的意思是？", ["微不足道的", "重要的、显著的", "临时的", "复杂的"], 1,
         "significant 意为“重要的、显著的”。", 2),
    ],
    "一般现在时": [
        ("句子：'She ___ to school every day.' 应填？", ["go", "goes", "going", "gone"], 1,
         "第三人称单数一般现在时动词加 -es：goes。", 1),
        ("一般现在时表示的习惯性动作用？", ["动词原形或三单形式", "be+doing", "have+过去分词", "will+动词原形"], 0,
         "一般现在时用动词原形，第三人称单数加 -s/-es。", 1),
    ],
    "现在完成时": [
        ("现在完成时的结构是？", ["have/has + 过去分词", "will + 动词原形", "动词过去式", "be + doing"], 0,
         "现在完成时：主语 + have/has + 过去分词。", 2),
        ("'since' 与 'for' 的区别是？", ["无区别", "since 接时间点，for 接时间段", "for 接时间点，since 接时间段", "只用于过去时"], 1,
         "since 后接具体时间点，for 后接持续的时间段。", 2),
    ],
    "被动语态": [
        ("'The book ___ by Lu Xun.' 应填？", ["writes", "was written", "is writing", "wrote"], 1,
         "书是被写的，用被动语态 was written。", 2),
        ("一般现在时被动语态的结构是？", ["am/is/are + 过去分词", "was/were + 过去分词", "have + 过去分词", "be + doing"], 0,
         "一般现在时被动：am/is/are + 过去分词。", 2),
    ],
    "定语从句": [
        ("关系代词 that 在从句中可作？", ["只能作主语", "只能作宾语", "主语或宾语", "只能作状语"], 2,
         "that 在定语从句中可作主语或宾语，不能作状语。", 3),
        ("'The man ___ is talking to Tom is my uncle.' 应填？", ["which", "who", "whose", "whom"], 1,
         "先行词是人且在从句中作主语，用 who。", 2),
    ],
    "非谓语动词": [
        ("'I enjoy ___ books.' 应填？", ["read", "reading", "to read", "reads"], 1,
         "enjoy 后接动名词作宾语：enjoy doing。", 2),
        ("不定式常用来表示？", ["目的或将来", "正在进行的动作", "完成的动作", "被动含义"], 0,
         "不定式常表示目的、将来或将发生的动作。", 3),
    ],
    "阅读理解": [
        ("做阅读理解时，第一步建议？", ["逐字翻译全文", "先看题目再读原文", "只读首段", "直接凭感觉选"], 1,
         "先看题目明确考查点，再带着问题回原文定位，效率更高。", 2),
        ("遇到生词时，最有效的策略是？", ["立刻查词典", "跳过不做", "根据上下文推测词义", "随机猜测"], 2,
         "高考阅读不鼓励逐词查词典，应培养根据上下文推断词义的能力。", 2),
    ],
    "书面表达": [
        ("英语作文中，段落之间的衔接最好使用？", ["重复同一句式", "恰当的连接词", "大量生僻词", "无标点长句"], 1,
         "使用 however / therefore / moreover 等连接词能让逻辑更清晰。", 2),
        ("作文开头段的主要作用是？", ["凑字数", "点明主题并引出下文", "罗列所有观点", "展示词汇量"], 1,
         "开头段应点题并引出下文，为全篇定基调。", 2),
    ],
    "古诗文默写": [
        ("'床前明月光' 的作者是？", ["杜甫", "李白", "白居易", "王维"], 1,
         "《静夜思》作者为李白。", 1),
        ("'会当凌绝顶，一览众山小' 出自？", ["《望岳》", "《春望》", "《登高》", "《山居秋暝》"], 0,
         "该句出自杜甫《望岳》。", 2),
    ],
    "文言实词": [
        ("'兵' 在古文中常表示？", ["士兵或兵器", "病痛", "冰冻", "并且"], 0,
         "兵可指兵器或士兵，需结合语境判断。", 2),
        ("'走' 在古文中表示？", ["行走", "跑", "离开", "经过"], 1,
         "古汉语中“走”意为“跑”，如“弃甲曳兵而走”。", 2),
    ],
    "文言虚词": [
        ("'之' 的常见用法不包括？", ["代词", "助词", "动词“到”", "连词“因为”"], 3,
         "之主要作代词、助词，也可作动词“到、往”，但不作连词表原因。", 3),
        ("'而' 表转折时相当于？", ["而且", "但是", "于是", "因为"], 1,
         "而表转折时相当于“但是、却”。", 3),
    ],
    "修辞手法": [
        ("下列哪个是比喻修辞？", ["红领巾是国旗的一角", "太阳像火球", "他跑了，跑得很快", "风轻轻地吹过"], 1,
         "把太阳比作火球是典型的比喻句。", 1),
        ("'问君能有几多愁，恰似一江春水向东流' 用了？", ["夸张", "比喻", "拟人", "排比"], 1,
         "以春水喻愁绪，是比喻中的明喻。", 2),
    ],
    "现代文阅读": [
        ("分析散文主旨，最可靠的依据是？", ["标题字面", "作者生平", "文本内容与情感线索", "读者感受"], 2,
         "主旨分析必须立足文本，结合情感线索与关键语句。", 2),
        ("小说中环境描写的主要作用不包括？", ["烘托气氛", "推动情节", "塑造人物", "直接说明中心思想"], 3,
         "环境描写通常间接服务于主题，不直接点明中心思想。", 2),
    ],
    "作文结构": [
        ("议论文的常见结构是？", ["总分总", "时间顺序", "空间顺序", "随机排列"], 0,
         "议论文常用总—分—总结构，逻辑清晰。", 2),
        ("记叙文开头最好？", ["直接抒情到底", "设置悬念或点明情境", "罗列所有情节", "先写结尾"], 1,
         "开头设置悬念或点明情境，能有效吸引读者。", 2),
    ],
    "受力分析": [
        ("对斜面上静止物体受力分析，不包含？", ["重力", "支持力", "摩擦力", "向心力"], 3,
         "静止物体没有向心力，向心力是圆周运动才需要的。", 2),
        ("受力分析的正确顺序一般是？", ["先接触力后场力", "先重力再弹力再摩擦力", "随机顺序", "只看水平方向"], 1,
         "通常按重力 → 弹力 → 摩擦力 → 其他力的顺序分析，不易遗漏。", 2),
    ],
    "牛顿运动定律": [
        ("牛顿第二定律 F=ma 中，F 指的是？", ["某个力", "合外力", "支持力", "摩擦力"], 1,
         "F 必须是物体所受的合外力。", 2),
        ("牛顿第三定律说明？", ["力可以单独存在", "作用力与反作用力等大反向", "合力为零", "质量守恒"], 1,
         "作用力与反作用力大小相等、方向相反、作用在不同物体上。", 2),
    ],
    "功与能": [
        ("功的计算公式 W = ?", ["F·s", "F·s·cosθ", "m·a", "m·g·h"], 1,
         "W=Fs·cosθ，θ 为力与位移的夹角。", 2),
        ("功是标量还是矢量？", ["标量", "矢量", "有时是矢量", "无法确定"], 0,
         "功只有大小没有方向，是标量。", 2),
    ],
    "电学基础": [
        ("电阻的基本单位是？", ["伏特", "安培", "欧姆", "瓦特"], 2,
         "电阻单位是欧姆(Ω)。", 1),
        ("欧姆定律的表达式是？", ["I=U/R", "U=IR²", "R=UI", "I=UR"], 0,
         "欧姆定律 I=U/R，电流与电压成正比、与电阻成反比。", 1),
        ("串联电路中电流的关系是？", ["各处相等", "各处不等", "与电阻成正比", "与电阻成反比"], 0,
         "串联电路电流处处相等。", 2),
    ],
    "光的折射": [
        ("光在真空中的速度约为？", ["3×10⁵ km/s", "3×10⁴ km/s", "3×10⁶ km/s", "3×10³ km/s"], 0,
         "光速约为 3×10⁵ km/s（即 3×10⁸ m/s）。", 2),
        ("光从空气斜射入水中时，折射角？", ["大于入射角", "小于入射角", "等于入射角", "与入射角无关"], 1,
         "光从光疏介质射入光密介质，折射角小于入射角。", 2),
    ],
    "能量守恒": [
        ("自由下落的物体，机械能？", ["增大", "减小", "守恒", "先增后减"], 2,
         "只有重力做功时机械能守恒。", 2),
        ("能量守恒定律说明能量？", ["可以创造", "可以消灭", "只能转化或转移", "总量会减少"], 2,
         "能量既不能创造也不能消灭，只能从一种形式转化为另一种形式。", 1),
    ],
    "化学式与化合价": [
        ("水的化学式是？", ["H₂O", "CO₂", "O₂", "H₂O₂"], 0,
         "水化学式为 H₂O。", 1),
        ("化合物 NaCl 中钠元素的化合价是？", ["+1", "-1", "+2", "0"], 0,
         "钠在化合物中通常显 +1 价。", 2),
    ],
    "化学方程式配平": [
        ("化学方程式配平的依据是？", ["质量守恒定律", "能量守恒", "电荷守恒", "平均分配"], 0,
         "配平依据质量守恒：反应前后原子个数相等。", 2),
        ("2H₂ + O₂ → 2H₂O 中，氢气与氧气的系数比是？", ["1:1", "2:1", "1:2", "2:3"], 1,
         "氢气系数 2，氧气系数 1，比为 2:1。", 2),
    ],
    "酸碱盐": [
        ("pH 值小于 7 的溶液呈？", ["酸性", "中性", "碱性", "无法判断"], 0,
         "pH<7 为酸性，=7 为中性，>7 为碱性。", 1),
        ("酸与碱反应生成？", ["盐和水", "只有盐", "只有水", "气体"], 0,
         "中和反应生成盐和水。", 2),
    ],
    "氧化还原": [
        ("氧化还原反应的本质是？", ["电子转移", "原子重组", "能量释放", "分子碰撞"], 0,
         "氧化还原反应的本质是电子的得失或偏移。", 3),
        ("还原剂在反应中？", ["失去电子被氧化", "得到电子被还原", "不参与反应", "只提供能量"], 0,
         "还原剂失电子、被氧化；氧化剂得电子、被还原。", 3),
    ],
    "实验基本操作": [
        ("给试管加热时，液体体积不应超过试管容积的？", ["1/2", "1/3", "2/3", "3/4"], 1,
         "加热试管内液体不得超过容积的 1/3，防止沸腾溅出。", 1),
        ("稀释浓硫酸时，正确操作是？", ["把水倒入浓硫酸", "把浓硫酸沿器壁缓缓倒入水中并搅拌", "直接混合", "加热后混合"], 1,
         "必须酸入水，且沿器壁缓慢加入并不断搅拌，防止液体飞溅。", 2),
    ],
    "物质分类": [
        ("下列属于纯净物的是？", ["空气", "蒸馏水", "食盐水", "合金"], 1,
         "蒸馏水只含 H₂O 一种物质，属于纯净物。", 1),
        ("下列属于混合物的是？", ["氧气", "二氧化碳", "空气", "铁"], 2,
         "空气由多种气体组成，属于混合物。", 1),
    ],
    "细胞结构": [
        ("细胞的控制中心是？", ["细胞膜", "细胞质", "细胞核", "线粒体"], 2,
         "细胞核含有遗传物质，是细胞的控制中心。", 1),
        ("植物细胞特有而动物细胞没有的结构是？", ["细胞膜", "细胞核", "细胞壁", "线粒体"], 2,
         "细胞壁、液泡、叶绿体是植物细胞特有的结构。", 1),
    ],
    "遗传规律": [
        ("孟德尔遗传定律中，显性性状用字母表示常为？", ["小写字母", "大写字母", "数字", "希腊字母"], 1,
         "显性基因常用大写字母表示，隐性基因用小写字母。", 3),
        ("基因型 Aa 的个体自交，后代显隐性比约为？", ["1:1", "3:1", "1:3", "9:1"], 1,
         "Aa×Aa 后代基因型比 1AA:2Aa:1aa，表现型显隐比 3:1。", 3),
    ],
    "生态系统": [
        ("生态系统中的生产者主要是？", ["绿色植物", "草食动物", "肉食动物", "分解者"], 0,
         "绿色植物通过光合作用制造有机物，是生态系统中的生产者。", 2),
        ("食物链的起点通常是？", ["生产者", "消费者", "分解者", "非生物"], 0,
         "食物链从生产者（绿色植物）开始，到最高级消费者结束。", 2),
    ],
    "人体生理": [
        ("人体呼吸系统进行气体交换的主要场所是？", ["气管", "肺泡", "鼻腔", "支气管"], 1,
         "肺泡壁薄、数量多、外面缠绕毛细血管，是气体交换的主要场所。", 2),
        ("人体血液循环的动力器官是？", ["肺", "肝脏", "心脏", "肾脏"], 2,
         "心脏通过收缩舒张推动血液在血管中循环流动。", 1),
    ],
}

NOTE_SEED = [
    {"title": "导数与函数的极值", "subject": "数学",
     "content": "导数判断函数单调性：f'(x)>0 递增，f'(x)<0 递减。求极值步骤：先求 f'(x)=0 的驻点，判断驻点两侧导数符号变化。极大值点左侧递增右侧递减，极小值反之。要注意边界点与不可导点。",
     "mistake": "容易忘记判断驻点两侧符号；把驻点当极值点。"},
    {"title": "现在完成时详解", "subject": "英语",
     "content": "现在完成时 have/has + 过去分词，表示过去发生但对现在有影响，或持续到现在的动作。常用时间词：already, yet, ever, never, just, since, for。主谓一致注意第三人称单数用 has。",
     "mistake": "易混淆一般过去时；since 后接时间点，for 后接时间段。"},
    {"title": "力学：牛顿第二定律", "subject": "物理",
     "content": "牛顿第二定律 F=ma，加速度与合外力成正比，与质量成反比。解题先受力分析，沿加速度方向正交分解。常见：斜面上物体的受力分解、连接体问题。",
     "mistake": "受合外力不等同于单个力；别忘了摩擦力的方向。"},
    {"title": "化学方程式配平方法", "subject": "化学",
     "content": "配平依据质量守恒定律。常用方法：观察法（简单反应）、最小公倍数法（原子个数差异）、奇偶配平法、化合价升降法（氧化还原）。配平后必须检查各元素原子个数与电荷守恒。",
     "mistake": "忘记配平就写等号；氧化还原反应忽略电子得失守恒。"},
    {"title": "三角函数诱导公式记忆", "subject": "数学",
     "content": "诱导公式口诀：奇变偶不变，符号看象限。以 α 为锐角，判断目标角所在象限确定符号。sin(π-α)=sinα，cos(π-α)=-cosα，sin(π/2-α)=cosα。",
     "mistake": "符号判断错误；把 π/2 的奇数倍与偶数倍混淆。"},
    {"title": "文言虚词「之」的用法", "subject": "语文",
     "content": "之一、作代词：代词人或物。二、作助词：取消句子独立性、宾语前置标志、定语后置标志。三、作动词：往、到。判断方法看它在句中的位置与前后搭配。",
     "mistake": "把取消句子独立性的「之」误当作代词。"},
    {"title": "遗传规律解题思路", "subject": "生物",
     "content": "判断显隐性：有中生无为显性，无中生有为隐性。判断基因型：隐性个体必为隐性纯合。计算概率：先分离后组合，用乘法原理。注意伴性遗传要区分常染色体。",
     "mistake": "混淆显隐性判断口诀；伴性遗传忘记考虑性别。"},
    {"title": "欧姆定律与串并联", "subject": "物理",
     "content": "欧姆定律 I=U/R。串联：电流处处相等，总电阻等于各电阻之和，电压按电阻分配。并联：电压处处相等，总电阻倒数等于各电阻倒数之和，电流按电阻反比分配。",
     "mistake": "并联电路总电阻计算时忘记取倒数；串联时误把电压当处处相等。"},
    {"title": "定语从句关系词选择", "subject": "英语",
     "content": "先看先行词是人是物，再看关系词在从句中作什么成分。作主语或宾语：who/whom/which/that。作定语：whose。作状语：when/where/why。介词后只能用 which/whom。",
     "mistake": "关系词在从句中作宾语时误用关系副词。"},
    {"title": "氧化还原反应判断", "subject": "化学",
     "content": "本质是电子转移。化合价升高失电子被氧化是还原剂；化合价降低得电子被还原是氧化剂。记忆口诀：升失氧还原剂，降得还氧化剂。常见氧化剂：氧气、高锰酸钾、浓硫酸。",
     "mistake": "氧化剂还原剂概念颠倒；忽略歧化反应中同一元素既升又降。"},
    {"title": "立体几何空间向量法", "subject": "数学",
     "content": "建立空间直角坐标系，求出各点坐标。线线角用两方向向量夹角余弦的绝对值。线面角用方向向量与法向量夹角正弦。二面角需结合图形判断钝锐，用两法向量夹角余弦加符号。",
     "mistake": "二面角忘记判断钝角还是锐角，直接取绝对值。"},
    {"title": "古诗文默写易错字整理", "subject": "语文",
     "content": "《劝学》：「君子博学而日参省乎己」的「参省」不写「叁醒」。《师说》：「师者，所以传道受业解惑也」的「受」通「授」。《岳阳楼记》：「浩浩汤汤」读 shāng 不写「荡荡」。",
     "mistake": "通假字写成现代字；生僻字笔画错误。"},
    {"title": "概率的加法与乘法原理", "subject": "数学",
     "content": "互斥事件用加法：P(A∪B)=P(A)+P(B)。独立事件用乘法：P(AB)=P(A)·P(B)。对立事件：P(Ā)=1-P(A)。区分「至少一个」通常用对立事件求解更简便。",
     "mistake": "把独立事件当成互斥事件；「至少」问题忘记用对立事件。"},
    {"title": "细胞呼吸与光合作用", "subject": "生物",
     "content": "光合作用：CO₂+H₂O →（光能、叶绿体）有机物+O₂。有氧呼吸：有机物+O₂ → CO₂+H₂O+大量能量。两者关系：光合作用为呼吸作用提供有机物和氧气，呼吸作用为光合作用提供 CO₂。",
     "mistake": "混淆两者的场所；忽略光反应与暗反应的区别。"},
    {"title": "现代文阅读答题模板", "subject": "语文",
     "content": "作用题：内容上写了什么，结构上承上启下/铺垫/照应，情感上表达了什么。含义题：表层义+深层义，结合上下文与主旨。赏析题：手法+内容+效果+情感四步走。",
     "mistake": "只答手法不答效果；脱离文本空谈。"},
    {"title": "函数单调性证明方法", "subject": "数学",
     "content": "定义法：设 x₁<x₂，作差 f(x₁)-f(x₂)，判断符号。导数法：求 f'(x)，判断在区间上的正负。复合函数遵循同增异减。抽象函数常用赋值法。",
     "mistake": "作差后忘记分解因式判断符号；复合函数单调性判断方向搞反。"},
    {"title": "英语作文高级句式积累", "subject": "英语",
     "content": "倒装句：Not only did he..., but he also... 强调句：It is ... that ... 定语从句：which 指代整句。非谓语作状语：Having finished..., he... 使用这些句式能让作文更有层次。",
     "mistake": "倒装句助动词位置错误；非谓语逻辑主语与主句主语不一致。"},
    {"title": "化学实验安全常识", "subject": "化学",
     "content": "浓硫酸稀释必须酸入水。给试管加热液体不超过 1/3，试管口不对人。闻气味用手扇。酒精灯用火柴点燃，不可用另一盏引燃。有毒气体实验需通风橱。",
     "mistake": "稀释浓硫酸时把水倒入酸中；加热试管口对着自己或他人。"},
    {"title": "功和能的关系梳理", "subject": "物理",
     "content": "功是能量转化的量度。合外力做功等于动能变化（动能定理）。重力做功等于重力势能减少量。除重力外其他力做功等于机械能变化。摩擦力做功产生内能。",
     "mistake": "混淆动能定理与机械能守恒的适用条件；摩擦力做功符号搞错。"},
    {"title": "数列求和方法总结", "subject": "数学",
     "content": "公式法：等差等比直接用公式。错位相减：等差乘等比型。裂项相消：分式型如 1/n(n+1)。分组求和：通项可拆成几部分。倒序相加：与首尾对称相关。",
     "mistake": "错位相减时项数计算错误；裂项后忘记检查剩余项。"},
]

REAL_SUMMARIES = {
    "导数与函数的极值": "通过导数符号判定单调性，掌握求极值的一般步骤（求驻点→判符号），并注意区分极值与最值、留意边界点与不可导点。",
    "现在完成时详解": "现在完成时结构 have/has+过去分词，强调“过去发生但对现在有影响”。重点区分 since/for 用法，注意与一般过去时的界限。",
    "力学：牛顿第二定律": "核心是 F=ma，解题关键是先受力分析、正交分解，再沿加速度方向列式。常见易错点在摩擦力的方向判断。",
}

STUDY_NOTES = [
    "复习导数与函数极值章节，重做错题", "精读一篇阅读理解，整理句式",
    "背诵文言文并默写重点段落", "练习受力分析，专项突破斜面问题",
    "默写化学方程式并配平练习", "限时训练，检验当周知识点掌握情况",
    "背单词并做听力精听训练", "梳理细胞结构知识框架",
    "整理三角函数诱导公式并做专项题", "复盘上周错题，归纳解题方法",
]

GOAL_SEED = [
    {"title": "本周学习 600 分钟", "period": "week", "metric": "duration", "target": 600, "subject": ""},
    {"title": "本周完成 60 道练习题", "period": "week", "metric": "quiz_count", "target": 60, "subject": ""},
    {"title": "本周数学正确率 75%", "period": "week", "metric": "accuracy", "target": 75, "subject": "数学"},
    {"title": "本月学习 2000 分钟", "period": "month", "metric": "duration", "target": 2000, "subject": ""},
    {"title": "本月完成 200 道练习题", "period": "month", "metric": "quiz_count", "target": 200, "subject": ""},
    {"title": "本月英语正确率 80%", "period": "month", "metric": "accuracy", "target": 80, "subject": "英语"},
    {"title": "本周物理专项 120 分钟", "period": "week", "metric": "duration", "target": 120, "subject": "物理"},
    {"title": "本月化学正确率 70%", "period": "month", "metric": "accuracy", "target": 70, "subject": "化学"},
]


def _ensure_user(username, nickname, role, password):
    u = User.query.filter_by(username=username).first()
    if u:
        return u, False
    u = User(username=username, nickname=nickname, role=role)
    u.set_password(password)
    db.session.add(u)
    db.session.flush()
    return u, True


def seed_users():
    created = []
    _, a = _ensure_user("admin", "管理员", "admin", "admin123")
    _, d = _ensure_user("demo", "演示同学", "user", "demo123")
    _, s = _ensure_user("student1", "李小明", "user", "student123")
    if a:
        created.append("admin/admin123")
    if d:
        created.append("demo/demo123")
    if s:
        created.append("student1/student123")
    if created:
        print("已创建账号：" + "、".join(created))
    return User.query.order_by(User.id).all()


def seed_subjects_and_points():
    """6 学科 + 40 知识点，返回 {学科名: Subject} 与 {知识点名: KnowledgePoint}"""
    subject_map = {}
    for i, s in enumerate(SUBJECT_SEED):
        sub = Subject.query.filter_by(name=s["name"]).first()
        if not sub:
            sub = Subject(name=s["name"], code=s["code"], color=s["color"],
                          description=s["description"], order_index=i)
            db.session.add(sub)
        subject_map[s["name"]] = sub
    db.session.flush()

    point_map = {}
    total = 0
    for sname, points in POINT_SEED.items():
        sub = subject_map[sname]
        for idx, (pname, diff) in enumerate(points):
            kp = KnowledgePoint.query.filter_by(subject_id=sub.id, name=pname).first()
            if not kp:
                kp = KnowledgePoint(subject_id=sub.id, name=pname,
                                    code=f"{sub.code}_{idx + 1}",
                                    description=f"{sname}·{pname}",
                                    difficulty=diff, order_index=idx)
                db.session.add(kp)
                total += 1
            point_map[pname] = kp
    db.session.flush()
    print(f"已写入 {len(subject_map)} 个学科、{total} 个知识点（共 {len(point_map)} 个）。")
    return subject_map, point_map


def seed_quizzes(subject_map, point_map):
    """60 道题，挂载知识点与学科，同时写入 quiz_options。"""
    if Quiz.query.count() > 0:
        print("题库已存在，跳过。")
        return Quiz.query.all()

    # 展开为扁平列表，便于精确控制总量
    flat = []
    for pname, items in QUIZ_SEED.items():
        kp = point_map.get(pname)
        if not kp:
            continue  # 该知识点已被裁剪，跳过
        sub = db.session.get(Subject, kp.subject_id)
        for (question, opts, ans, ana, diff) in items:
            flat.append((sub, kp, question, opts, ans, ana, diff))

    flat = flat[:60]  # 精确 60 题
    for (sub, kp, question, opts, ans, ana, diff) in flat:
        quiz = Quiz(question=question, options=json.dumps(opts, ensure_ascii=False),
                    answer=ans, analysis=ana, tag=kp.name, difficulty=diff,
                    subject_id=sub.id, knowledge_point_id=kp.id)
        quiz.option_rows = [
            QuizOption(idx=i, content=t, is_correct=(i == ans))
            for i, t in enumerate(opts)
        ]
        db.session.add(quiz)
    db.session.flush()
    print(f"已写入题库 {len(flat)} 题。")
    return Quiz.query.all()


def seed_notes(users):
    """20 篇笔记（在 3 个账号间轮转分配）。"""
    if Note.query.count() > 0:
        print("笔记已存在，跳过。")
        return
    n = 0
    for i in range(20):
        owner = users[i % len(users)]
        item = NOTE_SEED[i % len(NOTE_SEED)]
        db.session.add(Note(
            user_id=owner.id, title=item["title"], subject=item["subject"],
            content=item["content"], mistake=item["mistake"],
            summary=REAL_SUMMARIES.get(item["title"], "")))
        n += 1
    print(f"已写入 {n} 篇笔记。")


def seed_sessions(users):
    """30 条学习记录，跨 14 天。"""
    if StudySession.query.count() > 0:
        print("学习记录已存在，跳过。")
        return
    today = date.today()
    n = 0
    for owner in users:
        for _ in range(10):
            day_off = random.randint(0, 13)
            subject = random.choice([s["name"] for s in SUBJECT_SEED])
            db.session.add(StudySession(
                user_id=owner.id, subject=subject,
                duration=random.randint(25, 120),
                note=random.choice(STUDY_NOTES),
                study_date=today - timedelta(days=day_off)))
            n += 1
    print(f"已写入 {n} 条学习记录（跨 14 天）。")


def seed_records(users, quizzes):
    """80 条答题记录，并同步错题本（15 条）。"""
    if QuizRecord.query.count() > 0:
        print("答题记录已存在，跳过。")
        return
    today = date.today()
    # 3 个账号分配：27 + 27 + 26 = 80 条
    quota = [27, 27, 26]
    n = 0
    for i, owner in enumerate(users):
        for _ in range(quota[i % len(quota)]):
            quiz = random.choice(quizzes)
            n_opts = len(quiz.option_texts())
            correct = random.random() < 0.66
            chosen = quiz.answer if correct else (quiz.answer + random.randint(1, n_opts - 1)) % n_opts
            answered_at = (datetime(today.year, today.month, today.day,
                                    random.randint(8, 21), random.randint(0, 59))
                           - timedelta(days=random.randint(0, 13)))
            db.session.add(QuizRecord(
                user_id=owner.id, quiz_id=quiz.id, tag=quiz.tag,
                knowledge_point_id=quiz.knowledge_point_id,
                is_correct=correct, answer=chosen, answered_at=answered_at))
            n += 1
    db.session.flush()
    print(f"已写入 {n} 条答题记录。")

    # 错题本：每个用户最多取 5 道错题，合计 15 条
    wn = 0
    for owner in users:
        wrong_rows = (QuizRecord.query
                      .filter_by(user_id=owner.id, is_correct=False)
                      .order_by(QuizRecord.answered_at.desc()).all())
        seen = set()
        picked = 0
        for r in wrong_rows:
            if picked >= 5:
                break
            if r.quiz_id in seen:
                continue
            seen.add(r.quiz_id)
            if WrongBook.query.filter_by(user_id=owner.id, quiz_id=r.quiz_id).first():
                continue
            # 部分错题标记为已掌握，体现状态机两态
            mastered = random.random() < 0.3
            db.session.add(WrongBook(
                user_id=owner.id, quiz_id=r.quiz_id,
                knowledge_point_id=r.knowledge_point_id,
                wrong_count=1, correct_count=1 if mastered else 0,
                status="mastered" if mastered else "pending",
                last_answer=r.answer, last_wrong_at=r.answered_at,
                mastered_at=datetime.utcnow() if mastered else None))
            wn += 1
            picked += 1
    db.session.flush()
    print(f"已写入 {wn} 条错题本记录。")


def seed_goals(users):
    """8 个目标：涵盖 active / achieved / expired 三态。"""
    if StudyGoal.query.count() > 0:
        print("学习目标已存在，跳过。")
        return
    n = 0
    # 分配：user0 拿 3 个、user1 拿 3 个、user2 拿 2 个 → 共 8 个
    plan = {0: (0, 3), 1: (3, 6), 2: (6, 8)}
    for i, owner in enumerate(users):
        lo, hi = plan.get(i, (0, 0))
        for j in range(lo, hi):
            g = GOAL_SEED[j]
            start, end = goal_window(g["period"])
            goal = StudyGoal(
                user_id=owner.id, title=g["title"], period=g["period"],
                metric=g["metric"], target=g["target"], status="active",
                subject=g["subject"], start_date=start, end_date=end)
            db.session.add(goal)
            db.session.flush()
            # 前两条标记为已过期（历史目标），其余保持 active 并算进度
            if n < 2:
                goal.status = "expired"
                goal.start_date = start - timedelta(days=30)
                goal.end_date = end - timedelta(days=30)
                goal.progress = max(1, g["target"] // 2)
            else:
                refresh_goal(goal, commit=False)
            n += 1
    db.session.commit()
    print(f"已写入 {n} 个学习目标（active/achieved/expired 三态齐备）。")


def seed_achievements(users):
    """按真实指标评估 12 个成就（部分自动解锁）。"""
    total_unlocked = 0
    for owner in users:
        evaluate_achievements(owner.id, commit=False)
        db.session.flush()
        total_unlocked += Achievement_count(owner.id)
    db.session.commit()
    print(f"已初始化成就，共解锁 {total_unlocked} 个。")


def Achievement_count(uid):
    from models import Achievement
    return Achievement.query.filter_by(user_id=uid, unlocked=True).count()


def seed_insights(users):
    """10 条 AI 洞察（预置，source=local，首页直接可见）。"""
    if AiInsight.query.count() > 0:
        print("AI 洞察已存在，跳过。")
        return
    from services import build_insight_payload
    from ai_service import _local_insight_from

    n = 0
    for owner in users:
        payload = build_insight_payload(owner.id, max_points=4)
        result = _local_insight_from(payload)
        for item in result["insights"]:
            db.session.add(AiInsight(
                user_id=owner.id, kind=item.get("kind") or "weak_point",
                title=(item.get("title") or "学习洞察")[:128],
                content=item.get("content") or "",
                suggestion=item.get("suggestion") or "",
                knowledge_point_id=item.get("knowledge_point_id"),
                subject=item.get("subject") or "",
                severity=item.get("severity") or "medium",
                status="new", source="local"))
            n += 1

    # 补一条趋势类洞察，凑满 10 条（体现 kind 多样性）
    first = users[0]
    db.session.add(AiInsight(
        user_id=first.id, kind="trend",
        title="近期学习节奏趋于稳定",
        content="过去两周你的学习记录分布较为均匀，日均学习时长保持在合理区间。",
        suggestion="可尝试把每天的固定时段用于最薄弱的科目，形成稳定的学习节律。",
        severity="low", status="new", source="local"))
    n += 1

    db.session.commit()
    print(f"已写入 {n} 条 AI 洞察。")


def main():
    fresh = "--fresh" in sys.argv
    with app.app_context():
        if fresh:
            db.drop_all()
            print("已重建数据库。")
        db.create_all()

        users = seed_users()
        db.session.commit()
        users = User.query.order_by(User.id).all()

        subject_map, point_map = seed_subjects_and_points()
        db.session.commit()

        quizzes = seed_quizzes(subject_map, point_map)
        db.session.commit()

        seed_notes(users)
        db.session.commit()

        seed_sessions(users)
        db.session.commit()

        seed_records(users, quizzes)
        db.session.commit()

        seed_goals(users)
        seed_achievements(users)
        seed_insights(users)

        print("\n===== 数据统计 =====")
        from models import Achievement
        print(f"用户      {User.query.count()}")
        print(f"学科      {Subject.query.count()}")
        print(f"知识点    {KnowledgePoint.query.count()}")
        print(f"题目      {Quiz.query.count()}")
        print(f"选项      {QuizOption.query.count()}")
        print(f"笔记      {Note.query.count()}")
        print(f"答题记录  {QuizRecord.query.count()}")
        print(f"错题本    {WrongBook.query.count()}")
        print(f"学习记录  {StudySession.query.count()}")
        print(f"学习目标  {StudyGoal.query.count()}")
        print(f"成就      {Achievement.query.count()}（解锁 {Achievement.query.filter_by(unlocked=True).count()}）")
        print(f"AI 洞察   {AiInsight.query.count()}")
        print("\n数据初始化完成 ✔")


if __name__ == "__main__":
    main()
