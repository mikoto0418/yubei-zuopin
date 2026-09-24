# =============================================
# EduPulse 后端主应用
# =============================================
import logging
import os
from datetime import datetime

from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from werkzeug.exceptions import HTTPException

from config import Config
from models import db
from response import fail

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# 后端端口：统一使用 4103，可用环境变量 PORT 覆盖
PORT = int(os.getenv("PORT", "4103"))


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    jwt = JWTManager(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # ---- 全局异常处理：所有错误统一走 {code,data,message} ----
    # 标准 HTTP 错误（400/401/403/404/405…）由 HTTPException 处理器统一翻译为中文提示，
    # 其余未捕获异常统一返回 500，避免与上面冗余重复。
    @app.errorhandler(HTTPException)
    def handle_http(e):
        # 统一把标准 HTTP 错误翻译成结构化响应
        return fail(_http_message(e.code, e.description), http=e.code)

    @app.errorhandler(Exception)
    def handle_any(e):
        logger.exception("未捕获异常")
        return fail("服务器开小差了，请稍后再试", code=500, http=500)

    # ---- JWT 相关错误统一返回中文 401 ----
    @jwt.unauthorized_loader
    def missing_token(reason):
        return fail("登录已失效，请重新登录", http=401)

    @jwt.invalid_token_loader
    def invalid_token(reason):
        return fail("登录令牌无效，请重新登录", http=401)

    @jwt.expired_token_loader
    def expired_token(jwt_header, jwt_payload):
        return fail("登录已过期，请重新登录", http=401)

    from routes import (auth_routes, admin_routes, ai_routes, note_routes, quiz_routes,
                        session_routes, knowledge_routes, wrong_routes, goal_routes,
                        achievement_routes, insight_routes)

    app.register_blueprint(auth_routes.bp, url_prefix="/api/auth")
    app.register_blueprint(note_routes.bp, url_prefix="/api/notes")
    app.register_blueprint(quiz_routes.bp, url_prefix="/api/quizzes")
    app.register_blueprint(session_routes.bp, url_prefix="/api/sessions")
    app.register_blueprint(ai_routes.bp, url_prefix="/api/ai")
    app.register_blueprint(admin_routes.bp, url_prefix="/api/admin")
    app.register_blueprint(knowledge_routes.bp, url_prefix="/api/knowledge")
    app.register_blueprint(wrong_routes.bp, url_prefix="/api/wrong-book")
    app.register_blueprint(goal_routes.bp, url_prefix="/api/goals")
    app.register_blueprint(achievement_routes.bp, url_prefix="/api/achievements")
    app.register_blueprint(insight_routes.bp, url_prefix="/api/insights")

    # ---- 前端构建产物托管（单端口部署，可选加分项）----
    # 有 dist 就托管 SPA，否则回退为 API 健康信息。
    frontend_dist = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")

    @app.get("/")
    def home():
        if os.path.isfile(os.path.join(frontend_dist, "index.html")):
            return send_from_directory(frontend_dist, "index.html")
        from flask import jsonify
        return jsonify({"app": "EduPulse API", "status": "ok", "time": datetime.now().isoformat()})

    @app.get("/<path:path>")
    def spa_fallback(path):
        """前端路由回退：真实文件直出，否则交给 index.html；
        /api/* 未匹配路径仍走 JSON 404，不把接口错误伪装成页面。"""
        if path.startswith("api/"):
            from response import fail as _fail
            return _fail("接口不存在", http=404)
        full = os.path.join(frontend_dist, path)
        if os.path.isfile(full):
            return send_from_directory(frontend_dist, path)
        if os.path.isfile(os.path.join(frontend_dist, "index.html")):
            return send_from_directory(frontend_dist, "index.html")
        from response import fail as _fail
        return _fail("接口不存在", http=404)

    @app.get("/api/ping")
    def ping():
        from response import ok
        return ok({"status": "ok"})

    return app


def _http_message(code: int, desc: str):
    """尽量返回面向用户的友好提示，否则用标准描述兜底"""
    friendly = {
        400: "请求参数有误",
        401: "请先登录后再操作",
        403: "没有权限执行该操作",
        404: "请求的资源不存在",
        405: "不支持的请求方式",
    }
    return friendly.get(code, str(desc))


app = create_app()

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    logger.info("EduPulse 后端启动于 http://0.0.0.0:%s", PORT)
    # 允许局域网访问 + 开发重载
    app.run(host="0.0.0.0", port=PORT, debug=True, use_reloader=False)