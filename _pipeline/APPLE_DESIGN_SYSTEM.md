# Apple 设计语言基底（十套统一）

> 目标：把十套前端从"每套一种极端风格"收敛到**同一套 Apple 设计语言基底**，
> 再用一个差异化维度区分彼此。**禁止**：霓虹发光、CRT 扫描线、终端绿、高饱和撞色、硬投影、粗黑边框。

---

## 一、为什么换

第一批的差异化走了极端：EduPulse 是赛博霓虹，ExamPrep 是复古终端，HiveMarket 是粗野主义 3px 黑边。
这些风格单看有个性，但**放在一起像十个不同年代的产品**，而且霓虹/终端在评审投影仪上普遍偏暗、偏刺眼。

统一到 Apple 设计语言后：十个产品看起来像**同一个设计团队做的不同 App**，专业度立刻上一档；
差异化不再靠"夸张配色"，而是靠**每个 App 的独有交互范式 + 一个克制的主题色**。

---

## 二、基底规范（所有 App 必须遵守）

### 2.1 字体

```css
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
             "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif;
--font-serif: "Songti SC", "Noto Serif SC", Georgia, serif;   /* 仅 ScriptForge 正文 */
--font-mono: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
```

**字号阶梯**（严格按 Apple HIG，不要自创）：

| 语义 | 字号 / 字重 / 行高 | 用途 |
|---|---|---|
| Large Title | 34px / 700 / 1.2 | 页面主标题（每页只有一个） |
| Title 2 | 22px / 600 / 1.3 | 区块标题 |
| Headline | 17px / 600 / 1.4 | 卡片标题、列表主文案 |
| Body | 17px / 400 / 1.5 | 正文 |
| Subhead | 15px / 400 / 1.45 | 次要信息 |
| Footnote | 13px / 400 / 1.4 | 辅助说明 |
| Caption | 12px / 400 / 1.35 | 标签、时间戳 |

**字距**：大标题 `-0.02em`，正文 `-0.01em`。中文不额外加字距。

### 2.2 色彩

```css
/* 系统色（Apple System Colors，浅色模式） */
--blue:   #007AFF;   --green:  #34C759;   --red:    #FF3B30;
--orange: #FF9500;   --purple: #AF52DE;   --pink:   #FF2D55;
--teal:   #5AC8FA;   --yellow: #FFCC00;   --indigo: #5856D6;

/* 中性阶 */
--label:            rgba(0,0,0,0.92);   /* 主文字 */
--label-secondary:  rgba(60,60,67,0.60);
--label-tertiary:   rgba(60,60,67,0.30);
--separator:        rgba(60,60,67,0.16); /* 发丝线，1px */
--fill-primary:     rgba(120,120,128,0.12);
--fill-secondary:   rgba(120,120,128,0.08);
--bg-grouped:       #F2F2F7;   /* 分组列表底色 */
--bg-surface:       #FFFFFF;   /* 卡片底色 */
```

**每个 App 只选一个系统色作为主题色**，其余颜色只用于语义（成功/警告/错误/信息）。
正文与背景的对比度必须 ≥ 4.5:1。

**深色模式**：必须实现。用 `prefers-color-scheme` 自动切换，深色下背景 `#000` / 卡片 `#1C1C1E` / 分组底 `#0D0D0F`。

### 2.3 圆角与材质

```css
--radius-sm: 8px;    /* 小控件、标签 */
--radius-md: 12px;   /* 按钮、输入框 */
--radius-lg: 16px;   /* 卡片 */
--radius-xl: 22px;   /* 大面板、Sheet */
--radius-full: 999px;/* 胶囊按钮、头像 */
```

- **卡片**：`background: var(--bg-surface)`，**无边框**，阴影极克制：`0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)`
- **毛玻璃**：仅用于**悬浮层**（导航栏、Sheet、抽屉、浮窗），`backdrop-filter: saturate(180%) blur(20px)` + `background: rgba(255,255,255,0.72)`
- **分隔线**：`1px`，颜色 `var(--separator)`，只在列表项之间，**不用外框描边**

### 2.4 间距

8px 基准栅格：`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`。
卡片内边距 `16px`（移动）/ `20px`（桌面）；卡片间距 `16px`；页面左右留白 `24px`（桌面 `32px`）。

### 2.5 控件形态

