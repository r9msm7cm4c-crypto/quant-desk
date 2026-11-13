# Quant Desk 工程快照 — 分析导读

> **这是给分析者（人或 AI）的入口文档。先花三分钟读完这一页，再进代码。**
> 快照取自 `main` 分支，具体提交号见同目录 `MANIFEST.txt`。打包日期 2026-11-13。

---

## 1. 这是什么

一套 **A 股量化研究工作台**，服务于「数据 → 因子 → 信号 → 组合 → 回测 → 执行」这条链路。它有两个形态、共存于同一仓库：

- **离线单文件 PWA**（仓库根 `index.html`）：零依赖、零后端、可断网使用，约 6,200 行，全部 CSS/JS 内联。
- **全栈 SPA**（`tsp/`）：FastAPI + Polars 后端（408 个路由）+ React 18 前端（20 个页面、146 个组件），本地部署。

两者共用一套视觉语言（同一份色板 token），但不是同一套代码——**这点非常重要，混淆它们会导致对架构的误判**。

---

## 2. 三条产品线（请勿混为一谈）

| 线 | 位置 | 运行时 | 依赖后端 | 状态 |
|---|---|---|---|---|
| **A. 离线 PWA** | `/index.html`、`sw.js`、`manifest.webmanifest` | 浏览器 / WKWebView | 否 | 可用，含内置演示数据 |
| **B. TSP 全栈** | `/tsp/` | Node 构建 + Python 服务 | 是 | 可用，需本地起服务 |
| **C. iOS 交付** | `/ios/`（ObjC 壳）、`/tsp/mobile/`（Capacitor 工程） | iOS 15+ | 否 / 可选 | 壳可出包，Capacitor 工程**未编译** |

三条线的关系：

```
┌─────────────────────────────────────────────┐
│  B. TSP 全栈（唯一有真实计算能力的形态）      │
│     FastAPI 408 路由 + Polars/DuckDB        │
└───────────────┬─────────────────────────────┘
                │ 构建产物 frontend/dist
                ├──────────────► C-1. Capacitor App（WKWebView + OTA）
                │                  需要 macOS 才能 Archive
                │
                └──(人工同步)──► A. 离线 PWA（另一套独立实现，非同一份代码）
                                    │
                                    └──────► C-2. ObjC 壳（已出未签名 IPA）
```

---

## 3. 目录地图

```
.
├── index.html                  ★ 离线 PWA 全部实现（6,174 行，单文件）
├── sw.js                       Service Worker（缓存版本控制）
├── manifest.webmanifest        PWA 清单（landscape 锁定）
├── icons/                      各尺寸图标
├── UI_AUDIT.md                 48 条 UI 问题清单（P0/P1/P2）
├── DESIGN_TOKENS.md            色板与间距 token 定义
├── UI_REDESIGN_REPORT.md       五轮重构报告（Before/After）
│
├── ios/                        ★ 离线壳（Linux 交叉编译，无需 macOS）
│   ├── QuantDesk.m             207 行 ObjC，WKWebView + localStorage 桥接
│   ├── Info.plist
│   ├── build_ipa.sh            下载 SDK → 编译 → ldid 签名 → 打包 IPA
│   └── README.md               安装与自签说明
│
├── scripts/push_via_api.py     备用推送通道（Git Data API 逐提交回放）
│
└── tsp/                        ★ 全栈主体
    ├── backend/                FastAPI + Polars（292 个 .py，112,657 行）
    │   └── app/
    │       ├── main.py         应用入口，SPA 全路径回退
    │       ├── api/            路由层（408 个端点）
    │       ├── services/       业务服务（60+ 模块：回测、因子、AI、告警…）
    │       ├── factors/        因子计算
    │       ├── indicators/     技术指标
    │       ├── backtest/       回测引擎
    │       ├── data_providers/ 行情数据源
    │       └── plugins/        扩展机制
    │
    ├── frontend/               React 18 + Vite 5 + Tailwind（382 文件，102,743 行）
    │   └── src/
    │       ├── pages/          20 个页面
    │       ├── components/     146 个组件
    │       ├── lib/            api 封装、格式化、OTA 客户端、图表工具
    │       └── custom/quant-lab/  量化实验台（前端侧实现）
    │
    ├── native-core/            纯 TS 算法包（12 文件，963 行）
    │   └── src/analytics/      factors / risk / regime / signals / forecast / statistics
    │
    ├── mobile/                 Capacitor 工程（iOS 15.0，SPM）
    │   ├── capacitor.config.ts 含 LiveUpdate 配置
    │   └── ios/App/            Xcode 工程（含 PrivacyInfo.xcprivacy）
    │
    ├── ota/                    更新清单与公钥
    │   ├── stable.json         当前指向 0.1.1，enabled=true
    │   └── ota-public.pem      RSA-3072 公钥（私钥不在仓库内）
    │
    ├── scripts/
    │   ├── publish-ota.sh      构建→签名→发布→写清单（含四道闸门）
    │   └── verify-ota-bundle.mjs  离线校验任意 ZIP + manifest
    │
    └── docs/                   20+ 份设计与部署文档
```

