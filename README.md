# 预备作品

> 十套全栈系统 + 一套批量产出流水线。
> 统一 Apple 设计基底，各自差异化交互范式。

---

## 十套系统

| 系统 | 端口 | 领域 | 组件库 | 主题色 | 差异化维度 |
|---|---|---|---|---|---|
| [mindcare](mindcare/) | 4101 | AI 心理健康陪护 | Mantine 8 | `--pink` | 底部 Tab 栏 + 卡片流 + 沉浸冥想 |
| [scholarboard](scholarboard/) | 4102 | 学术笔记与简历 | Naive UI 2 | `--orange` | ⌘K 命令面板 + 三栏工作区 |
| [edupulse](edupulse/) | 4103 | AI 学习分析 | Ant Design 6 | `--teal` | 可拖拽 Widget 驾驶舱 |
| [hivemarket](hivemarket/) | 4104 | 校园二手交易 | PrimeVue 4 | `--red` | 瀑布流 + 详情抽屉 + 浮层聊天 |
| [examprep](examprep/) | 4105 | AI 备考规划 | Shoelace 2 | `--yellow` | 时间块日历 + 命令行（无构建） |
| [kitchenflow](kitchenflow/) | 4201 | 餐厅后厨订单 | — | `--orange` | 高密度卡片 + 倒计时进度环 |
| [citylens](citylens/) | 4202 | 城市设施巡检 | Element Plus | `--green` | 全屏地图 + 毛玻璃浮层 |
| [interviewgo](interviewgo/) | 4203 | AI 模拟面试 | MUI 7 | `--purple` | 对话流 + 气泡节奏 + 技能雷达 |
| [scriptforge](scriptforge/) | 4204 | 剧本创作台 | Arco Design Vue | `--indigo` | 纸张质感 + 衬线正文 |
| [logitrack](logitrack/) | 4205 | 物流运单跟踪 | — | `--blue` | 中轴时间轴 + 地图双向联动 |

每套目录结构一致：

```
<project>/
├── backend/          API 服务 + 测试
├── frontend/         前端源码（examprep 无构建步骤）
├── DESIGN.md         中文设计文档
├── README.md         项目说明
├── start.sh          一键启动
├── start.bat         Windows 启动
└── verify.sh         验证脚本
```

---

## 快速开始

任选一套：

```bash
cd mindcare && bash start.sh
```

十套统一验证：

```bash
bash _pipeline/verify-all.sh
```

演示账号统一为 `admin / admin123`，各套另有普通用户账号见其 README。

---

## 目录说明

| 目录 | 内容 |
|---|---|
| `<十个项目>/` | 十套系统源码 |
| [_pipeline/](_pipeline/) | 批量产出流水线（共享内核 + 脚手架 + 验收脚本） |
| [_docs/](_docs/) | 作品设计文档（需求规格、差异化方案） |
| [_screenshots/](_screenshots/) | 十套主界面截图 |
| [_archive/](_archive/) | 与作品无关的历史文件（本地保留，未纳入版本控制） |

---

## 环境要求

| 项 | 版本 |
|---|---|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Python | ≥ 3.10（mindcare / edupulse 用 Flask） |

---

## 验收状态

| 项 | 结果 |
|---|---|
| 十套后端测试 | 全部通过（合计 398 个用例） |
| 十套前端构建 | 全部零错误 |
| 十套接口冒烟 | 全部通过 |
| 十套前端页面托管 | 全部 200 |

---

## 关于流水线

`_pipeline/` 是批量产出的核心：

- `kernel/node/` — 共享后端内核（Express + better-sqlite3 + JWT），自带测试
- `scaffold.mjs` — 读一份 `projects/*.config.mjs` 即可生成完整项目骨架
- `verify-all.sh` / `smoke-frontend.sh` — 十套统一验收

新增一套系统：写一份配置文件，跑一条命令。

```bash
node _pipeline/scaffold.mjs _pipeline/projects/<name>.config.mjs
```
