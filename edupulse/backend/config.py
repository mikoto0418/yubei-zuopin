# =============================================
# EduPulse 全局配置
# =============================================
import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # 读取 backend/.env

BASE_DIR = Path(__file__).resolve().parent
DATABASE = os.getenv("DB_PATH", str(BASE_DIR / "edupulse.db"))


class Config:
    # 密钥：从环境变量读取，未配置时使用默认开发密钥（生产环境必须覆盖）
    SECRET_KEY = os.getenv("SECRET_KEY", "edupulse-dev-secret-change-me-please-this-is-a-32plus-byte-key")

    # JWT 配置
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", SECRET_KEY)
    _jwt_hours = int(os.getenv("JWT_EXPIRE_HOURS", "24"))
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=_jwt_hours)
    JWT_IDENTITY_CLAIM = "sub"

    # 数据库
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", f"sqlite:///{DATABASE}")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # AI 兼容 OpenAI 的接口配置（可选）
    LLM_API_KEY = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
    LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")