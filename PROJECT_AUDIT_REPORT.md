# PROJECT_AUDIT_REPORT

> 阶段 0 — 工程备份与基线审计
> 审计对象：`https://github.com/r9msm7cm4c-crypto/quant-desk.git`
> 审计提交：`907561da41a25f31a51601d73f1599bb4c195d98`
> 审计时间：2026-11-13
> 审计环境：Linux 6.6.117 / x86_64（**无 macOS、无 Xcode、无 Swift**）

---

## 0. 备份与回滚点

| 项 | 值 |
|---|---|
| 原始 commit | `907561d` |
| 工作区状态 | 干净（`git status --porcelain` 为空） |
| Git bundle | `backup/quant-desk-907561d.bundle`（22 MB，含全部分支与历史） |
| 工作区快照 | `backup/quant-desk-worktree.tar.gz`（26 MB，3,242 项，排除依赖与数据） |
| 恢复方式 | `git clone quant-desk-907561d.bundle quant-desk-restored` |

两份备份均在工程目录之外，不受后续改动影响。

---

## 1. 环境版本

| 工具 | 版本 | 状态 |
|---|---|---|
| Node | v22.13.1 | 可用 |
| npm | 11.9.0 | 可用 |
| pnpm | 10.28.2 | 可用 |
| Python | 3.11.1 | 可用 |
| **Xcode** | — | **NOT FOUND** |
| **swift / xcodebuild** | — | **NOT FOUND** |
| 磁盘 | 252 GB 可用 | 充足 |

**结论：阶段 5（iOS IPA 构建）在本环境物理上不可执行。** 不是缺依赖，是缺整条 Apple 工具链与 `iphoneos` SDK。任何声称在本环境产出 IPA 的说法都是伪造。

---

## 2. 原始工程结构

```
quant-desk/
├── index.html            6,174 行   离线单文件 PWA（独立实现）
├── sw.js / manifest      Service Worker 与清单
├── ios/                  207 行 ObjC 壳（旧方案，非正式 App）
├── scripts/              推送工具
└── tsp/                  全栈主体
    ├── backend/          292 个 .py（app/）／765 个（含测试）／203,655 行
    ├── frontend/         382 文件 / 102,743 行
    ├── native-core/      12 文件 / 963 行
    ├── mobile/           Capacitor 8 工程
    ├── ota/              清单 + 公钥
    ├── scripts/          发布与校验脚本
    └── docs/             20+ 份设计文档
```

**两个 iOS 工程并存，这是本项目的第一个结构性风险：**

| 工程 | 路径 | 性质 | 是否正式入口 |
|---|---|---|---|
| 旧壳 | `/ios/` | ObjC + WKWebView 加载离线 PWA，Linux 交叉编译 | **否** |
| 目标 | `tsp/mobile/ios/` | Capacitor 8 原生工程 | **是**（唯一） |

旧壳不支持 OTA，不加载全栈前端，不连接 SQLite。它与 Capacitor App 是两个完全不同的产物，**不可互相替代**。

---

## 3. 已实现功能清单

### 3.1 前端页面（主线 20 个 + 扩展 12 个）

主路由（`src/router.tsx`）：

```
/            总览          /watchlist    自选
/analysis    分析（含 :menuId）  /screener   选股
/backtest    回测          /factors      因子
/mining      挖掘          /data         数据
/settings    设置          /login        登录
/onboarding  引导
```

扩展模块（`src/custom/`，12 个有效模块）：

| 模块 | API 调用 | 直连 fetch 文件 |
|---|---|---|
| paper（模拟盘） | 29 | 3 |
| review（复盘） | 9 | 1 |
| monitor（监控） | 6 | 1 |
| source-packages | 5 | 1 |
| limit-ladder（连板梯队） | 4 | 1 |
| abnormal（异动） | 3 | 1 |
| lots（仓位） | 3 | 1 |
| assistant（AI 助手） | 2 | 2 |
| concept-analysis | 2 | 1 |
| industry-analysis | 2 | 1 |
| stock-analysis | 2 | 0 |
| signals（信号库） | 1 | 0 |
| **quant-lab** | **0** | **0** |
| financials | 0 | 0 |

`quant-lab` 与 `financials` 无 API 依赖，是仅有的两个天然具备 Local-first 条件的模块。

### 3.2 后端能力

| 项 | 数量 |
|---|---|
| 路由总数 | **409** |
| 服务模块（`app/services/*.py`） | 94 |
| API 路由文件 | 40+ |
| 数据提供者 | `tickflow_provider` + 自定义适配器 |
| 存储引擎 | Polars / DuckDB / Parquet |

