# -*- coding: utf-8 -*-
"""MindCare 后端核心链路测试（pytest + Flask test_client，不占端口/不落正式库）。"""
import pytest

import app as mindcare


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    """每个测试用独立临时数据库，保证互不影响。"""
    mindcare.DB_PATH = str(tmp_path / "mindcare_test.db")
    mindcare.LLM_API_KEY = ""  # 测试保持离线，确保走本地回退，结果确定
    mindcare.ENABLE_LOCAL_FALLBACK = True  # 无 Key 时启用本地兜底，否则聊天接口返回 503
    mindcare.init_db()
    yield


@pytest.fixture
def client():
    mindcare.app.config["TESTING"] = True
    with mindcare.app.test_client() as c:
        yield c


def _register(client, username="alice", password="alice12345"):
    return client.post("/api/auth/register", json={"username": username, "password": password})


def _auth(client, username="alice", password="alice12345"):
    _register(client, username, password)  # 不存在则创建；已存在(409)忽略
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    return r.get_json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def test_register_then_login(client):
    _register(client)
    r = client.post("/api/auth/login", json={"username": "alice", "password": "alice12345"})
    assert r.status_code == 200
    assert r.get_json()["user"]["username"] == "alice"


def test_duplicate_username(client):
    assert _register(client).status_code == 201
    assert _register(client).status_code == 409


def test_short_password_rejected(client):
    r = client.post("/api/auth/register", json={"username": "short", "password": "123"})
    assert r.status_code == 400


def test_wrong_password(client):
    _register(client)
    r = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    assert r.status_code == 401


def test_requires_auth(client):
    assert client.get("/api/moods").status_code == 401


def test_regular_user_forbidden_admin(client):
    token = _auth(client)
    r = client.get("/api/admin/overview", headers=_h(token))
    assert r.status_code == 403


def test_mood_crud(client):
    token = _auth(client)
    h = _h(token)
    # create
    r = client.post("/api/moods", json={"mood_score": 6, "emotion": "平静", "note": "不错的一天"}, headers=h)
    assert r.status_code == 200
    r = client.get("/api/moods", headers=h)
    moods = r.get_json()["moods"]
    assert len(moods) == 1
    mid = moods[0]["id"]
    # update
    r = client.put(f"/api/moods/{mid}", json={"mood_score": 9}, headers=h)
    assert r.status_code == 200
    r = client.get("/api/moods", headers=h)
    assert r.get_json()["moods"][0]["mood_score"] == 9
    # delete
    r = client.delete(f"/api/moods/{mid}", headers=h)
    assert r.status_code == 200
    r = client.get("/api/moods", headers=h)
    assert r.get_json()["moods"] == []


def test_mood_protected_ownership(client):
    token_a = _auth(client, "alice", "alice12345")
    _register(client, "bob", "bob12345678")
    token_b = _auth(client, "bob", "bob12345678")
    r = client.post("/api/moods", json={"mood_score": 6}, headers=_h(token_a))
    mid = client.get("/api/moods", headers=_h(token_a)).get_json()["moods"][0]["id"]
    # bob 不能改/删 alice 的记录
    assert client.put(f"/api/moods/{mid}", json={"mood_score": 1}, headers=_h(token_b)).status_code == 404
    assert client.delete(f"/api/moods/{mid}", headers=_h(token_b)).status_code == 404


def test_assessment_settled_level(client):
    token = _auth(client)
    h = _h(token)
    assert client.post("/api/assessments", json={"total_score": 40}, headers=h).get_json()["level"] == "正常"
    assert client.post("/api/assessments", json={"total_score": 70}, headers=h).get_json()["level"] in ("中度抑郁", "重度抑郁")


def test_chat_local_fallback(client):
    token = _auth(client)
    r = client.post("/api/chat", json={"message": "我最近有点焦虑"}, headers=_h(token))
    assert r.status_code == 200
    body = r.get_json()
    assert body["source"] == "local"          # 无 Key 时应走本地兜底
    assert "离线本地模式" in body["reply"]


