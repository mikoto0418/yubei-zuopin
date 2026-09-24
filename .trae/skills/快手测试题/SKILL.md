---
name: "快手测试题"
description: "探索与接入快手测试题(ks.bykj.world)平台后台:登录、发现创建测试题/答案的全部 API 入口、分析现有测试结构、结构化批量生成测试题并提交。当用户提到快手测试题、ks.bykj.world、批量创建/生成测试题、测试题 API、题库接入时使用。"
---

# 快手测试题平台接入 Skill

用于探索、接入并批量操作「快手测试题」平台的测试题目后台。核心目标:搞清楚平台创建测试/题目/答案的全部入口(页面入口 + 后端 API),沉淀为可复用的批量生成与提交流程。

## 1. 平台背景(已探明)

| 项目 | 信息 |
|---|---|
| 后台地址 | `http://ks.bykj.world/admin/#/`(hash 路由,`#/` 是 Vue Router hash 模式特征) |
| 账号 | 见 `f:\traecode\kuaishou-test\config\platform.json`(敏感信息不写入本 Skill) |
| 技术栈线索 | 前端为 Vite 构建的 Vue SPA(响应中出现 `@vite/client`);hash 路由;`/admin/` 为前端入口 |
| 域名 | `bykj.world` 注册于阿里云万网(hichina);`ks.bykj.world` 无公共 A 记录,属**内网/私有 DNS 域名** |

## 2. 访问前置条件(必须先检查)

**`ks.bykj.world` 只在内网/VPN 环境可访问。** 从公网或未接入的机器访问表现为:

- 公共/内网 DNS:`NXDOMAIN`(无记录)
- 经本地代理(如 Clash):HTTP `502 Bad Gateway`;HTTPS CONNECT 隧道建立但无 TLS 握手
- 浏览器(经中继):`502`,渲染为空壳页面

**执行任何探索前,先验证连通性**:

```powershell
# 1) 域名解析(应能解析出内网 IP)
Resolve-DnsName ks.bykj.world

# 2) HTTP 连通性(应返回 200 而非 502)
curl.exe -s -o NUL -w "%{http_code}" http://ks.bykj.world/admin/

# 3) 若上面失败 → 该机器未接入内网/VPN,停止探索并提示用户连接
```

若无法访问:不要假装已探索,如实告知用户需要连接内网/VPN,或请用户在能访问的浏览器里 F12 → Network 导出接口数据。

## 3. 后台探索执行手册

### 3.1 登录

1. 打开 `http://ks.bykj.world/admin/#/login`(或根路径自动跳转登录)
2. 输入账号密码(从 `config/platform.json` 读取)
3. 登录成功后用 `localStorage` / cookie 提取认证令牌:
   ```javascript
   // 常见 token 存储键:token / access_token / Admin-Token / Authorization
   localStorage.getItem('token') || localStorage.getItem('access_token')
   document.cookie
   ```
4. 记录 token 的请求头形式(Authorization: Bearer / Admin-Token 等),后续 API 调用需要

### 3.2 菜单全量遍历(找全部入口)

目标:把「创建测试题/答案」相关的**所有页面入口**找全。典型入口分布:

- 菜单:试卷管理 / 题库管理 / 题目管理 / 分类管理 / 组卷 / 考试管理 / 模板管理
- 每个列表页的**新增/创建按钮**、**批量导入**按钮、**编辑**弹窗
- 可能隐藏的入口:路由表直接访问、右键菜单、导入导出工具

遍历方法:点击每个菜单项 → 记录路由路径(地址栏 `#/xxx`)→ 截图列表页 → 记录页面上每个「新建/添加/导入」按钮对应的路由与操作。

### 3.3 网络抓包提炼 API(核心产出)

用浏览器 Network 面板或 `browser_network_requests`,按以下清单记录**所有**与测试/题目/答案相关的请求:

| 关注点 | 示例 |
|---|---|
| 登录接口 | `POST /api/login`,参数与响应 token 字段 |
| 列表接口 | `GET /api/exam/list?page=1&size=10`,响应分页结构 |
| 创建试卷 | `POST /api/exam/create` |
| 添加题目 | `POST /api/question/add`(注意单选/多选/判断/填空/简答的类型字段) |
| 添加选项 | 题目内嵌套选项数组,或独立 `POST /api/option/add` |
| 答案/解析 | 题目内 `answer` 字段,或独立接口 |
| 批量导入 | `POST /api/exam/import`(Excel/JSON),字段映射模板 |

**每个接口需记录**:方法、URL、请求体 JSON 结构、响应结构、鉴权头、成功/失败示例。

### 3.4 分析现有测试结构

拉取 1~2 份现有测试的完整数据(列表接口 + 详情接口),提炼:

- 测试对象字段:标题、说明、分类、时长、总分、及格分、题目数、发布状态
- 题目对象字段:题型、题干、选项数、正确选项位置、答案解析、分值
- 题型枚举(如 1=单选 2=多选 3=判断 4=填空 5=简答)
- 答案表达方式(选项字母 / 下标 / 布尔 / 文本)

**产出:一份「现有测试共通点报告」**,写入 `f:\traecode\kuaishou-test\research\现有测试共通点报告.md`。

## 4. 结构化批量生成流程

### 4.1 数据模型(统一 JSON Bundle)

```json
{
  "test": {
    "title": "示例测试卷",
    "category": "通用",
    "description": "说明",
    "duration_minutes": 30,
    "total_score": 100,
    "pass_score": 60
  },
  "questions": [
    {
      "type": "single",              // single|multi|judge|fill|essay
      "stem": "题干文本",
      "score": 5,
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": "A",                  // 单选:选项字母/下标
      "analysis": "解析"
    }
  ]
}
```

### 4.2 生成管线

1. **分类清单** → 确定要生成哪些分类/试卷(如岗位知识、行业标准、产品知识)
2. **LLM 批量生成** → 按题型模板逐题生成,输出为上述 JSON Bundle(用统一 Prompt 模板保证格式稳定,可参考 `f:\traecode\kuaishou-test\design\批量生成测试题方案.md` 中的 Prompt 模板)
3. **本地校验** → 校验:题型字段合法、单选题必有且仅有 1 个正确选项、多选 2~4 个正确、判题为对/错、分值合计 = 总分
4. **接口映射** → 将 JSON Bundle 字段映射为平台真实 API 请求体(见 3.3 提炼的接口)
5. **提交** → 脚本(见 `design/` 下的提交脚本模板)按平台接口批量 POST,带鉴权 token,支持幂等(记录已提交 id,失败重试)

### 4.3 幂等与安全

- 提交前先 GET 查重(标题是否已存在),避免重复创建
- 记录 `local` 状态文件(`submitted.json`),标记每份测试提交结果
- 批量提交限速(每次请求间隔),失败自动重试 2 次,连续失败停止并报告

## 5. 交付物清单(全部在 f:\traecode\kuaishou-test\)

| 文件 | 内容 |
|---|---|
| `config/platform.json` | 平台地址、账号、token 提取说明(敏感) |
| `docs/01-网络访问诊断报告.md` | 本次访问障碍的诊断结论与排查方法 |
| `docs/02-后台探索执行手册.md` | 登录、菜单遍历、抓包的具体执行步骤(本节 3 的展开) |
| `docs/03-API接口发现清单.md` | 待填写的接口清单模板 |
| `research/现有测试共通点报告.md` | 现有测试结构分析报告(访问后填充) |
| `design/批量生成测试题方案.md` | 数据模型、Prompt 模板、提交脚本设计 |

## 6. 使用示例

- 用户说「登录后台看看有哪些菜单」→ 按第 3 节执行:先验证连通性,再登录遍历
- 用户说「批量新建 100 道 xx 测试题」→ 按第 4 节:确认分类 → LLM 生成 Bundle → 校验 → 提交
- 用户说「分析一下现有的测试」→ 按 3.4 拉取数据写共通点报告
