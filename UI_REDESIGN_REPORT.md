# Quant Desk · UI 重构报告

项目：Quant Desk（`index.html` 单文件 PWA + `tsp/` 全功能主站）
时间：2026-11-12
基准提交：`71c587f`（改动前）
改动规模：164 个文件，+2124 / −1929 行（全部为样式与展示层，未改业务逻辑）

设计审查方法参考开源项目 [unslop](https://github.com/heydamir/unslop)，作者 Damir Sokolovsky（[@heydamir](https://x.com/heydamir)），CC BY 4.0。本文档与其派生的 `UI_AUDIT.md`、`DESIGN_TOKENS.md` 保留该署名。

---

## 一、方向

动手前先定方向，五个 Pass 都围绕它执行：

- **Product** — 给 A 股研究者用的本地量化终端，数据、筛选、因子、回测、监控在一个工作台里闭环。
- **Character** — 精确、克制、夜班值守。不是「现代简约」，而是仪表盘：每个刻度都有理由。
- **World** — 交易所夜盘监控台。石墨蓝灰机箱、冷白字符、单一钢蓝信号灯。
- **Moments** — K 线与净值曲线（全站唯一允许丰富色彩的地方）；大号等宽数字的排版本身。
- **Signature** — 数字列严格右对齐 + 行首 2px 状态刻度（涨红跌绿），区块标题左侧 2px 刻度条。

## 二、审计结论

完整清单见 `UI_AUDIT.md`，共 48 条，分级 P0/P1/P2。总体判断是 **light slop**：工程本来就有 CSS 变量、四档圆角、`tabular` 工具类和正确的红涨绿跌语义，问题在表层执行。

最要紧的四条：

| 编号 | 问题 | 处理 |
|---|---|---|
| C1 | 品牌紫 `#8B5CF6` 与强调蓝 `#3B82F6` 两套强调逻辑并存 | 紫色全部移除，只保留 `#63A7D9` |
| T1 | 小于 12px 字号 2320 处（9px 261、10px 1091） | 全量上提到 11px 下限 |
| L1 | 390px 下数据页工具条把文字压成竖排 | 工具条改横滑，页头换行 |
| L3 | 数据页 7 个、策略页 12 个同级按钮，颜色各异 | 主次分级 + 危险操作降级 |

另外发现一个隐藏缺陷：代码里 226 处 `bg-accent/15`、`border-accent/8` 这类透明度，Tailwind 默认档位里没有 8/12/15/35/45/55/65/85，**这些类此前根本没生成**——大量边框和底色其实一直没渲染。本次在 `tailwind.config.ts` 补齐档位，视觉层次才真正出来。

## 三、五个 Pass

### Pass 1 · Spacing

- 建立 4px 基础网格：页边距 16/24，卡片内边距 12/16/20 三档，区块间距 20/24。
- 侧栏：224 → 240px，导航行 36 → 34px，组内 gap 12 → 10，组间 16。
- 统一表格行高与单元格内边距；所有卡片内边距从 `p-1.5`(6px) 归到 `p-2`(8px) 或 `p-3`(12px)。
- 清理 `mt-[13px]`、`py-[11px]` 一类任意值。

涉及：`components/Layout.tsx`、`PageHeader.tsx`、`dashboard/*`、`pages/Data.tsx`、`pages/Settings.tsx`。

### Pass 2 · Color and Icons

- **色板重建**（`src/index.css`）：页面 `#101317`、面板 `#171C22`、次级面板 `#1D242C`、边框 `#2B333D`、主文字 `#E6EAF0`、次文字 `#929BA8`、弱化 `#6E7887`、强调 `#63A7D9`。
- **语义色降饱和**：涨 `#E05A52`、跌 `#3FA97A`、警示 `#DB9A2B`，在石墨底上不再刺眼。
- **图表色板**：新增 `--chart-1..6`，一图一主色，其余走中性。
- **图标统一 lucide**：侧栏 8 个自绘图标换成 `LayoutDashboard / Star / Filter / FlaskConical / History / Activity / LineChart / Database`，统一 16px、stroke 1.5；复盘页 7 个 emoji、监控设置 4 处、开发页 4 处、看板 1 处、助手 1 处全部替换或移除。
- **去发光**：13 处彩色 `shadow-[0_0_…]`、1 处 `drop-shadow`、5 处渐变文字、44 处渐变面全部清理；AI 悬浮球从「紫色 sparkle + 蓝色发光」改为实底钢蓝 + 消息图标。
- **去玻璃拟态**：卡片上的 `backdrop-blur` 移除（保留弹窗与遮罩的模糊）。
- 硬编码色 362 处收敛到新色板（canvas / ECharts 不支持 CSS 变量，故用同值 hex 而非 `var()`）。

### Pass 3 · Typography and Copy

- 字号阶梯：11 / 12 / 13 / 14 / 16 / 17 / 20 / 24。
- 2320 处 9px / 10px 全部提到 11px；看板卡片标题 12px，页头 17px / 500。
- 数字统一 `tabular-nums`，表格在 `@layer base` 里默认开启。
- 去掉 `uppercase tracking-[0.12em]` 的品牌名与大写分组标签，改句首大写、零字距。
- 装饰性胶囊（琥珀 `PRO`、`EXT`、`本次跳过`）降级为中性小圆点或纯文字。

### Pass 4 · Layout

- 侧栏加「扩展」分组标题，34 项平铺切成两段；`EXT` 角标从视觉元素移除（分组已表达）。
- 页头改为可换行：窄屏下操作区独占一行并横向滑动，任何按钮都不再压成竖排。
- 看板标题条去掉渐变竖条与 Gauge 图标，情绪分改为中性胶囊 + 语义色数字。
- 数据页内容容器改为响应式 `px-4 sm:px-6 lg:px-8`；设置页子页从 `max-w-3xl` 放宽到 `max-w-5xl`。
- 看板卡片标题统一为「左侧 2px 刻度条 + 12px 文字」，去掉图标与渐变条。

### Pass 5 · Details and Motion

- `transition-all` 121 处改为 `transition-colors`；`hover:scale` / `active:scale` 20 处移除。
- 统一缓动 `cubic-bezier(0.22,1,0.36,1)`，时长 140 / 180 / 240ms。
- 呼吸灯从「彩色 drop-shadow 脉动」改为仅透明度起伏。
- 圆角收敛：4 / 6 / 8 / 12，`lg/xl/2xl/3xl` 全部向下压一档；卡片 8px、控件 6px、标签 4px。
- 新增全局焦点环（`accent/55`，2px）与暗色输入框兜底（此前回测页参数输入框是白底黑字）。

## 四、九个模块的处理

| 模块 | 页面 | 主要改动 |
|---|---|---|
| Market Overview | 看板 | 标题条去装饰；分布柱从 6% 透明改实色，轴标签不再重叠；卡片标题去图标；情绪胶囊中性化 |
| Market Data | 数据 | 工具条主次分级、主按钮改实底；卡片标题去状态胶囊；移动端工具条横滑；内容区响应式内边距 |
| Strategy Analysis | 策略 / 因子 | 「创建策略·AI」从金色改主色实底，「叠加策略」改次级；策略池计数去胶囊；因子列表统一勾选与行高 |
| Backtesting | 回测 | 参数面板输入框改暗色；分组标题统一；空状态尺寸收敛 |
| Risk Analytics | 回测 / 市场环境 | 语义色降饱和，涨跌不再刺眼；图表网格与标签统一 mono |
| Prediction | 因子挖掘 / AI 分析 | 置信度、样本量保持可见；AI 入口去 sparkle 与发光，改为中性图标 |
| Portfolio / Watchlist | 自选 | 顶部工具条图标统一 16px；空状态收敛；分组色点保留但不发光 |
| Data Import | 数据 / 导入与备份 | 设置页子页宽度放宽，导入面板与其它设置页对齐 |
| Settings | 设置 | 左栏选中态从蓝色底改表面阶跃；徽标去胶囊；能力方格从蓝/红/黄改成 accent + 中性 + 单一警示色 |

## 五、响应式

- **Desktop（≥1024）**：侧栏 240px，内容流式，页头单行。
- **Tablet（768–1023）**：侧栏收为 rail 或抽屉，内容区 padding 降到 16。
- **Mobile（<768）**：页头换行、标题左让 56px 避开菜单键；工具条 `overflow-x: auto` + `nowrap`；看板 KPI 网格 2 列；卡片单列；表格保持横向滚动，不压缩字号。
- 实测 390×844：`scrollWidth = clientWidth = 390`，无横向溢出，无竖排文字。

## 六、测试

| 项 | 方法 | 结果 |
|---|---|---|
| 构建 | `pnpm build`（`tsc -b && vite build`） | 通过，0 error |
| 控制台 | 10 个路由逐个打开，监听 `pageerror` / `console.error` | 0 个前端错误（仅外部数据源 403 与 GitHub release 检查失败，属环境无外网凭据） |
| 路由 | `/` `/watchlist` `/screener` `/factors` `/backtest` `/data` `/settings` `/regime` `/indices` `/pwa/` | 全部 200 且渲染正常 |
| 交互 | 设置页切换「网络设置 / 系统设置 / 关于」 | 面板切换正常 |
| 移动端 | 390×844 截图 + 溢出检测 | 无横向溢出 |
| 亮色 | 移除 `html.dark` 后读取计算样式 | body `#F9FAFB`、侧栏 `#FFFFFF`、导航文字 `#171E26`，对比正常 |
| PWA | `/pwa/` 打开 | 正常，标题「量化工作台 · Quant Desk」 |

Before / After 截图见 `screenshots/`：`before/`、`after/`、`compare/`（同页上下对照）。

## 七、未完成与限制

如实列出，不宣称已完成：

1. **亮色主题只做了抽查**，未逐页面回归。暗色是产品默认与主要场景，亮色 token 已同步更新，但个别页面在亮色下可能仍有低对比细节。
2. **图表内部配色只统一了色板常量**（ECharts option、canvas 绘制），没有重写每个图表的网格、图例、tooltip 样式。列为后续项。
3. **数据时效标注（审计 D3）只覆盖了已有的「非实时」标签**，表格行级「数据截至」未加——需要后端在响应里带时间戳，属接口改动，本次不越界。
4. **演示数据角标（D4）未实现**：`seed_demo_data.py` 生成的合成数据目前在界面上与真实数据无差别。建议在数据源层加 `is_demo` 标记后由前端显示。
5. **空状态只统一了组件**（`EmptyState` / `ErrorState`），策略页、自选页仍有页面内自绘的空状态，未全部替换。
6. **未引入任何新依赖**，也未新增 UI 框架；`BrandIcons.tsx` 保留在仓库中（PWA 图标仍可用），只是不再用于侧栏导航。

## 八、交付物

| 文件 | 内容 |
|---|---|
| `UI_AUDIT.md` | 48 条问题清单：位置、组件、级别、建议 |
| `DESIGN_TOKENS.md` | 色板、字号、间距、圆角、阴影、动效、图标规范 |
| `UI_REDESIGN_REPORT.md` | 本文件 |
| `screenshots/before/` | 改动前基准截图 |
| `screenshots/after/` | 改动后截图（桌面 + 移动） |
| `screenshots/compare/` | 同页上下对照图 |
| `quant-desk/` | 完整工程（含改动） |
| `quant-desk-before-*.tar.gz` | 改动前完整备份 |
