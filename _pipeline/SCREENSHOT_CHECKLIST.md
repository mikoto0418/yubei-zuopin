# 截图采集清单

> 用户要求：每套完成后提供一张主界面截图，用于直观确认形态差异与 Apple 视觉基底。

## 输出目录

`F:\traecode\_screenshots\`

命名规则：`<项目名>-main.png`（主界面）、`<项目名>-detail.png`（可选，核心详情页）

## 每套的截图目标页（登录后）

| 项目 | 主界面（形态记忆点） | 账号 |
|---|---|---|
| MindCare | 底部 Tab 栏 + 卡片流首页 | xiaolan / xiaolan123 |
| ScholarBoard | 三栏编辑器 + ⌘K 命令面板 | alice / 123456 |
| EduPulse | 可拖拽 Widget 驾驶舱首页 | demo / demo123 |
| HiveMarket | 瀑布流集市首页 | zhangsan / 123456 |
| ExamPrep | 时间块日历视图 | demo / demo123 |
| KitchenFlow | 后厨看板（档口分列 + 倒计时环） | chef1 / chef123 |
| CityLens | 全屏地图 + 毛玻璃浮层 | inspector1 / inspector123 |
| InterviewGo | 对话流主界面 | candidate / candidate123 |
| ScriptForge | 创作工作台（三栏 + 衬线编辑器） | writer1 / writer123 |
| LogiTrack | 运单详情（时间轴 + 地图联动） | dispatcher1 / dispatcher123 |

## 采集流程

1. 用 `bash _pipeline/capture-screenshots.sh` 拉起后端（前端产物由后端托管）
2. 对每套：浏览器打开 `http://localhost:<端口>/` → 填入账号登录 → 截主界面
3. 截图统一存到 `_screenshots/`，命名如上
4. 全部采集完统一停进程

## 视觉核对点（截图要能看出）

- [ ] 字体是无衬线（Apple 字体栈），不是等宽/衬线（ScriptForge 正文除外）
- [ ] 卡片无边框、阴影极浅
- [ ] 主题色是 Apple 系统色，不是霓虹
- [ ] 每套的形态一眼可辨（看板/地图/对话/编辑器/时间轴/日历/瀑布流/卡片流/驾驶舱/后厨看板）
- [ ] 十套并排看：基底一致，但各有识别度
