# =============================================
# AI 模块：数字人答疑
# =============================================
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ai_service import answer_question, generate_quiz, llm_available
from response import ok, fail

bp = Blueprint("ai", __name__)


@bp.get("/status")
@jwt_required()
def status():
    return ok({
        "engine": "llm" if llm_available() else "mock",
        "source": "llm" if llm_available() else "local",
    })


@bp.post("/chat")
@jwt_required()
def chat():
    """数字人虚拟教师答疑。配了 LLM_API_KEY 走大模型，否则返回本地智能回答。"""
    data = request.get_json(silent=True) or {}
    question = (data.get("message") or "").strip()
    if not question:
        return fail("请输入你要问的问题")
    if len(question) > 2000:
        return fail("问题太长了，请精简到 2000 字以内")

    engine = "llm" if llm_available() else "mock"
    reply = answer_question(question)
    return ok({
        "reply": reply,
        "engine": engine,
        "source": "llm" if engine == "llm" else "local",
    })


@bp.post("/generate-quiz")
@jwt_required()
def ai_generate_quiz():
    """AI 出题：根据学科/知识点生成练习题。"""
    data = request.get_json(silent=True) or {}
    topic = (data.get("topic") or "").strip()
    if not topic:
        return fail("请先输入知识点或主题")
    subject = (data.get("subject") or "").strip()
    count = int(data.get("count") or 5)
    try:
        questions, source = generate_quiz(topic, subject, count)
    except Exception as e:
        return fail(f"AI 出题失败：{e}")
    return ok({"questions": questions, "source": source})