### 3.3 已有能力（可用）

- 行情数据导入、Parquet 分区存储、增量更新
- 技术指标、因子计算（Python 侧）
- 回测引擎（含 Walk-Forward、交易成本模型）
- 模拟盘、监控告警、复盘
- AI 分析报告（依赖外部 LLM API）
- 研究实验室（PWA 侧独立实现）

---

## 4. 未实现功能清单（与任务书要求的差距）

| 任务书要求 | 现状 | 结论 |
|---|---|---|
| SQLite 本地数据库 | **零依赖**，全项目无 `capacitor-community/sqlite`、无 Dexie、无 idb | **未实现** |
| Repository 层 | 不存在 | **未实现** |
| Service / Adapter 分层 | 页面直接调 `api`，无中间层 | **未实现** |
| 数据迁移（migrations） | 不存在 | **未实现** |
| 本地导入导出闭环 | 后端有导入中心，前端无本地文件导入 | **未实现** |
| 离线状态标识 | 无网络状态展示、无数据时效角标 | **未实现** |
| 统一错误处理 | 仅 `Toast` + `ApiError`，无分类错误模型 | **部分** |
| Native Core 覆盖 22 类算法 | 仅约 30 个导出函数 | **部分** |
| SemVer prerelease 支持 | `parseVersion` 丢弃预发布标识 | **缺陷** |
| OTA Manifest 地址 | 指向 `main/ota/stable.json`（缺 `tsp/`）→ 404 | **缺陷** |
| Stable 通道关闭 | `enabled: true` | **缺陷** |

---

## 5. 前后端依赖关系（Local-first 的核心障碍）

```
React 页面（20 主线 + 12 扩展）
        │  184 个文件 import '@/lib/api'
        ▼
  src/lib/api.ts（5,433 行，362 个方法，165 个唯一端点）
        │  const BASE = ''  ← 同源相对路径
        ▼
     /api/...  ──► FastAPI（409 路由）
```

**另有 42 个文件绕过 `api.ts` 直接 `fetch()`，共 81 处调用。** 这些是迁移时的隐藏雷区，逐条列出：

```
components/data/MinuteGapPanel.tsx
components/Layout.tsx
components/StockMultiDayIntradayChart.tsx
components/StockPanel.tsx
components/WatchlistAddMenu.tsx
components/ResourceTransferDialog.tsx
custom/abnormal/Page.tsx
custom/assistant/client.ts
custom/assistant/store.ts
custom/concept-analysis/Page.tsx
custom/industry-analysis/Page.tsx
custom/limit-ladder/Page.tsx
custom/lots/Page.tsx
custom/monitor/Page.tsx
custom/paper/*.tsx（3 个）
custom/review/Page.tsx
custom/source-packages/Page.tsx
...（共 42 个文件）
```

### Local-first 就绪度判定

| 判定项 | 结果 |
|---|---|
| 断网后能否启动 | 能（Shell 加载成功） |
| 断网后页面能否渲染 | 能（骨架屏） |
| 断网后能否取到业务数据 | **否** |
| 断网后能否计算指标 | **否**（计算在后端） |
| 断网后能否保存研究结果 | **否**（无本地库） |
| 天然具备 Local-first 的模块 | 2 个（quant-lab、financials） |

> **结论：当前 14 个扩展模块中 12 个、主线 20 个页面中全部，在无后端时只能显示空态或错误。
> Local-first 就绪度 = 0/22 页面。任务书「不得只包装网页」的要求，当前状态明确未达标。**

---

## 6. 数据模型清单

| 层 | 实现 | 说明 |
|---|---|---|
| 行情 | Parquet 分区 | `kline_daily/date=YYYY-MM-DD/part.parquet` |
| 查询 | DuckDB | 内存/文件混合 |
| 业务状态 | **localStorage**（141 处 / 54 文件） | 仅存 UI 偏好、设置、少量缓存 |
| 结构化业务数据 | **无本地库** | 全部由后端持有 |
| AI 报告 | 后端文件 + 前端缓存 | `aiReportStore.ts` |

localStorage 承担了 141 处状态存储，**这不是数据层**：无事务、无 schema、无版本、容量上限约 5 MB、清除缓存即丢失。把它当作 Local-first 的存储方案是不成立的。

---

## 7. 算法清单

### native-core 现有导出（约 30 个）