---

## 4. 规模与技术栈

| 部分 | 文件 | 行数 |
|---|---|---|
| 离线 PWA | 1 | 6,174 |
| 后端 Python（`tsp/backend` 全部，含测试与脚本） | 765 | 203,655 |
| 　其中 `app/` 核心业务 | 292 | 112,657 |
| 前端 TSX | 267 | 84,929 |
| 前端 TS | 115 | 19,275 |
| 文档 Markdown | 62 | 11,129 |
| native-core | 12 | 963 |
| ObjC 壳 | 1 | 207 |
| **合计（可统计文本）** | **1,402** | **340,721** |

**后端**：Python ≥3.11、FastAPI、Polars、DuckDB、PyArrow、Pandas、Numba、SSE-Starlette
**前端**：React 18.3、Vite 5.4、TypeScript 5.5、Tailwind、ECharts 5、Capacitor 8
**存储**：Parquet 分区（`kline_daily/date=YYYY-MM-DD/part.parquet`）、DuckDB、localStorage

---

## 5. 数据流

```
外部行情源 ──┐
            ├─► data_providers ─► Parquet 分区（按 date=YYYY-MM-DD）
本地导入   ──┘                          │
                                        ▼
                            backend/app/services/*（60+ 服务）
                                        │  HTTP / SSE
                                        ▼
                                 frontend/src/lib/api.ts
                                        │
                                        ▼
                              React 页面（20 个）
```

离线 PWA 是**另一条独立路径**：内置演示数据直接写在 `index.html` 里，通过 `QL.LAB` 命名空间计算，不发任何网络请求（全文件 `fetch()` 调用数为 0）。

---

## 6. 关键设计决策

| 决策 | 理由 | 代价 |
|---|---|---|
| PWA 做成单文件 | 可邮件分发、断网可用、零部署 | 6,174 行一文件，难维护；与 TSP 前端重复实现 |
| 双端共存而非二选一 | 离线演示 + 在线全功能，覆盖两类场景 | 两套 UI 需同步维护 |
| Parquet 按日期分区 | 增量更新、按日扫描快 | 与「按 symbol 分区」的统计逻辑曾冲突（已修） |
| native-core 用纯 TS | 前端与移动端共用同一份算法 | 无法复用 Python 侧已实现的计算 |
| OTA 用签名 ZIP 而非热更新 JS | 可校验、可回滚、不执行任意代码 | 需要密钥管理与发布流程 |
| Capacitor 工程而非原生重写 | 复用 Web 资产 | 依赖 macOS 才能出包 |

---

## 7. 当前状态：可信度分级

**已验证（有实际执行记录）**

- `tsc -b` 类型检查通过
- `vite build` 生产构建通过（13.2s）
- OTA 单元测试 **10/10 通过**
- 全量测试 **494 通过 / 30 失败**
- OTA 端到端：打包 → 签名 → 发布 → 从 GitHub 下载 → sha256 校验 → RSA 验签 → **字节级一致**
- 远端仓库推送成功，`main` 与本地一致

**部分验证**

- 30 个失败测试全在 `MiniIntraday.*` / `MiniChart.*` 的 SVG 断言（期望 ≥1 个元素，实际 0），判断为 jsdom 渲染问题，**未修复**
- 亮色主题只做了抽查，未逐页回归

**完全未验证（环境限制，不要当成已实现）**

- iOS 真机运行：那个未签名 IPA 从未在任何设备上启动过
- Capacitor App：`tsp/mobile/ios/` 工程从未被 Xcode 编译
- OTA 在真机上的下载/切换/回滚行为
- PWA 在 WKWebView 中的 localStorage 兜底路径

