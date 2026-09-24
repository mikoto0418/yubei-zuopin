# =============================================
# 成就模块：成就墙 / 重新评估解锁
# =============================================
from flask import Blueprint
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import db, Achievement
from response import ok
from services import achievement_metrics, evaluate_achievements

bp = Blueprint("achievements", __name__)


def _uid():
    return int(get_jwt_identity())


@bp.get("")
@jwt_required()
def list_achievements():
    """成就墙：返回全部成就（含未解锁的进度），并按类别分组统计。"""
    uid = _uid()
    # 首次访问时补齐成就定义（新用户不会缺项）
    evaluate_achievements(uid)

    items = (Achievement.query.filter_by(user_id=uid)
             .order_by(Achievement.category, Achievement.threshold).all())
    unlocked = [a for a in items if a.unlocked]

    by_category = {}
    for a in items:
        cell = by_category.setdefault(a.category, {"category": a.category, "total": 0, "unlocked": 0})
        cell["total"] += 1
        if a.unlocked:
            cell["unlocked"] += 1

    return ok({
        "items": [a.to_dict() for a in items],
        "unlocked_count": len(unlocked),
        "total_count": len(items),
        "by_category": list(by_category.values()),
        "metrics": achievement_metrics(uid),
        "latest": [a.to_dict() for a in sorted(
            unlocked, key=lambda x: x.unlocked_at or 0, reverse=True)[:3]],
    })


@bp.post("/evaluate")
@jwt_required()
def evaluate():
    """手动触发成就重新评估，返回本次新解锁的成就。"""
    uid = _uid()
    newly = evaluate_achievements(uid)
    total = Achievement.query.filter_by(user_id=uid).count()
    unlocked = Achievement.query.filter_by(user_id=uid, unlocked=True).count()
    return ok({
        "unlocked": [a.to_dict() for a in newly],
        "unlocked_count": unlocked,
        "total_count": total,
    }, message=f"本次新解锁 {len(newly)} 个成就")
