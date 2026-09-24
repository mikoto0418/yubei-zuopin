# =============================================
# EduPulse 数据模型（12 张表）
#   users            用户
#   subjects         学科
#   knowledge_points 知识点（挂学科）
#   notes            笔记
#   quizzes          题目（挂知识点 + 学科）
#   quiz_options     选项（结构化，替代 JSON 字符串）
#   quiz_records     答题记录
#   wrong_book       错题本
#   study_sessions   学习记录
#   study_goals      学习目标（状态机）
#   achievements     成就
#   ai_insights      AI 洞察（落库，驱动首页与练习入口）
# =============================================
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()

# ============================================================
# 状态机常量
# ============================================================

# 学习目标：active → achieved / expired；后两者为终态，不可再流转
GOAL_ACTIVE, GOAL_ACHIEVED, GOAL_EXPIRED = "active", "achieved", "expired"
GOAL_STATUSES = (GOAL_ACTIVE, GOAL_ACHIEVED, GOAL_EXPIRED)
GOAL_TRANSITIONS = {
    GOAL_ACTIVE: (GOAL_ACHIEVED, GOAL_EXPIRED),
    GOAL_ACHIEVED: (),
    GOAL_EXPIRED: (),
}
GOAL_PERIODS = ("week", "month")
GOAL_METRICS = ("duration", "quiz_count", "accuracy")

# 错题本：pending → mastered
WRONG_PENDING, WRONG_MASTERED = "pending", "mastered"
WRONG_STATUSES = (WRONG_PENDING, WRONG_MASTERED)

# AI 洞察
INSIGHT_KINDS = ("weak_point", "advice", "trend")
INSIGHT_STATUSES = ("new", "read", "resolved")
INSIGHT_SEVERITIES = ("low", "medium", "high")

# 成就定义表：12 枚徽章，规则由 services.evaluate_achievements 执行
ACHIEVEMENT_DEFS = [
    {"code": "streak_3", "title": "三日不辍", "description": "连续学习打卡 3 天",
     "icon": "🔥", "category": "streak", "threshold": 3},
    {"code": "streak_7", "title": "一周坚持", "description": "连续学习打卡 7 天",
     "icon": "📅", "category": "streak", "threshold": 7},
    {"code": "streak_14", "title": "半月恒心", "description": "连续学习打卡 14 天",
     "icon": "🏔️", "category": "streak", "threshold": 14},
    {"code": "quiz_10", "title": "初露锋芒", "description": "累计答题 10 道",
     "icon": "✏️", "category": "volume", "threshold": 10},
    {"code": "quiz_50", "title": "题海初探", "description": "累计答题 50 道",
     "icon": "📚", "category": "volume", "threshold": 50},
    {"code": "quiz_100", "title": "百题斩", "description": "累计答题 100 道",
     "icon": "⚔️", "category": "volume", "threshold": 100},
    {"code": "quiz_200", "title": "题霸", "description": "累计答题 200 道",
     "icon": "👑", "category": "volume", "threshold": 200},
    {"code": "accuracy_60", "title": "稳步提升", "description": "正确率达到 60%（至少 20 题）",
     "icon": "📈", "category": "accuracy", "threshold": 60},
    {"code": "accuracy_75", "title": "精准作答", "description": "正确率达到 75%（至少 30 题）",
     "icon": "🎯", "category": "accuracy", "threshold": 75},
    {"code": "accuracy_90", "title": "近乎完美", "description": "正确率达到 90%（至少 50 题）",
     "icon": "💎", "category": "accuracy", "threshold": 90},
    {"code": "duration_300", "title": "五小时", "description": "累计学习时长达到 300 分钟",
     "icon": "⏱️", "category": "duration", "threshold": 300},
    {"code": "duration_1000", "title": "千分钟", "description": "累计学习时长达到 1000 分钟",
     "icon": "🕰️", "category": "duration", "threshold": 1000},
]

ACHIEVEMENT_MAP = {d["code"]: d for d in ACHIEVEMENT_DEFS}


def _iso(dt):
    return dt.isoformat(sep=" ") if dt else ""


# ============================================================
# 1. 用户
# ============================================================

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(16), nullable=False, default="user")  # user / admin
    nickname = db.Column(db.String(64), nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, raw):
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw):
        return check_password_hash(self.password_hash, raw)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "nickname": self.nickname,
            "created_at": _iso(self.created_at),
        }


