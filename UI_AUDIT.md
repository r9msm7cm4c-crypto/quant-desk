# Quant Desk · UI 审计报告

审计对象：`quant-desk`（`index.html` 单文件 PWA + `tsp/frontend` React 主站）
审计时间：2026-11-12
审计方法：参照 [unslop](https://github.com/heydamir/unslop)（作者 Damir Sokolovsky / [@heydamir](https://x.com/heydamir)，CC BY 4.0）的 signs 清单逐项比对，配合代码扫描与浏览器实测截图。
基准提交：`71c587f`
Before 截图：`screenshots/before/`

## 一、总体判断

主站的基础工程是**有设计系统的**：`src/index.css` 已定义 HSL 色彩变量，`tailwind.config.ts` 已有 `card/btn/input/dialog` 四档圆角与 `tabular` 工具类，A 股红涨绿跌语义色也已正确落地。这属于 unslop 定义的 **light slop（轻度污染）**：骨架合格，问题集中在执行层——一个紫色品牌色与蓝色强调色并行、渐变文字、发光阴影、玻璃拟态、字号过小、移动端工具栏溢出。

因此本次不做推倒重来，按「保留信息架构、重建表层工艺」处理：换掉配色体系与装饰，收紧间距与字号，修掉可读性与移动端缺陷。

## 二、问题清单

严重程度：**P0** 影响可用性 / **P1** 明显损害专业感 / **P2** 打磨项

### 1. 颜色与表面

| # | 问题 | 位置 | 组件 | 级别 | 建议 |
|---|---|---|---|---|---|
| C1 | 品牌色 `#8B5CF6`（紫）与强调色 `#3B82F6`（蓝）并存，同一屏出现两套强调逻辑 | `components/Layout.tsx:76`、`pages/Onboarding.tsx:36` | Logo / 引导页 | P0 | 删除紫色，统一为单一强调色 `#63A7D9`；品牌识别交给字形与间距 |
| C2 | Logo 带紫色外发光 `drop-shadow-[0_0_8px_rgba(139,92,246,0.4)]` | `components/Layout.tsx:803` | 侧栏品牌区 | P1 | 去发光，改用纯色描边图标 |
| C3 | 引导页径向紫光 + 两处紫色渐变卡（`radial-gradient`、`linear-gradient(135deg,…)`） | `pages/Onboarding.tsx:82,221,849` | Onboarding | P1 | 改为平面表面 + 一条 hairline |
| C4 | 标题使用渐变文字 `bg-gradient-to-b … bg-clip-text text-transparent` | `components/PageHeader.tsx:22` | 全站页头 | P1 | 改纯色主文字，层级交给字号 |
| C5 | 彩色发光阴影 20+ 处（`shadow-[0_0_…rgba(59,130,246,…)]`） | `StatCard.tsx:215`、`StrategyCard.tsx:109`、`Layout.tsx:1074/1172` 等 | 卡片 / 开关 / 状态点 | P1 | 暗色下用表面阶梯 + 1px 边框表达层级，去掉彩色阴影 |
| C6 | 玻璃拟态：`backdrop-blur` 71 处，部分卡片同时带模糊 + 阴影 + 半透明底 | `components/dashboard/shared.tsx:104` 等 | KPI 卡 / 浮层 | P1 | 仅浮层（弹窗、下拉）保留模糊；卡片改实色表面 |
| C7 | 硬编码色值 362 处（`#FACC15`、`#C74040`、`#2D9B65`、`#a855f7`…），与 token 并行 | 全站 `.tsx` | 图表 / 标签 / 状态 | P0 | 收敛到 token；图表色另立 `chart-*` 变量并集中在一处 |
| C8 | 语义色饱和度过高（`#F04438`、`#12B76A`）在深色底上刺眼，与整体偏冷的石墨底不协调 | `src/index.css:19-22` | 全局 | P2 | 降饱和：涨 `#E05A52`、跌 `#3FA97A`，保持 4.5:1 |

### 2. 图标

| # | 问题 | 位置 | 组件 | 级别 | 建议 |
|---|---|---|---|---|---|
| I1 | Emoji 作图标或标签装饰：🎁 🎯 📊 🔥 💰 📰 ⚠ 💡 📖 ✅ ❌ ⚪ ✦ ✎ | `AssistantDrawer.tsx:243`、`custom/review/Page.tsx:857-863`、`pages/Dev.tsx:334-423`、`settings/Monitoring.tsx:649,959`、`settings/DataSources.tsx:105` | 助手 / 复盘 / 开发 / 监控 | P1 | 全部换 lucide 线性图标；纯文本状态用彩色圆点 |
| I2 | 三套图标并行：`BrandIcons.tsx` 自绘 8 个导航图标 + lucide + emoji，笔画粗细不一致 | `components/BrandIcons.tsx` | 侧栏导航 | P1 | 导航统一 lucide 16px / 1.5 stroke |
| I3 | 图标尺寸散乱：`h-3 w-3` / `h-3.5` / `h-4` / `h-5` 混用，同一行内不齐 | 全站 | — | P2 | 统一 16px（紧凑处 14px），图标盒等宽 |
| I4 | 勾选/关闭符号用 `✓ ✕ ✗` 文本字符，字形随字体变化 | `ListColumnCustomizerInner.tsx:1259`、`StrategyBuilderDialog.tsx:695` | 列表配置 / 策略构建 | P2 | 换 `Check` / `X` 图标 |

### 3. 字体与文案

| # | 问题 | 位置 | 组件 | 级别 | 建议 |
|---|---|---|---|---|---|
| T1 | 小于 12px 的字号出现 **2320 处**，正文标签大量 10px/9px，1440 宽下需凑近看 | 全站 | — | P0 | 正文下限 12px，辅助信息 11px 仅用于角标；关键数字提升到 13–14px |
| T2 | 大写 + 宽字距标签 `uppercase tracking-[0.12em]`（品牌名、多处分组标题） | `Layout.tsx:807` 等 | 侧栏 / 分组 | P1 | 改句首大写、零字距 |
| T3 | 数字格式不统一：`+12.34%` / `12.3%` / `0.12` / `1.2 亿` 混排，部分未用等宽 | 看板 / 数据 / 回测 | 指标卡 / 表格 | P1 | 统一 `+0.00%`、千分位、`tabular-nums`；单位紧跟数值 |
| T4 | 标题层级靠字重堆叠（`font-semibold` 遍地），缺少字号阶梯 | 全站 | — | P2 | 建立 12/13/14/16/20/24/32 六档，字重只用 400/500/600 |
| T5 | 装饰性状态胶囊过多：`自动`/`暂无`/`不可用`/`EXT`/`Beta` 彩色小标签 | 数据页卡片头、侧栏 EXT 标记 | — | P1 | 保留必要状态，改为中性文字 + 圆点；`EXT` 改为图标角标 |
| T6 | 免责声明位置不统一：回测页有顶部条，因子挖掘置信度只在表内一行 | `Backtest.tsx`、`MiningWorkbench.tsx:279` | 回测 / 挖掘 | P0 | 统计性结论统一加「历史统计，非收益承诺」的固定标注位 |

### 4. 间距与形状

| # | 问题 | 位置 | 组件 | 级别 | 建议 |
|---|---|---|---|---|---|
| S1 | 卡片内边距三档混用：`px-2 py-1`、`p-3`、`p-4`，同屏出现 | 数据页 / 看板 | 卡片 | P1 | 统一 12 / 16 / 20 三档，按密度选用 |
| S2 | 任意值 11 处（`mt-[13px]`、`py-[11px]` 类）破坏 4px 节奏 | 全站 | — | P2 | 归入 4px 阶梯 |
| S3 | 圆角混用：`rounded-card(8)` 与 `rounded-lg/xl/2xl` 并存，19 处任意圆角 | 全站 | — | P1 | 收敛为 4/6/8/12 四档；嵌套圆角 = 外圆角 − 内边距 |
| S4 | 卡片嵌套卡片：数据页「存储」卡片内再套 6 个统计卡，看板 KPI 内套 MiniMetric | `pages/Data.tsx`、`dashboard/widgets.tsx` | 数据 / 看板 | P1 | 内层改用分隔线与行，不再套卡 |
| S5 | 侧栏 34 项平铺，无分组，扩展项与核心项视觉权重相同 | `Layout.tsx:89-96,630-640` | 侧栏 | P0 | 分「核心 / 扩展 / 系统」三组，组间 16px、组内 2px |

### 5. 布局与响应式

| # | 问题 | 位置 | 组件 | 级别 | 建议 |
|---|---|---|---|---|---|
| L1 | 移动端（390px）数据页顶部 7 个按钮横向溢出，文字被压成竖排（「立/即/同/步」） | `pages/Data.tsx` 工具条 | 数据页 | **P0** | 工具条改为「主操作 + 更多」折叠菜单；按钮不换行 |
| L2 | 设置页内容固定 `max-w-3xl`(768px)，1440 下两侧各留 300px 空白 | `settings/*.tsx` | 设置 | P1 | 放宽到 1024–1120，或改双栏 |
| L3 | 顶部工具条按钮数量失控：数据页 7 个、策略页 12 个，颜色各异 | `pages/Data.tsx`、`Screener.tsx` | 页头 | P0 | 按「数据操作 / 视图 / 危险操作」三组，危险操作降为文字按钮 |
| L4 | 看板卡片高度依赖内容，同行卡片底部不齐 | `dashboard/*` | 看板 | P2 | 网格行等高，卡片内部 flex 撑满 |
| L5 | 表格缺移动端形态，直接横向压缩 | `pages/Watchlist.tsx` 等 | 表格 | P1 | 保留横向滚动 + 冻结首列；次要列在窄屏隐藏 |

### 6. 图表

| # | 问题 | 位置 | 组件 | 级别 | 建议 |
|---|---|---|---|---|---|
| G1 | 图表色板各自为政：情绪雷达绿、涨跌分布红绿、指数线蓝，无统一 `chart-*` token | `dashboard/widgets.tsx`、`components/charts/*` | 看板 | P1 | 建立 6 色图表色板，一图一主色 |
| G2 | 网格线对比度过高，与数据线抢注意力 | 多处 ECharts 配置 | 图表 | P2 | 网格降到 `border` 的 50%，标签用 mono 11px |
| G3 | 单位与图例位置不统一（有的左上、有的右上、有的无） | 看板 / 数据 / 回测 | 图表 | P2 | 单位固定右上角 mono；图例统一底部 |
| G4 | 面积渐变填充（`from-bull/45 to-bull/90`）在 K 线下方形成色块噪声 | `dashboard/widgets.tsx:87` | 迷你柱 | P2 | 改单色，或只保留 1px 基准线 |

### 7. 动效

| # | 问题 | 位置 | 组件 | 级别 | 建议 |
|---|---|---|---|---|---|
| M1 | `transition-all` 121 处，连带动画布局属性 | 全站 | — | P1 | 只过渡 `color/background/border/opacity/transform` |
| M2 | 呼吸光晕 `breath-glow`、`breath-sync` 用彩色 `drop-shadow` 脉动 | `src/index.css:125-153` | 侧栏 / 同步按钮 | P1 | 改为静态强调色，或仅透明度呼吸不带光 |
| M3 | `hover:scale-105`、`active:scale-[0.99]` 17 处，卡片悬停位移 | 全站 | 卡片 / 气泡 | P2 | 取消位移，改边框/表面变化 |
| M4 | AI 助手浮动球持续发光 + 缩放吸引点击 | 全局悬浮层 | AI 气泡 | P1 | 静态圆点入口，仅 hover 提亮 |

### 8. 状态与数据诚信

| # | 问题 | 位置 | 组件 | 级别 | 建议 |
|---|---|---|---|---|---|
| D1 | 空状态、错误状态、加载状态各页自绘，样式不一致 | `EmptyState.tsx`、`ErrorState.tsx` 及页面内联 | 全站 | P1 | 统一三态组件：图标 + 一句结论 + 一个动作 |
| D2 | 缺数据统一用 `—`，但部分位置写「暂无」「-」「N/A」 | 全站 | — | P2 | 统一 `—`，悬浮说明原因 |
| D3 | 行情过期提示只在局部（实时行情条），表格内无时效标记 | `Layout.tsx` 实时区 | 全站 | P0 | 表格/卡片统一加「数据截至 HH:MM」或「已过期」标记 |
| D4 | 合成演示数据与真实行情在 UI 上无差别标注 | `tsp/scripts/seed_demo_data.py` | 数据 | P0 | 数据源标记为「演示」时全站显示角标，禁止伪装为实时行情 |

## 三、设计方向

- **Product**：给 A 股研究者用的本地量化终端，数据、筛选、因子、回测、监控在一个工作台里闭环。
- **Character**：精确、克制、夜班值守。不是「现代简约」，而是像仪表盘一样每个刻度都有理由。
- **World**：交易所夜盘监控台。石墨蓝灰的机箱，冷白字符，单一钢蓝信号灯。
- **Moments**：K 线与净值曲线（唯一允许出现丰富色彩的地方）；大号等宽数字的排版本身。
- **Signature**：数字列严格右对齐 + 行首 2px 状态刻度（涨红跌绿），全站一致。

## 四、重构范围

| 层级 | 文件 | 处理 |
|---|---|---|
| Token | `tsp/frontend/src/index.css`、`tailwind.config.ts` | 重建色板/字号/圆角/动效，新增全局组件类 |
| 框架 | `components/Layout.tsx`、`PageHeader.tsx`、`Logo.tsx` | 侧栏分组、去紫、去发光、页头纯色 |
| 通用 | `dashboard/shared.tsx`、`EmptyState.tsx`、`ErrorState.tsx`、`data/StatCard.tsx` | 去渐变/阴影/模糊，统一三态 |
| 页面 | Dashboard / Data / Screener / Factors / Backtest / Watchlist / Settings / Regime / Indices | 修局部 slop，补时效与统计标注 |
| PWA | `index.html` | 同步色板与圆角，保持离线可用 |

不在本次范围：业务逻辑、接口、数据管道、策略引擎。所有改动只触及样式与展示层。