def test_admin_overview(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    token = r.get_json()["token"]
    r = client.get("/api/admin/overview", headers=_h(token))
    assert r.status_code == 200
    body = r.get_json()
    assert "mood_trend" in body and "risk_users" in body


def test_admin_users_pagination_search(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    token = r.get_json()["token"]
    r = client.get("/api/admin/users?q=admin&size=10&page=1", headers=_h(token))
    assert r.status_code == 200
    body = r.get_json()
    assert body["total"] >= 1
    assert body["users"][0]["username"] == "admin"


def test_mood_tag_crud(client):
    token = _auth(client)
    h = _h(token)
    # 列表会返回内置标签，这里只关注用户自建的部分
    tags0 = client.get("/api/mood-tags", headers=h).get_json()["tags"]
    assert any(t["is_builtin"] for t in tags0), "应已 seed 内置标签"
    # 添加
    r = client.post("/api/mood-tags", json={"tag": "内耗"}, headers=h)
    assert r.status_code == 200
    custom = [t for t in client.get("/api/mood-tags", headers=h).get_json()["tags"] if not t["is_builtin"]]
    assert len(custom) == 1 and custom[0]["tag"] == "内耗"
    tag_id = custom[0]["id"]
    # 重复添加报错
    assert client.post("/api/mood-tags", json={"tag": "内耗"}, headers=h).status_code == 400
    # 删除后自建标签清空，内置标签保留
    assert client.delete(f"/api/mood-tags/{tag_id}", headers=h).status_code == 200
    remaining = client.get("/api/mood-tags", headers=h).get_json()["tags"]
    assert [t for t in remaining if not t["is_builtin"]] == []


def test_mood_tag_length_limit(client):
    token = _auth(client)
    h = _h(token)
    # 上限为 12 字，13 字应被拒绝
    assert client.post("/api/mood-tags", json={"tag": "这是一条超过十二个字的标签内容"}, headers=h).status_code == 400
    assert client.post("/api/mood-tags", json={"tag": ""}, headers=h).status_code == 400


def test_custom_quiz_flow(client):
    token = _auth(client)
    h = _h(token)
    payload = {
        "title": "考前焦虑自评",
        "intro": "测试",
        "options": ["从不", "有时", "经常", "总是"],
        "questions": [
            {"q": "临近考试我容易紧张", "scores": [0, 1, 2, 3]},
            {"q": "我能平静应对考试", "scores": [3, 2, 1, 0]},
        ],
    }
    r = client.post("/api/quizzes", json=payload, headers=h)
    assert r.status_code == 200
    qid = r.get_json()["id"]
    # 列表
    body = client.get("/api/quizzes", headers=h).get_json()
    assert len(body["quizzes"]) == 1
    assert body["quizzes"][0]["question_count"] == 2
    # 详情
    detail = client.get(f"/api/quizzes/{qid}", headers=h).get_json()["quiz"]
    assert detail["options"] == ["从不", "有时", "经常", "总是"]
    # 提交（全选低频 → 低分）
    r = client.post(f"/api/quizzes/{qid}/submit", json={"answers": [0, 3]}, headers=h)
    assert r.status_code == 200
    sub = r.get_json()["submission"]
    assert sub["score"] == 0 and sub["level"] == "偏低"
    # 提交数量不匹配报错
    assert client.post(f"/api/quizzes/{qid}/submit", json={"answers": [0]}, headers=h).status_code == 400
    # 删除
    assert client.delete(f"/api/quizzes/{qid}", headers=h).status_code == 200
    assert client.get("/api/quizzes", headers=h).get_json()["quizzes"] == []


def test_custom_quiz_ownership(client):
    token_a = _auth(client, "alice", "alice12345")
    _register(client, "bob", "bob12345678")
    token_b = _auth(client, "bob", "bob12345678")
    qid = client.post(
        "/api/quizzes",
        json={"title": "仅alice可见", "options": ["A", "B"], "questions": [{"q": "Q", "scores": [0, 1]}]},
        headers=_h(token_a),
    ).get_json()["id"]
    # bob 看不到、打不开、删不了
    assert client.get("/api/quizzes", headers=_h(token_b)).get_json()["quizzes"] == []
    assert client.get(f"/api/quizzes/{qid}", headers=_h(token_b)).status_code == 404
    assert client.post(f"/api/quizzes/{qid}/submit", json={"answers": [0]}, headers=_h(token_b)).status_code == 404


# ================================================================ 新增：咨询师预约
def _counselor_token(client):
    r = client.post("/api/auth/login", json={"username": "counselor1", "password": "counselor123"})
    assert r.status_code == 200, "种子应包含 counselor1 账号"
    return r.get_json()["token"]


def _admin_token(client):
    return client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).get_json()["token"]


def _free_slot(client, token, cid):
    """取该咨询师一个未被占用的时段（种子数据会占用部分排班）。"""
    c = client.get(f"/api/counselors/{cid}", headers=_h(token)).get_json()["counselor"]
    taken = set(c.get("taken_slots") or [])
    free = [s for s in c["slots"] if s not in taken]
    assert free, f"咨询师 {cid} 无空闲时段"
    return free[0], c


def test_counselor_list_and_pagination(client):
    token = _auth(client)
    r = client.get("/api/counselors?page=1&size=3", headers=_h(token))
    assert r.status_code == 200
    body = r.get_json()
    assert body["total"] == 8 and len(body["counselors"]) == 3
    assert len(body["specialties"]) > 0
    # 第二页不重复
    page2 = client.get("/api/counselors?page=2&size=3", headers=_h(token)).get_json()
    ids1 = {c["id"] for c in body["counselors"]}
    ids2 = {c["id"] for c in page2["counselors"]}
    assert not (ids1 & ids2)


def test_counselor_search_by_specialty(client):
    token = _auth(client)
    body = client.get("/api/counselors?q=焦虑", headers=_h(token)).get_json()
    assert body["total"] >= 1
    assert all("焦虑" in (c["intro"] + ",".join(c["specialties"])) or "焦虑" in c["title"] for c in body["counselors"])


def test_counselor_detail_has_taken_slots(client):
    token = _auth(client)
    r = client.get("/api/counselors/1", headers=_h(token))
    assert r.status_code == 200
    c = r.get_json()["counselor"]
    assert isinstance(c["slots"], list) and "taken_slots" in c
    assert client.get("/api/counselors/9999", headers=_h(token)).status_code == 404


def test_appointment_create_and_invalid_slot(client):
    token = _auth(client)
    slot, c = _free_slot(client, token, 2)
    r = client.post("/api/appointments", json={"counselor_id": 2, "slot": slot, "topic": "考试焦虑"}, headers=_h(token))
    assert r.status_code == 201
    appt = r.get_json()["appointment"]
    assert appt["status"] == "pending" and appt["counselor_name"] == c["name"]
    # 同一时段重复预约被拒
    assert client.post("/api/appointments", json={"counselor_id": 2, "slot": slot}, headers=_h(token)).status_code == 400
    # 不在排班内的时段被拒
    assert client.post("/api/appointments", json={"counselor_id": 2, "slot": "周日 03:00-04:00"}, headers=_h(token)).status_code == 400
    # 缺参数
    assert client.post("/api/appointments", json={"slot": slot}, headers=_h(token)).status_code == 400


def test_appointment_state_machine_full_flow(client):
    """pending → confirmed → completed，并完成评价。"""
    utoken = _auth(client)
    ctoken = _counselor_token(client)
    slot, c = _free_slot(client, utoken, 1)
    aid = client.post(
        "/api/appointments", json={"counselor_id": 1, "slot": slot, "topic": "状态机测试"},
        headers=_h(utoken),
    ).get_json()["appointment"]["id"]

    # 用户无权把 pending 改成 confirmed（只有咨询师/admin 可以）
    r = client.post(f"/api/appointments/{aid}/transition", json={"to": "confirmed"}, headers=_h(utoken))
    assert r.status_code == 400
    # 咨询师确认
    r = client.post(f"/api/appointments/{aid}/transition", json={"to": "confirmed"}, headers=_h(ctoken))
    assert r.status_code == 200 and r.get_json()["appointment"]["status"] == "confirmed"
    # 咨询师标记完成
    r = client.post(f"/api/appointments/{aid}/transition", json={"to": "completed"}, headers=_h(ctoken))
    assert r.status_code == 200 and r.get_json()["appointment"]["status"] == "completed"
    # 用户评价
    r = client.post(f"/api/appointments/{aid}/review", json={"score": 5, "text": "很有帮助"}, headers=_h(utoken))
    assert r.status_code == 200
    assert r.get_json()["appointment"]["review_score"] == 5
    # 重复评价被拒
    assert client.post(f"/api/appointments/{aid}/review", json={"score": 4}, headers=_h(utoken)).status_code == 400


def test_appointment_illegal_transition_returns_400(client):
    """终态不可再流转；跳级流转返回 400。"""
    utoken = _auth(client)
    ctoken = _counselor_token(client)
    slot, _c = _free_slot(client, utoken, 1)
    aid = client.post(
        "/api/appointments", json={"counselor_id": 1, "slot": slot}, headers=_h(utoken),
    ).get_json()["appointment"]["id"]
    # pending 不能直接跳到 completed
    assert client.post(f"/api/appointments/{aid}/transition", json={"to": "completed"}, headers=_h(ctoken)).status_code == 400
    # 非法目标状态
    assert client.post(f"/api/appointments/{aid}/transition", json={"to": "flying"}, headers=_h(ctoken)).status_code == 400
    # 走到 cancelled（终态）
    assert client.post(f"/api/appointments/{aid}/transition", json={"to": "cancelled"}, headers=_h(utoken)).status_code == 200
    # 终态不可再流转
    assert client.post(f"/api/appointments/{aid}/transition", json={"to": "confirmed"}, headers=_h(ctoken)).status_code == 400
    assert client.post(f"/api/appointments/{aid}/transition", json={"to": "cancelled"}, headers=_h(utoken)).status_code == 400


def test_appointment_cross_user_forbidden(client):
    """他人预约不可操作（403），不可评价（403）。"""
    token_a = _auth(client, "alice", "alice12345")
    _register(client, "bob", "bob12345678")
    token_b = _auth(client, "bob", "bob12345678")
    slot, _c = _free_slot(client, token_a, 3)
    aid = client.post(
        "/api/appointments", json={"counselor_id": 3, "slot": slot}, headers=_h(token_a),
    ).get_json()["appointment"]["id"]
    assert client.post(f"/api/appointments/{aid}/transition", json={"to": "cancelled"}, headers=_h(token_b)).status_code == 403
    assert client.post(f"/api/appointments/{aid}/review", json={"score": 5}, headers=_h(token_b)).status_code == 403
    # bob 的列表里看不到 alice 的预约
    ids = [a["id"] for a in client.get("/api/appointments", headers=_h(token_b)).get_json()["appointments"]]
    assert aid not in ids


def test_appointment_role_visibility_and_stats(client):
    """咨询师只看到自己的预约；admin 看到全部；统计按角色收敛。"""
    utoken = _auth(client)
    ctoken = _counselor_token(client)
    atoken = _admin_token(client)
    c1_slot, c1 = _free_slot(client, utoken, 1)
    client.post("/api/appointments", json={"counselor_id": 1, "slot": c1_slot}, headers=_h(utoken))

    admin_all = client.get("/api/appointments?size=100", headers=_h(atoken)).get_json()
    assert admin_all["total"] >= 21  # 20 条种子 + 1 条新增
    counselor_only = client.get("/api/appointments?size=100", headers=_h(ctoken)).get_json()
    assert all(a["counselor_id"] == 1 for a in counselor_only["appointments"])
    stats = client.get("/api/appointments/stats", headers=_h(ctoken)).get_json()["stats"]
    assert set(stats) == {"pending", "confirmed", "completed", "cancelled"}


def test_appointment_status_filter_and_search(client):
    utoken = _auth(client)
    atoken = _admin_token(client)
    body = client.get("/api/appointments?status=completed&size=50", headers=_h(atoken)).get_json()
    assert body["total"] >= 1 and all(a["status"] == "completed" for a in body["appointments"])
    # 非法状态值
    assert client.get("/api/appointments?status=bogus", headers=_h(utoken)).status_code == 400
    # 搜索命中主题
    hit = client.get("/api/appointments?q=答辩&size=50", headers=_h(atoken)).get_json()
    assert all("答辩" in (a["topic"] or "") or "答辩" in (a["counselor_name"] or "") for a in hit["appointments"])


def test_appointment_requires_auth(client):
    assert client.get("/api/appointments").status_code == 401
    assert client.get("/api/counselors").status_code == 401


# ================================================================ 新增：危机预警
def test_crisis_trigger_on_severe_assessment(client):
    """中度及以上测评自动生成预警。"""
    token = _auth(client)
    h = _h(token)
    r = client.post("/api/assessments", json={"total_score": 68}, headers=h)
    assert r.status_code == 200
    assert r.get_json()["crisis_alert"] is True
    # 正常分数不触发
    r = client.post("/api/assessments", json={"total_score": 40}, headers=h)
    assert r.get_json()["crisis_alert"] is False
    mine = client.get("/api/crisis-alerts/mine", headers=h).get_json()["alerts"]
    assert len(mine) == 1 and mine[0]["level"] == "medium"


def test_assessment_answers_persisted(client):
    """逐题作答落库，并按用户隔离。"""
    token = _auth(client)
    h = _h(token)
    answers = [{"q": "我觉得闷闷不乐", "score": 3}, {"q": "我晚上睡眠不好", "score": 2}]
    aid = client.post("/api/assessments", json={"total_score": 68, "answers": answers}, headers=h).get_json()["assessment_id"]
    body = client.get(f"/api/assessments/{aid}/answers", headers=h).get_json()
    assert len(body["answers"]) == 2
    assert body["answers"][0]["question"] == "我觉得闷闷不乐"
    # 他人无权查看
    _register(client, "bob", "bob12345678")
    token_b = _auth(client, "bob", "bob12345678")
    assert client.get(f"/api/assessments/{aid}/answers", headers=_h(token_b)).status_code == 403


def test_crisis_alert_role_guard(client):
    """普通用户无权访问预警列表；咨询师/admin 可以。"""
    utoken = _auth(client)
    assert client.get("/api/crisis-alerts", headers=_h(utoken)).status_code == 403
    atoken = _admin_token(client)
    body = client.get("/api/crisis-alerts?size=100", headers=_h(atoken)).get_json()
    assert body["total"] == 15
    assert body["stats"]["open"] >= 1
    ctoken = _counselor_token(client)
    assert client.get("/api/crisis-alerts", headers=_h(ctoken)).status_code == 200


def test_crisis_alert_handle_flow(client):
    """处理预警：联系/转介/解除，重复处理返回 400。"""
    atoken = _admin_token(client)
    h = _h(atoken)
    open_alert = [a for a in client.get("/api/crisis-alerts?status=open&size=50", headers=h).get_json()["alerts"]][0]
    aid = open_alert["id"]
    # 非法处理方式
    assert client.post(f"/api/crisis-alerts/{aid}/handle", json={"action": "explode"}, headers=h).status_code == 400
    # 非解除必须填写记录
    assert client.post(f"/api/crisis-alerts/{aid}/handle", json={"action": "contact"}, headers=h).status_code == 400
    r = client.post(f"/api/crisis-alerts/{aid}/handle", json={"action": "contact", "note": "已电话联系"}, headers=h)
    assert r.status_code == 200
    body = r.get_json()["alert"]
    assert body["status"] == "handled" and body["handle_action"] == "contact"
    # 重复处理被拒
    assert client.post(f"/api/crisis-alerts/{aid}/handle", json={"action": "refer", "note": "x"}, headers=h).status_code == 400


def test_crisis_alert_filters(client):
    atoken = _admin_token(client)
    h = _h(atoken)
    assert client.get("/api/crisis-alerts?status=bogus", headers=h).status_code == 400
    assert client.get("/api/crisis-alerts?level=bogus", headers=h).status_code == 400
    highs = client.get("/api/crisis-alerts?level=high&size=50", headers=h).get_json()
    assert all(a["level"] == "high" for a in highs["alerts"])
    dismissed = client.get("/api/crisis-alerts?status=dismissed&size=50", headers=h).get_json()
    assert all(a["status"] == "dismissed" for a in dismissed["alerts"])


# ================================================================ 新增：资源库
def test_resources_list_and_pagination(client):
    token = _auth(client)
    h = _h(token)
    body = client.get("/api/resources?page=1&size=8", headers=h).get_json()
    assert body["total"] >= 18
    assert len(body["resources"]) == 8
    assert len(body["categories"]) >= 3
    # 分类筛选
    cat = body["categories"][0]["category"]
    filtered = client.get(f"/api/resources?category={cat}&size=50", headers=h).get_json()
    assert all(r["category"] == cat for r in filtered["resources"])
    # 搜索
    hits = client.get("/api/resources?q=焦虑&size=50", headers=h).get_json()
    assert hits["total"] >= 1


def test_resource_detail_and_collect_toggle(client):
    token = _auth(client)
    h = _h(token)
    rid = client.get("/api/resources?size=1", headers=h).get_json()["resources"][0]["id"]
    detail = client.get(f"/api/resources/{rid}", headers=h).get_json()["resource"]
    assert detail["content"] and detail["collected"] is False
    # 收藏 → 取消收藏
    assert client.post(f"/api/resources/{rid}/collect", headers=h).get_json()["collected"] is True
    assert client.get(f"/api/resources/{rid}", headers=h).get_json()["resource"]["collected"] is True
    assert client.post(f"/api/resources/{rid}/collect", headers=h).get_json()["collected"] is False
    # 收藏列表
    client.post(f"/api/resources/{rid}/collect", headers=h)
    collected = client.get("/api/resources/collected", headers=h).get_json()["resources"]
    assert [r["id"] for r in collected] == [rid]
    # 404
    assert client.get("/api/resources/99999", headers=h).status_code == 404


def test_resource_progress_tracking(client):
    token = _auth(client)
    h = _h(token)
    rid = client.get("/api/resources?size=1", headers=h).get_json()["resources"][0]["id"]
    assert client.post(f"/api/resources/{rid}/progress", json={"progress": 60}, headers=h).get_json()["progress"] == 60
    assert client.get(f"/api/resources/{rid}", headers=h).get_json()["resource"]["progress"] == 60
    # 越界被夹紧 / 非法输入
    assert client.post(f"/api/resources/{rid}/progress", json={"progress": 999}, headers=h).get_json()["progress"] == 100
    assert client.post(f"/api/resources/{rid}/progress", json={"progress": "abc"}, headers=h).status_code == 400


def test_private_report_isolated_per_user(client):
    """AI 周报属于私人报告区，他人不可见。"""
    _register(client, "bob", "bob12345678")
    token_b = _auth(client, "bob", "bob12345678")
    body = client.get("/api/resources?mine=1", headers=_h(token_b)).get_json()
    assert body["total"] == 0, "新用户不应看到小兰的私人周报"


# ================================================================ 新增：AI 周报（降级落库）
def test_weekly_report_generate_and_persist(client):
    """无 Key 时走本地降级，周报写入 resources 并可在首页读到。"""
    token = _auth(client)
    h = _h(token)
    for i in range(3):
        client.post("/api/moods", json={"mood_score": 4 + i, "emotion": "焦虑"}, headers=h)
    r = client.post("/api/ai/weekly-report", headers=h)
    assert r.status_code == 201
    body = r.get_json()
    assert body["source"] == "local", "测试环境无 Key，应降级本地"
    report = body["report"]
    assert report["kind"] == "weekly_report" and len(report["content"]) > 50
    # 落库可读
    latest = client.get("/api/ai/weekly-report", headers=h).get_json()["report"]
    assert latest["id"] == report["id"]
    # 进入私人报告列表
    mine = client.get("/api/resources?mine=1", headers=h).get_json()
    assert any(x["id"] == report["id"] for x in mine["resources"])


def test_weekly_report_requires_auth(client):
    assert client.get("/api/ai/weekly-report").status_code == 401


# ================================================================ 新增：首页聚合与分页边界
def test_dashboard_aggregation(client):
    token = _auth(client)
    h = _h(token)
    client.post("/api/moods", json={"mood_score": 6}, headers=h)
    body = client.get("/api/dashboard", headers=h).get_json()
    assert body["mood_count"] == 1
    for key in ("avg_mood", "last_assessment", "weekly_report", "upcoming_appointments", "open_alerts"):
        assert key in body


def test_pagination_boundaries(client):
    """分页边界：page=0 归一到 1；size 超上限被夹到 100。"""
    atoken = _admin_token(client)
    h = _h(atoken)
    body = client.get("/api/admin/users?page=0&size=9999", headers=h).get_json()
    assert body["page"] == 1 and body["size"] == 100
    body = client.get("/api/counselors?page=-5&size=0", headers=h).get_json()
    assert body["page"] == 1 and body["size"] == 1
    # 超出范围的页码返回空列表而非报错
    body = client.get("/api/appointments?page=99&size=20", headers=h).get_json()
    assert body["appointments"] == []


def test_assessments_pagination_and_isolation(client):
    token_a = _auth(client, "alice", "alice12345")
    _register(client, "bob", "bob12345678")
    token_b = _auth(client, "bob", "bob12345678")
    for _ in range(3):
        client.post("/api/assessments", json={"total_score": 45}, headers=_h(token_a))
    body = client.get("/api/assessments?page=1&size=2", headers=_h(token_a)).get_json()
    assert body["total"] == 3 and len(body["assessments"]) == 2
    assert client.get("/api/assessments", headers=_h(token_b)).get_json()["total"] == 0


def test_admin_overview_includes_new_modules(client):
    atoken = _admin_token(client)
    body = client.get("/api/admin/overview", headers=_h(atoken)).get_json()
    assert body["crisis_stats"]["open"] >= 1
    assert body["appointment_stats"]["pending"] >= 1
    assert len(body["top_counselors"]) == 5
    assert body["resource_count"] == 20
    assert len(body["recent_appointments"]) >= 1


def test_role_label_exposed(client):
    utoken = _auth(client)
    me = client.get("/api/auth/me", headers=_h(utoken)).get_json()["user"]
    assert me["role_label"] == "普通用户"
    ctoken = _counselor_token(client)
    me = client.get("/api/auth/me", headers=_h(ctoken)).get_json()["user"]
    assert me["role"] == "counselor" and me["role_label"] == "咨询师"