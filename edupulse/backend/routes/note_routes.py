# =============================================
# 笔记模块：增删改查 + AI 知识梳理 + 搜索/筛选/分页
# =============================================
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, Note
from ai_service import summarize_note
from response import ok, fail

bp = Blueprint("notes", __name__)


def _current_user_id():
    return int(get_jwt_identity())


def _parse_page():
    """解析分页参数，返回 (page, size)；越界自动收拢到 [1,100]。"""
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
def list_notes():
    uid = _current_user_id()
    q = request.args.get("q", "").strip()
    subject = request.args.get("subject", "").strip()
    page, size = _parse_page()

    query = Note.query.filter_by(user_id=uid)
    if q:
        like = f"%{q}%"
        query = query.filter(db.or_(Note.title.like(like), Note.content.like(like)))
    if subject:
        query = query.filter_by(subject=subject)

    total = query.count()
    items = (query.order_by(Note.created_at.desc())
             .offset((page - 1) * size).limit(size).all())
    return ok({
        "items": [n.to_dict() for n in items],
        "total": total,
        "page": page,
        "pageSize": size,
    })


@bp.get("/subjects")
@jwt_required()
def list_subjects():
    """当前用户笔记涉及的全部科目（用于前端筛选下拉）。"""
    uid = _current_user_id()
    subs = [r[0] for r in db.session.query(Note.subject).filter_by(user_id=uid)
            .distinct().all() if r[0]]
    return ok(sorted(subs))


@bp.post("")
@jwt_required()
def create_note():
    uid = _current_user_id()
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title:
        return fail("请填写标题")
    if len(title) > 128:
        return fail("标题不能超过 128 字")
    if not content:
        return fail("请填写笔记正文")
    note = Note(
        user_id=uid,
        title=title,
        content=content,
        subject=(data.get("subject") or "").strip(),
        mistake=(data.get("mistake") or "").strip(),
        summary=(data.get("summary") or "").strip(),
    )
    db.session.add(note)
    db.session.commit()
    return ok(note.to_dict(), message="保存成功", status=201)


@bp.get("/<int:nid>")
@jwt_required()
def get_note(nid):
    uid = _current_user_id()
    note = db.session.get(Note, nid)
    if not note or note.user_id != uid:
        return fail("笔记不存在", http=404)
    return ok(note.to_dict())


@bp.put("/<int:nid>")
@jwt_required()
def update_note(nid):
    uid = _current_user_id()
    note = db.session.get(Note, nid)
    if not note or note.user_id != uid:
        return fail("笔记不存在", http=404)
    data = request.get_json(silent=True) or {}
    if "title" in data and (data.get("title") or "").strip():
        note.title = (data["title"] or "").strip()
    elif "title" in data:
        return fail("标题不能为空")
    if "content" in data:
        if not (data.get("content") or "").strip():
            return fail("笔记正文不能为空")
        note.content = data["content"]
    if "subject" in data:
        note.subject = (data.get("subject") or "").strip()
    if "mistake" in data:
        note.mistake = (data.get("mistake") or "").strip()
    if "summary" in data:
        note.summary = (data.get("summary") or "").strip()
    db.session.commit()
    return ok(note.to_dict(), message="更新成功")


@bp.delete("/<int:nid>")
@jwt_required()
def delete_note(nid):
    uid = _current_user_id()
    note = db.session.get(Note, nid)
    if not note or note.user_id != uid:
        return fail("笔记不存在", http=404)
    db.session.delete(note)
    db.session.commit()
    return ok(message="删除成功")


@bp.post("/<int:nid>/summarize")
@jwt_required()
def summarize(nid):
    """AI 知识梳理：总结要点、提取易错点"""
    uid = _current_user_id()
    note = db.session.get(Note, nid)
    if not note or note.user_id != uid:
        return fail("笔记不存在", http=404)
    result = summarize_note(note.title, note.content, note.subject, note.mistake)
    note.summary = result.get("summary", "")
    db.session.commit()
    result["source"] = result.get("source", "local")
    return ok(result, message="AI 梳理完成")