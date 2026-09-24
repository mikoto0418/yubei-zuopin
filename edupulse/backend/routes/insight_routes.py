# =============================================
# AI 洞察模块：生成 / 列表 / 状态更新
# AI 分析结果落库到 ai_insights，首页读取并驱动练习入口。
# =============================================
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ai_service import analyze_insights
from models import INSIGHT_STATUSES, AiInsight, db
from response import ok, fail
from services import build_insight_payload, persist_insights

bp = Blueprint("insights", __name__)


def _uid():
    return int(get_jwt_identity())


@bp.get("")
@jwt_required()
def list_insights():
    """洞察列表：按状态/类型筛选，分页返回。首页只用 ?size=5 取最新。"""
    uid = _uid()
    status = (request.args.get("status") or "").strip()
    kind = (request.args.get("kind") or "").strip()
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        size = min(100, max(1, int(request.args.get("size", 10))))
    except ValueError:
        size = 10

    query = AiInsight.query.filter_by(user_id=uid)
    if status:
        query = query.filter_by(status=status)
    if kind:
        query = query.filter_by(kind=kind)

    total = query.count()
    items = (query.order_by(AiInsight.created_at.desc(), AiInsight.id.desc())
             .offset((page - 1) * size).limit(size).all())
    return ok({
        "items": [i.to_dict() for i in items],
        "total": total, "page": page, "pageSize": size,
        "new_count": AiInsight.query.filter_by(user_id=uid, status="new").count(),
    })


@bp.post("/analyze")
@jwt_required()
def analyze():
    """分析薄弱知识点 → 写入 ai_insights → 返回落库结果。

    未配置 LLM 时走本地规则（source=local），保证功能可用。
    """
    uid = _uid()
    payload = build_insight_payload(uid)
    result, source = analyze_insights(payload)
    written = persist_insights(uid, result, source=source)
    return ok({
        "insights": [i.to_dict() for i in written],
        "source": source,
        "weak_points": payload["weak_points"],
    }, message=f"已生成 {len(written)} 条学习洞察")


@bp.post("/<int:iid>/status")
@jwt_required()
def update_status(iid):
    """更新洞察状态：new / read / resolved。"""
    uid = _uid()
    ins = db.session.get(AiInsight, iid)
    if not ins or ins.user_id != uid:
        return fail("洞察不存在", http=404)
    data = request.get_json(silent=True) or {}
    status = (data.get("status") or "").strip()
    if status not in INSIGHT_STATUSES:
        return fail("状态取值不合法")
    ins.status = status
    db.session.commit()
    return ok(ins.to_dict(), message="状态已更新")


@bp.delete("/<int:iid>")
@jwt_required()
def delete_insight(iid):
    uid = _uid()
    ins = db.session.get(AiInsight, iid)
    if not ins or ins.user_id != uid:
        return fail("洞察不存在", http=404)
    db.session.delete(ins)
    db.session.commit()
    return ok(message="洞察已删除")
