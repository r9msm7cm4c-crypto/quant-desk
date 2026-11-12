# Quant Desk · Design Tokens

方向：**Institutional Quantitative Research Terminal** — 石墨蓝灰机箱、冷白字符、单一钢蓝信号灯。
所有 token 定义在 `tsp/frontend/src/index.css`（CSS 变量）与 `tsp/frontend/tailwind.config.ts`（Tailwind 映射），PWA 的 `index.html` 使用同名色值。

## 1. 颜色

### 表面与文字（暗色，默认）

| Token | CSS 变量 | 值 | 用途 |
|---|---|---|---|
| Page | `--base` | `#101317` | 页面底色 |
| Panel | `--surface` | `#171C22` | 主面板、侧栏、卡片 |
| Sub-panel | `--elevated` | `#1D242C` | 选中行、输入框、内嵌分组 |
| Border | `--border` | `#2B333D` | 所有 hairline，1px |
| Text / primary | `--fg-primary` | `#E6EAF0` | 正文、数字、标题 |
| Text / secondary | `--fg-secondary` | `#929BA8` | 标签、说明、导航非激活 |
| Text / muted | `--fg-muted` | `#6E7887` | 角标、单位、时间戳 |
| Accent | `--accent` | `#63A7D9` | 主操作、选中、唯一强调 |

层级只靠**表面阶梯 + 1px 边框**，暗色下不用阴影。

### 语义色

| Token | 暗色 | 亮色 | 规则 |
|---|---|---|---|
| `--bull` | `#E05A52` | `#D14A44` | 涨 / 正向变化（A 股惯例，红涨） |
| `--bear` | `#3FA97A` | `#38916A` | 跌 / 负向变化 |
| `--warning` | `#DB9A2B` | `#B8862A` | 数据缺失、需要处理 |
| `--danger` | 同 bull | 同 bull | 破坏性操作、核心能力不可用 |

语义色只表达含义，不做装饰。同一屏最多出现两种语义色。

### 图表色板

`--chart-1..6`：钢蓝 / 红 / 绿 / 金 / 中灰 / 淡紫灰。**一图一主色**，其余系列走中性阶梯；只有确实需要区分序列时才用多色，且必须有一个主导色。

### 亮色

| Token | 值 |
|---|---|
| `--base` | `#F7F9FB` |
| `--surface` | `#FFFFFF` |
| `--elevated` | `#F2F5F8` |
| `--border` | `#DCE2E9` |
| `--fg-primary` | `#161C24` |
| `--fg-secondary` | `#55606F` |
| `--fg-muted` | `#7A8595` |
| `--accent` | `#3B84B8`（加深，保证 4.5:1） |

## 2. 字号

| Token | 值 / 行高 | 用途 |
|---|---|---|
| `text-micro` | 11 / 15 | 角标、单位、时间戳（全站下限） |
| `text-label` | 12 / 16 | 表头、卡片标题、辅助标签 |
| `text-body` | 13 / 19 | 正文、列表、导航 |
| `text-lead` | 14 / 21 | 面板正文、表单 |
| `text-[17px]` | 17 / tight | 页面标题 |
| `text-2xl` | 24 | 数据页大数字 |

- 字重只用 400 / 500 / 600。标题不靠加粗，靠字号与颜色。
- 数字一律 `font-variant-numeric: tabular-nums`（`table` 已在 base 层默认开启）。
- 11px 以下不再使用；小字不用负字距。

## 3. 间距

基准 4px，允许 2px 用于控件内微调。

| 场景 | 值 |
|---|---|
| 控件内 | 4 / 8 / 12 |
| 列表行之间 | 2 / 4 |
| 分组之间 | 12 / 16 / 24 |
| 区块之间 | 20 / 24 / 32 |
| 页边距 | 16（窄）/ 24（中）/ 32（宽） |
| 导航行高 | 34（桌面）、36（触屏） |
| 侧栏宽度 | 240（展开）、56（rail） |

同组元素间距必须小于组间间距；等宽卡片的内边距必须一致。

## 4. 圆角

| Token | 值 | 用途 |
|---|---|---|
| `rounded-chip` | 4 | 标签、键帽、小徽标 |
| `rounded-btn` / `rounded-input` | 6 | 按钮、输入框、下拉 |
| `rounded-card` | 8 | 卡片、面板 |
| `rounded-dialog` | 12 | 弹窗 |

嵌套圆角 = 外圆角 − 内边距（不小于 4）。`rounded-full` 只用于状态点、开关、头像，不用于按钮。

## 5. 阴影与层级

| Token | 值 | 用途 |
|---|---|---|
| `shadow-pop` | `0 8px 24px -8px hsl(214 30% 4% / .55), 0 0 0 1px var(--border)` | 浮层、下拉、悬浮入口 |
| `shadow-hairline` | `inset 0 1px 0 hsl(0 0% 100% / .04)` | 暗色按钮顶部微高光 |

禁止：彩色发光（`shadow-[0_0_…rgba(…)]`）、`drop-shadow` 光晕、玻璃拟态卡片。

## 6. 动效

| 项 | 值 |
|---|---|
| 缓动 | `cubic-bezier(0.22, 1, 0.36, 1)`（`ease-smooth`） |
| 悬停 / 按下 | 120–180ms |
| 菜单 / 弹层 | 160–220ms |
| 入场 / 布局 | 300–500ms |
| 交错 | 40–60ms，最多 6 项 |

只过渡 `color / background-color / border-color / opacity / transform`。不用 `transition-all`，不做 `hover:scale`，不做无限循环的发光呼吸。

## 7. 图标

- 单一图标族：**lucide**，16px，stroke 1.5，颜色取所在文字角色（`muted` 或 `secondary`）。
- 图标盒等宽，与文字间距 8–10px。
- 不用 emoji 作图标或标签装饰；状态用 4px 圆点。
- 12px 及以下的文字旁不放图标。

## 8. 组件约定

以下类定义在 `src/index.css` 的 `@layer components`，新代码优先复用：

```css
.tf-panel          /* 面板：surface + hairline + 8px 圆角 */
.tf-subpanel       /* 面板内分组：elevated/55 + 8px 圆角 */
.tf-section-title  /* 区块标题：左侧 2px 刻度条 + 12/13px 文字 */
.tf-tick           /* 行首状态刻度：data-tone="up|down" */
.tf-btn-primary    /* accent 实底 + 深色字 */
.tf-btn-secondary  /* elevated + hairline */
.tf-input          /* 输入框：base/60 + hairline，focus 转 accent */
.tf-toolbar        /* 窄屏横向滑动工具栏 */
```

### 示例

```tsx
<section className="tf-panel p-4">
  <h2 className="tf-section-title mb-3">持仓分布</h2>
  <div className="flex items-baseline justify-between">
    <span className="text-label text-muted">总市值</span>
    <span className="font-mono text-2xl tabular-nums text-foreground">1,284,300</span>
  </div>
</section>
```

## 9. 禁用清单

- 紫→蓝、任意色相渐变的表面或文字
- 渐变文字（`bg-clip-text`）
- 彩色发光、霓虹边框、径向光晕
- 卡片玻璃拟态（`backdrop-blur` + 半透明 + 彩色阴影）
- emoji 作图标
- 大写 + 宽字距的标签
- 每张卡都带 sparkline / 迷你柱
- 无限循环的脉动、漂浮、视差
- 9px / 10px 字号

---

参考项目：unslop，作者 Damir Sokolovsky（[@heydamir](https://x.com/heydamir)），[github.com/heydamir/unslop](https://github.com/heydamir/unslop)，CC BY 4.0。
