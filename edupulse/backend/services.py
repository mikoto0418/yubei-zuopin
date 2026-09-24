# =============================================
# EduPulse 业务服务层
#   知识点掌握度 / 错题本联动 / 目标状态机 / 成就解锁 / AI 洞察
# 所有跨表业务规则集中在此，路由层只做参数校验与序列化。
# =============================================
import logging
from datetime import date, datetime, timedelta

from sqlalchemy import case, func

from models import (
    ACHIEVEMENT_DEFS, ACHIEVEMENT_MAP, GOAL_ACTIVE, GOAL_ACHIEVED, GOAL_EXPIRED,
    WRONG_MASTERED, WRONG_PENDING,
    Achievement, AiInsight, db, KnowledgePoint, Quiz, QuizRecord, StudyGoal,
    StudySession, User, WrongBook,
)

logger = logging.getLogger(__name__)

# 掌握度分档
MASTERY_LEVELS = [
    (85, "已掌握"), (70, "较熟练"), (50, "待巩固"), (0, "薄弱"),
]


def mastery_level(accuracy):
    for threshold, label in MASTERY_LEVELS:
        if accuracy >= threshold:
            return label
    return "薄弱"


# ============================================================
# 知识点掌握度
# ============================================================

def knowledge_mastery(uid, subject_id=None):
    """按知识点聚合掌握度：正确率 = 答对 / 答题总数。

    返回 [{knowledge_point_id, name, subject_name, total, correct, accuracy, level}]
    只包含有答题记录的知识点。
    """
    q = (db.session.query(
            QuizRecord.knowledge_point_id,
            func.count(QuizRecord.id),
            func.sum(case((QuizRecord.is_correct == True, 1), else_=0)),  # noqa: E712
         )
         .filter(QuizRecord.user_id == uid,
                 QuizRecord.knowledge_point_id.isnot(None))
         .group_by(QuizRecord.knowledge_point_id))
    rows = q.all()

    kp_ids = [r[0] for r in rows]
    kps = {}
    if kp_ids:
        for kp in KnowledgePoint.query.filter(KnowledgePoint.id.in_(kp_ids)).all():
            kps[kp.id] = kp

    out = []
    for kp_id, total, correct in rows:
        kp = kps.get(kp_id)
        if not kp:
            continue
        if subject_id and kp.subject_id != subject_id:
            continue
        correct = int(correct or 0)
        acc = round(correct / total * 100, 1) if total else 0.0
        out.append({
            "knowledge_point_id": kp_id,
            "name": kp.name,
            "subject_id": kp.subject_id,
            "subject_name": kp.subject.name if kp.subject else "",
            "subject_color": kp.subject.color if kp.subject else "",
            "difficulty": kp.difficulty,
            "total": total,
            "correct": correct,
            "accuracy": acc,
            "level": mastery_level(acc),
        })
    out.sort(key=lambda x: x["accuracy"])
    return out


def weakest_knowledge_points(uid, limit=3, min_answers=1):
    """薄弱知识点：正确率升序，且至少答过 min_answers 题。"""
    rows = [r for r in knowledge_mastery(uid) if r["total"] >= min_answers]
    return rows[:limit]


# ============================================================
# 错题本联动
# ============================================================

def sync_wrong_book(uid, quiz, chosen_index, is_correct):
    """答题后同步错题本：
       - 答错：入库 / 累计错误次数，状态回到 pending
       - 答对：若已在错题本，累计正确次数并标记已掌握
    """
    entry = WrongBook.query.filter_by(user_id=uid, quiz_id=quiz.id).first()
    if not is_correct:
        if entry:
            entry.wrong_count += 1
            entry.last_answer = chosen_index
            entry.last_wrong_at = datetime.utcnow()
            entry.status = WRONG_PENDING
            entry.mastered_at = None
        else:
            entry = WrongBook(
                user_id=uid, quiz_id=quiz.id,
                knowledge_point_id=quiz.knowledge_point_id,
                wrong_count=1, correct_count=0, status=WRONG_PENDING,
                last_answer=chosen_index, last_wrong_at=datetime.utcnow(),
            )
            db.session.add(entry)
    elif entry:
        entry.correct_count += 1
        entry.status = WRONG_MASTERED
        entry.mastered_at = datetime.utcnow()
    return entry


