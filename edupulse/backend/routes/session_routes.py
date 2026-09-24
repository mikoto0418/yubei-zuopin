# =============================================
# 学习记录模块：录入 / 查询 / 汇总 / 筛选分页
# =============================================
from datetime import date, datetime
from collections import defaultdict

from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, StudySession
from response import ok, fail
from services import evaluate_achievements

bp = Blueprint("sessions", __name__)


def _uid():
    return int(get_jwt_identity())


def _parse_page():
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        size = min(100, max(1, int(request.args.get("size", 10))))
    except ValueError:
        size = 10
    return page, size


@bp.get("")
@jwt_required()
def list_sessions():
    uid = _uid()
    subject = (request.args.get("subject") or "").strip()
    from_date = (request.args.get("from") or "").strip() or None
    to_date = (request.args.get("to") or "").strip() or None
    page, size = _parse_page()

    query = StudySession.query.filter_by(user_id=uid)
    if subject:
        query = query.filter_by(subject=subject)
    if from_date:
        try:
            query = query.filter(StudySession.study_date >= datetime.strptime(from_date, "%Y-%m-%d").date())
        except ValueError:
            return fail("起始日期格式应为 YYYY-MM-DD")
    if to_date:
        try:
            query = query.filter(StudySession.study_date <= datetime.strptime(to_date, "%Y-%m-%d").date())
        except ValueError:
            return fail("结束日期格式应为 YYYY-MM-DD")

    total = query.count()
    items = (query.order_by(StudySession.study_date.desc(), StudySession.id.desc())
             .offset((page - 1) * size).limit(size).all())
    return ok({
        "items": [s.to_dict() for s in items],
        "total": total,
        "page": page,
        "pageSize": size,
    })


@bp.post("")
@jwt_required()
def add_session():
    uid = _uid()
    data = request.get_json(silent=True) or {}
    subject = (data.get("subject") or "").strip()
    try:
        duration = int(data.get("duration", 0))
    except (TypeError, ValueError):
        return fail("学习时长必须是数字")
    if not subject:
        return fail("请填写科目")
    if duration < 1 or duration > 1440:
        return fail("学习时长需在 1-1440 分钟之间")

    d = data.get("study_date") or date.today().isoformat()
    try:
        study_date = datetime.strptime(d, "%Y-%m-%d").date()
    except ValueError:
        return fail("日期格式应为 YYYY-MM-DD")

    item = StudySession(user_id=uid, subject=subject, duration=duration,
                        note=(data.get("note") or "").strip(), study_date=study_date)
    db.session.add(item)
    # 录入学习记录后重算成就（连续打卡 / 时长里程碑）
    unlocked = evaluate_achievements(uid, commit=False)
    db.session.commit()
    return ok({"session": item.to_dict(),
               "unlocked": [a.to_dict() for a in unlocked]},
              message="录入成功", status=201)


@bp.delete("/<int:sid>")
@jwt_required()
def delete_session(sid):
    uid = _uid()
    item = db.session.get(StudySession, sid)
    if not item or item.user_id != uid:
        return fail("记录不存在", http=404)
    db.session.delete(item)
    db.session.commit()
    return ok(message="删除成功")


@bp.get("/summary")
@jwt_required()
def summary():
    """个人学习汇总：总时长、各科时长、每日时长、连续打卡天数"""
    uid = _uid()
    items = StudySession.query.filter_by(user_id=uid).all()
    total = sum(s.duration for s in items)
    by_subject = defaultdict(int)
    for s in items:
        by_subject[s.subject] += s.duration
    by_day = defaultdict(int)
    for s in items:
        by_day[str(s.study_date)] += s.duration

    from services import _current_streak
    return ok({
        "total_duration": total,
        "subject_duration": [{"subject": k, "minutes": v} for k, v in by_subject.items()],
        "daily_duration": [{"date": k, "minutes": v} for k, v in sorted(by_day.items())],
        "days": len(set(str(s.study_date) for s in items)),
        "streak": _current_streak(uid),
    })
