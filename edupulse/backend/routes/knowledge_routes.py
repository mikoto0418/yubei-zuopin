# =============================================
# 知识点模块：学科 / 知识点树 / 掌握度
# =============================================
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, KnowledgePoint, Quiz, QuizRecord, Subject
from response import ok, fail
from services import knowledge_mastery, mastery_level

bp = Blueprint("knowledge", __name__)


def _uid():
    return int(get_jwt_identity())


@bp.get("/subjects")
@jwt_required()
def list_subjects():
    """学科列表（含知识点数量），供筛选与分组展示。"""
    subs = Subject.query.order_by(Subject.order_index, Subject.id).all()
    return ok([s.to_dict() for s in subs])


@bp.get("/points")
@jwt_required()
def list_points():
    """知识点列表，支持按学科筛选与关键词搜索，分页返回。"""
    subject_id = request.args.get("subject_id", type=int)
    q = (request.args.get("q") or "").strip()
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        size = min(100, max(1, int(request.args.get("size", 20))))
    except ValueError:
        size = 20

    query = KnowledgePoint.query
    if subject_id:
        query = query.filter_by(subject_id=subject_id)
    if q:
        query = query.filter(KnowledgePoint.name.like(f"%{q}%"))

    total = query.count()
    items = (query.order_by(KnowledgePoint.subject_id, KnowledgePoint.order_index, KnowledgePoint.id)
             .offset((page - 1) * size).limit(size).all())

    # 附带每个知识点的题量与个人掌握度
    mastery_map = {m["knowledge_point_id"]: m for m in knowledge_mastery(_uid())}
    data = []
    for kp in items:
        d = kp.to_dict()
        d["quiz_count"] = Quiz.query.filter_by(knowledge_point_id=kp.id).count()
        m = mastery_map.get(kp.id)
        d["mastery"] = m["accuracy"] if m else None
        d["mastery_level"] = m["level"] if m else "未练习"
        d["answered"] = m["total"] if m else 0
        data.append(d)

    return ok({"items": data, "total": total, "page": page, "pageSize": size})


@bp.get("/mastery")
@jwt_required()
def mastery():
    """当前用户的知识点掌握度总览（按学科聚合 + 明细）。"""
    subject_id = request.args.get("subject_id", type=int)
    rows = knowledge_mastery(_uid(), subject_id=subject_id)

    # 按学科汇总
    by_subject = {}
    for r in rows:
        cell = by_subject.setdefault(r["subject_name"] or "综合",
                                     {"subject": r["subject_name"] or "综合",
                                      "color": r["subject_color"], "total": 0, "correct": 0,
                                      "points": 0})
        cell["total"] += r["total"]
        cell["correct"] += r["correct"]
        cell["points"] += 1
    for cell in by_subject.values():
        cell["accuracy"] = round(cell["correct"] / cell["total"] * 100, 1) if cell["total"] else 0.0
        cell["level"] = mastery_level(cell["accuracy"])

    summary = {
        "point_count": len(rows),
        "answered": sum(r["total"] for r in rows),
        "average": round(sum(r["accuracy"] for r in rows) / len(rows), 1) if rows else 0.0,
        "weak_count": sum(1 for r in rows if r["accuracy"] < 60),
    }
    return ok({"summary": summary, "by_subject": sorted(by_subject.values(), key=lambda x: x["subject"]),
               "items": rows})


@bp.get("/points/<int:pid>")
@jwt_required()
def point_detail(pid):
    """知识点详情：基本信息 + 个人掌握度 + 关联题目。"""
    kp = db.session.get(KnowledgePoint, pid)
    if not kp:
        return fail("知识点不存在", http=404)
    uid = _uid()
    m = next((x for x in knowledge_mastery(uid) if x["knowledge_point_id"] == pid), None)
    quizzes = Quiz.query.filter_by(knowledge_point_id=pid).order_by(Quiz.difficulty, Quiz.id).all()
    records = (QuizRecord.query.filter_by(user_id=uid, knowledge_point_id=pid)
               .order_by(QuizRecord.answered_at.desc()).limit(20).all())

    d = kp.to_dict()
    d["mastery"] = m["accuracy"] if m else None
    d["mastery_level"] = m["level"] if m else "未练习"
    d["answered"] = m["total"] if m else 0
    return ok({
        "point": d,
        "quizzes": [q.to_dict(with_answer=False) for q in quizzes],
        "recent_records": [r.to_dict() for r in records],
    })