---

## 8. 已知问题（诚实清单）

1. **30 个前端测试失败**，集中在 SVG 迷你图表组件，未定位根因。
2. **OTA 自动更新未启用**：`autoUpdateStrategy: 'none'`，需用户在设置页手动触发。
3. **离线 PWA 与全栈前端功能不对等**：PWA 只有研究实验室 + 演示数据，无实时行情、无 AI 助手。
4. **`enabled=true` 已生效但无客户端**：目前没有任何设备安装 Capacitor App，发布等于空转。
5. **图表网格/图例/tooltip 未按新色板逐个重写**，只改了容器与轴线。
6. **演示数据无 `is_demo` 角标**，用户可能误认为是真实行情。
7. **私有 key 只存在于构建机**：`ota-private.pem` 不在仓库，丢失后无法发布兼容更新（只能换公钥+重发版）。
8. **iOS 图标走 `CFBundleIconFiles` 旧机制**（Linux 无 `actool`），个别系统版本可能回落默认图标。

---

## 9. 建议的分析切入点

如果你的目标是……

- **评架构合理性** → 先看 `tsp/backend/app/main.py`（挂载顺序、SPA 回退）与 `tsp/frontend/src/lib/api.ts`（接口封装层）
- **评量化算法正确性** → `tsp/native-core/src/analytics/`（963 行，最集中）；Python 侧对应 `backend/app/factors/`
- **评 OTA 安全模型** → `tsp/frontend/src/lib/otaUpdate.ts`（校验链）+ `tsp/scripts/publish-ota.sh`（四道闸门）
- **评 UI 工程质量** → `tsp/frontend/src/index.css`（token 层）+ `tailwind.config.ts`（注意 `opacity` 档位必须显式声明，曾因缺失导致 226 处边框不渲染）
- **评单文件 PWA 的可维护性** → `index.html`，重点看 `QL.LAB` 命名空间下的 `demoPanel` / `factorIC` / `composite` / `portfolio` / `execCost`
- **找出隐藏 bug** → 建议跑 `npx vitest run`，那 30 个失败是现成的入口

---

## 10. 如何验证

```bash
# 全栈：后端
cd tsp && uv venv --python 3.11 && uv pip install -e backend

# 全栈：前端
cd tsp/frontend && pnpm install && pnpm test && npx vite build

# 离线 PWA：直接打开 index.html（无构建步骤）
open index.html

# OTA：离线校验任意包
node tsp/scripts/verify-ota-bundle.mjs \
  --bundle <zip> --manifest tsp/ota/stable.json --public-key tsp/ota/ota-public.pem

# iOS 壳（Linux 亦可）
cd ios && ./build_ipa.sh
```

---

## 11. 术语表

| 术语 | 含义 |
|---|---|
| **TSP** | tick-stock-panel，本工程全栈部分的上游项目名 |
| **PWA** | 本仓库根目录的离线单文件应用 |
| **OTA** | Over-The-Air，应用内内容更新（只更新 Web 资源，不更新原生代码） |
| **bundle** | 一次 OTA 发布的 ZIP 包，内含构建后的 Web 资产 |
| **runtimeVersion** | 原生壳与 Web 包的兼容契约，不匹配则拒绝更新 |
| **IC** | Information Coefficient，因子与未来收益的秩相关 |
| **BL** | Black-Litterman，组合优化中的观点融合模型 |
| **Walk-Forward** | 滚动前向回测，避免未来函数 |
| **unslop** | 一套 UI 审查方法（去除渐变、发光、emoji 图标等「AI 味」装饰） |

---

## 12. 关于本快照的取舍

为控制体积、便于分析，**已剔除**：

- `node_modules/`、`.venv/`、`__pycache__/`、`dist/`（依赖与构建产物，可重建）
- `tsp/screenshots/`、`tsp/gui-test-screenshots/`（18 MB 界面截图，无法被文本分析利用）
- `tsp/data/`、`backend/data/`（1,241 个 Parquet 数据文件）
- `tsp/artifacts/`（已发布的 OTA ZIP）
- `*.pem` 私钥（**仅保留公钥**，私钥在任何交付物中都不存在）

**保留**了全部源码、配置、文档、测试、构建脚本。

---

*文档生成于 2026-11-13。若代码与此描述不符，以代码为准。*