# ============================================================
# 2. 学科
# ============================================================

class Subject(db.Model):
    __tablename__ = "subjects"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(32), unique=True, nullable=False, index=True)
    code = db.Column(db.String(32), nullable=False, default="")
    color = db.Column(db.String(16), nullable=False, default="#007AFF")
    description = db.Column(db.String(256), nullable=False, default="")
    order_index = db.Column(db.Integer, nullable=False, default=0)

    knowledge_points = db.relationship(
        "KnowledgePoint", backref="subject", lazy="select",
        cascade="all, delete-orphan", order_by="KnowledgePoint.order_index")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "code": self.code,
            "color": self.color,
            "description": self.description,
            "order_index": self.order_index,
            "knowledge_count": len(self.knowledge_points),
        }


# ============================================================
# 3. 知识点
# ============================================================

class KnowledgePoint(db.Model):
    __tablename__ = "knowledge_points"

    id = db.Column(db.Integer, primary_key=True)
    subject_id = db.Column(db.Integer, db.ForeignKey("subjects.id"), nullable=False, index=True)
    name = db.Column(db.String(64), nullable=False, index=True)
    code = db.Column(db.String(64), nullable=False, default="")
    description = db.Column(db.String(256), nullable=False, default="")
    difficulty = db.Column(db.Integer, nullable=False, default=2)  # 1 易 2 中 3 难
    order_index = db.Column(db.Integer, nullable=False, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "subject_id": self.subject_id,
            "subject_name": self.subject.name if self.subject else "",
            "subject_color": self.subject.color if self.subject else "",
            "name": self.name,
            "code": self.code,
            "description": self.description,
            "difficulty": self.difficulty,
            "order_index": self.order_index,
        }


# ============================================================
# 4. 笔记
# ============================================================

class Note(db.Model):
    __tablename__ = "notes"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(128), nullable=False)
    content = db.Column(db.Text, nullable=False, default="")
    subject = db.Column(db.String(64), nullable=False, default="")
    mistake = db.Column(db.Text, nullable=False, default="")
    summary = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "content": self.content,
            "subject": self.subject,
            "mistake": self.mistake,
            "summary": self.summary,
            "created_at": _iso(self.created_at),
        }


# ============================================================
# 5. 题目
# ============================================================

class Quiz(db.Model):
    __tablename__ = "quizzes"

    id = db.Column(db.Integer, primary_key=True)
    question = db.Column(db.Text, nullable=False)
    options = db.Column(db.Text, nullable=False)   # JSON 冗余存储，兼容旧数据
    answer = db.Column(db.Integer, nullable=False)  # 正确选项下标
    analysis = db.Column(db.Text, nullable=False, default="")
    tag = db.Column(db.String(64), nullable=False, default="")
    difficulty = db.Column(db.Integer, nullable=False, default=1)

    subject_id = db.Column(db.Integer, db.ForeignKey("subjects.id"), nullable=True, index=True)
    knowledge_point_id = db.Column(db.Integer, db.ForeignKey("knowledge_points.id"),
                                   nullable=True, index=True)

    subject = db.relationship("Subject", lazy="select")
    knowledge_point = db.relationship("KnowledgePoint", lazy="select")
    option_rows = db.relationship(
        "QuizOption", backref="quiz", lazy="select",
        cascade="all, delete-orphan", order_by="QuizOption.idx")

    # ---- 选项：优先读结构化 quiz_options 表，回退到 JSON 列 ----
    def option_texts(self):
        if self.option_rows:
            return [o.content for o in self.option_rows]
        import json
        try:
            return json.loads(self.options)
        except Exception:
            return []

    def to_dict(self, with_answer=True):
        data = {
            "id": self.id,
            "question": self.question,
            "options": self.option_texts(),
            "tag": self.tag,
            "difficulty": self.difficulty,
            "analysis": self.analysis,
            "subject_id": self.subject_id,
            "subject_name": self.subject.name if self.subject else "",
            "knowledge_point_id": self.knowledge_point_id,
            "knowledge_point_name": self.knowledge_point.name if self.knowledge_point else "",
        }
        if with_answer:
            data["answer"] = self.answer
        return data


