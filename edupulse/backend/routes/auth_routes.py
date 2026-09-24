# =============================================
# 认证模块：注册 / 登录 / 当前用户
# =============================================
from flask import Blueprint, request
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity

from models import db, User
from response import ok, fail

bp = Blueprint("auth", __name__)


@bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    nickname = (data.get("nickname") or "").strip()

    if not username or len(username) < 3:
        return fail("用户名至少 3 位字符")
    if len(username) > 64:
        return fail("用户名不能超过 64 位字符")
    if len(password) < 6:
        return fail("密码至少 6 位")
    if User.query.filter_by(username=username).first():
        return fail("用户名已被占用", http=409)

    # 出于安全考虑：普通用户注册不开放 admin 角色，默认均为 user
    user = User(username=username, nickname=nickname or username, role="user")
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return ok({"token": token, "user": user.to_dict()}, message="注册成功", status=201)


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return fail("请输入用户名和密码")

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return fail("用户名或密码错误", http=401)

    token = create_access_token(identity=str(user.id))
    return ok({"token": token, "user": user.to_dict()}, message="登录成功")


@bp.get("/me")
@jwt_required()
def me():
    uid = int(get_jwt_identity())
    user = db.session.get(User, uid)
    if not user:
        return fail("用户不存在", http=404)
    return ok(user.to_dict())