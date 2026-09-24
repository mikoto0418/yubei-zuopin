# =============================================
# 学习目标模块（状态机：active → achieved / expired）
# =============================================
from datetime import datetime

from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from models import (GOAL_ACTIVE, GOAL_ACHIEVED, GOAL_EXPIRED, GOAL_METRICS,
                    GOAL_PERIODS, db, METRIC_LABELS, StudyGoal)
from response import ok, fail
from services import expire_stale_goals, goal_window, refresh_goal

bp = Blueprint("goals", __name__)


def _uid():
    return int(get_jwt_identity())


def _serialize_goal(goal):
    d = goal.to_dict()
    d["can_achieve"] = goal.can_transition(GOAL_ACHIEVED)
    d["can_expire"] = goal.can_transition(GOAL_EXPIRED)
    return d


@bp.get("")
@jwt_required()
def list_goals():
    """目标列表：支持状态筛选，返回前先把过期目标置为 expired。"""
    uid = _uid()
    expire_stale_goals(uid)

    status = (request.args.get("status") or "").strip()
    query = StudyGoal.query.filter_by(user_id=uid)
    if status:
        if status not in (GOAL_ACTIVE, GOAL_ACHIEVED, GOAL_EXPIRED):
            return fail("状态取值不合法")
        query = query.filter_by(status=status)

    goals = query.order_by(StudyGoal.status.asc(), StudyGoal.id.desc()).all()
    # 活跃目标实时刷新进度（不自动流转，避免列表接口产生副作用时跳变）
    for g in goals:
        if g.status == GOAL_ACTIVE:
            g.progress = __import__("services").compute_goal_progress(g)

    stats = {
        "active": StudyGoal.query.filter_by(user_id=uid, status=GOAL_ACTIVE).count(),
        "achieved": StudyGoal.query.filter_by(user_id=uid, status=GOAL_ACHIEVED).count(),
        "expired": StudyGoal.query.filter_by(user_id=uid, status=GOAL_EXPIRED).count(),
    }
    return ok({"items": [_serialize_goal(g) for g in goals], "stats": stats,
               "metrics": [{"value": k, "label": v} for k, v in METRIC_LABELS.items()]})


@bp.post("")
@jwt_required()
def create_goal():
    """创建目标。周期起止日期由后端按 week/month 自动计算。"""
    uid = _uid()
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return fail("请填写目标名称")
    if len(title) > 128:
        return fail("目标名称不能超过 128 字")

    period = (data.get("period") or "week").strip()
    if period not in GOAL_PERIODS:
        return fail("周期只能是 week 或 month")
    metric = (data.get("metric") or "duration").strip()
    if metric not in GOAL_METRICS:
        return fail("指标只能是 duration / quiz_count / accuracy")

    try:
        target = int(data.get("target") or 0)
    except (TypeError, ValueError):
        return fail("目标值必须是数字")
    if target <= 0:
        return fail("目标值必须大于 0")
    if metric == "accuracy" and target > 100:
        return fail("正确率目标不能超过 100%")
    if metric == "duration" and target > 100000:
        return fail("时长目标过大")
    if metric == "quiz_count" and target > 10000:
        return fail("题量目标过大")

    start, end = goal_window(period)
    goal = StudyGoal(user_id=uid, title=title, period=period, metric=metric,
                     target=target, progress=0, status=GOAL_ACTIVE,
                     subject=(data.get("subject") or "").strip(),
                     start_date=start, end_date=end)
    db.session.add(goal)
    db.session.commit()
    # 创建后立即算一次进度（新目标可能已由既有数据满足）
    refresh_goal(goal)
    return ok(_serialize_goal(goal), message="目标已创建", status=201)


@bp.get("/<int:gid>")
@jwt_required()
def get_goal(gid):
    uid = _uid()
    goal = db.session.get(StudyGoal, gid)
    if not goal or goal.user_id != uid:
        return fail("目标不存在", http=404)
    if goal.status == GOAL_ACTIVE:
        from services import compute_goal_progress
        goal.progress = compute_goal_progress(goal)
        db.session.commit()
    return ok(_serialize_goal(goal))


@bp.post("/<int:gid>/progress")
@jwt_required()
def refresh(gid):
    """刷新进度；达到目标值时自动流转 active → achieved，并解锁成就。"""
    uid = _uid()
    goal = db.session.get(StudyGoal, gid)
    if not goal or goal.user_id != uid:
        return fail("目标不存在", http=404)
    if goal.status != GOAL_ACTIVE:
        return fail(f"目标已处于 {goal.status} 状态，无法刷新进度")
    _, unlocked = refresh_goal(goal)
    return ok({"goal": _serialize_goal(goal),
               "unlocked": [a.to_dict() for a in unlocked]},
              message="进度已刷新")


@bp.post("/<int:gid>/transition")
@jwt_required()
def transition(gid):
    """状态机流转。仅允许 active → achieved / expired，非法流转返回 400。"""
    uid = _uid()
    goal = db.session.get(StudyGoal, gid)
    if not goal or goal.user_id != uid:
        return fail("目标不存在", http=404)

    data = request.get_json(silent=True) or {}
    target = (data.get("status") or "").strip()
    if target not in (GOAL_ACHIEVED, GOAL_EXPIRED):
        return fail("只能流转到 achieved 或 expired")
    if not goal.can_transition(target):
        return fail(f"目标当前状态为 {goal.status}，不允许流转到 {target}")

    unlocked = []
    if target == GOAL_ACHIEVED:
        # 标记达成需要确实完成，除非显式 force
        from services import compute_goal_progress
        goal.progress = compute_goal_progress(goal)
        if goal.progress < goal.target and not data.get("force"):
            return fail(f"进度 {goal.progress} 未达到目标 {goal.target}，无法标记达成")
        goal.status = GOAL_ACHIEVED
        goal.achieved_at = datetime.utcnow()
        from services import evaluate_achievements
        unlocked = evaluate_achievements(uid, commit=False)
    else:
        goal.status = GOAL_EXPIRED

    db.session.commit()
    return ok({"goal": _serialize_goal(goal),
               "unlocked": [a.to_dict() for a in unlocked]},
              message="状态已更新")


@bp.delete("/<int:gid>")
@jwt_required()
def delete_goal(gid):
    uid = _uid()
    goal = db.session.get(StudyGoal, gid)
    if not goal or goal.user_id != uid:
        return fail("目标不存在", http=404)
    db.session.delete(goal)
    db.session.commit()
    return ok(message="目标已删除")
