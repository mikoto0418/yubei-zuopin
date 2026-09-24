# =============================================
# Admin 模块：权限校验 + 数据仪表盘
# =============================================
from collections import defaultdict
from datetime import datetime, timedelta

from flask import Blueprint
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, User, Quiz, QuizRecord, StudySession, Note
from response import ok, fail

bp = Blueprint("admin", __name__)


def _current_user():
    return db.session.get(User, int(get_jwt_identity()))


def admin_required(func=None):
    """admin 权限装饰器：既支持 @admin_required 也支持 @admin_required()"""
    from functools import wraps
    def decorate(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            user = _current_user()
            if not user or user.role != "admin":
                return fail("需要管理员权限", http=403)
            return fn(*args, **kwargs)
        return wrapper
    if func is not None:
        return decorate(func)
    return decorate


@bp.get("/overview")
@admin_required()
def overview():
    """仪表盘核心数据汇总"""
    users = User.query.count()
    notes = Note.query.count()
    quizzes = Quiz.query.count()
    records = QuizRecord.query.count()
    sessions = StudySession.query.count()

    total_duration = sum(s.duration for s in StudySession.query.all())
    correct = QuizRecord.query.filter_by(is_correct=True).count()
    accuracy = round(correct / records * 100, 1) if records else 0.0

    return ok({
        "users": users,
        "notes": notes,
        "quizzes": quizzes,
        "records": records,
        "sessions": sessions,
        "total_duration": total_duration,
        "accuracy": accuracy,
    })


@bp.get("/dashboard")
@admin_required()
def dashboard():
    """仪表盘图表数据：饼图 / 雷达 / 趋势 / 柱状图 / 活跃度"""
    subject_duration = defaultdict(int)
    for s in StudySession.query.all():
        subject_duration[s.subject] += s.duration

    tag_stats = defaultdict(lambda: {"total": 0, "correct": 0})
    for r in QuizRecord.query.all():
        if r.tag:
            tag_stats[r.tag]["total"] += 1
            if r.is_correct:
                tag_stats[r.tag]["correct"] += 1
    mastery = [{"tag": tg, "total": v["total"], "accuracy": round(v["correct"] / v["total"] * 100, 1)}
               for tg, v in tag_stats.items() if v["total"] > 0]

    dates = [(datetime.utcnow().date() - timedelta(days=i)) for i in range(13, -1, -1)]
    day_stats = defaultdict(lambda: {"total": 0, "correct": 0})
    for r in QuizRecord.query.all():
        key = r.answered_at.date()
        day_stats[key]["total"] += 1
        if r.is_correct:
            day_stats[key]["correct"] += 1
    accuracy_trend = []
    for d in dates:
        st = day_stats[d]
        accuracy_trend.append({
            "date": d.isoformat()[5:],
            "total": st["total"],
            "accuracy": round(st["correct"] / st["total"] * 100, 1) if st["total"] else None,
        })

    session_day = defaultdict(int)
    for s in StudySession.query.all():
        session_day[s.study_date] += s.duration
    daily = [{"date": d.isoformat()[5:], "minutes": session_day.get(d, 0)} for d in dates]

    active = []
    for u in User.query.all():
        rcount = QuizRecord.query.filter_by(user_id=u.id).count()
        duration = sum(s.duration for s in StudySession.query.filter_by(user_id=u.id).all())
        if rcount > 0 or duration > 0:
            active.append({"username": u.username, "nickname": u.nickname,
                           "records": rcount, "duration": duration, "role": u.role})
    active.sort(key=lambda x: -x["records"])

    return ok({
        "subject_duration": [{"name": k, "value": v} for k, v in subject_duration.items()],
        "mastery": mastery,
        "accuracy_trend": accuracy_trend,
        "daily_duration": daily,
        "active_users": active,
    })


@bp.get("/users")
@admin_required()
def users():
    us = User.query.order_by(User.created_at.desc()).all()
    data = []
    for u in us:
        rec = QuizRecord.query.filter_by(user_id=u.id).count()
        dur = sum(s.duration for s in StudySession.query.filter_by(user_id=u.id).all())
        d = u.to_dict()
        d["records"] = rec
        d["duration"] = dur
        data.append(d)
    return ok(data)


@bp.get("/quizzes")
@admin_required()
def quizzes():
    qs = Quiz.query.order_by(Quiz.id).all()
    return ok([q.to_dict() for q in qs])