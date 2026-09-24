"""MindCare - AI 心理健康陪护系统 后端
Flask + SQLite + JWT。轻量、前后端分离、不过度工程化。
"""
import logging
import os
import sqlite3
import secrets

logger = logging.getLogger(__name__)
from datetime import datetime, timedelta, timezone
from functools import wraps

from dotenv import load_dotenv  # optional; 见下方兼容
from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import jwt

# .env 加载（若安装了 python-dotenv 才加载，未安装则直接读环境变量）
try:
    load_dotenv()
except Exception:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "mindcare.db")
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_hex(32))

app = Flask(__name__)
CORS(app)
app.config["JSON_AS_ASCII"] = False


# ---------------------------------------------------------------- 统一 JSON 与全局异常
def json_ok(data=None, status=200):
    return jsonify({} if data is None else data), status


def json_err(message, status=400):
    return jsonify({"error": message}), status


@app.errorhandler(404)
def not_found(e):
    return json_err("接口不存在", 404)


@app.errorhandler(405)
def method_not_allowed(e):
    return json_err("请求方法不允许", 405)


@app.errorhandler(500)
def server_error(e):
    return json_err("服务器内部错误，请稍后再试", 500)


# ---------------------------------------------------------------- DB 层
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def query(sql, args=(), one=False):
    cur = get_db().execute(sql, args)
    rows = cur.fetchall()
    return (rows[0] if rows else None) if one else rows


def execute(sql, args=()):
    db = get_db()
    cur = db.execute(sql, args)
    db.commit()
    return cur.lastrowid


def row_to_dict(row):
    return dict(row) if row else None


SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  nickname TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS mood_entries(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  mood_score INTEGER NOT NULL,
  emotion TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS assessments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  total_score INTEGER NOT NULL,
  level TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS chat_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS meditation_sessions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  duration INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS mood_tags(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  color TEXT,
  emoji TEXT,
  kind TEXT DEFAULT 'neutral',
  is_builtin INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(user_id, tag),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS user_prefs(
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY(user_id, key),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS quizzes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  intro TEXT,
  questions TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(owner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS quiz_submissions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  score REAL NOT NULL,
  max_score REAL NOT NULL DEFAULT 0,
  level TEXT NOT NULL,
  answers TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(quiz_id) REFERENCES quizzes(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
-- 测评逐题作答（测评明细，支撑后台回看具体答题分布）
CREATE TABLE IF NOT EXISTS assessment_answers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  question_no INTEGER NOT NULL,
  question TEXT,
  answer_score INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(assessment_id) REFERENCES assessments(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
-- 咨询师档案（user_id 关联登录账号，counselor 角色）
CREATE TABLE IF NOT EXISTS counselors(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  name TEXT NOT NULL,
  title TEXT,
  avatar TEXT,
  specialties TEXT,
  intro TEXT,
  slots TEXT,
  rating REAL DEFAULT 5.0,
  rating_count INTEGER DEFAULT 0,
  price INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
-- 预约（状态机 pending → confirmed → completed / cancelled）
CREATE TABLE IF NOT EXISTS appointments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  counselor_id INTEGER NOT NULL,
  slot TEXT NOT NULL,
  topic TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_score INTEGER,
  review_text TEXT,
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(counselor_id) REFERENCES counselors(id)
);
-- 危机预警（测评中度以上 / 情绪连续 3 天 ≤3 分自动生成）
CREATE TABLE IF NOT EXISTS crisis_alerts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  trigger_type TEXT NOT NULL,
  level TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  handler_id INTEGER,
  handle_action TEXT,
  handle_note TEXT,
  handled_at TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
-- 科普资源库 + AI 周报私人报告区（user_id 为空 = 公共文章）
CREATE TABLE IF NOT EXISTS resources(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'article',
  category TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  source TEXT DEFAULT 'local',
  read_minutes INTEGER DEFAULT 3,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
"""


BUILTIN_TAGS = [
    {"tag": "开心", "emoji": "😄", "color": "#4ade80", "kind": "positive"},
    {"tag": "平静", "emoji": "😌", "color": "#7c6cf0", "kind": "positive"},
    {"tag": "放松", "emoji": "🌿", "color": "#38bdf8", "kind": "positive"},
    {"tag": "焦虑", "emoji": "😟", "color": "#f59e0b", "kind": "negative"},
    {"tag": "疲惫", "emoji": "🥱", "color": "#94a3b8", "kind": "negative"},
    {"tag": "倦怠", "emoji": "😪", "color": "#a78bfa", "kind": "negative"},
    {"tag": "难过", "emoji": "😢", "color": "#60a5fa", "kind": "negative"},
    {"tag": "愤怒", "emoji": "😠", "color": "#ef4444", "kind": "negative"},
]


def seed_builtin_tags(uid):
    """为指定用户入库内置情绪标签（仅首次，通过 user_prefs 保证只 seed 一次）。跳过同名已有标签。"""
    if query("SELECT 1 FROM user_prefs WHERE user_id=? AND key='builtin_seeded'", (uid,), one=True):
        return
    for t in BUILTIN_TAGS:
        try:
            execute(
                "INSERT INTO mood_tags(user_id,tag,color,emoji,kind,is_builtin) VALUES(?,?,?,?,?,1)",
                (uid, t["tag"], t["color"], t["emoji"], t["kind"]),
            )
        except Exception:
            pass  # 同名标签已存在，跳过
    try:
        execute("INSERT INTO user_prefs(user_id,key,value) VALUES(?, 'builtin_seeded', '1')", (uid,))
    except Exception:
        pass


def init_db(seed=True):
    db = sqlite3.connect(DB_PATH)
    db.executescript(SCHEMA)
    # 兼容旧库：若 quizzes 表已存在但缺 intro 列，则补充（仅演示用途，字段可空）
    try:
        cols = [r[1] for r in db.execute("PRAGMA table_info(quizzes)").fetchall()]
        if cols and "intro" not in cols:
            db.execute("ALTER TABLE quizzes ADD COLUMN intro TEXT")
    except Exception:
        pass
    # 兼容旧库：mood_tags 补情绪标签增强字段
    try:
        mcols = [r[1] for r in db.execute("PRAGMA table_info(mood_tags)").fetchall()]
        for col, ddl in (
            ("color", "TEXT"),
            ("emoji", "TEXT"),
            ("kind", "TEXT DEFAULT 'neutral'"),
            ("is_builtin", "INTEGER DEFAULT 0"),
            ("hidden", "INTEGER DEFAULT 0"),
        ):
            if "color" == "":
                continue
            if col not in mcols:
                db.execute(f"ALTER TABLE mood_tags ADD COLUMN {col} {ddl}")
                mcols.append(col)
    except Exception:
        pass
    db.commit()
    # 演示数据统一由 seed 模块写入（账号/咨询师/情绪/测评/预约/危机预警/资源）
    if seed:
        import seed as seed_mod
        seed_mod.seed_all(db)
    db.commit()
    db.close()


# ---------------------------------------------------------------- 认证
def token_for(user):
    payload = {
        "uid": user["id"],
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        data = jwt.decode(auth[7:], SECRET_KEY, algorithms=["HS256"])
        return query("SELECT * FROM users WHERE id=?", (data["uid"],), one=True)
    except Exception:
        return None


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        u = current_user()
        if not u:
            return jsonify({"error": "未登录或登录已过期"}), 401
        return fn(*a, **kw)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        u = current_user()
        if not u:
            return jsonify({"error": "未登录或登录已过期"}), 401
        if u["role"] != "admin":
            return jsonify({"error": "需要管理员权限"}), 403
        return fn(*a, **kw)

    return wrapper


# ---------------------------------------------------------------- 认证接口
@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(force=True)
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if len(username) < 3 or len(password) < 6:
        return jsonify({"error": "用户名至少3位，密码至少6位"}), 400
    try:
        uid = execute(
            "INSERT INTO users(username,password_hash,role,nickname) VALUES(?,?,?,?)",
            (username, generate_password_hash(password), "user", username),
        )
    except Exception:
        return jsonify({"error": "用户名已存在"}), 409
    seed_builtin_tags(uid)
    user = query("SELECT * FROM users WHERE id=?", (uid,), one=True)
    return jsonify({"token": token_for(user), "user": user_public(user)}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    user = query("SELECT * FROM users WHERE username=?", (data.get("username", "").strip(),), one=True)
    if not user or not check_password_hash(user["password_hash"], data.get("password", "")):
        return jsonify({"error": "用户名或密码错误"}), 401
    return jsonify({"token": token_for(user), "user": user_public(user)})


@app.route("/api/auth/me", methods=["GET"])
@login_required
def me():
    return jsonify({"user": user_public(current_user())})


ROLE_LABELS = {"admin": "管理员", "counselor": "咨询师", "user": "普通用户"}


def user_public(u):
    return {
        "id": u["id"],
        "username": u["username"],
        "role": u["role"],
        "role_label": ROLE_LABELS.get(u["role"], u["role"]),
        "nickname": u["nickname"] or u["username"],
    }


# ---------------------------------------------------------------- AI 接口
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1").rstrip("/")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")
# 兼容老配置：默认关闭本地兜底（仅云端）；需要离线兜底时置为 on/1/true
ENABLE_LOCAL_FALLBACK = os.getenv("ENABLE_LOCAL_FALLBACK", "").strip().lower() in ("1", "true", "on", "yes")


def _llm_error(reason):
    """把云端失败的真实原因包装成统一中文提示。"""
    if not LLM_API_KEY:
        return "未配置大模型 Key（请在后端 .env 设置 LLM_API_KEY）"
    base = "云端 AI 服务暂时不可用，请稍后再试"
    if "429" in str(reason):
        return f"{base}（配额/限流）"
    if "402" in str(reason):
        return f"{base}（账户余额不足）"
    if "401" in str(reason):
        return f"{base}（Key 无效或已失效）"
    if "timeout" in str(reason).lower() or "timed out" in str(reason).lower():
        return f"{base}（请求超时）"
    return f"{base}（{str(reason)[:120]}）"


def _local_reply(user_text):
    """离线 / 无 Key 时可选的低成本本地回应。仅当 ENABLE_LOCAL_FALLBACK 开启时启用。"""
    t = user_text
    replies = []
    if any(k in t for k in ["睡", "失眠", "熬夜"]):
        replies.append("睡眠是情绪的重要基底。今晚不妨试试：睡前放下手机 30 分钟，做几次深呼吸，把明天的事写下来再休息。")
    if any(k in t for k in ["焦虑", "紧张", "担心"]):
        replies.append("听起来你正被一些不确定的想法压着。我们能不能把它拆小一点：你现在最担心的一件具体的事是什么？")
    if any(k in t for k in ["累", "疲惫", "没力气"]):
        replies.append("疲惫的时候请先允许自己休息，这不是偷懒。今天有没有哪件小事，当我再回复时你愿意先做一半？")
    if any(k in t for k in ["哭", "难过", "伤心", "失落"]):
        replies.append("谢谢你愿意告诉我这些，能说出来本身就很有勇气。慢慢来，不必强迫自己一下就好起来。")
    if any(k in t for k in ["开心", "高兴", "成功", "过了"]):
        replies.append("为你高兴！愿你把这份成就感和喜悦也好好记下来，它是你真实力量的一部分。")
    if not replies:
        replies = [
            "我一直在认真听。能不能再多说一点，让此刻的你被更好地理解？",
            "听起来这件事对你有些分量。你更希望我陪你聊聊情绪，还是帮你理一理怎么做？",
        ]
    # 明确标注来源，避免被误认为大模型回复
    return "【离线本地模式】" + replies[0]


@app.route("/api/chat", methods=["POST"])
@login_required
def chat():
    u = current_user()
    data = request.get_json(force=True)
    user_text = (data.get("message") or "").strip()[:1000]
    if not user_text:
        return jsonify({"error": "消息不能为空"}), 400

    execute("INSERT INTO chat_history(user_id,role,content) VALUES(?,?,?)", (u["id"], "user", user_text))

    reply = None
    reply_source = "cloud"
    if LLM_API_KEY:
        try:
            reply = ask_llm(u["id"], user_text)
        except Exception as e:
            reason = _llm_error(str(e))
            # 仅云端模式：云端失败直接报错，不再静默降级本地
            if not ENABLE_LOCAL_FALLBACK:
                return jsonify({"error": reason, "message": reason, "reply": None}), 503
            reply = _local_reply(user_text)
            reply_source = "local"
    else:
        if not ENABLE_LOCAL_FALLBACK:
            return jsonify({"error": _llm_error(""), "message": _llm_error(""), "reply": None}), 503
        reply = _local_reply(user_text)
        reply_source = "local"

    execute("INSERT INTO chat_history(user_id,role,content) VALUES(?,?,?)", (u["id"], "ai", reply))
    return jsonify({"reply": reply, "source": reply_source})


@app.route("/api/chat/history", methods=["GET"])
@login_required
def chat_history():
    u = current_user()
    rows = query(
        "SELECT role, content, created_at FROM chat_history WHERE user_id=? ORDER BY id DESC LIMIT 50",
        (u["id"],),
    )
    return jsonify({"history": [row_to_dict(r) for r in reversed(rows)]})


def ask_llm(uid, user_text):
    """调用兼容 OpenAI 的 chat completions。"""
    import urllib.request

    recent = query(
        "SELECT role, content FROM ("
        " SELECT role, content, id FROM chat_history WHERE user_id=? ORDER BY id DESC LIMIT 8"
        ") ORDER BY id",
        (uid,),
    )
    messages = [{"role": "system", "content": "你是 MindCare 的心理健康陪护助手，温柔、共情、不评判，必要时建议寻求专业帮助。回答简洁、中文。"}]
    for r in recent:
        # OpenAI 兼容接口只认 assistant/system/user/tool；库内以 "ai" 存储助手消息，这里做映射
        messages.append({"role": "assistant" if r["role"] == "ai" else r["role"], "content": r["content"]})

    body = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": 0.8,
        "max_tokens": 500,
    }
    req = urllib.request.Request(
        f"{LLM_BASE_URL}/chat/completions",
        data=jsonify_args(body),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LLM_API_KEY}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = resp.read().decode("utf-8")
    return json_loads(result)["choices"][0]["message"]["content"].strip()


def jsonify_args(obj):
    import json
    return json.dumps(obj, ensure_ascii=False).encode("utf-8")


def json_loads(s):
    import json
    return json.loads(s)


def json_dumps(obj):
    import json
    return json.dumps(obj, ensure_ascii=False)


# ---------------------------------------------------------------- 情绪日志
@app.route("/api/moods", methods=["GET"])
@login_required
def list_moods():
    u = current_user()
    page = max(1, request.args.get("page", default=1, type=int))
    size = min(100, max(1, request.args.get("size", default=50, type=int)))
    total = query("SELECT COUNT(*) c FROM mood_entries WHERE user_id=?", (u["id"],), one=True)["c"]
    rows = query(
        "SELECT id, mood_score, emotion, note, created_at FROM mood_entries "
        "WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        (u["id"], size, (page - 1) * size),
    )
    return jsonify({"moods": [row_to_dict(r) for r in rows], "total": total, "page": page, "size": size})


@app.route("/api/moods", methods=["POST"])
@login_required
def add_mood():
    u = current_user()
    data = request.get_json(force=True)
    try:
        score = max(1, min(10, int(data.get("mood_score"))))
    except Exception:
        return jsonify({"error": "评分必须是1-10的数字"}), 400
    emotion = (data.get("emotion") or "").strip()[:20]
    note = (data.get("note") or "").strip()[:500]
    execute(
        "INSERT INTO mood_entries(user_id,mood_score,emotion,note) VALUES(?,?,?,?)",
        (u["id"], score, emotion or None, note or None),
    )
    # 连续 3 天 ≤3 分 → 自动生成危机预警（同一天不重复生成）
    alert_id = _check_mood_streak(u["id"])
    return jsonify({"ok": True, "crisis_alert": bool(alert_id)})


@app.route("/api/moods/today", methods=["POST"])
@login_required
def mood_today():
    u = current_user()
    data = request.get_json(force=True)
    from datetime import date
    today = date.today().isoformat()
    row = query(
        "SELECT 1 FROM mood_entries WHERE user_id=? AND date(created_at)=date('now','localtime')",
        (u["id"],),
        one=True,
    )
    if row:
        return jsonify({"error": "今天已经记录过情绪了"}), 400
    try:
        score = max(1, min(10, int(data.get("mood_score"))))
    except Exception:
        return jsonify({"error": "评分必须是1-10的数字"}), 400
    emotion = (data.get("emotion") or "").strip()[:20]
    note = (data.get("note") or "").strip()[:200]
    execute(
        "INSERT INTO mood_entries(user_id,mood_score,emotion,note,created_at) VALUES(?,?,?,?,date('now','localtime'))",
        (u["id"], score, emotion or None, note or None),
    )
    alert_id = _check_mood_streak(u["id"])
    return jsonify({"ok": True, "crisis_alert": bool(alert_id)})


@app.route("/api/moods/<int:mood_id>", methods=["GET", "PUT", "DELETE"])
@login_required
def mood_detail(mood_id):
    u = current_user()
    row = query("SELECT * FROM mood_entries WHERE id=? AND user_id=?", (mood_id, u["id"]), one=True)
    if not row:
        return json_err("记录不存在", 404)

    if request.method == "DELETE":
        execute("DELETE FROM mood_entries WHERE id=?", (mood_id,))
        return jsonify({"ok": True})

    if request.method == "GET":
        return jsonify({"mood": row_to_dict(row)})

    data = request.get_json(force=True)
    try:
        score = max(1, min(10, int(data.get("mood_score"))))
    except Exception:
        return json_err("评分必须是1-10的数字", 400)
    emotion = (data.get("emotion") if "emotion" in data else row["emotion"]) or ""
    note = (data.get("note") if "note" in data else row["note"]) or ""
    execute(
        "UPDATE mood_entries SET mood_score=?, emotion=?, note=? WHERE id=?",
        (score, emotion.strip()[:20] or None, note.strip()[:500] or None, mood_id),
    )
    return jsonify({"ok": True})


# ---------------------------------------------------------------- 日记·自定义情绪标签
@app.route("/api/mood-tags", methods=["GET"])
@login_required
def list_mood_tags():
    u = current_user()
    seed_builtin_tags(u["id"])
    rows = query(
        "SELECT id, tag, color, emoji, kind, is_builtin, hidden FROM mood_tags WHERE user_id=? ORDER BY is_builtin DESC, id",
        (u["id"],),
    )
    return jsonify({"tags": [row_to_dict(r) for r in rows]})


@app.route("/api/mood-tags", methods=["POST"])
@login_required
def add_mood_tag():
    u = current_user()
    data = request.get_json(force=True)
    tag = (data.get("tag") or "").strip()
    if len(tag) < 1 or len(tag) > 12:
        return jsonify({"error": "标签需为1-12个字"}), 400
    color = (data.get("color") or "").strip() or None
    emoji = (data.get("emoji") or "").strip() or None
    if len(emoji or "") > 4:
        return jsonify({"error": "emoji 最多 4 个字符"}), 400
    kind = (data.get("kind") or "neutral").strip()
    if kind not in ("positive", "negative", "neutral"):
        kind = "neutral"
    n = query("SELECT COUNT(*) c FROM mood_tags WHERE user_id=? AND hidden=0", (u["id"],), one=True)["c"]
    # 隐藏的标签不占用容量，避免删过的内置标签阻止新增
    total_n = query("SELECT COUNT(*) c FROM mood_tags WHERE user_id=?", (u["id"],), one=True)["c"]
    if total_n >= 40:
        return jsonify({"error": "标签数量已达上限 40"}), 400
    try:
        execute(
            "INSERT INTO mood_tags(user_id,tag,color,emoji,kind) VALUES(?,?,?,?,?)",
            (u["id"], tag, color, emoji, kind),
        )
    except Exception:
        return jsonify({"error": "该标签已存在"}), 400
    return jsonify({"ok": True})


@app.route("/api/mood-tags/<int:tag_id>", methods=["PUT"])
@login_required
def update_mood_tag(tag_id):
    u = current_user()
    row = query("SELECT * FROM mood_tags WHERE id=? AND user_id=?", (tag_id, u["id"]), one=True)
    if not row:
        return json_err("标签不存在", 404)
    data = request.get_json(force=True)
    tag = (data.get("tag") or row["tag"]).strip()
    if len(tag) < 1 or len(tag) > 12:
        return jsonify({"error": "标签需为1-12个字"}), 400
    tag2 = tag if tag == row["tag"] else tag
    exist = query("SELECT id FROM mood_tags WHERE user_id=? AND tag=? AND id<>?", (u["id"], tag2, tag_id), one=True)
    if exist:
        return jsonify({"error": "该标签名已存在"}), 400
    color = (data.get("color") or row["color"] or "").strip() or None
    emoji = (data.get("emoji") if "emoji" in data else row["emoji"]) or None
    if len(emoji or "") > 4:
        return jsonify({"error": "emoji 最多 4 个字符"}), 400
    kind = (data.get("kind") or row["kind"] or "neutral").strip()
    if kind not in ("positive", "negative", "neutral"):
        kind = "neutral"
    hidden = 1 if data.get("hidden") else 0
    execute(
        "UPDATE mood_tags SET tag=?, color=?, emoji=?, kind=?, hidden=? WHERE id=? AND user_id=?",
        (tag2, color, emoji, kind, hidden, tag_id, u["id"]),
    )
    # 内置标签改名后，把历史情绪记录里旧 tag 一并更新（保持统计一致）；自定义标签不追改历史
    if row["is_builtin"] and tag2 != row["tag"]:
        execute(
            "UPDATE mood_entries SET emotion=? WHERE user_id=? AND emotion=?",
            (tag2, u["id"], row["tag"]),
        )
    return jsonify({"ok": True})


@app.route("/api/mood-tags/<int:tag_id>", methods=["DELETE"])
@login_required
def delete_mood_tag(tag_id):
    u = current_user()
    execute("DELETE FROM mood_tags WHERE id=? AND user_id=?", (tag_id, u["id"]))
    return jsonify({"ok": True})


# ---------------------------------------------------------------- 自建测评问卷
def _auto_level(score, max_score):
    """按得分占满分的比例自动评定水平，供自建问卷复用。"""
    if max_score <= 0:
        return "无评分"
    ratio = score / max_score
    if ratio < 0.25:
        return "偏低"
    if ratio < 0.50:
        return "中等"
    if ratio < 0.75:
        return "偏高"
    return "显著"


def _quiz_payload(row):
    q = row_to_dict(row)
    items, options = _quiz_items_and_options(q.get("questions"))
    q["max_score"] = _quiz_max_score(q.get("questions"))
    q["options"] = options
    q["question_count"] = len(items)
    return q


def _quiz_items_and_options(questions_json):
    """解析存于 questions 列的问卷结构；兼容「仅题目列表」与「{options, items}」两种形态。"""
    try:
        data = json_loads(questions_json)
    except Exception:
        return [], []
    if isinstance(data, dict):
        return data.get("items") or [], data.get("options") or []
    return data or [], []


def _quiz_max_score(questions_json):
    items, _ = _quiz_items_and_options(questions_json)
    total = 0
    for item in items:
        scores = item.get("scores") or []
        total += max(scores) if scores else 0
    return total


@app.route("/api/quizzes", methods=["GET"])
@login_required
def list_quizzes():
    u = current_user()
    rows = query(
        "SELECT id, title, intro, questions, created_at FROM quizzes WHERE owner_id=? ORDER BY id DESC",
        (u["id"],),
    )
    return jsonify({"quizzes": [_quiz_payload(r) for r in rows]})


@app.route("/api/quizzes", methods=["POST"])
@login_required
def create_quiz():
    u = current_user()
    data = request.get_json(force=True)
    title = (data.get("title") or "").strip()
    if len(title) < 1 or len(title) > 30:
        return jsonify({"error": "问卷标题需为1-30个字"}), 400
    intro = (data.get("intro") or "").strip()[:100]
    questions = data.get("questions") or []
    options = data.get("options") or []
    if not isinstance(questions, list) or not 1 <= len(questions) <= 20:
        return jsonify({"error": "题目需为1-20道"}), 400
    if not isinstance(options, list) or not 2 <= len(options) <= 8:
        return jsonify({"error": "选项需为2-8个"}), 400
    options = [str(o).strip()[:10] or f"选项{j + 1}" for j, o in enumerate(options)]
    cleaned = []
    for item in questions:
        q = (item.get("q") or "").strip()
        scores = item.get("scores")
        if len(q) < 1 or len(q) > 100:
            return jsonify({"error": "题干需为1-100个字"}), 400
        if not isinstance(scores, list) or len(scores) != len(options):
            return jsonify({"error": "每个选项都需提供对应分值"}), 400
        cleaned.append({"q": q, "scores": [max(-10, min(10, int(x))) for x in scores]})
    payload = {"options": options, "items": cleaned}
    n = query("SELECT COUNT(*) c FROM quizzes WHERE owner_id=?", (u["id"],), one=True)["c"]
    if n >= 20:
        return jsonify({"error": "最多自建 20 个问卷"}), 400
    qid = execute(
        "INSERT INTO quizzes(owner_id,title,intro,questions) VALUES(?,?,?,?)",
        (u["id"], title, intro or None, json_dumps(payload)),
    )
    return jsonify({"id": qid})


# 本地问卷题库（无大模型 Key 时的回退来源）。每题含关键词，命中主题优先选用。
_LOCAL_QUIZ_BANK = [
    {"q": "近期我常感到情绪低落", "kw": ["抑郁", "心情", "低落"]},
    {"q": "我对喜欢的事情提不起兴趣", "kw": ["抑郁", "兴趣", "快乐"]},
    {"q": "我难以集中注意力", "kw": ["抑郁", "焦虑", "压力", "专注"]},
    {"q": "我常为一些小事感到烦恼", "kw": ["焦虑", "烦躁"]},
    {"q": "我经常感到紧张不安", "kw": ["焦虑", "紧张"]},
    {"q": "我容易担心未来的事", "kw": ["焦虑", "压力", "担忧"]},
    {"q": "我觉得自己肩上的负担很重", "kw": ["压力", "负担"]},
    {"q": "我容易感到筋疲力尽", "kw": ["压力", "疲惫", "累"]},
    {"q": "我晚上很难入睡", "kw": ["失眠", "睡眠", "入睡"]},
    {"q": "我夜里经常醒来或早醒", "kw": ["失眠", "睡眠"]},
    {"q": "我白天感觉很困乏没精神", "kw": ["失眠", "疲惫", "困"]},
    {"q": "我常常自我怀疑", "kw": ["自信", "自卑"]},
    {"q": "我觉得自己不够好", "kw": ["自信", "自卑", "抑郁"]},
    {"q": "我害怕在众人面前表现自己", "kw": ["社交", "自信", "紧张"]},
    {"q": "我与人交往时感到不自在", "kw": ["社交", "社交焦虑"]},
    {"q": "我常感到孤独", "kw": ["社交", "孤独", "抑郁"]},
    {"q": "我愿意主动找朋友倾诉", "kw": ["社交", "压力"]},
    {"q": "我对生活有明确的方向和动力", "kw": ["抑郁", "动力", "希望"]},
    {"q": "我能接纳和正视自己的情绪", "kw": ["自信", "情绪"]},
    {"q": "我最近容易对别人发脾气", "kw": ["焦虑", "愤怒", "暴躁"]},
    {"q": "我对自己近期状态感到满意", "kw": ["自豪", "满意", "自信"]},
    {"q": "我担心无法完成手头的任务", "kw": ["压力", "焦虑", "拖延"]},
]

_QUIZ_OPTIONS = ["从不", "有时", "经常", "总是"]
_QUIZ_SCORES = [0, 1, 2, 3]  # 出现越频繁得分越高，代表该倾向越明显


def _build_local_quiz(topic, n):
    ranked, rest = [], list(_LOCAL_QUIZ_BANK)
    for it in _LOCAL_QUIZ_BANK:
        if any(k in topic for k in it["kw"]):
            ranked.append(it)
    for it in ranked:
        if it in rest:
            rest.remove(it)
    picked = (ranked + rest)[: n]
    while len(picked) < n:  # 题目偏少时循环补足
        picked.append(picked[len(picked) % len(_LOCAL_QUIZ_BANK)])
    picked = picked[: n]
    opts = list(_QUIZ_OPTIONS)
    if len(opts) > 3:
        opts = opts[:3]
    questions = [{"q": it["q"], "scores": list(_QUIZ_SCORES[: (len(opts))])} for it in picked]
    return {
        "title": (topic.strip()[:24] or "心理健康") + "自评问卷",
        "intro": f"针对“{topic.strip() or '当前状态'}”生成的快速自评问卷，结果仅供参考。",
        "options": opts,
        "questions": questions,
    }


@app.route("/api/ai/generate-quiz", methods=["POST"])
@login_required
def generate_quiz():
    data = request.get_json(force=True)
    topic = (data.get("topic") or "").strip()
    if not topic:
        return jsonify({"error": "请先输入问卷主题"}), 400
    n = max(1, min(20, int(data.get("n") or 5)))
    result = None
    source = "cloud"
    if LLM_API_KEY:
        try:
            result = _ask_llm_quiz(topic, n)
            source = "cloud"
        except Exception as e:
            reason = _llm_error(str(e))
            if not ENABLE_LOCAL_FALLBACK:
                return jsonify({"error": reason, "message": reason}), 503
            result = _build_local_quiz(topic, n)
            source = "local"
    else:
        if not ENABLE_LOCAL_FALLBACK:
            return jsonify({"error": _llm_error(""), "message": _llm_error("")}), 503
        result = _build_local_quiz(topic, n)
        source = "local"
    return jsonify({"source": source, **result})


def _ask_llm_quiz(topic, n):
    """让大模型生成结构化问卷，解析并做一次校验。"""
    import urllib.request

    prompt = (
        "请为心理咨询生成一个简短的自我评估问卷。"
        f"主题：{topic}。生成 {n} 道题，每题给 3 个选项，选项为：从不/有时/经常。"
        "分值递增（从不=0, 有时=1, 经常=2），得分越高代表该倾向越明显。"
        '必须严格输出 JSON（不要 markdown 代码块），格式：'
        '{"title": "...", "intro": "...", "options": ["从不","有时","经常"], '
        '"questions": [{"q": "题干", "scores": [0,1,2]}]}'
    )
    body = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": "你是严谨的心理测评问卷设计师，只输出合法 JSON。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 1500,
    }
    req = urllib.request.Request(
        f"{LLM_BASE_URL}/chat/completions",
        data=jsonify_args(body),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LLM_API_KEY}",
        },
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        payload = json_loads(resp.read().decode("utf-8"))
    text = payload["choices"][0]["message"]["content"].strip()
    # 去掉可能的 ```json 包裹
    start, end = text.find("{"), text.rfind("}")
    text = text[start:end + 1] if start >= 0 and end > start else text
    obj = json_loads(text)
    opts = list(obj.get("options") or _QUIZ_OPTIONS)[:3]
    questions = []
    for it in (obj.get("questions") or [])[:n]:
        q = (it.get("q") or "").strip()
        if not q:
            continue
        scores = list(it.get("scores") or _QUIZ_SCORES[: len(opts)])
        while len(scores) < len(opts):
            scores.append(scores[-1] if scores else 0)
        questions.append({"q": q, "scores": scores[: len(opts)]})
    if len(questions) < 1:
        raise ValueError("AI 返回题目为空")
    return {
        "title": (obj.get("title") or "").strip()[:30] or (topic[:24] + "自评问卷"),
        "intro": (obj.get("intro") or "").strip()[:100],
        "options": opts,
        "questions": questions,
    }


# ---------------------------------------------------------------- AI 情绪周洞察
@app.route("/api/ai/insight", methods=["POST"])
@login_required
def ai_insight():
    """AI 情绪周洞察：根据近期情绪记录 + 可选焦点，生成约 150 字中文洞察与建议。
    云端优先，云端失败/未配 Key 时回退本地算法并打印 warning 说明原因。"""
    u = current_user()
    data = request.get_json(force=True)
    focus = (data.get("focus") or "").strip()[:100]
    recent = query(
        "SELECT mood_score, emotion, note, created_at FROM mood_entries "
        "WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 28",
        (u["id"],),
    )
    nick = u["nickname"] or u["username"]
    if LLM_API_KEY:
        try:
            text = _ask_llm_insight(nick, focus, [row_to_dict(r) for r in recent])
            return jsonify({"text": text, "source": "cloud"})
        except Exception as e:
            reason = _llm_error(str(e))
            logger.warning("AI 情绪洞察云端失败，回退本地: %s", reason)
    text = _local_insight(nick, focus, [row_to_dict(r) for r in recent])
    return jsonify({"text": text, "source": "local"})


def _insight_context(recent):
    """聚合近两周情绪，生成供 AI / 本地使用的情节上下文。"""
    if not recent:
        return {"n": 0, "avg": None, "top": None, "notes": []}
    scores = [r["mood_score"] for r in recent if r.get("mood_score")]
    from collections import Counter
    cnt = Counter(str(r.get("emotion") or "平静") for r in recent)
    top = cnt.most_common(1)[0][0]
    notes = [str(r.get("note")) for r in recent if r.get("note")][:3]
    return {
        "n": len(recent),
        "avg": round(sum(scores) / len(scores), 1) if scores else None,
        "top": top,
        "notes": notes,
    }


def _ask_llm_insight(nick, focus, recent):
    """调用云端大模型生成 150 字情绪洞察。失败时抛异常交由上层回退。"""
    import urllib.request

    ctx = _insight_context(recent)
    if ctx["avg"] is not None:
        mood_block = (
            f"该用户近两周共 {ctx['n']} 条情绪记录，平均评分 {ctx['avg']}/10，"
            f"出现最多的情绪是「{ctx['top']}」。"
            + (f"留言节选：{'；'.join(ctx['notes'])}。" if ctx["notes"] else "")
        )
    else:
        mood_block = "该用户近期还没有情绪记录。"
    prompt = (
        f"你是 MindCare 的 AI 情绪洞察分析师。请为一位名为「{nick}」的学生生成一段"
        "约 150 字的中文『情绪周洞察』（可在 130-190 字之间），内容包含："
        "① 本周情绪概况与主要波动的客观描述；② 结合记录/留言线索给出的温和归因；"
        "③ 1-2 条具体、可落地、非套话的情绪调节或行动建议。\n"
        "要求：语气温暖、共情、不评判；语言自然、有细节，避免空泛口号；"
        f"不要出现『寻求专业帮助』等通用免责套话。\n"
        f"{mood_block}\n"
        f"用户可选补充（可能为空）：{focus or '无'}\n"
        "只输出正文本身，不要『标题』或『序号』，不要 markdown。"
    )
    body = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": "你是温柔共情、细节真实的中文情绪洞察写手，只输出正文。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.75,
        "max_tokens": 400,
    }
    req = urllib.request.Request(
        f"{LLM_BASE_URL}/chat/completions",
        data=jsonify_args(body),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {LLM_API_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        payload = json_loads(resp.read().decode("utf-8"))
    return payload["choices"][0]["message"]["content"].strip()


def _local_insight(nick, focus, recent):
    """本地情绪分析：无需大模型也能给出贴合记录的自然洞察。"""
    ctx = _insight_context(recent)
    if ctx["n"] == 0:
        base = (
            f"{nick}，这一周你还没有留下情绪记录。起点往往是接纳此刻的自己——"
            "不妨从今天起，每天花一分钟记下当下的心情，无论开心还是低落都值得被看见。"
        )
    else:
        if ctx["avg"] is None:
            tone = ""
        elif ctx["avg"] >= 7:
            tone = "整体情绪稳中向好"
        elif ctx["avg"] >= 5:
            tone = "情绪在中等区间缓缓起伏"
        else:
            tone = "整体情绪偏低落，需要多关照自己"
        base = f"这一周你留下了 {ctx['n']} 条心情记录，{tone}，出现最多的情绪是「{ctx['top']}」。"
        if ctx["notes"]:
            base += f"从留言里能感觉到，{ctx['notes'][0]}。"
    tip = _insight_tip(focus or ctx["top"])
    return base + tip


def _insight_tip(keyword):
    """根据关键词给 1-2 条具体、非套话的调节建议。"""
    k = keyword or ""
    if any(x in k for x in ["睡", "失眠", "熬夜"]):
        return "今晚试着把手机留在桌上，睡前 15 分钟做几次 4-7-8 呼吸，让身体先慢下来。"
    if any(x in k for x in ["焦虑", "紧张", "担心"]):
        return "焦虑常在放大不确定。试着把最担心的事写下来，划掉无法掌控的部分，只留一件明天能推进的小事。"
    if any(x in k for x in ["累", "疲惫", "没力气"]):
        return "疲惫时先允许自己休息，不必靠硬撑。午间给 10 分钟彻底放空，比硬顶更高效。"
    if any(x in k for x in ["哭", "难过", "伤心", "失落", "低落"]):
        return "情绪低落时不必强求马上振作。允许自己低电量一天，找位信任的人聊聊，或只做清单里最简单的一件。"
    if any(x in k for x in ["开心", "高兴", "平静", "放松"]):
        return "把这份好的感受留在语言里：今天具体是什么让你舒服？记下来，低落时它能提醒你。"
    return "给自己留一段不被打扰的安静时间，散步或泡杯热饮都好，把注意力放回呼吸。"


@app.route("/api/quizzes/<int:quiz_id>", methods=["GET", "DELETE"])
@login_required
def quiz_detail(quiz_id):
    u = current_user()
    row = query("SELECT * FROM quizzes WHERE id=? AND owner_id=?", (quiz_id, u["id"]), one=True)
    if not row:
        return json_err("问卷不存在", 404)
    if request.method == "DELETE":
        execute("DELETE FROM quiz_submissions WHERE quiz_id=?", (quiz_id,))
        execute("DELETE FROM quizzes WHERE id=?", (quiz_id,))
        return jsonify({"ok": True})
    return jsonify({"quiz": _quiz_payload(row)})


@app.route("/api/quizzes/<int:quiz_id>/submit", methods=["POST"])
@login_required
def submit_quiz(quiz_id):
    u = current_user()
    row = query("SELECT * FROM quizzes WHERE id=? AND owner_id=?", (quiz_id, u["id"]), one=True)
    if not row:
        return json_err("问卷不存在", 404)
    items, _ = _quiz_items_and_options(row["questions"])
    if not items:
        return json_err("问卷数据异常", 400)
    data = request.get_json(force=True)
    answers = data.get("answers") or []
    if not isinstance(answers, list) or len(answers) != len(items):
        return jsonify({"error": "答题数量与题目不一致"}), 400
    score = 0
    for i, item in enumerate(items):
        idx = answers[i]
        scores = item.get("scores") or []
        idx = int(idx) if isinstance(idx, int) or str(idx).isdigit() else 0
        idx = max(0, min(len(scores) - 1, idx))
        score += scores[idx]
    max_score = _quiz_max_score(row["questions"])
    level = _auto_level(score, max_score)
    sub_id = execute(
        "INSERT INTO quiz_submissions(quiz_id,user_id,score,max_score,level,answers) VALUES(?,?,?,?,?,?)",
        (quiz_id, u["id"], score, max_score, level, json_dumps(answers)),
    )
    return jsonify(
        {"submission": {
            "id": sub_id,
            "quiz_id": quiz_id,
            "score": score,
            "max_score": max_score,
            "level": level,
        }}
    )


@app.route("/api/quizzes/<int:quiz_id>/submissions", methods=["GET"])
@login_required
def quiz_submissions(quiz_id):
    u = current_user()
    rows = query(
        "SELECT id, score, max_score, level, created_at FROM quiz_submissions "
        "WHERE quiz_id=? AND user_id=? ORDER BY id DESC",
        (quiz_id, u["id"]),
    )
    return jsonify({"submissions": [row_to_dict(r) for r in rows]})


# ---------------------------------------------------------------- SDS 测评
def _sds_level(total):
    return "正常" if total < 53 else ("轻度抑郁" if total < 63 else ("中度抑郁" if total < 73 else "重度抑郁"))


@app.route("/api/assessments", methods=["POST"])
@login_required
def submit_assessment():
    """提交 SDS 测评：落库总分与逐题作答，中度及以上自动生成危机预警。"""
    u = current_user()
    data = request.get_json(force=True)
    try:
        total = max(20, min(80, int(data.get("total_score"))))
    except Exception:
        return jsonify({"error": "总分无效"}), 400
    level = _sds_level(total)
    aid = execute(
        "INSERT INTO assessments(user_id,total_score,level) VALUES(?,?,?)",
        (u["id"], total, level),
    )
    # 逐题作答（可选）：前端传 answers 时落库，供后台回看答题分布
    answers = data.get("answers")
    if isinstance(answers, list) and answers:
        db = get_db()
        for i, item in enumerate(answers):
            if isinstance(item, dict):
                q = str(item.get("q") or "")[:200]
                try:
                    sc = int(item.get("score"))
                except Exception:
                    sc = None
            else:
                q, sc = None, None
            db.execute(
                "INSERT INTO assessment_answers(assessment_id,user_id,question_no,question,answer_score)"
                " VALUES(?,?,?,?,?)",
                (aid, u["id"], i + 1, q, sc),
            )
        db.commit()
    alert_id = _trigger_crisis_from_assessment(u["id"], total, level)
    return jsonify({"level": level, "score": total, "assessment_id": aid, "crisis_alert": bool(alert_id)})


@app.route("/api/assessments", methods=["GET"])
@login_required
def assessments():
    u = current_user()
    page, size = _paginate()
    total = query("SELECT COUNT(*) c FROM assessments WHERE user_id=?", (u["id"],), one=True)["c"]
    rows = query(
        "SELECT id, total_score, level, created_at FROM assessments WHERE user_id=? "
        "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        (u["id"], size, (page - 1) * size),
    )
    return jsonify({
        "assessments": [row_to_dict(r) for r in rows],
        "total": total, "page": page, "size": size,
    })


@app.route("/api/assessments/<int:aid>/answers", methods=["GET"])
@login_required
def assessment_answers(aid):
    """查看某次测评的逐题作答（本人或 admin）。"""
    u = current_user()
    row = query("SELECT * FROM assessments WHERE id=?", (aid,), one=True)
    if not row:
        return json_err("测评不存在", 404)
    if row["user_id"] != u["id"] and u["role"] != "admin":
        return json_err("无权查看他人的测评明细", 403)
    rows = query(
        "SELECT question_no, question, answer_score FROM assessment_answers "
        "WHERE assessment_id=? ORDER BY question_no",
        (aid,),
    )
    return jsonify({"assessment": row_to_dict(row), "answers": [row_to_dict(r) for r in rows]})


# ---------------------------------------------------------------- 冥想
@app.route("/api/meditation", methods=["POST"])
@login_required
def meditation():
    u = current_user()
    data = request.get_json(force=True)
    try:
        duration = max(1, min(3600, int(data.get("duration", 300))))
    except Exception:
        return jsonify({"error": "时长无效"}), 400
    execute("INSERT INTO meditation_sessions(user_id,duration) VALUES(?,?)", (u["id"], duration))
    return jsonify({"ok": True})


# ---------------------------------------------------------------- 个人汇总
@app.route("/api/summary", methods=["GET"])
@login_required
def summary():
    u = current_user()
    avg = query("SELECT AVG(mood_score) a FROM mood_entries WHERE user_id=?", (u["id"],), one=True)
    n_mood = query("SELECT COUNT(*) c FROM mood_entries WHERE user_id=?", (u["id"],), one=True)["c"]
    n_med = query("SELECT COUNT(*) c FROM meditation_sessions WHERE user_id=?", (u["id"],), one=True)["c"]
    tot_med = query("SELECT COALESCE(SUM(duration),0) s FROM meditation_sessions WHERE user_id=?", (u["id"],), one=True)["s"]
    last = query(
        "SELECT level, created_at FROM assessments WHERE user_id=? ORDER BY id DESC LIMIT 1",
        (u["id"],),
        one=True,
    )
    return jsonify(
        {
            "avg_mood": round(avg["a"], 1) if avg["a"] is not None else None,
            "mood_count": n_mood,
            "meditation_count": n_med,
            "meditation_total_sec": tot_med,
            "last_assessment": row_to_dict(last),
        }
    )


# ---------------------------------------------------------------- Admin 仪表盘
def date_trunc_col_expr():
    return "date(created_at)"


@app.route("/api/admin/overview", methods=["GET"])
@admin_required
def admin_overview():
    # 注册与活跃
    total_users = query("SELECT COUNT(*) c FROM users", one=True)["c"]
    user_count = total_users - 1  # 扣除 admin
    # 近14天情绪趋势（所有用户）
    mood_trend = query(
        "SELECT date(created_at) d, AVG(mood_score) a, COUNT(*) c FROM mood_entries "
        "WHERE created_at >= datetime('now','localtime','-13 day') GROUP BY date(created_at) ORDER BY d"
    )
    # 情绪分布（emotion 标签）
    emotion_dist = query(
        "SELECT COALESCE(emotion,'未标注') label, COUNT(*) c FROM mood_entries "
        "WHERE created_at >= datetime('now','localtime','-30 day') GROUP BY label ORDER BY c DESC LIMIT 8"
    )
    # 预警：最新测评为中重度以上的用户
    risk_users = query(
        "SELECT u.id, u.username, u.nickname, a.total_score, a.level, a.created_at "
        "FROM assessments a JOIN users u ON u.id=a.user_id "
        "WHERE a.id IN (SELECT MAX(id) FROM assessments GROUP BY user_id) "
        "AND a.level != '正常' ORDER BY a.total_score DESC LIMIT 20"
    )
    # 测评统计
    a_count = query("SELECT COUNT(*) c FROM assessments", one=True)["c"]
    levels = query(
        "SELECT level, COUNT(*) c FROM assessments GROUP BY level"
    )
    # 每日活跃（写情绪的独立用户数）近7天
    active = query(
        "SELECT date(created_at) d, COUNT(DISTINCT user_id) c FROM mood_entries "
        "WHERE created_at >= datetime('now','localtime','-6 day') GROUP BY d ORDER BY d"
    )
    # 危机预警概览
    alert_stats = query("SELECT status, COUNT(*) c FROM crisis_alerts GROUP BY status")
    alert_levels = query("SELECT level, COUNT(*) c FROM crisis_alerts GROUP BY level")
    open_alerts = query(
        "SELECT ca.id, ca.trigger_type, ca.level, ca.detail, ca.created_at, u.nickname "
        "FROM crisis_alerts ca JOIN users u ON u.id=ca.user_id "
        "WHERE ca.status='open' ORDER BY ca.created_at DESC, ca.id DESC LIMIT 8"
    )
    # 预约概览
    appt_stats = query("SELECT status, COUNT(*) c FROM appointments GROUP BY status")
    appt_recent = query(
        "SELECT a.id, a.slot, a.topic, a.status, a.created_at, c.name AS counselor_name, u.nickname "
        "FROM appointments a JOIN counselors c ON c.id=a.counselor_id "
        "JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC, a.id DESC LIMIT 8"
    )
    counselor_top = query(
        "SELECT id, name, avatar, rating, rating_count, specialties FROM counselors "
        "ORDER BY rating DESC, rating_count DESC LIMIT 5"
    )
    return jsonify(
        {
            "total_users": total_users,
            "user_count": user_count,
            "mood_trend": [row_to_dict(r) for r in mood_trend],
            "emotion_dist": [row_to_dict(r) for r in emotion_dist],
            "risk_users": [row_to_dict(r) for r in risk_users],
            "assessment_count": a_count,
            "assessment_levels": [row_to_dict(r) for r in levels],
            "active_users": [row_to_dict(r) for r in active],
            "crisis_stats": {r["status"]: r["c"] for r in alert_stats},
            "crisis_levels": [row_to_dict(r) for r in alert_levels],
            "open_alerts": [row_to_dict(r) for r in open_alerts],
            "appointment_stats": {r["status"]: r["c"] for r in appt_stats},
            "recent_appointments": [row_to_dict(r) for r in appt_recent],
            "top_counselors": [row_to_dict(r) for r in counselor_top],
            "resource_count": query("SELECT COUNT(*) c FROM resources", one=True)["c"],
        }
    )


@app.route("/api/admin/users", methods=["GET"])
@admin_required
def admin_users():
    q = (request.args.get("q") or "").strip()
    page = max(1, request.args.get("page", default=1, type=int))
    size = min(100, max(1, request.args.get("size", default=20, type=int)))
    where = "WHERE 1=1"
    args = []
    if q:
        where += " AND (username LIKE ? OR nickname LIKE ?)"
        like = f"%{q}%"
        args += [like, like]
    total = query(f"SELECT COUNT(*) c FROM users {where}", args, one=True)["c"]
    rows = query(
        f"SELECT id, username, nickname, role, created_at FROM users {where} "
        "ORDER BY created_at DESC LIMIT ? OFFSET ?",
        args + [size, (page - 1) * size],
    )
    return jsonify({"users": [row_to_dict(r) for r in rows], "total": total, "page": page, "size": size})


# ---------------------------------------------------------------- 通用：多角色鉴权 / user_prefs JSON
def roles_required(*roles):
    """限定角色访问；未登录 401，角色不符 403。"""

    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            u = current_user()
            if not u:
                return jsonify({"error": "未登录或登录已过期"}), 401
            if u["role"] not in roles:
                return jsonify({"error": "无权限访问该资源"}), 403
            return fn(*a, **kw)

        return wrapper

    return deco


def _pref_json(uid, key, default):
    row = query("SELECT value FROM user_prefs WHERE user_id=? AND key=?", (uid, key), one=True)
    if not row or not row["value"]:
        return default
    try:
        return json_loads(row["value"])
    except Exception:
        return default


def _set_pref_json(uid, key, value):
    db = get_db()
    db.execute(
        "INSERT INTO user_prefs(user_id,key,value) VALUES(?,?,?) "
        "ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value",
        (uid, key, json_dumps(value)),
    )
    db.commit()


def _paginate():
    page = max(1, request.args.get("page", default=1, type=int))
    size = min(100, max(1, request.args.get("size", default=20, type=int)))
    return page, size


# ---------------------------------------------------------------- 危机预警：自动触发
def _trigger_crisis_from_assessment(uid, total, level):
    """测评达到中度及以上时自动生成预警；同一次测评只生成一条。"""
    if level not in ("中度抑郁", "重度抑郁"):
        return None
    tag = "high" if level == "重度抑郁" else "medium"
    detail = "SDS 测评得分 %d，评定为%s（中度及以上）" % (total, level)
    return execute(
        "INSERT INTO crisis_alerts(user_id,trigger_type,level,detail,status) VALUES(?,?,?,?,'open')",
        (uid, "assessment", tag, detail),
    )


def _check_mood_streak(uid):
    """情绪连续 3 天 ≤3 分时生成预警；同一自然日内不重复生成。"""
    rows = query(
        "SELECT date(created_at) d, MIN(mood_score) mn FROM mood_entries WHERE user_id=? "
        "GROUP BY date(created_at) ORDER BY d DESC LIMIT 3",
        (uid,),
    )
    if len(rows) < 3:
        return None
    if not all(r["mn"] is not None and r["mn"] <= 3 for r in rows):
        return None
    exists = query(
        "SELECT 1 FROM crisis_alerts WHERE user_id=? AND trigger_type='mood' "
        "AND date(created_at)=date('now','localtime')",
        (uid,),
        one=True,
    )
    if exists:
        return None
    detail = "情绪记录连续 3 天评分 ≤ 3 分（%s）" % "/".join(str(r["mn"]) for r in rows)
    return execute(
        "INSERT INTO crisis_alerts(user_id,trigger_type,level,detail,status) VALUES(?,?,?,?,'open')",
        (uid, "mood", "medium", detail),
    )


# ---------------------------------------------------------------- 咨询师
def _counselor_payload(row):
    c = row_to_dict(row)
    if not c:
        return None
    c["specialties"] = [s for s in (c.get("specialties") or "").split(",") if s]
    try:
        c["slots"] = json_loads(c.get("slots") or "[]")
    except Exception:
        c["slots"] = []
    return c


@app.route("/api/counselors", methods=["GET"])
@login_required
def list_counselors():
    q = (request.args.get("q") or "").strip()
    spec = (request.args.get("specialty") or "").strip()
    page, size = _paginate()
    where = "WHERE active=1"
    args = []
    if q:
        where += " AND (name LIKE ? OR title LIKE ? OR specialties LIKE ? OR intro LIKE ?)"
        like = f"%{q}%"
        args += [like, like, like, like]
    if spec:
        where += " AND specialties LIKE ?"
        args.append(f"%{spec}%")
    total = query(f"SELECT COUNT(*) c FROM counselors {where}", args, one=True)["c"]
    rows = query(
        f"SELECT * FROM counselors {where} ORDER BY rating DESC, id LIMIT ? OFFSET ?",
        args + [size, (page - 1) * size],
    )
    # 擅长领域聚合，供前端做筛选条
    cats = query("SELECT specialties FROM counselors WHERE active=1")
    pool = []
    for r in cats:
        for s in (r["specialties"] or "").split(","):
            if s and s not in pool:
                pool.append(s)
    return jsonify({
        "counselors": [_counselor_payload(r) for r in rows],
        "specialties": pool,
        "total": total, "page": page, "size": size,
    })


@app.route("/api/counselors/<int:cid>", methods=["GET"])
@login_required
def counselor_detail(cid):
    row = query("SELECT * FROM counselors WHERE id=?", (cid,), one=True)
    if not row:
        return json_err("咨询师不存在", 404)
    data = _counselor_payload(row)
    # 已被预约占用的时段（未取消的），前端置灰
    taken = query(
        "SELECT slot FROM appointments WHERE counselor_id=? AND status IN ('pending','confirmed')",
        (cid,),
    )
    data["taken_slots"] = sorted({r["slot"] for r in taken})
    return jsonify({"counselor": data})


# ---------------------------------------------------------------- 预约状态机
APPT_TRANSITIONS = {
    "pending": {"confirmed", "cancelled"},
    "confirmed": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}
# 谁能把预约推进到某状态
APPT_ACTORS = {
    "confirmed": ("counselor", "admin"),
    "completed": ("counselor", "admin"),
    "cancelled": ("user", "counselor", "admin"),
}


def _appt_payload(row):
    a = row_to_dict(row)
    if not a:
        return None
    a["counselor_name"] = a.pop("cname", None)
    a["counselor_title"] = a.pop("ctitle", None)
    a["counselor_avatar"] = a.pop("cavatar", None)
    a["user_nickname"] = a.pop("unick", None)
    a["available_actions"] = sorted(APPT_TRANSITIONS.get(a["status"], set()))
    return a


APPT_SELECT = (
    "SELECT a.*, c.name AS cname, c.title AS ctitle, c.avatar AS cavatar, u.nickname AS unick "
    "FROM appointments a JOIN counselors c ON c.id=a.counselor_id "
    "JOIN users u ON u.id=a.user_id "
)


@app.route("/api/appointments", methods=["GET"])
@login_required
def list_appointments():
    u = current_user()
    status = (request.args.get("status") or "").strip()
    q = (request.args.get("q") or "").strip()
    page, size = _paginate()
    where, args = "WHERE 1=1", []
    if u["role"] == "counselor":
        own = query("SELECT id FROM counselors WHERE user_id=?", (u["id"],), one=True)
        if not own:
            return jsonify({"appointments": [], "total": 0, "page": page, "size": size})
        where += " AND a.counselor_id=?"
        args.append(own["id"])
    elif u["role"] != "admin":
        where += " AND a.user_id=?"
        args.append(u["id"])
    if status:
        if status not in APPT_TRANSITIONS:
            return json_err("状态值非法", 400)
        where += " AND a.status=?"
        args.append(status)
    if q:
        where += " AND (a.topic LIKE ? OR c.name LIKE ?)"
        like = f"%{q}%"
        args += [like, like]
    total = query(
        f"SELECT COUNT(*) c FROM appointments a JOIN counselors c ON c.id=a.counselor_id {where}",
        args, one=True,
    )["c"]
    rows = query(
        APPT_SELECT + where + " ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?",
        args + [size, (page - 1) * size],
    )
    counts = query(
        "SELECT status, COUNT(*) c FROM appointments a JOIN counselors c ON c.id=a.counselor_id "
        + where + " GROUP BY status",
        args,
    ) if False else None
    return jsonify({
        "appointments": [_appt_payload(r) for r in rows],
        "total": total, "page": page, "size": size,
    })


@app.route("/api/appointments/stats", methods=["GET"])
@login_required
def appointment_stats():
    u = current_user()
    if u["role"] == "counselor":
        own = query("SELECT id FROM counselors WHERE user_id=?", (u["id"],), one=True)
        if not own:
            return jsonify({"stats": {}})
        rows = query(
            "SELECT status, COUNT(*) c FROM appointments WHERE counselor_id=? GROUP BY status",
            (own["id"],),
        )
    elif u["role"] == "admin":
        rows = query("SELECT status, COUNT(*) c FROM appointments GROUP BY status")
    else:
        rows = query(
            "SELECT status, COUNT(*) c FROM appointments WHERE user_id=? GROUP BY status",
            (u["id"],),
        )
    stats = {s: 0 for s in APPT_TRANSITIONS}
    for r in rows:
        stats[r["status"]] = r["c"]
    return jsonify({"stats": stats})


@app.route("/api/appointments", methods=["POST"])
@login_required
def create_appointment():
    u = current_user()
    data = request.get_json(force=True)
    try:
        cid = int(data.get("counselor_id"))
    except Exception:
        return json_err("请选择咨询师", 400)
    slot = (data.get("slot") or "").strip()
    if not slot:
        return json_err("请选择预约时段", 400)
    topic = (data.get("topic") or "").strip()[:100]
    note = (data.get("note") or "").strip()[:500]
    c = query("SELECT * FROM counselors WHERE id=? AND active=1", (cid,), one=True)
    if not c:
        return json_err("咨询师不存在", 404)
    try:
        valid_slots = json_loads(c["slots"] or "[]")
    except Exception:
        valid_slots = []
    if valid_slots and slot not in valid_slots:
        return json_err("该时段不在咨询师排班内", 400)
    dup = query(
        "SELECT 1 FROM appointments WHERE counselor_id=? AND slot=? AND status IN ('pending','confirmed')",
        (cid, slot), one=True,
    )
    if dup:
        return json_err("该时段已被预约，请选择其他时段", 400)
    aid = execute(
        "INSERT INTO appointments(user_id,counselor_id,slot,topic,note,status) VALUES(?,?,?,?,?,'pending')",
        (u["id"], cid, slot, topic or None, note or None),
    )
    row = query(APPT_SELECT + "WHERE a.id=?", (aid,), one=True)
    return jsonify({"appointment": _appt_payload(row)}), 201


def _can_act(u, appt):
    """返回当前用户对该预约可执行的动作集合。"""
    actions = set()
    if u["role"] == "admin":
        actions = set(APPT_TRANSITIONS.get(appt["status"], set()))
    elif u["role"] == "counselor":
        own = query("SELECT id FROM counselors WHERE user_id=?", (u["id"],), one=True)
        if own and own["id"] == appt["counselor_id"]:
            actions = {"confirmed", "completed", "cancelled"} & APPT_TRANSITIONS.get(appt["status"], set())
    elif appt["user_id"] == u["id"]:
        actions = {"cancelled"} & APPT_TRANSITIONS.get(appt["status"], set())
    return actions


@app.route("/api/appointments/<int:aid>/transition", methods=["POST"])
@login_required
def transition_appointment(aid):
    u = current_user()
    row = query("SELECT * FROM appointments WHERE id=?", (aid,), one=True)
    if not row:
        return json_err("预约不存在", 404)
    # 越权：与该预约无关的用户直接 403（不泄露存在性给完全无关的人）
    if u["role"] == "user" and row["user_id"] != u["id"]:
        return json_err("无权操作他人的预约", 403)
    if u["role"] == "counselor":
        own = query("SELECT id FROM counselors WHERE user_id=?", (u["id"],), one=True)
        if not own or own["id"] != row["counselor_id"]:
            return json_err("无权操作该咨询师的预约", 403)

    data = request.get_json(force=True)
    target = (data.get("to") or data.get("action") or "").strip()
    if target not in APPT_TRANSITIONS:
        return json_err("目标状态非法", 400)
    allowed = _can_act(u, row)
    if target not in allowed:
        return json_err(
            "非法的状态流转：%s → %s（当前身份%s）" % (
                row["status"], target,
                "可执行 " + "/".join(sorted(allowed)) if allowed else "无权操作",
            ),
            400,
        )
    execute(
        "UPDATE appointments SET status=?, updated_at=datetime('now','localtime') WHERE id=?",
        (target, aid),
    )
    # 完成时同步刷新咨询师评分计数
    if target == "completed":
        execute(
            "UPDATE counselors SET rating_count=rating_count+1 WHERE id=?",
            (row["counselor_id"],),
        )
    new_row = query(APPT_SELECT + "WHERE a.id=?", (aid,), one=True)
    return jsonify({"appointment": _appt_payload(new_row)})


@app.route("/api/appointments/<int:aid>/review", methods=["POST"])
@login_required
def review_appointment(aid):
    u = current_user()
    row = query("SELECT * FROM appointments WHERE id=?", (aid,), one=True)
    if not row:
        return json_err("预约不存在", 404)
    if row["user_id"] != u["id"] and u["role"] != "admin":
        return json_err("只能评价自己的预约", 403)
    if row["status"] != "completed":
        return json_err("仅已完成的预约可以评价", 400)
    if row["review_score"]:
        return json_err("该预约已评价过", 400)
    data = request.get_json(force=True)
    try:
        score = int(data.get("score"))
    except Exception:
        return json_err("评分需为 1-5 的整数", 400)
    if not 1 <= score <= 5:
        return json_err("评分需为 1-5 的整数", 400)
    text = (data.get("text") or "").strip()[:300]
    execute(
        "UPDATE appointments SET review_score=?, review_text=?, reviewed_at=datetime('now','localtime') WHERE id=?",
        (score, text or None, aid),
    )
    # 用真实评价均值回写咨询师评分
    avg = query(
        "SELECT AVG(review_score) a FROM appointments WHERE counselor_id=? AND review_score IS NOT NULL",
        (row["counselor_id"],), one=True,
    )
    if avg and avg["a"] is not None:
        execute("UPDATE counselors SET rating=? WHERE id=?", (round(avg["a"], 1), row["counselor_id"]))
    new_row = query(APPT_SELECT + "WHERE a.id=?", (aid,), one=True)
    return jsonify({"appointment": _appt_payload(new_row)})


# ---------------------------------------------------------------- 危机预警
def _alert_payload(row):
    a = row_to_dict(row)
    if not a:
        return None
    a["user_nickname"] = a.pop("unick", None)
    a["handler_nickname"] = a.pop("hnick", None)
    return a


ALERT_SELECT = (
    "SELECT ca.*, u.nickname AS unick, h.nickname AS hnick FROM crisis_alerts ca "
    "JOIN users u ON u.id=ca.user_id LEFT JOIN users h ON h.id=ca.handler_id "
)


@app.route("/api/crisis-alerts", methods=["GET"])
@roles_required("counselor", "admin")
def list_crisis_alerts():
    status = (request.args.get("status") or "").strip()
    level = (request.args.get("level") or "").strip()
    q = (request.args.get("q") or "").strip()
    page, size = _paginate()
    where, args = "WHERE 1=1", []
    if status:
        if status not in ("open", "handled", "dismissed"):
            return json_err("状态值非法", 400)
        where += " AND ca.status=?"
        args.append(status)
    if level:
        if level not in ("low", "medium", "high"):
            return json_err("等级值非法", 400)
        where += " AND ca.level=?"
        args.append(level)
    if q:
        where += " AND (u.nickname LIKE ? OR u.username LIKE ? OR ca.detail LIKE ?)"
        like = f"%{q}%"
        args += [like, like, like]
    total = query(
        f"SELECT COUNT(*) c FROM crisis_alerts ca JOIN users u ON u.id=ca.user_id {where}",
        args, one=True,
    )["c"]
    rows = query(
        ALERT_SELECT + where + " ORDER BY (ca.status='open') DESC, ca.created_at DESC, ca.id DESC LIMIT ? OFFSET ?",
        args + [size, (page - 1) * size],
    )
    stats = query("SELECT status, COUNT(*) c FROM crisis_alerts GROUP BY status")
    return jsonify({
        "alerts": [_alert_payload(r) for r in rows],
        "stats": {r["status"]: r["c"] for r in stats},
        "total": total, "page": page, "size": size,
    })


@app.route("/api/crisis-alerts/<int:aid>", methods=["GET"])
@roles_required("counselor", "admin")
def crisis_alert_detail(aid):
    row = query(ALERT_SELECT + "WHERE ca.id=?", (aid,), one=True)
    if not row:
        return json_err("预警不存在", 404)
    return jsonify({"alert": _alert_payload(row)})


@app.route("/api/crisis-alerts/<int:aid>/handle", methods=["POST"])
@roles_required("counselor", "admin")
def handle_crisis_alert(aid):
    u = current_user()
    row = query("SELECT * FROM crisis_alerts WHERE id=?", (aid,), one=True)
    if not row:
        return json_err("预警不存在", 404)
    if row["status"] != "open":
        return json_err("该预警已处理，无法重复处理", 400)
    data = request.get_json(force=True)
    action = (data.get("action") or "").strip()
    if action not in ("contact", "refer", "dismiss"):
        return json_err("处理方式需为 contact / refer / dismiss", 400)
    note = (data.get("note") or "").strip()[:500]
    if action != "dismiss" and not note:
        return json_err("请填写处理记录", 400)
    status = "dismissed" if action == "dismiss" else "handled"
    execute(
        "UPDATE crisis_alerts SET status=?, handler_id=?, handle_action=?, handle_note=?, "
        "handled_at=datetime('now','localtime') WHERE id=?",
        (status, u["id"], action, note or None, aid),
    )
    new_row = query(ALERT_SELECT + "WHERE ca.id=?", (aid,), one=True)
    return jsonify({"alert": _alert_payload(new_row)})


@app.route("/api/crisis-alerts/mine", methods=["GET"])
@login_required
def my_crisis_alerts():
    """普通用户查看自己的预警提示（不含他人与处理人信息）。"""
    u = current_user()
    rows = query(
        "SELECT id, trigger_type, level, detail, status, created_at FROM crisis_alerts "
        "WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
        (u["id"],),
    )
    return jsonify({"alerts": [row_to_dict(r) for r in rows]})


# ---------------------------------------------------------------- 心理科普资源库
def _resource_payload(row, uid=None, collected=None, progress=None):
    r = row_to_dict(row)
    if not r:
        return None
    r["is_mine"] = bool(uid and r.get("user_id") == uid)
    if collected is not None:
        r["collected"] = r["id"] in collected
    if progress is not None:
        r["progress"] = progress.get(str(r["id"]), 0)
    # 列表场景不带正文，降低载荷
    return r


@app.route("/api/resources", methods=["GET"])
@login_required
def list_resources():
    u = current_user()
    category = (request.args.get("category") or "").strip()
    kind = (request.args.get("kind") or "").strip()
    q = (request.args.get("q") or "").strip()
    only_mine = request.args.get("mine") in ("1", "true")
    page, size = _paginate()
    # 公共文章 + 自己的私人报告
    where = "WHERE (user_id IS NULL OR user_id=?)"
    args = [u["id"]]
    if only_mine:
        where = "WHERE user_id=?"
        args = [u["id"]]
    if category:
        where += " AND category=?"
        args.append(category)
    if kind:
        where += " AND kind=?"
        args.append(kind)
    if q:
        where += " AND (title LIKE ? OR summary LIKE ?)"
        like = f"%{q}%"
        args += [like, like]
    total = query(f"SELECT COUNT(*) c FROM resources {where}", args, one=True)["c"]
    rows = query(
        f"SELECT id, user_id, kind, category, title, summary, source, read_minutes, created_at "
        f"FROM resources {where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        args + [size, (page - 1) * size],
    )
    collected = set(_pref_json(u["id"], "collected_resources", []))
    progress = _pref_json(u["id"], "reading_progress", {})
    cats = query(
        "SELECT category, COUNT(*) c FROM resources WHERE user_id IS NULL AND category IS NOT NULL "
        "GROUP BY category ORDER BY c DESC"
    )
    return jsonify({
        "resources": [_resource_payload(r, u["id"], collected, progress) for r in rows],
        "categories": [row_to_dict(r) for r in cats],
        "total": total, "page": page, "size": size,
    })


@app.route("/api/resources/<int:rid>", methods=["GET"])
@login_required
def resource_detail(rid):
    u = current_user()
    row = query("SELECT * FROM resources WHERE id=? AND (user_id IS NULL OR user_id=?)", (rid, u["id"]), one=True)
    if not row:
        return json_err("资源不存在", 404)
    collected = set(_pref_json(u["id"], "collected_resources", []))
    progress = _pref_json(u["id"], "reading_progress", {})
    return jsonify({"resource": _resource_payload(row, u["id"], collected, progress)})


@app.route("/api/resources/<int:rid>/collect", methods=["POST"])
@login_required
def collect_resource(rid):
    u = current_user()
    row = query("SELECT 1 FROM resources WHERE id=? AND (user_id IS NULL OR user_id=?)", (rid, u["id"]), one=True)
    if not row:
        return json_err("资源不存在", 404)
    collected = _pref_json(u["id"], "collected_resources", [])
    if rid in collected:
        collected = [x for x in collected if x != rid]
        on = False
    else:
        collected.append(rid)
        on = True
    _set_pref_json(u["id"], "collected_resources", collected)
    return jsonify({"collected": on, "count": len(collected)})


@app.route("/api/resources/<int:rid>/progress", methods=["POST"])
@login_required
def resource_progress(rid):
    u = current_user()
    row = query("SELECT 1 FROM resources WHERE id=? AND (user_id IS NULL OR user_id=?)", (rid, u["id"]), one=True)
    if not row:
        return json_err("资源不存在", 404)
    data = request.get_json(force=True)
    try:
        pct = max(0, min(100, int(data.get("progress", 0))))
    except Exception:
        return json_err("进度需为 0-100 的整数", 400)
    progress = _pref_json(u["id"], "reading_progress", {})
    progress[str(rid)] = pct
    _set_pref_json(u["id"], "reading_progress", progress)
    return jsonify({"progress": pct})


@app.route("/api/resources/collected", methods=["GET"])
@login_required
def collected_resources():
    u = current_user()
    ids = _pref_json(u["id"], "collected_resources", [])
    if not ids:
        return jsonify({"resources": []})
    marks = ",".join("?" * len(ids))
    rows = query(
        "SELECT id, user_id, kind, category, title, summary, source, read_minutes, created_at "
        "FROM resources WHERE id IN (%s) AND (user_id IS NULL OR user_id=?) ORDER BY id DESC" % marks,
        ids + [u["id"]],
    )
    progress = _pref_json(u["id"], "reading_progress", {})
    return jsonify({"resources": [_resource_payload(r, u["id"], set(ids), progress) for r in rows]})


# ---------------------------------------------------------------- AI 情绪周报（落库到 resources）
def _weekly_context(uid):
    rows = query(
        "SELECT mood_score, emotion, note FROM mood_entries "
        "WHERE user_id=? AND created_at >= datetime('now','localtime','-7 day') ORDER BY created_at",
        (uid,),
    )
    if not rows:
        return None
    from collections import Counter
    scores = [r["mood_score"] for r in rows]
    cnt = Counter(str(r["emotion"] or "平静") for r in rows)
    daily = query(
        "SELECT date(created_at) d, MIN(mood_score) mn, AVG(mood_score) av FROM mood_entries "
        "WHERE user_id=? AND created_at >= datetime('now','localtime','-7 day') "
        "GROUP BY date(created_at) ORDER BY d",
        (uid,),
    )
    return {
        "n": len(rows),
        "days": len(daily),
        "avg": round(sum(scores) / len(scores), 1),
        "top": cnt.most_common(1)[0][0],
        "dist": cnt.most_common(3),
        "notes": [str(r["note"]) for r in rows if r["note"]][:4],
        "low_days": [r["d"] for r in daily if r["mn"] is not None and r["mn"] <= 4],
        "high_days": [r["d"] for r in daily if r["av"] is not None and r["av"] >= 7],
    }


def _local_weekly_report(nick, ctx):
    """无 Key / 云端失败时的本地周报生成。"""
    if not ctx:
        return (
            "%s，这一周你还没有留下情绪记录。\n\n"
            "周报的价值在于「被看见」——它需要一点原料。从今天起，每天花一分钟记下当下的心情，"
            "哪怕只写一个词。一周之后回看，你会发现自己情绪的节律，比想象中更有规律。\n\n"
            "下周建议：先把「每天记录一次」当成唯一目标，不追求写得好看。" % nick
        )
    tone = ("整体情绪稳中向好" if ctx["avg"] >= 7 else
            ("情绪在中等区间缓缓起伏" if ctx["avg"] >= 5 else "整体情绪偏低落，需要多关照自己"))
    parts = [
        "这一周你留下了 %d 条记录，覆盖 %d 天，平均 %.1f 分，%s，出现最多的情绪是「%s」。"
        % (ctx["n"], ctx["days"], ctx["avg"], tone, ctx["top"])
    ]
    dist = "、".join("%s %d 次" % (k, v) for k, v in ctx["dist"])
    if dist:
        parts.append("情绪分布：%s。" % dist)
    if ctx["notes"]:
        parts.append("从你的留言里能感觉到，「%s」这件事占据了不小的位置。" % ctx["notes"][0][:40])
    if ctx["low_days"]:
        parts.append("值得注意的是，%s 这几天的情绪明显偏低，可以回看那几天发生了什么。" % "、".join(ctx["low_days"][:3]))
    if ctx["high_days"]:
        parts.append("而 %s 状态不错——记住那种状态下的生活节奏，它比任何建议都更有参考价值。" % "、".join(ctx["high_days"][:3]))
    tip = _insight_tip(ctx["top"])
    parts.append("下周可以试一件事：%s" % tip)
    return "\n\n".join(parts)


def _ask_llm_weekly(nick, ctx):
    """云端生成周报正文；失败抛异常由上层回退。"""
    import urllib.request

    if ctx:
        block = (
            "近 7 天共 %d 条记录，覆盖 %d 天，平均 %.1f/10，最多情绪「%s」，情绪分布 %s。"
            % (ctx["n"], ctx["days"], ctx["avg"], ctx["top"],
               "；".join("%s %d 次" % (k, v) for k, v in ctx["dist"]))
            + ("留言节选：%s。" % "；".join(ctx["notes"]) if ctx["notes"] else "")
            + ("情绪明显偏低的日子：%s。" % "、".join(ctx["low_days"]) if ctx["low_days"] else "")
            + ("状态较好的日子：%s。" % "、".join(ctx["high_days"]) if ctx["high_days"] else "")
        )
    else:
        block = "该用户近 7 天没有任何情绪记录。"
    prompt = (
        "你是 MindCare 的 AI 情绪周报分析师。请为一位名为「%s」的学生撰写一份中文『情绪周报』，"
        "约 300-400 字，分 3 个自然段：\n"
        "① 本周情绪概况（平均分、主要情绪、波动日期的客观描述）；\n"
        "② 结合留言线索的温和归因；\n"
        "③ 2-3 条具体、可落地、非套话的下周行动建议。\n"
        "要求：语气温暖、共情、不评判；用具体细节代替空泛口号；不要出现『寻求专业帮助』等通用免责套话；"
        "不要使用 markdown 标题或序号。\n"
        "%s\n只输出正文本身。"
    ) % (nick, block)
    body = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": "你是温柔共情、细节真实的中文情绪周报写手，只输出正文。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.75,
        "max_tokens": 900,
    }
    req = urllib.request.Request(
        f"{LLM_BASE_URL}/chat/completions",
        data=jsonify_args(body),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {LLM_API_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        payload = json_loads(resp.read().decode("utf-8"))
    return payload["choices"][0]["message"]["content"].strip()


def _generate_weekly_report(u):
    """生成并落库一份周报，返回 (resource_dict, source)。"""
    nick = u["nickname"] or u["username"]
    ctx = _weekly_context(u["id"])
    source = "local"
    text = None
    if LLM_API_KEY:
        try:
            text = _ask_llm_weekly(nick, ctx)
            source = "cloud"
        except Exception as e:
            logger.warning("AI 周报云端失败，回退本地: %s", _llm_error(str(e)))
    if not text:
        text = _local_weekly_report(nick, ctx)
        source = "local"
    summary = (ctx["top"] + "为主的一周" if ctx else "本周暂无情绪记录") + \
              ("，平均 %.1f 分" % ctx["avg"] if ctx else "")
    rid = execute(
        "INSERT INTO resources(user_id,kind,category,title,summary,content,source,read_minutes) "
        "VALUES(?,'weekly_report','AI 周报',?,?,?,?,3)",
        (u["id"], "情绪周报 · " + datetime.now().strftime("%m月%d日"), summary, text, source),
    )
    row = query("SELECT * FROM resources WHERE id=?", (rid,), one=True)
    return _resource_payload(row, u["id"], set(), {}), source


@app.route("/api/ai/weekly-report", methods=["GET", "POST"])
@login_required
def weekly_report():
    u = current_user()
    if request.method == "GET":
        row = query(
            "SELECT * FROM resources WHERE user_id=? AND kind='weekly_report' ORDER BY id DESC LIMIT 1",
            (u["id"],), one=True,
        )
        return jsonify({"report": _resource_payload(row, u["id"], set(), {}) if row else None})
    report, source = _generate_weekly_report(u)
    return jsonify({"report": report, "source": source}), 201


# ---------------------------------------------------------------- 首页聚合（含周报）
@app.route("/api/dashboard", methods=["GET"])
@login_required
def dashboard():
    """首页一次性聚合：概览 + 最新周报 + 我的预警 + 待办预约。"""
    u = current_user()
    avg = query("SELECT AVG(mood_score) a, COUNT(*) c FROM mood_entries WHERE user_id=?", (u["id"],), one=True)
    last = query(
        "SELECT total_score, level, created_at FROM assessments WHERE user_id=? ORDER BY id DESC LIMIT 1",
        (u["id"],), one=True,
    )
    report = query(
        "SELECT id, title, summary, source, created_at FROM resources "
        "WHERE user_id=? AND kind='weekly_report' ORDER BY id DESC LIMIT 1",
        (u["id"],), one=True,
    )
    upcoming = query(
        APPT_SELECT + "WHERE a.user_id=? AND a.status IN ('pending','confirmed') "
        "ORDER BY a.created_at DESC LIMIT 3",
        (u["id"],),
    )
    alerts = query(
        "SELECT COUNT(*) c FROM crisis_alerts WHERE user_id=? AND status='open'",
        (u["id"],), one=True,
    )["c"]
    n_med = query("SELECT COUNT(*) c FROM meditation_sessions WHERE user_id=?", (u["id"],), one=True)["c"]
    return jsonify({
        "avg_mood": round(avg["a"], 1) if avg["a"] is not None else None,
        "mood_count": avg["c"],
        "meditation_count": n_med,
        "last_assessment": row_to_dict(last),
        "weekly_report": row_to_dict(report),
        "upcoming_appointments": [_appt_payload(r) for r in upcoming],
        "open_alerts": alerts,
    })


# ---------------------------------------------------------------- 静态托管（前端 dist，单端口部署）
FRONTEND_DIST = os.path.join(BASE_DIR, "..", "frontend", "dist")


@app.route("/")
def index():
    """有前端构建产物就托管首页，否则回退到 API 健康信息。"""
    if os.path.isfile(os.path.join(FRONTEND_DIST, "index.html")):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return jsonify({"app": "MindCare", "api": "ok"})


@app.route("/<path:path>")
def spa_fallback(path):
    """前端路由回退：命中真实文件则直出，否则交给 index.html（SPA 深链可达）。
    /api/* 未匹配的路径保持 JSON 404，避免把接口错误伪装成页面。"""
    if path.startswith("api/"):
        return json_err("接口不存在", 404)
    full = os.path.join(FRONTEND_DIST, path)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND_DIST, path)
    if os.path.isfile(os.path.join(FRONTEND_DIST, "index.html")):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return json_err("接口不存在", 404)


if __name__ == "__main__":
    init_db()
    port = int(os.getenv("PORT", "4101"))
    debug = os.getenv("FLASK_DEBUG", "").lower() in ("1", "true", "on")
    app.run(host="0.0.0.0", port=port, debug=debug)