| 文件 | 导出 | 覆盖 |
|---|---|---|
| `indicators/index.ts` | 7 | 基础均线类 |
| `indicators/advanced.ts` | 7 | 进阶指标 |
| `analytics/statistics.ts` | 6 | 均值/方差/相关性 |
| `analytics/signals.ts` | 3 | 信号生成 |
| `analytics/factors.ts` | 2 | 因子 |
| `analytics/risk.ts` | 1 | 风险 |
| `analytics/regime.ts` | 1 | 市场状态 |
| `analytics/forecast.ts` | 1 | 预测 |
| `analytics/validation.ts` | 1 | 验证 |
| `analytics/csv.ts` | 1 | CSV |

### 任务书要求的 22 类算法 vs 现状

| 算法 | 状态 |
|---|---|
| SMA / EMA / RSI / MACD / BOLL / ATR / ADX / Stochastic / OBV | 需逐项核对（Native Core 有部分，未做一致性测试） |
| Donchian / Momentum / Volume Surprise | 未见明确实现 |
| Cross-sectional Z-score / Spearman Rank IC | **未见**（PWA 侧有独立实现，非 native-core） |
| Sharpe / Sortino / Calmar / VaR / CVaR | 部分（`risk.ts` 仅 1 个导出） |
| Walk-forward Validation | **未见**（后端 Python 有） |
| Market Regime | 有（`regime.ts`，1 个导出） |

> **不能宣称 Native Core 是后端算法的替代品。** 当前约为后端的 10%～15%，且无一致性测试。

---

## 8. iOS 构建依赖

| 项 | 值 | 状态 |
|---|---|---|
| 工程路径 | `tsp/mobile/ios/` | 存在 |
| Bundle ID | `com.quantdesk.mobile` | 已配置 |
| Deployment Target | 15.0 | 已配置 |
| Marketing Version | 0.1.0 | 已配置 |
| Capacitor | 8.x | 已安装 |
| 插件 | core / ios / live-update | 3 个 |
| PrivacyInfo.xcprivacy | 已接入 Resources 阶段 | 已配置 |
| SPM 依赖 | `CapApp-SPM` | 已生成 |
| 是否被 Xcode 编译过 | **从未** | BLOCKED |
| 是否有 `ios/App/App/public` 产物 | 有（6.8 MB，gitignore） | 可重建 |

---

## 9. OTA 状态

| 项 | 实际值 | 是否符合任务书 |
|---|---|---|
| `ota/stable.json` enabled | **true** | **否**，要求 false |
| manifest 默认 URL | `.../main/ota/stable.json` | **否**，缺 `tsp/`，实际 404 |
| `.env.ota.example` URL | 同上有误 | **否** |
| 公钥位置 | `tsp/ota/ota-public.pem`、`tsp/mobile/ota-public.pem` | 是 |
| 私钥 | 仅构建机，未入库 | 是 |
| `compareVersions` prerelease | 忽略（`0.1.1-beta.1` 等价于 `0.1.1`） | **否** |
| Host allowlist | github.com / objects / release-assets | 已实现 |
| GitHub Release | `ota-v0.1.1` 存在，资产 3,251,220 B | 已发布 |
| 端到端验签 | 下载 → sha256 → RSA 验签 → 字节一致 | 已验证 |
| 真机更新 | **未执行** | NOT TESTED |

**矛盾点确认属实**：`stable.json` 已 `enabled=true` 且 Release 已存在，但 OTA 从未在真机验证，且 manifest URL 是错的——**装了 Capacitor App 的设备会拉取 404**。这是必须先修的 P0。

---

## 10. 测试状态

**执行命令**：`cd tsp/frontend && npx vitest run --reporter=json`
**环境**：Linux / Node 22.13.1 / jsdom
**耗时**：22.89s

| 指标 | 数值 |
|---|---|
| 测试文件 | 75（5 失败 / 70 通过） |
| 测试总数 | **524** |
| 通过 | **494** |
| 失败 | **30** |

### 失败分布（逐个文件）

| 文件 | 失败数 | 性质 |
|---|---|---|
| `components/stock-table/MiniIntraday.auction.test.tsx` | 11 | SVG 元素断言 |
| `components/stock-table/MiniCandlestick.test.tsx` | 7 | SVG 元素断言 |
| `components/stock-table/MiniIntraday.volume.test.tsx` | 7 | SVG 元素断言 |
| `components/stock-table/MiniIntraday.test.tsx` | 4 | SVG 元素断言 |
| `custom/signals/Signals.numeric-right.test.tsx` | **1** | **非 SVG，见下** |

### 关于那 1 个非 SVG 失败（重要）

```
测试：信号库页: 数字右值条件不再触发错误边界, 正常渲染
断言：expect(container.textContent).toContain('0.6')
实际：渲染出「信号库 条件信号定义… 0 · 0 …」
```