# ============================================================
# 学习目标状态机
# ============================================================

def goal_window(period, today=None):
    """按周期计算目标起止日期：周 = 本周一至周日；月 = 本月 1 日至月末。"""
    today = today or date.today()
    if period == "month":
        start = today.replace(day=1)
        nxt = (start + timedelta(days=32)).replace(day=1)
        return start, nxt - timedelta(days=1)
    start = today - timedelta(days=today.weekday())
    return start, start + timedelta(days=6)


def compute_goal_progress(goal):
    """实时计算目标进度（时长 / 题量 / 正确率）。"""
    start, end = goal.start_date, goal.end_date
    if goal.metric == "duration":
        q = (db.session.query(func.coalesce(func.sum(StudySession.duration), 0))
             .filter(StudySession.user_id == goal.user_id,
                     StudySession.study_date >= start,
                     StudySession.study_date <= end))
        if goal.subject:
            q = q.filter(StudySession.subject == goal.subject)
        return int(q.scalar() or 0)

    rec_q = (db.session.query(QuizRecord)
             .filter(QuizRecord.user_id == goal.user_id,
                     func.date(QuizRecord.answered_at) >= start.isoformat(),
                     func.date(QuizRecord.answered_at) <= end.isoformat()))
    if goal.subject:
        rec_q = rec_q.join(Quiz, Quiz.id == QuizRecord.quiz_id).filter(Quiz.tag == goal.subject)
    recs = rec_q.all()

    if goal.metric == "quiz_count":
        return len(recs)
    if goal.metric == "accuracy":
        if not recs:
            return 0
        return int(round(sum(1 for r in recs if r.is_correct) / len(recs) * 100))
    return 0


def refresh_goal(goal, commit=True):
    """刷新单个目标进度，达到目标值时自动流转 active → achieved。"""
    goal.progress = compute_goal_progress(goal)
    unlocked = []
    if goal.status == GOAL_ACTIVE and goal.target and goal.progress >= goal.target:
        goal.status = GOAL_ACHIEVED
        goal.achieved_at = datetime.utcnow()
        # 达成目标 → 触发成就重新评估
        unlocked = evaluate_achievements(goal.user_id, commit=False)
    if commit:
        db.session.commit()
    return goal, unlocked


def expire_stale_goals(uid, commit=True):
    """把已过截止日期且未达成的目标标记为 expired（active → expired）。"""
    today = date.today()
    stale = (StudyGoal.query
             .filter(StudyGoal.user_id == uid,
                     StudyGoal.status == GOAL_ACTIVE,
                     StudyGoal.end_date < today)
             .all())
    for g in stale:
        if g.can_transition(GOAL_EXPIRED):
            g.status = GOAL_EXPIRED
    if stale and commit:
        db.session.commit()
    return stale


# ============================================================
# 成就系统
# ============================================================

def _current_streak(uid):
    """连续打卡天数：从今天（或昨天）往前数连续有学习记录的天数。"""
    days = {s.study_date for s in
            StudySession.query.filter_by(user_id=uid).all() if s.study_date}
    if not days:
        return 0
    today = date.today()
    cursor = today if today in days else today - timedelta(days=1)
    if cursor not in days:
        return 0
    n = 0
    while cursor in days:
        n += 1
        cursor -= timedelta(days=1)
    return n


def achievement_metrics(uid):
    """计算成就所需的全部原始指标。"""
    recs = QuizRecord.query.filter_by(user_id=uid).all()
    total = len(recs)
    correct = sum(1 for r in recs if r.is_correct)
    accuracy = round(correct / total * 100, 1) if total else 0.0
    duration = int(db.session.query(func.coalesce(func.sum(StudySession.duration), 0))
                   .filter(StudySession.user_id == uid).scalar() or 0)
    return {
        "streak": _current_streak(uid),
        "quiz_total": total,
        "accuracy": accuracy,
        "duration": duration,
    }


