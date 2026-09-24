# -*- coding: utf-8 -*-
# EduPulse 后端核心链路测试（≥20 用例）
#
# 运行：在 backend 目录下执行  python -m pytest tests -v
"""
覆盖范围：
  1. 注册 / 登录 / 鉴权
  2. 权限 / RBAC（403）
  3. 笔记 CRUD + AI 梳理
  4. 答题判定 + 知识点挂载
  5. 学习记录
  6. AI 保底输出（降级）
  7. 知识点掌握度
  8. 错题本联动（自动入本 / 标记掌握 / 重做）
  9. 学习目标状态机（非法流转 400）
 10. 成就自动解锁
 11. AI 洞察落库
 12. 分页与边界
"""


# ---------- 1. 注册 / 登录 ----------

def test_register_then_login(client):
    r = client.post("/api/auth/register", json={
        "username": "alice", "password": "abc123", "nickname": "爱丽丝"})
    assert r.status_code == 201
    body = r.get_json()
    assert body["code"] == 0
    assert body["data"]["user"]["username"] == "alice"
    assert body["data"]["user"]["role"] == "user"
    assert body["data"]["token"]

    r = client.post("/api/auth/login", json={"username": "alice", "password": "abc123"})
    assert r.status_code == 200
    assert r.get_json()["data"]["token"]


def test_register_validation(client):
    r = client.post("/api/auth/register", json={"username": "ab", "password": "abc123"})
    assert r.status_code == 400
    assert "至少" in r.get_json()["message"]
    r = client.post("/api/auth/register", json={"username": "alice", "password": "123"})
    assert r.status_code == 400


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401


