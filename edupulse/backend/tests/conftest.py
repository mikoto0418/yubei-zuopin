# -*- coding: utf-8 -*-
# pytest 共享夹具：使用独立临时数据库，隔离开发库
import json
import os
import tempfile
from datetime import date, timedelta

import pytest

# 必须在导入 app 之前设置数据库位置，保证窥测对象为测试库
_tmpdir = tempfile.mkdtemp(prefix="edupulse_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_tmpdir, 'test.db')}"
os.environ["JWT_EXPIRE_HOURS"] = "24"
# 置空而非删除：load_dotenv() 默认不覆盖已存在的键，留空可阻止 .env 里的真实 Key 生效，
# 使"未配 Key 时走本地保底"的断言稳定成立。
os.environ["LLM_API_KEY"] = ""

from app import create_app  # noqa: E402
from models import (  # noqa: E402
    QuizOption, db, KnowledgePoint, Quiz, StudySession, Subject, User,
)

# 测试用学科 / 知识点
TEST_SUBJECTS = [("数学", "#007AFF"), ("英语", "#34C759"), ("物理", "#5856D6")]
TEST_POINTS = {
    "数学": [("三角函数", 1), ("导数与极值", 3), ("数列", 3)],
    "英语": [("现在完成时", 2), ("定语从句", 3)],
    "物理": [("力学", 1), ("电学", 2)],
}

# 测试题：(学科, 知识点, 题干, [选项], 正确答案下标)
TEST_QUIZZES = [
    ("数学", "三角函数", "sin²x + cos²x = ?", ["0", "1", "2", "-1"], 1),
    ("数学", "导数与极值", "f(x)=x³ 的导数是？", ["3x²", "x²", "3x", "x²/3"], 0),
    ("数学", "数列", "等差数列 2,5,8 的公差是？", ["2", "3", "4", "5"], 1),
    ("英语", "现在完成时", "现在完成时的结构是？",
     ["have/has + 过去分词", "will + 原形", "过去式", "be + doing"], 0),
    ("英语", "定语从句", "先行词是人且在从句作主语，用？", ["which", "who", "whose", "whom"], 1),
    ("物理", "力学", "重力公式是？", ["F=ma", "G=mg", "F=kx", "P=UI"], 1),
    ("物理", "电学", "电阻的基本单位是？", ["伏特", "安培", "欧姆", "瓦特"], 2),
]


@pytest.fixture()
def app():
    app = create_app()
    app.config["TESTING"] = True
    with app.app_context():
        db.create_all()
        seed_base()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def seed_base():
    """创建默认账号 + 学科 + 知识点 + 题目，保证核心链路可测。"""
    if not User.query.filter_by(username="admin").first():
        admin = User(username="admin", nickname="管理员", role="admin")
        admin.set_password("admin123")
        db.session.add(admin)
    if not User.query.filter_by(username="demo").first():
        demo = User(username="demo", nickname="演示同学", role="user")
        demo.set_password("demo123")
        db.session.add(demo)
    db.session.flush()

    if Subject.query.count() == 0:
        for i, (name, color) in enumerate(TEST_SUBJECTS):
            db.session.add(Subject(name=name, code=f"s{i}", color=color,
                                   description=name, order_index=i))
        db.session.flush()

    if KnowledgePoint.query.count() == 0:
        for sname, points in TEST_POINTS.items():
            sub = Subject.query.filter_by(name=sname).first()
            for idx, (pname, diff) in enumerate(points):
                db.session.add(KnowledgePoint(subject_id=sub.id, name=pname,
                                              code=f"{sub.code}_{idx}", difficulty=diff,
                                              description=f"{sname}·{pname}", order_index=idx))
        db.session.flush()

    if Quiz.query.count() == 0:
        for (sname, pname, question, opts, ans) in TEST_QUIZZES:
            sub = Subject.query.filter_by(name=sname).first()
            kp = KnowledgePoint.query.filter_by(name=pname).first()
            quiz = Quiz(question=question, options=json.dumps(opts, ensure_ascii=False),
                        answer=ans, tag=pname, difficulty=1,
                        analysis=f"{pname} 的解析", subject_id=sub.id,
                        knowledge_point_id=kp.id)
            quiz.option_rows = [
                QuizOption(idx=i, content=t, is_correct=(i == ans))
                for i, t in enumerate(opts)
            ]
            db.session.add(quiz)
    db.session.commit()


def _auth(client, username, password):
    """登录并返回 Bearer 头。"""
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200
    token = r.get_json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin_headers(client):
    return _auth(client, "admin", "admin123")


@pytest.fixture()
def user_headers(client):
    return _auth(client, "demo", "demo123")


@pytest.fixture()
def new_user_headers(client):
    """注册一个全新普通用户并返回其 token 头。"""
    r = client.post("/api/auth/register",
                    json={"username": "tester", "password": "secret123", "nickname": "测试员"})
    assert r.status_code == 201
    token = r.get_json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def demo_quiz_ids(app):
    """返回测试题库中每道题的 (id, 正确答案下标, 知识点名) 列表。"""
    with app.app_context():
        rows = []
        for q in Quiz.query.order_by(Quiz.id).all():
            rows.append((q.id, q.answer, q.tag))
        return rows


@pytest.fixture()
def fresh_user(client, app):
    """注册独立用户（避免测试间互相污染统计数据），返回 (headers, user_id)。"""
    r = client.post("/api/auth/register",
                    json={"username": "fresh_user", "password": "secret123", "nickname": "新同学"})
    token = r.get_json()["data"]["token"]
    uid = r.get_json()["data"]["user"]["id"]
    return {"Authorization": f"Bearer {token}"}, uid