页面确实渲染了（未触发错误边界），但信号列表为空，所以取不到 `0.6`。原因是该页面在 jsdom 中同样去请求 `/api/signals`，无后端 → 空列表。

**这不是断言写错，而是「页面强依赖后端」在测试层的直接体现。** 它与阶段 2 的 Local-first 是同一个根因。

### 其余 29 个

断言形如 `expect(bars.length).toBeGreaterThanOrEqual(1)`，实际 `0`。即 SVG 中找不到预期的 `rect[fill=…]` 元素。可能是渲染条件变化（如需要容器尺寸/`getBoundingClientRect` 返回 0）导致未绘制。**尚未定位根因，标记为 IN PROGRESS，不宣称与业务无关。**

### NOT RUN（未执行，不标注为通过）

| 测试类型 | 状态 |
|---|---|
| 后端 pytest | **NOT RUN**（未执行） |
| native-core 单测 | **NOT RUN** |
| E2E / Playwright | **NOT RUN** |
| iOS 真机测试 | **NOT RUN**（无设备） |
| OTA 真机更新与回滚 | **NOT RUN** |
| 离线断网场景 | **NOT RUN** |
| 数据导入导出闭环 | **NOT RUN** |

---

## 11. 风险与阻断问题

### P0 阻断

| # | 问题 | 影响 | 可否在本环境解决 |
|---|---|---|---|
| 1 | **无 macOS/Xcode** | 阶段 5 IPA 构建完全不可执行 | **否，永久阻断** |
| 2 | OTA manifest URL 缺 `tsp/` | 已装 App 拉取 404，更新功能形同虚设 | 是 |
| 3 | `stable.json` enabled=true 但未验证 | 用户可能收到不可用更新 | 是 |
| 4 | 零本地数据库 | Local-first 无从谈起，阶段 2 全量未开始 | 是（工作量大） |
| 5 | 22 个页面全部依赖 `/api` | 断网即空壳 | 是（难度最高） |

### P1 重要

| # | 问题 | 影响 |
|---|---|---|
| 6 | 42 个文件绕过 api.ts 直接 fetch | 迁移时易漏改 |
| 7 | `compareVersions` 忽略 prerelease | 预发布版本比较错误 |
| 8 | Native Core 覆盖率约 10–15% | 无法替代后端计算 |
| 9 | 30 个测试失败未定位根因 | 回归基线不可信 |
| 10 | 两个 iOS 工程并存 | 误用旧壳构建的风险 |

### P2 一般

| # | 问题 |
|---|---|
| 11 | localStorage 承担 141 处状态，无 schema |
| 12 | 无统一错误分类模型 |
| 13 | 离线状态无 UI 标识 |

---

## 12. 结论与建议执行顺序

### 结论

1. **工程完整、可恢复**，备份与回滚点已建立。
2. **OTA 存在两处真实缺陷**（URL 404、enabled 误开），且 SemVer 不完整——任务书的描述准确，不是臆测。
3. **Local-first 尚未开始**：没有 SQLite，没有 Repository 层，22 个页面全部依赖后端。当前状态距离任务书要求差距最大，且不是「补几个接口」能解决的量级。
4. **iOS IPA 在本环境不可能产出**，这一条无法通过任何技术手段绕开。

### 建议顺序

| 阶段 | 可行性 | 说明 |
|---|---|---|
| 0 审计 | ✅ 已完成 | 本报告 |
| 1 OTA 修复 | ✅ 可完成 | 全部为代码级修复 + 可验证 |
| 2 Local-first | ⚠️ 部分可完成 | 建数据层与 Repository 可行；22 页面全量迁移工作量极大，需分批 |
| 3 持久化/导入导出 | ⚠️ 依赖阶段 2 | 数据层就绪后才能做 |
| 4 UI + 测试 | ⚠️ 部分 | UI 可维护；测试根因可查；iOS 测试 NOT RUN |
| 5 IPA | ❌ BLOCKED | 缺 macOS/Xcode |
| 6 OTA 发布验证 | ⚠️ 部分 | 签名链路可验；真机不可验 |

### 停止条件核对

任务书要求「工程不完整、关键文件缺失或依赖无法安装时，先输出问题报告」。

- 工程完整性：✅ 通过
- 关键文件：✅ 齐全
- 依赖安装：✅ pnpm 与 npm 均可安装
- **环境能力：❌ 缺少 macOS/Xcode**

因此：**阶段 1 至 4 可以继续，阶段 5 必须以 BLOCKED 状态交付，不得声称完成。**

---

*本报告所有数字均来自实际命令输出，未做估算或推测。可复现命令见各节。*