# ============================================================
# 6. 题目选项
# ============================================================

class QuizOption(db.Model):
    __tablename__ = "quiz_options"
    __table_args__ = (db.UniqueConstraint("quiz_id", "idx", name="uq_quiz_option_idx"),)

    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey("quizzes.id"), nullable=False, index=True)
    idx = db.Column(db.Integer, nullable=False)          # 选项下标 0..n
    content = db.Column(db.Text, nullable=False)
    is_correct = db.Column(db.Boolean, nullable=False, default=False)

    def to_dict(self):
        return {"id": self.id, "quiz_id": self.quiz_id, "idx": self.idx,
                "content": self.content, "is_correct": self.is_correct}


def sync_quiz_options(quiz, texts, answer_index):
    """把题目的选项写入 quiz_options（结构化），保持与 JSON 列一致。"""
    import json
    quiz.options = json.dumps(texts, ensure_ascii=False)
    quiz.answer = answer_index
    quiz.option_rows = [
        QuizOption(idx=i, content=t, is_correct=(i == answer_index))
        for i, t in enumerate(texts)
    ]


# ============================================================
# 7. 答题记录
# ============================================================

class QuizRecord(db.Model):
    __tablename__ = "quiz_records"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey("quizzes.id"), nullable=False, index=True)
    tag = db.Column(db.String(64), nullable=False, default="")
    knowledge_point_id = db.Column(db.Integer, db.ForeignKey("knowledge_points.id"),
                                   nullable=True, index=True)
    is_correct = db.Column(db.Boolean, nullable=False)
    answer = db.Column(db.Integer, nullable=False)
    answered_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    quiz = db.relationship("Quiz", lazy="select")
    knowledge_point = db.relationship("KnowledgePoint", lazy="select")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "quiz_id": self.quiz_id,
            "tag": self.tag,
            "knowledge_point_id": self.knowledge_point_id,
            "knowledge_point_name": self.knowledge_point.name if self.knowledge_point else "",
            "is_correct": self.is_correct,
            "answer": self.answer,
            "answered_at": _iso(self.answered_at),
        }


# ============================================================
# 8. 错题本
# ============================================================

class WrongBook(db.Model):
    __tablename__ = "wrong_book"
    __table_args__ = (db.UniqueConstraint("user_id", "quiz_id", name="uq_wrong_user_quiz"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey("quizzes.id"), nullable=False, index=True)
    knowledge_point_id = db.Column(db.Integer, db.ForeignKey("knowledge_points.id"),
                                   nullable=True, index=True)
    wrong_count = db.Column(db.Integer, nullable=False, default=1)
    correct_count = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(16), nullable=False, default=WRONG_PENDING, index=True)
    last_answer = db.Column(db.Integer, nullable=True)
    last_wrong_at = db.Column(db.DateTime, default=datetime.utcnow)
    mastered_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    quiz = db.relationship("Quiz", lazy="select")
    knowledge_point = db.relationship("KnowledgePoint", lazy="select")

    def to_dict(self):
        q = self.quiz
        return {
            "id": self.id,
            "user_id": self.user_id,
            "quiz_id": self.quiz_id,
            "knowledge_point_id": self.knowledge_point_id,
            "knowledge_point_name": self.knowledge_point.name if self.knowledge_point else "",
            "subject_name": (q.subject.name if q and q.subject else ""),
            "question": q.question if q else "",
            "options": q.option_texts() if q else [],
            "correct_answer": q.answer if q else None,
            "analysis": q.analysis if q else "",
            "tag": q.tag if q else "",
            "difficulty": q.difficulty if q else 1,
            "wrong_count": self.wrong_count,
            "correct_count": self.correct_count,
            "status": self.status,
            "last_answer": self.last_answer,
            "last_wrong_at": _iso(self.last_wrong_at),
            "mastered_at": _iso(self.mastered_at),
        }


# ============================================================
# 9. 学习记录
# ============================================================

class StudySession(db.Model):
    __tablename__ = "study_sessions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    subject = db.Column(db.String(64), nullable=False, default="")
    duration = db.Column(db.Integer, nullable=False, default=0)  # 分钟
    note = db.Column(db.String(256), nullable=False, default="")
    study_date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "subject": self.subject,
            "duration": self.duration,
            "note": self.note,
            "study_date": self.study_date.isoformat() if self.study_date else "",
        }