| 控件 | 规范 |
|---|---|
| 主按钮 | 主题色实底，白字，高 44px（移动）/ 36px（桌面），圆角 `--radius-md`，按下 `scale(0.97)` |
| 次按钮 | `--fill-secondary` 底，主题色文字 |
| 文字按钮 | 无底色，主题色文字 |
| 输入框 | `--fill-secondary` 底，无边框，聚焦时 2px 主题色描边 + 外发光 `0 0 0 4px rgba(主题色,0.12)` |
| 分段控件 | 胶囊底 `--fill-secondary`，选中项白底 + 极浅阴影，滑动过渡 `cubic-bezier(0.4,0,0.2,1)` |
| 开关 | 胶囊轨道 51×31，滑块 27px 白色 + 阴影，开时轨道填主题色 |
| 列表项 | 高 44px 起，左侧内容 + 右侧 chevron（`›`），组内分隔线左缩进 16px |
| 弹窗 | 居中卡片 `--radius-xl`，遮罩 `rgba(0,0,0,0.32)` + `blur(2px)` |
| 抽屉 / Sheet | 侧滑或底部上滑，`--radius-xl` 只圆上/外侧角，带拖拽把手（底部 Sheet） |
| 标签 / 徽章 | 圆角 `--radius-sm`，`--fill-secondary` 底，`13px` 字号，不用高饱和填充 |

### 2.6 动效

```css
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);
--dur-fast: 150ms;  --dur-base: 250ms;  --dur-slow: 400ms;
```

- 页面/卡片进入：`opacity 0→1` + `translateY(8px→0)`，`--dur-base`
- 弹层：从触发点缩放 `0.96→1` + 淡入
- **必须**尊重 `prefers-reduced-motion: reduce`（全部降级为无动画）
- 禁止：无限循环的呼吸/脉冲装饰动画（加载骨架除外）

### 2.7 状态完整性（每页都要有）

加载态（骨架屏，不用转圈）· 空态（插图 + 一句说明 + 一个行动按钮）· 错误态（说明 + 重试）· 无权限态 · 404。
表单：行内校验 + 提交中禁用 + 失败保留输入。

---

## 三、五个 App 的差异化维度

统一基底之上，**每个 App 只在下面这一个维度上做区别**，其余全部遵守基底。

| App | 主题色 | 差异化维度 | 具体做法 |
|---|---|---|---|
| **KitchenFlow**（后厨） | `--orange` | **高密度卡片 + 倒计时压力** | 卡片比其他 App 小一号、圆角 `--radius-md`；订单卡带**剩余时间进度环**，超时卡片主题色描边脉冲（唯一允许的循环动画，且有语义） |
| **CityLens**（巡检） | `--green` | **全屏地图 + 毛玻璃浮层** | 地图铺满，浮层用毛玻璃；标记是水滴形，不用卡片网格 |
| **InterviewGo**（面试） | `--purple` | **对话流 + 气泡节奏** | 只有气泡，没有卡片；AI 气泡 `--fill-secondary` 底，用户气泡主题色底白字 |
| **ScriptForge**（剧本） | `--indigo` | **纸张质感 + 衬线正文** | 编辑器区域米色纸 `#FBF9F6`，正文衬线 17px，行高 1.8；界面元素仍无衬线 |
| **LogiTrack**（物流） | `--blue` | **时间轴 + 地图联动** | 中轴时间轴，节点与地图标记双向联动；运输中节点有流动虚线 |

**禁止的差异化手段**：改字体族（必须同一个）、改圆角基准、改间距基准、加发光/阴影特效。

---

## 四、组件库适配

五个 App 沿用各自的组件库，但**必须通过主题层把库的默认样式压到 Apple 基底之下**：

| App | 组件库 | 适配要点 |
|---|---|---|
| KitchenFlow | shadcn 设计语言 + Tailwind v4 | 重写 `@theme` 令牌为上面这套；Radix 原语保留 |
| CityLens | Element Plus | 覆盖 `--el-color-primary` 等变量；`el-card` 去边框改阴影；`el-table` 去斑马纹 |
| InterviewGo | MUI v7 | `createTheme` 里设 `shape.borderRadius: 12`、`typography.fontFamily`、`shadow` 只留 2 档 |
| ScriptForge | Arco Design Vue | 覆盖 `--primary-6` 等；`a-card` 去边框；`a-input` 改填充式 |
| LogiTrack | Chakra UI v3 | `createSystem` 里定义语义令牌；`Card` 用 `variant="elevated"` 极浅阴影 |

**组件库的品牌辨识度要保留**（评审能看出用了不同库），但**视觉语言必须统一到 Apple 基底**。

---

## 五、自检清单（每个 App 交付前逐条过）

- [ ] 字体族与字号阶梯完全按 §2.1，没有自创字号
- [ ] 主题色只有一个，且取自 §2.2 的系统色
- [ ] 卡片无边框、阴影极浅；毛玻璃只用在悬浮层
- [ ] 分隔线是 1px 发丝线，没有粗边框
- [ ] 深色模式可用，切换无闪烁
- [ ] 圆角只用 §2.3 定义的档位
- [ ] 动效有 `prefers-reduced-motion` 降级
- [ ] 每页有加载 / 空 / 错误 / 无权限四态
- [ ] 没有霓虹、扫描线、终端绿、硬投影、粗黑边
- [ ] 与其它四个 App 并排看：基底一致，但一眼能认出是哪个
