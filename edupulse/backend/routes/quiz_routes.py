# =============================================
# 题库模块：抽题 / 作答 / 记录 / 错题本联动 / 分页
# =============================================
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, KnowledgePoint, Quiz, QuizRecord, Subject, WrongBook
from response import ok, fail
from services import evaluate_achievements, sync_wrong_book

bp = Blueprint("quizzes", __name__)


def _uid():
    return int(get_jwt_identity())


def _parse_page(default_size=10):
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        size = min(100, max(1, int(request.args.get("size", default_size))))
    except ValueError:
        size = default_size
    return page, size


@bp.get("")
@jwt_required()
def list_quizzes():
    """题库列表：支持学科/知识点/关键词筛选，分页返回（含答案，供题库页展示）。"""
    page, size = _parse_page(20)
    subject_id = request.args.get("subject_id", type=int)
    kp_id = request.args.get("knowledge_point_id", type=int)
    q = (request.args.get("q") or "").strip()

    query = Quiz.query
    if subject_id:
        query = query.filter_by(subject_id=subject_id)
    if kp_id:
        query = query.filter_by(knowledge_point_id=kp_id)
    if q:
        query = query.filter(Quiz.question.like(f"%{q}%"))

    total = query.count()
    items = query.order_by(Quiz.id).offset((page - 1) * size).limit(size).all()
    return ok({"items": [x.to_dict() for x in items], "total": total,
               "page": page, "pageSize": size})


@bp.get("/tags")
@jwt_required()
def list_tags():
    """全部知识点标签（兼容旧前端），返回知识点名列表。"""
    tags = [t[0] for t in db.session.query(Quiz.tag).distinct().all() if t[0]]
    return ok({"tags": sorted(tags)})


@bp.get("/practice")
@jwt_required()
def practice_paper():
    """按知识点/学科抽题，返回不含答案的一组题。"""
    tag = (request.args.get("tag") or "").strip()
    kp_id = request.args.get("knowledge_point_id", type=int)
    subject_id = request.args.get("subject_id", type=int)
    try:
        qty = int(request.args.get("count", "5"))
    except ValueError:
        qty = 5
    qty = max(1, min(qty, 20))

    query = Quiz.query
    if kp_id:
        query = query.filter_by(knowledge_point_id=kp_id)
    elif tag:
        query = query.filter_by(tag=tag)
    if subject_id:
        query = query.filter_by(subject_id=subject_id)

    pool = query.all()
    if not pool:
        return fail("该知识点暂无题目", http=404)
    import random
    picked = random.sample(pool, min(qty, len(pool)))
    return ok([q.to_dict(with_answer=False) for q in picked])


@bp.post("/<int:qid>/answer")
@jwt_required()
def answer_quiz(qid):
    """作答：判定对错 → 写答题记录 → 联动错题本 → 重算成就。"""
    uid = _uid()
    quiz = db.session.get(Quiz, qid)
    if not quiz:
        return fail("题目不存在", http=404)

    data = request.get_json(silent=True) or {}
    if data.get("answer") is None:
        return fail("请提交答案")
    try:
        chosen = int(data["answer"])
    except (TypeError, ValueError):
        return fail("答案格式不正确")
    n_opts = len(quiz.option_texts())
    if chosen < 0 or chosen >= n_opts:
        return fail("答案选项超出范围")

    correct = (chosen == quiz.answer)
    db.session.add(QuizRecord(
        user_id=uid, quiz_id=qid, tag=quiz.tag,
        knowledge_point_id=quiz.knowledge_point_id,
        is_correct=correct, answer=chosen))
    wrong = sync_wrong_book(uid, quiz, chosen, correct)
    unlocked = evaluate_achievements(uid, commit=False)
    db.session.commit()

    return ok({
        "correct": correct,
        "correct_answer": quiz.answer,
        "answer_text": (quiz.option_texts() or [""])[quiz.answer],
        "analysis": quiz.analysis,
        "knowledge_point_id": quiz.knowledge_point_id,
        "knowledge_point_name": quiz.knowledge_point.name if quiz.knowledge_point else "",
        "wrong_status": wrong.status if wrong else None,
        "unlocked": [a.to_dict() for a in unlocked],
    }, message="作答已记录")


@bp.get("/records")
@jwt_required()
def my_records():
    """我的答题记录：支持筛选与分页；不传分页参数时保持兼容（返回最近 500 条）。"""
    uid = _uid()
    want_page = "page" in request.args or "size" in request.args
    query = QuizRecord.query.filter_by(user_id=uid)
    if request.args.get("is_correct") in ("true", "false"):
        query = query.filter_by(is_correct=request.args["is_correct"] == "true")
    kp_id = request.args.get("knowledge_point_id", type=int)
    if kp_id:
        query = query.filter_by(knowledge_point_id=kp_id)

    if not want_page:
        rows = query.order_by(QuizRecord.answered_at.desc()).limit(500).all()
        return ok([r.to_dict() for r in rows])

    page, size = _parse_page()
    total = query.count()
    rows = (query.order_by(QuizRecord.answered_at.desc())
            .offset((page - 1) * size).limit(size).all())
    return ok({"items": [r.to_dict() for r in rows], "total": total,
               "page": page, "pageSize": size})


@bp.get("/wrong")
@jwt_required()
def wrong_questions():
    """错题回顾（兼容旧接口）：返回答错过的完整题目。"""
    uid = _uid()
    rows = (db.session.query(QuizRecord, Quiz)
            .join(Quiz, Quiz.id == QuizRecord.quiz_id)
            .filter(QuizRecord.user_id == uid, QuizRecord.is_correct == False)  # noqa: E712
            .all())
    return ok([{"record": r.to_dict(), "quiz": q.to_dict()} for r, q in rows])


@bp.get("/my-summary")
@jwt_required()
def my_summary():
    """个人答题汇总：总题量 / 正确数 / 按知识点掌握度 / 错题本计数。"""
    uid = _uid()
    records = QuizRecord.query.filter_by(user_id=uid).all()
    total = len(records)
    correct = sum(1 for r in records if r.is_correct)

    by_tag = {}
    for r in records:
        t = r.tag or "未分类"
        cell = by_tag.setdefault(t, {"total": 0, "correct": 0, "kp_id": r.knowledge_point_id})
        cell["total"] += 1
        if r.is_correct:
            cell["correct"] += 1
    mastery = [{"tag": t, "total": v["total"], "knowledge_point_id": v["kp_id"],
                "accuracy": round(v["correct"] / v["total"] * 100, 1)}
               for t, v in by_tag.items()]
    mastery.sort(key=lambda x: x["accuracy"])

    return ok({
        "total": total,
        "correct": correct,
        "accuracy": round(correct / total * 100, 1) if total else 0.0,
        "mastery": mastery,
        "wrong_pending": WrongBook.query.filter_by(user_id=uid, status="pending").count(),
        "wrong_mastered": WrongBook.query.filter_by(user_id=uid, status="mastered").count(),
    })


@bp.get("/meta")
@jwt_required()
def meta():
    """题库元数据：学科 + 知识点，供前端筛选器使用。"""
    subjects = Subject.query.order_by(Subject.order_index, Subject.id).all()
    points = KnowledgePoint.query.order_by(KnowledgePoint.subject_id,
                                           KnowledgePoint.order_index).all()
    return ok({
        "subjects": [s.to_dict() for s in subjects],
        "knowledge_points": [k.to_dict() for k in points],
    })
