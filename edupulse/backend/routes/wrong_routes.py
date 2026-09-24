# =============================================
# 错题本模块：列表 / 标记已掌握 / 重做 / 移除
# =============================================
from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import WRONG_MASTERED, WRONG_PENDING, db, Quiz, QuizRecord, WrongBook
from response import ok, fail
from services import sync_wrong_book

bp = Blueprint("wrong", __name__)


def _uid():
    return int(get_jwt_identity())


@bp.get("")
@jwt_required()
def list_wrong():
    """错题本列表：支持状态筛选、知识点筛选、关键词搜索、分页。"""
    uid = _uid()
    status = (request.args.get("status") or "").strip()
    kp_id = request.args.get("knowledge_point_id", type=int)
    q = (request.args.get("q") or "").strip()
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        size = min(100, max(1, int(request.args.get("size", 10))))
    except ValueError:
        size = 10

    query = WrongBook.query.filter_by(user_id=uid)
    if status in (WRONG_PENDING, WRONG_MASTERED):
        query = query.filter_by(status=status)
    if kp_id:
        query = query.filter_by(knowledge_point_id=kp_id)
    if q:
        query = query.join(Quiz, Quiz.id == WrongBook.quiz_id).filter(Quiz.question.like(f"%{q}%"))

    total = query.count()
    items = (query.order_by(WrongBook.status.asc(), WrongBook.last_wrong_at.desc())
             .offset((page - 1) * size).limit(size).all())

    pending = WrongBook.query.filter_by(user_id=uid, status=WRONG_PENDING).count()
    mastered = WrongBook.query.filter_by(user_id=uid, status=WRONG_MASTERED).count()
    return ok({
        "items": [w.to_dict() for w in items],
        "total": total, "page": page, "pageSize": size,
        "pending": pending, "mastered": mastered,
    })


@bp.get("/<int:wid>")
@jwt_required()
def get_wrong(wid):
    uid = _uid()
    w = db.session.get(WrongBook, wid)
    if not w or w.user_id != uid:
        return fail("错题不存在", http=404)
    return ok(w.to_dict())


@bp.post("/<int:wid>/master")
@jwt_required()
def mark_mastered(wid):
    """标记为已掌握（pending → mastered）。已是 mastered 则幂等返回。"""
    uid = _uid()
    w = db.session.get(WrongBook, wid)
    if not w or w.user_id != uid:
        return fail("错题不存在", http=404)
    if w.status == WRONG_MASTERED:
        return ok(w.to_dict(), message="该题已是掌握状态")
    w.status = WRONG_MASTERED
    w.mastered_at = datetime.utcnow()
    db.session.commit()
    return ok(w.to_dict(), message="已标记为掌握")


@bp.post("/<int:wid>/redo")
@jwt_required()
def redo(wid):
    """重做错题：提交新答案，答对自动标记已掌握，答错累计错误次数。"""
    uid = _uid()
    w = db.session.get(WrongBook, wid)
    if not w or w.user_id != uid:
        return fail("错题不存在", http=404)
    quiz = db.session.get(Quiz, w.quiz_id)
    if not quiz:
        return fail("题目已被删除", http=404)

    data = request.get_json(silent=True) or {}
    if data.get("answer") is None:
        return fail("请提交答案")
    try:
        chosen = int(data["answer"])
    except (TypeError, ValueError):
        return fail("答案格式不正确")
    if chosen < 0 or chosen >= len(quiz.option_texts()):
        return fail("答案选项超出范围")

    is_correct = (chosen == quiz.answer)
    # 写入一条正式答题记录，保证统计口径一致
    db.session.add(QuizRecord(
        user_id=uid, quiz_id=quiz.id, tag=quiz.tag,
        knowledge_point_id=quiz.knowledge_point_id,
        is_correct=is_correct, answer=chosen))
    sync_wrong_book(uid, quiz, chosen, is_correct)
    db.session.commit()
    db.session.refresh(w)

    return ok({
        "correct": is_correct,
        "correct_answer": quiz.answer,
        "answer_text": (quiz.option_texts() or [""])[quiz.answer],
        "analysis": quiz.analysis,
        "wrong": w.to_dict(),
    }, message="重做已记录")


@bp.delete("/<int:wid>")
@jwt_required()
def remove_wrong(wid):
    """从错题本移除（不影响历史答题记录）。"""
    uid = _uid()
    w = db.session.get(WrongBook, wid)
    if not w or w.user_id != uid:
        return fail("错题不存在", http=404)
    db.session.delete(w)
    db.session.commit()
    return ok(message="已从错题本移除")