def evaluate_achievements(uid, commit=True):
    """按指标重新评估全部成就，返回本次新解锁的成就列表（幂等）。"""
    m = achievement_metrics(uid)
    existing = {a.code: a for a in Achievement.query.filter_by(user_id=uid).all()}
    newly = []

    for d in ACHIEVEMENT_DEFS:
        code = d["code"]
        cat = d["category"]
        if cat == "streak":
            prog = m["streak"]
        elif cat == "volume":
            prog = m["quiz_total"]
        elif cat == "duration":
            prog = m["duration"]
        else:  # accuracy：题量不足时进度按比例折半，避免早期误判
            prog = m["accuracy"] if m["quiz_total"] >= 20 else 0

        a = existing.get(code)
        if not a:
            a = Achievement(user_id=uid, code=code, title=d["title"],
                            description=d["description"], icon=d["icon"],
                            category=cat, threshold=d["threshold"], progress=prog)
            db.session.add(a)
            existing[code] = a
        else:
            a.progress = prog
            a.title = d["title"]
            a.description = d["description"]
            a.icon = d["icon"]
            a.threshold = d["threshold"]

        if not a.unlocked and prog >= d["threshold"]:
            # accuracy 类必须满足最低题量，避免 1 题答对就解锁
            if cat == "accuracy" and m["quiz_total"] < 20:
                continue
            a.unlocked = True
            a.unlocked_at = datetime.utcnow()
            newly.append(a)

    if commit:
        db.session.commit()
    return newly


# ============================================================
# AI 洞察
# ============================================================

def build_insight_payload(uid, max_points=3):
    """构造薄弱点分析数据（供 AI 服务生成建议）。"""
    weak = weakest_knowledge_points(uid, limit=max_points)
    m = achievement_metrics(uid)
    return {
        "weak_points": [
            {"knowledge_point_id": w["knowledge_point_id"], "name": w["name"],
             "subject": w["subject_name"], "accuracy": w["accuracy"], "total": w["total"]}
            for w in weak
        ],
        "metrics": m,
    }


def persist_insights(uid, payload, source="local"):
    """把 AI（或本地规则）产出的洞察写入 ai_insights 表。

    payload: {"insights": [{"title","content","suggestion","severity",
                            "knowledge_point_id","subject","kind"}]}
    返回写入的 AiInsight 列表。同知识点未处理的旧洞察会被标记 resolved，避免堆积。
    """
    written = []
    for item in payload.get("insights", []):
        kp_id = item.get("knowledge_point_id")
        if kp_id:
            old = (AiInsight.query
                   .filter_by(user_id=uid, knowledge_point_id=kp_id, status="new")
                   .all())
            for o in old:
                o.status = "resolved"
        ins = AiInsight(
            user_id=uid,
            kind=item.get("kind") or "weak_point",
            title=(item.get("title") or "学习洞察")[:128],
            content=item.get("content") or "",
            suggestion=item.get("suggestion") or "",
            knowledge_point_id=kp_id,
            subject=item.get("subject") or "",
            severity=item.get("severity") or "medium",
            status="new",
            source=source,
        )
        db.session.add(ins)
        written.append(ins)
    db.session.commit()
    return written


def local_insight_payload(uid):
    """本地规则版薄弱点分析（未配置 LLM 时的保底，结构与大模型一致）。"""
    data = build_insight_payload(uid)
    weak = data["weak_points"]
    insights = []
    if not weak:
        insights.append({
            "kind": "advice",
            "title": "先积累一些答题数据",
            "content": "你还没有足够的答题记录，系统暂时无法定位薄弱知识点。",
            "suggestion": "建议先完成 10 道练习题，AI 就能给出针对性的薄弱点分析了。",
            "severity": "low",
            "subject": "",
        })
    else:
        for w in weak:
            acc = w["accuracy"]
            severity = "high" if acc < 50 else ("medium" if acc < 75 else "low")
            insights.append({
                "kind": "weak_point",
                "title": f"{w['name']} 掌握不足（正确率 {acc}%）",
                "content": f"你在「{w['name']}」上答了 {w['total']} 题，正确率 {acc}%，"
                           f"低于熟练掌握水平。该知识点属于{w['subject'] or '综合'}。",
                "suggestion": f"建议先回顾「{w['name']}」的笔记与例题，"
                              f"再针对该知识点做 5 道专项练习，做完立即复盘错因。",
                "severity": severity,
                "knowledge_point_id": w["knowledge_point_id"],
                "subject": w["subject"],
            })
    return {"insights": insights, "source": "local"}