def test_me_requires_auth(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401
    assert "重新登录" in r.get_json()["message"]


# ---------- 2. 权限 / RBAC ----------

def test_regular_user_admin_403(client, user_headers):
    r = client.get("/api/admin/overview", headers=user_headers)
    assert r.status_code == 403
    assert "管理员" in r.get_json()["message"]


def test_admin_can_access(client, admin_headers):
    r = client.get("/api/admin/overview", headers=admin_headers)
    assert r.status_code == 200
    assert r.get_json()["code"] == 0
    assert "users" in r.get_json()["data"]


def test_notes_require_auth(client):
    assert client.get("/api/notes").status_code == 401


# ---------- 3. 笔记 CRUD + AI 梳理 ----------

def test_note_crud(client, new_user_headers):
    h = new_user_headers
    r = client.post("/api/notes", headers=h, json={"title": "导数", "subject": "数学",
                                                   "content": "f'(x)>0 则递增，求极值先求驻点。",
                                                   "mistake": "容易忽略驻点两侧符号"})
    assert r.status_code == 201
    nid = r.get_json()["data"]["id"]

    r = client.get("/api/notes", headers=h)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["total"] >= 1
    assert any(x["id"] == nid for x in data["items"])

    r = client.get(f"/api/notes/{nid}", headers=h)
    assert r.get_json()["data"]["title"] == "导数"

    r = client.put(f"/api/notes/{nid}", json={"title": "导数基础"}, headers=h)
    assert r.status_code == 200
    assert r.get_json()["data"]["title"] == "导数基础"

    r = client.put(f"/api/notes/{nid}", json={"title": ""}, headers=h)
    assert r.status_code == 400

    r = client.post(f"/api/notes/{nid}/summarize", headers=h)
    assert r.status_code == 200
    res = r.get_json()["data"]
    assert res["summary"]
    assert "key_points" in res
    assert res.get("source") == "local"

    r = client.delete(f"/api/notes/{nid}", headers=h)
    assert r.get_json()["code"] == 0
    assert client.get(f"/api/notes/{nid}", headers=h).status_code == 404


def test_note_ownership(client, new_user_headers, admin_headers):
    h = new_user_headers
    r = client.post("/api/notes", headers=h, json={"title": "私有笔记", "subject": "数学", "content": "仅本人可见"})
    nid = r.get_json()["data"]["id"]
    assert client.get(f"/api/notes/{nid}", headers=admin_headers).status_code == 404


# ---------- 4. 答题判定 + 知识点挂载 ----------

def test_answer_judging(client, new_user_headers, demo_quiz_ids):
    h = new_user_headers
    qid, correct_ans, kp_name = demo_quiz_ids[0]

    r = client.get("/api/quizzes?page=1&size=5", headers=h)
    data = r.get_json()["data"]
    assert data["total"] >= 1
    assert data["page"] == 1

    # 抽题不含答案
    r = client.get("/api/quizzes/practice?count=3", headers=h)
    assert r.status_code == 200
    assert "answer" not in r.get_json()["data"][0]

    # 答对：应返回知识点信息
    r = client.post(f"/api/quizzes/{qid}/answer", json={"answer": correct_ans}, headers=h)
    body = r.get_json()["data"]
    assert body["correct"] is True
    assert body["knowledge_point_name"] == kp_name

    # 答错
    wrong = (correct_ans + 1) % 4
    r = client.post(f"/api/quizzes/{qid}/answer", json={"answer": wrong}, headers=h)
    assert r.get_json()["data"]["correct"] is False
    # 答错后错题本状态为 pending
    assert r.get_json()["data"]["wrong_status"] == "pending"

    # 参数校验
    assert client.post(f"/api/quizzes/{qid}/answer", json={}, headers=h).status_code == 400
    assert client.post(f"/api/quizzes/{qid}/answer", json={"answer": 999}, headers=h).status_code == 400


def test_my_summary(client, new_user_headers, demo_quiz_ids):
    h = new_user_headers
    qid, ans, _ = demo_quiz_ids[0]
    client.post(f"/api/quizzes/{qid}/answer", json={"answer": ans}, headers=h)
    r = client.get("/api/quizzes/my-summary", headers=h)
    data = r.get_json()["data"]
    assert data["total"] >= 1
    assert data["accuracy"] > 0
    assert "wrong_pending" in data


# ---------- 5. 学习记录 ----------

def test_session_add_and_summary(client, new_user_headers):
    h = new_user_headers
    r = client.post("/api/sessions", headers=h, json={"subject": "数学", "duration": 50,
                                                      "study_date": "2026-09-01", "note": "刷题"})
    assert r.status_code == 201
    assert "session" in r.get_json()["data"]

    r = client.post("/api/sessions", headers=h, json={"subject": "数学", "duration": 0})
    assert r.status_code == 400

    r = client.get("/api/sessions/summary", headers=h)
    data = r.get_json()["data"]
    assert data["total_duration"] >= 50
    assert "streak" in data

    r = client.get("/api/sessions?subject=数学", headers=h)
    assert r.get_json()["data"]["total"] >= 1


# ---------- 6. AI 保底输出（降级） ----------

def test_ai_chat_local_fallback(client, new_user_headers):
    h = new_user_headers
    r = client.post("/api/ai/chat", json={"message": "英语怎样高效背单词？"}, headers=h)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["reply"]
    assert data["source"] in ("local", "llm")

    r = client.post("/api/ai/chat", json={"message": "  "}, headers=h)
    assert r.status_code == 400


def test_ai_status(client, new_user_headers):
    r = client.get("/api/ai/status", headers=new_user_headers)
    assert r.status_code == 200
    assert r.get_json()["data"]["source"] in ("local", "llm")


def test_ai_generate_quiz_local_fallback(client, new_user_headers):
    """未配置 Key 时 AI 出题走本地样例题（降级可用）。"""
    r = client.post("/api/ai/generate-quiz",
                    json={"topic": "三角函数", "subject": "数学", "count": 3},
                    headers=new_user_headers)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["source"] == "local"
    assert len(data["questions"]) >= 1
    assert "answer" in data["questions"][0]

    # 缺主题被拒绝
    assert client.post("/api/ai/generate-quiz", json={}, headers=new_user_headers).status_code == 400


# ---------- 7. 知识点掌握度 ----------

def test_knowledge_subjects_and_points(client, new_user_headers):
    h = new_user_headers
    r = client.get("/api/knowledge/subjects", headers=h)
    subs = r.get_json()["data"]
    assert len(subs) >= 3
    assert all("knowledge_count" in s for s in subs)

    r = client.get("/api/knowledge/points?page=1&size=3", headers=h)
    data = r.get_json()["data"]
    assert data["total"] >= 3
    assert len(data["items"]) == 3
    assert "mastery_level" in data["items"][0]


def test_knowledge_mastery(client, fresh_user, demo_quiz_ids):
    """答对/答错后，掌握度按知识点正确率计算。"""
    h, _ = fresh_user
    # 第一题答对
    qid, ans, kp_name = demo_quiz_ids[0]
    client.post(f"/api/quizzes/{qid}/answer", json={"answer": ans}, headers=h)
    # 第二题答错
    qid2, ans2, kp2 = demo_quiz_ids[1]
    client.post(f"/api/quizzes/{qid2}/answer", json={"answer": (ans2 + 1) % 4}, headers=h)

    r = client.get("/api/knowledge/mastery", headers=h)
    data = r.get_json()["data"]
    assert data["summary"]["point_count"] == 2
    assert data["summary"]["answered"] == 2
    names = {x["name"]: x for x in data["items"]}
    assert names[kp_name]["accuracy"] == 100.0
    assert names[kp2]["accuracy"] == 0.0
    assert names[kp2]["level"] == "薄弱"
    assert data["summary"]["weak_count"] == 1


def test_knowledge_point_detail(client, new_user_headers):
    h = new_user_headers
    points = client.get("/api/knowledge/points", headers=h).get_json()["data"]["items"]
    pid = points[0]["id"]
    r = client.get(f"/api/knowledge/points/{pid}", headers=h)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["point"]["id"] == pid
    assert "quizzes" in data
    # 不存在的知识点 → 404
    assert client.get("/api/knowledge/points/999999", headers=h).status_code == 404


# ---------- 8. 错题本 ----------

def test_wrong_book_flow(client, fresh_user, demo_quiz_ids):
    """答错自动入错题本 → 标记已掌握 → 重做。"""
    h, _ = fresh_user
    qid, ans, _ = demo_quiz_ids[0]
    wrong_choice = (ans + 1) % 4

    # 答错 → 自动入错题本
    client.post(f"/api/quizzes/{qid}/answer", json={"answer": wrong_choice}, headers=h)
    r = client.get("/api/wrong-book", headers=h)
    data = r.get_json()["data"]
    assert data["total"] == 1
    assert data["pending"] == 1
    wid = data["items"][0]["id"]
    assert data["items"][0]["status"] == "pending"
    assert data["items"][0]["wrong_count"] == 1

    # 再次答错 → 累计错误次数
    client.post(f"/api/quizzes/{qid}/answer", json={"answer": wrong_choice}, headers=h)
    r = client.get(f"/api/wrong-book/{wid}", headers=h)
    assert r.get_json()["data"]["wrong_count"] == 2

    # 标记已掌握
    r = client.post(f"/api/wrong-book/{wid}/master", headers=h)
    assert r.status_code == 200
    assert r.get_json()["data"]["status"] == "mastered"
    # 幂等
    r = client.post(f"/api/wrong-book/{wid}/master", headers=h)
    assert r.status_code == 200
    assert "已是掌握" in r.get_json()["message"]

    # 重做（答对）→ 保持 mastered
    r = client.post(f"/api/wrong-book/{wid}/redo", json={"answer": ans}, headers=h)
    body = r.get_json()["data"]
    assert body["correct"] is True
    assert body["wrong"]["status"] == "mastered"

    # 权限：其他用户看不到
    other = client.post("/api/auth/register",
                        json={"username": "other_user", "password": "secret123"}).get_json()
    other_h = {"Authorization": f"Bearer {other['data']['token']}"}
    assert client.get(f"/api/wrong-book/{wid}", headers=other_h).status_code == 404


def test_wrong_book_redo_wrong_keeps_pending(client, fresh_user, demo_quiz_ids):
    """重做答错 → 保持 pending 且错误次数 +1。"""
    h, _ = fresh_user
    qid, ans, _ = demo_quiz_ids[0]
    client.post(f"/api/quizzes/{qid}/answer", json={"answer": (ans + 1) % 4}, headers=h)
    wid = client.get("/api/wrong-book", headers=h).get_json()["data"]["items"][0]["id"]

    r = client.post(f"/api/wrong-book/{wid}/redo", json={"answer": (ans + 2) % 4}, headers=h)
    body = r.get_json()["data"]
    assert body["correct"] is False
    assert body["wrong"]["status"] == "pending"
    assert body["wrong"]["wrong_count"] == 2

    # 参数校验
    assert client.post(f"/api/wrong-book/{wid}/redo", json={}, headers=h).status_code == 400


def test_wrong_book_filters(client, fresh_user, demo_quiz_ids):
    """错题本支持状态筛选与分页。"""
    h, _ = fresh_user
    for qid, ans, _ in demo_quiz_ids[:3]:
        client.post(f"/api/quizzes/{qid}/answer", json={"answer": (ans + 1) % 4}, headers=h)

    r = client.get("/api/wrong-book?status=pending&page=1&size=2", headers=h)
    data = r.get_json()["data"]
    assert data["total"] == 3
    assert len(data["items"]) == 2
    assert data["pageSize"] == 2

    r = client.get("/api/wrong-book?status=mastered", headers=h)
    assert r.get_json()["data"]["total"] == 0


# ---------- 9. 学习目标状态机 ----------

def test_goal_create_and_validation(client, fresh_user):
    h, _ = fresh_user
    r = client.post("/api/goals", headers=h, json={
        "title": "本周学习 100 分钟", "period": "week", "metric": "duration", "target": 100})
    assert r.status_code == 201
    data = r.get_json()["data"]
    assert data["status"] == "active"
    assert data["start_date"] and data["end_date"]
    assert data["can_achieve"] is True

    # 非法周期
    assert client.post("/api/goals", headers=h, json={
        "title": "x", "period": "day", "metric": "duration", "target": 10}).status_code == 400
    # 非法指标
    assert client.post("/api/goals", headers=h, json={
        "title": "x", "period": "week", "metric": "xxx", "target": 10}).status_code == 400
    # 目标值非法
    assert client.post("/api/goals", headers=h, json={
        "title": "x", "period": "week", "metric": "duration", "target": 0}).status_code == 400
    # 正确率超 100
    assert client.post("/api/goals", headers=h, json={
        "title": "x", "period": "week", "metric": "accuracy", "target": 120}).status_code == 400
    # 缺标题
    assert client.post("/api/goals", headers=h, json={
        "period": "week", "metric": "duration", "target": 10}).status_code == 400


def test_goal_state_machine_illegal_transition(client, fresh_user):
    """状态机：终态不可再流转，非法流转返回 400。"""
    h, _ = fresh_user
    gid = client.post("/api/goals", headers=h, json={
        "title": "过期测试目标", "period": "week", "metric": "duration", "target": 99999,
    }).get_json()["data"]["id"]

    # active → expired 合法
    r = client.post(f"/api/goals/{gid}/transition", json={"status": "expired"}, headers=h)
    assert r.status_code == 200
    assert r.get_json()["data"]["goal"]["status"] == "expired"

    # expired → achieved 非法（终态）
    r = client.post(f"/api/goals/{gid}/transition", json={"status": "achieved"}, headers=h)
    assert r.status_code == 400
    assert "不允许流转" in r.get_json()["message"]

    # expired → expired 同样非法
    r = client.post(f"/api/goals/{gid}/transition", json={"status": "expired"}, headers=h)
    assert r.status_code == 400

    # 非法目标状态值
    r = client.post(f"/api/goals/{gid}/transition", json={"status": "done"}, headers=h)
    assert r.status_code == 400


def test_goal_achieve_requires_progress(client, fresh_user):
    """未达标不能标记达成；达标后自动流转。"""
    h, _ = fresh_user
    # 目标 10000 分钟，不可能达标
    gid = client.post("/api/goals", headers=h, json={
        "title": "高目标", "period": "week", "metric": "duration", "target": 10000,
    }).get_json()["data"]["id"]
    r = client.post(f"/api/goals/{gid}/transition", json={"status": "achieved"}, headers=h)
    assert r.status_code == 400
    assert "未达到目标" in r.get_json()["message"]

    # 目标 1 分钟，录一条学习记录后刷新即可达标
    gid2 = client.post("/api/goals", headers=h, json={
        "title": "小目标", "period": "week", "metric": "duration", "target": 1,
    }).get_json()["data"]["id"]
    client.post("/api/sessions", headers=h, json={"subject": "数学", "duration": 30})
    r = client.post(f"/api/goals/{gid2}/progress", headers=h)
    assert r.status_code == 200
    assert r.get_json()["data"]["goal"]["status"] == "achieved"
    # 达成后不能再刷新
    assert client.post(f"/api/goals/{gid2}/progress", headers=h).status_code == 400


def test_goal_list_and_filter(client, fresh_user):
    h, _ = fresh_user
    client.post("/api/goals", headers=h, json={
        "title": "目标A", "period": "week", "metric": "quiz_count", "target": 10})
    r = client.get("/api/goals", headers=h)
    data = r.get_json()["data"]
    assert data["stats"]["active"] >= 1
    assert "metrics" in data

    r = client.get("/api/goals?status=active", headers=h)
    assert all(g["status"] == "active" for g in r.get_json()["data"]["items"])

    assert client.get("/api/goals?status=bad", headers=h).status_code == 400


# ---------- 10. 成就解锁 ----------

def test_achievements_auto_unlock(client, fresh_user, demo_quiz_ids):
    """答题量达到阈值后自动解锁成就。"""
    h, _ = fresh_user
    r = client.get("/api/achievements", headers=h)
    data = r.get_json()["data"]
    assert data["total_count"] == 12
    assert data["unlocked_count"] == 0

    # 答 10 题 → 答题时即自动解锁 quiz_10（初露锋芒）
    qid, ans, _ = demo_quiz_ids[0]
    for _ in range(10):
        client.post(f"/api/quizzes/{qid}/answer", json={"answer": ans}, headers=h)

    # 答题响应里直接带回解锁结果（AI/业务闭环：作答即评估）
    r = client.post(f"/api/quizzes/{qid}/answer", json={"answer": ans}, headers=h)
    assert r.status_code == 200

    r = client.get("/api/achievements", headers=h)
    data = r.get_json()["data"]
    codes = {a["code"] for a in data["items"] if a["unlocked"]}
    assert "quiz_10" in codes
    assert data["unlocked_count"] >= 1

    # 幂等：再次评估不会重复解锁（已在答题时解锁）
    r = client.post("/api/achievements/evaluate", headers=h)
    assert len(r.get_json()["data"]["unlocked"]) == 0

    # 成就墙按类别分组
    wall = data
    assert len(wall["by_category"]) == 4
    unlocked = [a for a in wall["items"] if a["unlocked"]]
    assert all(a["percent"] == 100 for a in unlocked)
    assert all(a["unlocked_at"] for a in unlocked)


def test_achievement_streak_unlock(client, fresh_user):
    """连续打卡 3 天 → 解锁 streak_3。"""
    h, _ = fresh_user
    from datetime import date, timedelta
    today = date.today()
    for i in range(3):
        d = (today - timedelta(days=i)).isoformat()
        client.post("/api/sessions", headers=h, json={"subject": "数学", "duration": 30, "study_date": d})

    r = client.get("/api/achievements", headers=h)
    codes = {a["code"] for a in r.get_json()["data"]["items"] if a["unlocked"]}
    assert "streak_3" in codes


# ---------- 11. AI 洞察落库 ----------

def test_insight_analyze_and_persist(client, fresh_user, demo_quiz_ids):
    """AI 洞察：分析 → 落库 → 列表可读 → 驱动练习入口。"""
    h, _ = fresh_user
    # 制造一个薄弱知识点（全答错）
    qid, ans, kp_name = demo_quiz_ids[0]
    for _ in range(3):
        client.post(f"/api/quizzes/{qid}/answer", json={"answer": (ans + 1) % 4}, headers=h)

    r = client.post("/api/insights/analyze", headers=h)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["source"] == "local"
    assert len(data["insights"]) >= 1
    assert data["weak_points"], "应识别出薄弱知识点"

    ins = data["insights"][0]
    assert ins["knowledge_point_id"], "洞察必须回填知识点 ID（用于跳转练习）"
    assert ins["status"] == "new"

    # 列表可读
    r = client.get("/api/insights?size=5", headers=h)
    listing = r.get_json()["data"]
    assert listing["total"] >= 1
    assert listing["new_count"] >= 1

    # 状态更新
    iid = ins["id"]
    r = client.post(f"/api/insights/{iid}/status", json={"status": "read"}, headers=h)
    assert r.get_json()["data"]["status"] == "read"
    assert client.post(f"/api/insights/{iid}/status", json={"status": "bad"}, headers=h).status_code == 400


def test_insight_local_fallback_without_data(client, fresh_user):
    """无答题数据时，AI 洞察降级为通用建议而非报错。"""
    h, _ = fresh_user
    r = client.post("/api/insights/analyze", headers=h)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["source"] == "local"
    assert len(data["insights"]) >= 1
    assert data["insights"][0]["kind"] == "advice"


# ---------- 12. 分页与边界 ----------

def test_pagination_boundaries(client, new_user_headers):
    """分页参数越界自动收拢，不报错。"""
    h = new_user_headers
    r = client.get("/api/notes?page=0&size=999", headers=h)
    data = r.get_json()["data"]
    assert data["page"] == 1
    assert data["pageSize"] == 100

    r = client.get("/api/notes?page=abc&size=xyz", headers=h)
    data = r.get_json()["data"]
    assert data["page"] == 1
    assert data["pageSize"] == 10

    # 页码远超总数 → 空列表但结构完整
    r = client.get("/api/quizzes?page=9999&size=10", headers=h)
    data = r.get_json()["data"]
    assert data["items"] == []
    assert data["total"] >= 1


def test_unauthorized_new_endpoints(client):
    """新增接口全部需要鉴权。"""
    for path in ("/api/knowledge/subjects", "/api/knowledge/mastery",
                 "/api/wrong-book", "/api/goals", "/api/achievements", "/api/insights"):
        assert client.get(path).status_code == 401, path


def test_records_pagination_compat(client, fresh_user, demo_quiz_ids):
    """答题记录：无分页参数时兼容旧结构（数组），带参数时返回分页结构。"""
    h, _ = fresh_user
    qid, ans, _ = demo_quiz_ids[0]
    client.post(f"/api/quizzes/{qid}/answer", json={"answer": ans}, headers=h)

    r = client.get("/api/quizzes/records", headers=h)
    assert isinstance(r.get_json()["data"], list)

    r = client.get("/api/quizzes/records?page=1&size=5", headers=h)
    data = r.get_json()["data"]
    assert data["total"] >= 1
    assert len(data["items"]) <= 5
