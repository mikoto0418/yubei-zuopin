# =============================================
# 统一响应结构与错误对象
# 所有接口统一返回 {code, data, message}
#  code = 0   成功
#  code != 0  业务失败（HTTP 状态码同步使用 4xx/5xx）
# =============================================
from flask import jsonify


def ok(data=None, message="ok", status=200):
    """成功响应：code=0，可自定义 HTTP 状态码（创建类返回 201）。"""
    resp = jsonify({"code": 0, "data": data, "message": message})
    resp.status_code = status
    return resp


def fail(message, code=1, http=400):
    """业务失败响应：message 为面向用户的中文提示"""
    resp = jsonify({"code": code, "data": None, "message": message})
    resp.status_code = http
    return resp