# ============================================================
# 10. 学习目标（状态机）
# ============================================================

class StudyGoal(db.Model):
    __tablename__ = "study_goals"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    title = db.Column(db.String(128), nullable=False)
    period = db.Column(db.String(16), nullable=False, default="week")   # week / month
    metric = db.Column(db.String(16), nullable=False, default="duration")  # duration/quiz_count/accuracy
    target = db.Column(db.Integer, nullable=False, default=100)
    progress = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(16), nullable=False, default=GOAL_ACTIVE, index=True)
    subject = db.Column(db.String(64), nullable=False, default="")
    start_date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)
    end_date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    achieved_at = db.Column(db.DateTime, nullable=True)

    def can_transition(self, to_status):
        return to_status in GOAL_TRANSITIONS.get(self.status, ())

    def percent(self):
        if not self.target:
            return 0
        return min(100, round(self.progress / self.target * 100))

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "period": self.period,
            "metric": self.metric,
            "metric_label": METRIC_LABELS.get(self.metric, self.metric),
            "target": self.target,
            "progress": self.progress,
            "percent": self.percent(),
            "status": self.status,
            "subject": self.subject,
            "start_date": self.start_date.isoformat() if self.start_date else "",
            "end_date": self.end_date.isoformat() if self.end_date else "",
            "achieved_at": _iso(self.achieved_at),
            "created_at": _iso(self.created_at),
        }


METRIC_LABELS = {
    "duration": "学习时长(分钟)",
    "quiz_count": "答题数量(道)",
    "accuracy": "正确率(%)",
}


# ============================================================
# 11. 成就
# ============================================================

class Achievement(db.Model):
    __tablename__ = "achievements"
    __table_args__ = (db.UniqueConstraint("user_id", "code", name="uq_achv_user_code"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    code = db.Column(db.String(32), nullable=False, index=True)
    title = db.Column(db.String(64), nullable=False)
    description = db.Column(db.String(200), nullable=False, default="")
    icon = db.Column(db.String(16), nullable=False, default="🏅")
    category = db.Column(db.String(16), nullable=False, default="volume")
    threshold = db.Column(db.Integer, nullable=False, default=0)
    progress = db.Column(db.Integer, nullable=False, default=0)
    unlocked = db.Column(db.Boolean, nullable=False, default=False, index=True)
    unlocked_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        pct = 0 if not self.threshold else min(100, round(self.progress / self.threshold * 100))
        return {
            "id": self.id,
            "code": self.code,
            "title": self.title,
            "description": self.description,
            "icon": self.icon,
            "category": self.category,
            "threshold": self.threshold,
            "progress": self.progress,
            "percent": 100 if self.unlocked else pct,
            "unlocked": self.unlocked,
            "unlocked_at": _iso(self.unlocked_at),
        }


# ============================================================
# 12. AI 洞察（AI 结果落库 → 驱动首页与练习入口）
# ============================================================

class AiInsight(db.Model):
    __tablename__ = "ai_insights"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    kind = db.Column(db.String(16), nullable=False, default="weak_point", index=True)
    title = db.Column(db.String(128), nullable=False)
    content = db.Column(db.Text, nullable=False, default="")
    suggestion = db.Column(db.Text, nullable=False, default="")
    knowledge_point_id = db.Column(db.Integer, db.ForeignKey("knowledge_points.id"),
                                   nullable=True, index=True)
    subject = db.Column(db.String(64), nullable=False, default="")
    severity = db.Column(db.String(16), nullable=False, default="medium")
    status = db.Column(db.String(16), nullable=False, default="new", index=True)
    source = db.Column(db.String(16), nullable=False, default="local")  # llm / local
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    knowledge_point = db.relationship("KnowledgePoint", lazy="select")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "kind": self.kind,
            "title": self.title,
            "content": self.content,
            "suggestion": self.suggestion,
            "knowledge_point_id": self.knowledge_point_id,
            "knowledge_point_name": self.knowledge_point.name if self.knowledge_point else "",
            "subject": self.subject,
            "severity": self.severity,
            "status": self.status,
            "source": self.source,
            "created_at": _iso(self.created_at),
        }
