# Quant Desk — 阶段 2 页面迁移矩阵

> **状态声明（以此为准）**
>
> ```
> PHASE_2_STATUS   = NOT_STARTED
> MIGRATED_PAGES   = 0/22
> LOCAL_DATABASE   = NOT_IMPLEMENTED
> ```
>
> `tsp/LOCAL_FIRST_PHASE2_REPORT.md` 是原始上传包附带的历史文档，描述的是上一轮「native-core + quant-lab」的增量，**不属于本次阶段 2 的执行记录**，不得作为进度依据。本文件是阶段 2 的唯一进度账本。

盘点时间：2026-11-13　代码基线：`ed553e9`（与 `origin/main` 一致，工作区干净）

---

## 0. 这份矩阵是怎么来的

不是靠读文档或凭印象填的，全部由源码静态扫描得出，可复现：

| 步骤 | 方法 | 产物 |
|---|---|---|
| 1 | TypeScript Compiler API 解析 `src/lib/api.ts`，提取 `api` 对象每个方法的 HTTP 方法、路径、入参签名、返回泛型 | 364 个方法（362 个带返回类型） |
| 2 | 遍历前端全部 `.ts/.tsx`，提取 `api.xxx()` 调用点与裸 `fetch()` | 429 处 api 调用 / 26 处裸 fetch |
| 3 | 按「页面目录 + 该页专用 hook/store」归并，避免共享组件把每页数字撑大 | 22 个页面单元 |
| 4 | 按路径前缀对照 `backend/app/api/*.py` 与 `services/` | 后端模块与数据模型 |
| 5 | 扫描 `*.test.ts(x)` 与被测文件路径匹配 | 页面级测试归属 |

**汇总**：22 个页面合计 367 处 API 引用（去重后 300 个不同方法、246 个路径模板），其中 364 处是实际调用点，其余是 `queryFn: api.xxx` 形式的引用传递。

口径说明：

- 「页面」= 有独立路由与独立功能边界的界面单元。22 = 10 个核心数据页 + 12 个扩展页。
- `Onboarding`、`Auth`、`Branding`、`Dev` 四个入口不计入 22：它们是外壳/登录/品牌/调试，不承载业务数据流。其中 `Onboarding` 与 `Auth` 确实调用 `/api/settings` 与 `/api/auth/*`，会在阶段 3 随 `preferences` 一起本地化。
- 「当前使用的 API」取该页目录与其专用 hook 的直接调用，不含 `Layout` 外壳的全局请求（后者单列于 §2）。

---

## 1. 22 页总表

| # | 页面 | 路由 | API 方法 | 调用点 | 后端模块 | 状态 |
|---|---|---|---:|---:|---|---|
| 1 | 总览看板 | `/` | 10 | 9 | `overview / pipeline / alerts / kline` | NOT_STARTED |
| 2 | 个股分析报告 | `/analysis/:menuId` | 5 | 2 | `analysis / ext_data` | NOT_STARTED |
| 3 | 自选股 | `/watchlist` | 26 | 24 | `watchlist / kline` | NOT_STARTED |
| 4 | 选股器 | `/screener` | 34 | 40 | `screener / strategy / signals` | NOT_STARTED |
| 5 | 回测与因子挖掘 | `/backtest` | 48 | 50 | `backtest / mining / guardian` | NOT_STARTED |
| 6 | 因子库 | `/factors` | 11 | 12 | `factors` | NOT_STARTED |
| 7 | 数据中心 | `/data` | 49 | 49 | `data / ext_data / import_center` | NOT_STARTED |
| 8 | 指数 | `/indices` | 4 | 4 | `indices / intraday` | NOT_STARTED |
| 9 | 市场环境 | `/regime` | 8 | 9 | `regime` | NOT_STARTED |
| 10 | 设置 | `/settings` | 80 | 83 | `settings / pages_admin / upgrade_guard` | NOT_STARTED |
| 11 | 个股分析（扩展） | `/stock-analysis` | 9 | 9 | `stock_analysis` | NOT_STARTED |
| 12 | 连板梯队 | `/limit-ladder` | 5 | 4 | `screener` | NOT_STARTED |
| 13 | 概念板块 | `/concept-analysis` | 4 | 2 | `ext_data` | NOT_STARTED |
| 14 | 行业板块 | `/industry-analysis` | 4 | 2 | `ext_data` | NOT_STARTED |
| 15 | 财务概况 | `/financials` | 8 | 8 | `financials` | NOT_STARTED |
| 16 | 监控中心 | `/monitor` | 14 | 11 | `monitor_rules / alerts` | NOT_STARTED |
| 17 | 异动监控 | `/abnormal` | 4 | 3 | `abnormal` | NOT_STARTED |
| 18 | 持仓提醒 | `/lots` | 5 | 3 | `lots` | NOT_STARTED |
| 19 | 模拟盘 | `/paper` | 23 | 26 | `paper / paper_execution` | NOT_STARTED |
| 20 | 信号库 | `/signals` | 6 | 4 | `signals / strategy` | NOT_STARTED |
| 21 | 复盘 | `/review` | 10 | 10 | `market_recap` | NOT_STARTED |
| 22 | 量化研究实验室 | `/quant-lab` | 0 | 0 | `（无后端）` | NOT_STARTED |

---

## 2. 共享层（不归属单页，但迁移时必须一并处理）

### 2.1 全局外壳 `components/Layout.tsx`

每个页面渲染时都会执行，共 6 个请求，迁移后必须改为本地：

| 方法 | 路径 | 用途 |
|---|---|---|
| `watchlistEnriched` | `GET /api/watchlist/enriched` | 侧边栏自选行情 |
| `pipelineJobs` | `GET /api/pipeline/jobs` | 顶部数据任务进度 |
| `indexQuotes` | `GET /api/intraday/indices` | 顶栏指数条 |
| `alertsList` | `GET /api/alerts` | 提醒铃铛 |
| `updateQuoteInterval` / `updateRealtimeQuotes` | `PUT /api/settings/preferences/*` | 刷新频率设置 |

### 2.2 跨页共享组件携带的 API

这些组件被多页复用，迁移时只需实现一次：

| 组件 | 携带的 API | 影响页面 |
|---|---|---|
| `components/StockPreviewDialogContent.tsx` | `watchlistAdd` / `watchlistRemove` / `abnormalOverview` | 看板、自选、选股、扩展页 |
| `components/financials/StockFinancialSearch.tsx` | `instrumentSearch` | 财务、看板 |
| `components/EChartsCandlestick.tsx` | `coord` / `value` | 所有带 K 线图的页面 |
| `components/DefinitionPicker.tsx` | `definitionsList` / `definitionsSmoke` | 数据中心、选股 |
| `components/DimensionMembersDialogContent.tsx` | `dimensionMembers` / `dimensionIntraday` | 个股分析 |
| `components/ext-data/*` | `extDataPullConfig` / `extDataPullRun` / `extDataDetectFields` / `extDataCreate` / `extDataUpdate` / `extDataBackup` | 数据中心、概念/行业板块 |
| `components/signals/CustomSignalDialog.tsx` | `customSignalSave` / `customSignalsAiGenerate` / `strategyAiStatus` | 信号库、选股 |

### 2.3 绕过 `api.ts` 的裸 `fetch`（改造时容易漏）

| 文件 | 端点 | 说明 |
|---|---|---|
| `custom/assistant/client.ts` | `/api/custom/assistant/chat`、`/actions` | 流式对话，SSE |
| `custom/assistant/store.ts` | `SESSIONS_URL` | 会话持久化 |
| `custom/paper/executionClient.ts` | `/api/custom/paper-execution/*` | 策略执行 |
| `extensions/runtime.tsx` | `GET /api/ext-pages` | 扩展页清单 |
| `lib/api.ts` 自身 | `/api/financials/analyze`、`/api/stock-analysis/analyze`、`/api/market-recap/analyze` | 三条流式通道 |
| `lib/backtestTask.ts` / `robustTask.ts` / `walkforwardTask.ts` | `*/cancel` | 任务取消（轮询之外的旁路） |
| `lib/taskRegistry.ts` | `/api/task-registry` | 统一任务表 |
| `lib/uiPrefs.ts` | `/api/settings/preferences` | 偏好旁路 |
| `lib/updateCheck.ts` | `api.github.com` / `github.com` | 版本检查（外网） |
| `lib/otaUpdate.ts` | OTA 清单 URL | 内容更新（外网） |

---

## 3. 逐页明细

### 3.1 总览看板 — `/`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 总览看板 |
| 2. 页面路由 | `/` |
| 3. 当前使用的 API | 10 个方法 / 9 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/overview.py`（市场概览聚合：指数、涨跌家数、情绪分、板块）、`api/pipeline.py`（数据任务状态）、`api/alerts.py`（提醒流）、`api/settings.py`（情绪分配置、看板布局）、`api/kline.py` + `api/intraday.py`（指数与个股行情）、`api/financials.py`（财务快照） |
| 7. 依赖的数据模型 | `overview_market`（聚合结果，非持久实体）、`pipeline_jobs`、`alerts`、`preferences.dashboard_layout` / `emotion_score_config`、`kline_index_daily` / `kline_index_minute`、`financial_*` |
| 8. 本地替代方案 | 指数与自选行情改读本地 `kline_*` 表；情绪分/涨跌家数由本地 `analytics/statistics.ts` 重算；`pipeline_jobs` 改为本地 `jobs` 表（SQLite 队列）；`alerts` 由本地规则引擎生成；布局继续走 `preferences` 表 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `pages/Dashboard.test.tsx`、`pages/Dashboard.status.test.tsx`、`components/dashboard/layout.test.ts`、`components/dashboard/useDashboardLayout.test.tsx` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `emotionScoreConfigUpdate` | PUT | `/api/settings/emotion-score/config` | config: EmotionScoreConfig \| null | EmotionScoreConfigPayload | 2 |
| `alertsList` | GET | `/api/alerts${s ? `?${s}` : ''}` | params?: { days?: number; limit?: number; source?: string; type?: string; extColumns?: string } | { alerts: AlertEvent[]; total: number } | 1 |
| `emotionScoreConfig` | GET | `/api/settings/emotion-score/config` | — | EmotionScoreConfigPayload | 1 |
| `overviewMarket` | GET | `/api/overview/market${asOf ? `?as_of=${asOf}` : ''}` | asOf?: string | OverviewMarket | 1 |
| `pipelineJob` | GET | `/api/pipeline/jobs/${id}` | id: string | PipelineJob | 1 |
| `pipelineJobs` | GET | `/api/pipeline/jobs?limit=${limit}` | limit = 20 | { active_id: string \| null; jobs: PipelineJobSummary[] } | 1 |
| `refreshCache` | POST | `/api/data/refresh-cache` | — | { ok: boolean } | 1 |
| `saveDashboardLayout` | PUT | `/api/settings/preferences/dashboard-layout` | layout: Preferences['dashboard_layout'] | { dashboard_layout: Preferences['dashboard_layout'] } | 1 |
| `dataSources` | GET | `/api/settings/data-sources` | — | DataSourcesResponse | 引用 |
| `pipelineRun` | POST | `/api/pipeline/run` | — | { job_id: string; reused: boolean } | 引用 |

</details>

### 3.2 个股分析报告 — `/analysis/:menuId`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 个股分析报告 |
| 2. 页面路由 | `/analysis/:menuId` |
| 3. 当前使用的 API | 5 个方法 / 2 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/analysis.py`（分析菜单定义持久化）、`api/ext_data.py`（扩展数据行查询）、`api/definitions.py`（维度成员）、`api/intraday.py`（分时明细）；URL 模板型仅做外链嵌入，无后端计算 |
| 7. 依赖的数据模型 | `analysis_menus`（id / label / template / url / dimension 配置）、`ext_data_config` + 各 config 的数据行、`dimension_members` |
| 8. 本地替代方案 | `analysis_menus` 与 `ext_data_rows` 落 SQLite；维度成员由本地 `dimension_members` 表提供；URL 模板仍走网络（需显式标注外部来源） |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | 无专项测试（该页 17 行，仅做菜单分发，实际渲染在 `ExtDimensionAnalysis`） |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `analysisMenu` | GET | `/api/analysis-menus/${encodeURIComponent(id)}` | id: string | AnalysisMenu | 1 |
| `extDataRows` | GET | `/api/ext-data/${encodeURIComponent(id)}/rows${suffix ? `?${suffix}` : ''}` | id: string, opts?: { date?: string; limit?: number; columns?: string[] } | ExtDataRowsResult | 1 |
| `analysisMenus` | GET | `/api/analysis-menus` | — | { items: AnalysisMenu[] } | 引用 |
| `extDataList` | GET | `/api/ext-data` | — | { items: ExtDataConfig[] } | 引用 |
| `extDataSchemaAll` | GET | `/api/ext-data/schema-all` | — | { items: { id: string; label: string; mode: string; time_field?: string \| null; granularity?: 'intraday' \| 'daily' \| null; columns: { name: string; type: str | 引用 |

</details>

### 3.3 自选股 — `/watchlist`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 自选股 |
| 2. 页面路由 | `/watchlist` |
| 3. 当前使用的 API | 26 个方法 / 24 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/watchlist.py` + `services/watchlist.py`（`watchlist.parquet` + `watchlist_groups.json` 双文件存储）、`api/kline.py`（行情富化）、`services/watchlist_csv.py` / `watchlist_ocr.py`（CSV / 图片导入） |
| 7. 依赖的数据模型 | `watchlist_entries`（symbol / note / group_id / 排序）、`watchlist_groups`（id / name / color / order）、`instruments`（代码-名称映射）、`kline_daily`（富化行情） |
| 8. 本地替代方案 | 两张表直接落 SQLite（原 parquet+json 双写改为单库事务）；富化行情改读本地 `kline_daily` 缓存；CSV 导入纯前端解析，图片 OCR 保留可选在线能力 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `lib/watchlist-columns.test.ts`、`lib/useSharedQueries.test.tsx` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `watchlistGroupCreate` | POST | `/api/watchlist/groups` | name: string, color: WatchlistGroupColor | { groups: WatchlistGroup[]; group: WatchlistGroup } | 2 |
| `extDataSeries` | GET | ``/api/ext-data/${configId}/series?field=${encodeURIComponent(field)}` + (date ? `&date=${date}` : '') + (symbols?.length ? `&symbols=${encodeURIComponent(symbols.join(','))}` : '') + (days ? `&days=${days}` : '')` | configId: string, field: string, date?: string \| null, symbols?: string[], days?: number | { config_id: string; field: string; date: string \| null; granularity?: 'intraday' \| 'daily'; days?: number; items: Record<string, [string, number][]> } | 1 |
| `instrumentSearch` | GET | `/api/kline/instruments/search?q=${encodeURIComponent(q)}&limit=${limit}${assetTypes ? `&asset_types=${encodeURIComponent(assetTypes)}` : ''}` | q: string, limit = 20, assetTypes?: string | { results: { symbol: string; name: string; code: string; asset_type?: string }[] } | 1 |
| `updateQuoteInterval` | PUT | `/api/settings/preferences/quote-interval` | interval: number | { interval: number; min_interval: number; max_interval: number } | 1 |
| `updateRealtimeQuotes` | PUT | `/api/settings/preferences/realtime-quotes` | enabled: boolean | { realtime_quotes_enabled: boolean; realtime_allowed?: boolean; mode?: string; error?: string } | 1 |
| `updateWatchlistColumns` | PUT | `/api/settings/preferences/watchlist-columns` | columns: any[] | { columns: any[] } | 1 |
| `updateWatchlistGroupsInNav` | PUT | `/api/settings/preferences/watchlist-groups-in-nav` | enabled: boolean | { watchlist_groups_in_nav: boolean } | 1 |
| `watchlistAdd` | POST | `/api/watchlist` | symbol: string, note = '', groupId?: string \| null | { symbols: WatchlistEntry[] } | 1 |
| `watchlistBatchAdd` | POST | `/api/watchlist/batch` | symbols: string[], note = '', groupId?: string \| null, groupIds?: string[] | { symbols: WatchlistEntry[]; added: number } | 1 |
| `watchlistClear` | DELETE | `/api/watchlist` | — | { removed: number } | 1 |
| `watchlistColumns` | GET | `/api/settings/preferences/watchlist-columns` | — | { columns: any[] \| null } | 1 |
| `watchlistEnriched` | GET | `extColumns ? `/api/watchlist/enriched?ext_columns=${encodeURIComponent(extColumns)}` : '/api/watchlist/enriched'` | extColumns?: string | { rows: any[] as_of: string \| null elapsed_ms: number /** 按资产类型的行情日期 (ISO); 缺失 (旧后端) 时前端按不新鲜处理 */ dates?: { stock: string \| null; etf: string \| null; index:  | 1 |
| `watchlistGroupAddMember` | POST | `/api/watchlist/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(symbol)}` | groupId: string, symbol: string | { symbols: WatchlistEntry[] } | 1 |
| `watchlistGroupClear` | POST | `/api/watchlist/groups/${encodeURIComponent(groupId)}/clear` | groupId: string | { symbols: WatchlistEntry[] } | 1 |
| `watchlistGroupDelete` | DELETE | `/api/watchlist/groups/${encodeURIComponent(groupId)}` | groupId: string | { groups: WatchlistGroup[]; symbols: WatchlistEntry[] } | 1 |
| `watchlistGroupRemoveMember` | DELETE | `/api/watchlist/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(symbol)}` | groupId: string, symbol: string | { symbols: WatchlistEntry[] } | 1 |
| `watchlistGroupRename` | PUT | `/api/watchlist/groups/${encodeURIComponent(groupId)}` | groupId: string, name: string, color: WatchlistGroupColor | { groups: WatchlistGroup[] } | 1 |
| `watchlistGroupReorder` | PUT | `/api/watchlist/groups/reorder` | orderedIds: string[] | { groups: WatchlistGroup[] } | 1 |
| `watchlistImportCodes` | POST | `/api/watchlist/import-codes` | text: string, signal?: AbortSignal | WatchlistImportResult | 1 |
| `watchlistImportCsv` | POST | `/api/watchlist/import-csv` | file: File, signal?: AbortSignal, quiet = false | WatchlistImportResult | 1 |
| `watchlistImportImage` | POST | `/api/watchlist/import-image` | file: File, signal?: AbortSignal, quiet = false | WatchlistImportResult | 1 |
| `watchlistMoveToTop` | POST | `/api/watchlist/${encodeURIComponent(symbol)}/top` | symbol: string | { symbols: WatchlistEntry[] } | 1 |
| `watchlistRemove` | DELETE | `/api/watchlist/${encodeURIComponent(symbol)}` | symbol: string | { symbols: WatchlistEntry[] } | 1 |
| `extDataSchemaAll` | GET | `/api/ext-data/schema-all` | — | { items: { id: string; label: string; mode: string; time_field?: string \| null; granularity?: 'intraday' \| 'daily' \| null; columns: { name: string; type: str | 引用 |
| `watchlistGroups` | GET | `/api/watchlist/groups` | — | { groups: WatchlistGroup[] } | 引用 |
| `watchlistList` | GET | `/api/watchlist` | — | { symbols: WatchlistEntry[] } | 引用 |

</details>

### 3.4 选股器 — `/screener`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 选股器 |
| 2. 页面路由 | `/screener` |
| 3. 当前使用的 API | 34 个方法 / 40 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/screener.py` + `services/screener.py`（Polars 全市场筛选）、`api/strategy.py` + `strategy/engine.py`（策略执行与代码沙箱）、`api/signals.py`、`api/monitor_rules.py`、`api/ext_data.py` |
| 7. 依赖的数据模型 | `strategies`（id / name / code / config / version / status）、`screener_runs` 与 `screener_results`（按交易日缓存）、`custom_signals`、`monitor_rules` |
| 8. 本地替代方案 | 策略定义落 SQLite；筛选执行改为本地列式扫描（`kline_daily` 缓存 + 本地因子求值）；`screener_results` 直接存本地结果表，去掉 `cached` 轮询 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `components/screener/StrategyBuilderDialog.minute.test.tsx`、`StrategyCard.test.tsx`、`StrategyPoolDialog.test.tsx`、`StrategySettingsDialog.test.tsx`、`StrategyExportButton.test.tsx`、`DefaultStrategyParamsDialog.test.tsx` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `screenerStrategies` | GET | `/api/strategies?${assetType ? `asset_type=${assetType}&` : ''}${timeframe !== 'all' ? `timeframe=${timeframe}` : ''}` | assetType?: 'stock' \| 'etf' \| 'index', timeframe: '1d' \| '1m' \| 'all' = '1d' | { strategies: StrategyDetail[] load_errors?: StrategyLoadError[] legacy_migration?: { seeded_signals?: number; seeded_strategies?: number; archived_files?: stri | 6 |
| `strategyGet` | GET | `/api/strategies/${id}` | id: string | StrategyDetail | 5 |
| `screenerRunAll` | POST | `/api/screener/run_all` | asOf?: string, strategyIds?: string[], assetType: 'stock' \| 'etf' = 'stock', timeframe: '1d' \| '1m' = '1d', ensure = f | ScreenerRunAllSummary | 2 |
| `strategyBuildStream` | — | `（流式/动态）` | — | （流式或未标注） | 2 |
| `strategySaveCodeV2` | POST | `/api/strategies/code/save` | payload: { strategy_id: string code: string target_source: 'ai' \| 'custom' mode: 'create' \| 'update' name?: string des | StrategyCodeSaveResult | 2 |
| `strategySaveConfig` | POST | `/api/strategies/config` | strategyId: string, overrides: Record<string, any> | { ok: boolean } | 2 |
| `extDataSeries` | GET | ``/api/ext-data/${configId}/series?field=${encodeURIComponent(field)}` + (date ? `&date=${date}` : '') + (symbols?.length ? `&symbols=${encodeURIComponent(symbols.join(','))}` : '') + (days ? `&days=${days}` : '')` | configId: string, field: string, date?: string \| null, symbols?: string[], days?: number | { config_id: string; field: string; date: string \| null; granularity?: 'intraday' \| 'daily'; days?: number; items: Record<string, [string, number][]> } | 1 |
| `monitorRuleDelete` | DELETE | `/api/monitor-rules/${encodeURIComponent(id)}` | id: string | { ok: boolean } | 1 |
| `monitorRuleSave` | POST | `/api/monitor-rules` | rule: MonitorRule | { ok: boolean; rule: MonitorRule } | 1 |
| `screenerCached` | GET | `extColumns ? `/api/screener/cached?ext_columns=${encodeURIComponent(extColumns)}` : '/api/screener/cached'` | extColumns?: string | { as_of: string \| null; results: Record<string, { total: number; as_of: string; rows: any[] }>; today_ever_matched: Record<string, string[]> \| null; today_eve | 1 |
| `screenerCachedResult` | GET | `extColumns ? `/api/screener/cached-result/${encodeURIComponent(strategyId)}?ext_columns=${encodeURIComponent(extColumns)}` : `/api/screener/cached-result/${encodeURIComponent(strategyId)}`` | strategyId: string, extColumns?: string | ScreenerCachedResult | 1 |
| `screenerCachedSummary` | GET | `'/api/screener/cached-summary' + (taskId ? `?task_id=${encodeURIComponent(taskId)}` : '')` | taskId?: string | ScreenerCachedSummary | 1 |
| `screenerResultColumns` | GET | `/api/settings/preferences/screener-result-columns` | — | { columns: any[] \| null } | 1 |
| `screenerRunPreset` | POST | `/api/screener/run_preset` | strategy_id: string, pool?: string[], asOf?: string, extColumns?: string, assetType: 'stock' \| 'etf' = 'stock', timefra | ScreenerResult | 1 |
| `strategyAiIterate` | POST | `/api/strategies/ai/iterate` | payload: { name?: string description?: string direction?: string rules?: string execution_backend?: 'polars_expr' \| 'ma | AiIterateResult | 1 |
| `strategyAiStatus` | GET | `/api/strategies/ai/status` | — | { configured: boolean; has_key: boolean; has_model: boolean; provider?: string } | 1 |
| `strategyDelete` | DELETE | `/api/strategies/${strategyId}` | strategyId: string | { ok: boolean } | 1 |
| `strategyGetSource` | GET | `/api/strategies/${id}/source` | id: string | { code: string; source: string } | 1 |
| `strategyList` | GET | `/api/strategies${qs ? `?${qs}` : ''}` | assetType?: 'stock' \| 'etf', timeframe: '1d' \| '1m' \| 'all' = '1d', includeResearch = false | { strategies: StrategyDetail[]; load_errors?: StrategyLoadError[] } | 1 |
| `strategyPatchConfig` | PATCH | `/api/strategies/config` | strategyId: string, overrides: Record<string, any> | { ok: boolean } | 1 |
| `strategyPublish` | POST | `/api/strategies/${encodeURIComponent(strategyId)}/publish` | strategyId: string | { ok: boolean; strategy_id: string } | 1 |
| `strategyResetConfig` | DELETE | `/api/strategies/config/${strategyId}` | strategyId: string | { ok: boolean } | 1 |
| `strategySaveComposite` | POST | `/api/strategies/composite/save` | payload: { strategy_id: string name: string description?: string children: { strategy_id: string; weight: number }[] mer | StrategyCodeSaveResult | 1 |
| `strategyValidateCode` | POST | `/api/strategies/code/validate` | payload: { code: string; strategy_id?: string; name?: string; description?: string } | StrategyBuildResult | 1 |
| `updateScreenerResultColumns` | PUT | `/api/settings/preferences/screener-result-columns` | columns: any[] | { columns: any[] } | 1 |
| `watchlistAdd` | POST | `/api/watchlist` | symbol: string, note = '', groupId?: string \| null | { symbols: WatchlistEntry[] } | 1 |
| `watchlistRemove` | DELETE | `/api/watchlist/${encodeURIComponent(symbol)}` | symbol: string | { symbols: WatchlistEntry[] } | 1 |
| `customSignalsList` | GET | `/api/custom-signals` | — | { signals: CustomSignal[] } | 引用 |
| `customSignalsOptions` | GET | `/api/custom-signals/options` | — | CustomSignalOptions | 引用 |
| `extDataSchemaAll` | GET | `/api/ext-data/schema-all` | — | { items: { id: string; label: string; mode: string; time_field?: string \| null; granularity?: 'intraday' \| 'daily' \| null; columns: { name: string; type: str | 引用 |
| `minuteRefreshStatus` | GET | `/api/settings/minute-refresh/status` | — | { available: boolean enabled?: boolean running?: boolean /** 读侧 freshness: 本地分区正被服务持续写入 (前端据此切本地读/解除截断) */ healthy?: boolean provider?: string provider_effectiv | 引用 |
| `monitorRulesList` | GET | `/api/monitor-rules` | — | { rules: MonitorRule[] } | 引用 |
| `strategyReload` | POST | `/api/strategies/reload` | — | { ok: boolean; count: number } | 引用 |
| `watchlistList` | GET | `/api/watchlist` | — | { symbols: WatchlistEntry[] } | 引用 |

</details>

### 3.5 回测与因子挖掘 — `/backtest`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 回测与因子挖掘 |
| 2. 页面路由 | `/backtest` |
| 3. 当前使用的 API | 48 个方法 / 50 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/backtest.py` + `app/backtest/`（回测引擎、稳健性、参数扫描、walk-forward）、`api/mining.py`（因子挖掘任务）、`api/guardian.py`（策略守护）、`strategy/engine.py` |
| 7. 依赖的数据模型 | `strategies`、`backtest_runs`、`backtest_results`（parquet 明细）、`mining_runs`、`research_candidates`、`guardian_combinations` |
| 8. 本地替代方案 | 回测引擎需整体移植到本地（最大工作量项）；任务队列由后端线程池改为本地 `jobs` 表 + Web Worker；结果明细存 SQLite 或本地文件，`research_candidates` 落表 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `pages/backtest/StrategyBacktest.status.test.tsx`、`components/BacktestEvidencePanel.test.tsx`、`components/MiningLockControl.test.tsx`、`components/paramSweep.test.ts`、`pages/backtest/tradeNav.test.ts` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `strategyList` | GET | `/api/strategies${qs ? `?${qs}` : ''}` | assetType?: 'stock' \| 'etf', timeframe: '1d' \| '1m' \| 'all' = '1d', includeResearch = false | { strategies: StrategyDetail[]; load_errors?: StrategyLoadError[] } | 5 |
| `miningAvailability` | GET | `/api/backtest/mining/availability?${query}` | params: { assetType: 'stock' \| 'etf' budgetProfile: MiningBudgetProfile start?: string end?: string } | MiningAvailability | 4 |
| `miningRun` | GET | `/api/backtest/mining/runs/${encodeURIComponent(runId)}` | runId: string | MiningRun | 3 |
| `researchCandidateCreate` | POST | `/api/backtest/candidates` | payload: ResearchCandidateCreate | ResearchCandidate | 3 |
| `factorLibrary` | GET | `/api/factors${assetType ? `?asset_type=${assetType}` : ''}` | assetType?: 'stock' \| 'etf' | { factors: FactorLibraryItem[] } | 2 |
| `regimeRecompute` | POST | `/api/regime/recompute${qs ? `?${qs}` : ''}` | start?: string, end?: string | { ok: boolean; computed: number; phase_days?: number; mainline_rows?: number } | 2 |
| `strategyGet` | GET | `/api/strategies/${id}` | id: string | StrategyDetail | 2 |
| `coord` | — | `（流式/动态）` | — | （流式或未标注） | 1 |
| `customSignalSave` | POST | `/api/custom-signals` | signal: CustomSignal | { ok: boolean; signal: CustomSignal } | 1 |
| `factorBatch` | POST | `/api/backtest/factor/batch` | payload: { factor_names: string[] symbols?: string[] \| null start?: string \| null end?: string \| null n_groups?: numb | FactorBatchResult | 1 |
| `factorRun` | POST | `/api/backtest/factor/run` | payload: { factor_name: string symbols?: string[] \| null start?: string \| null end?: string \| null n_groups?: number  | FactorBacktestResult | 1 |
| `guardianAdopt` | POST | `/api/backtest/guardian/${encodeURIComponent(strategyId)}/adopt` | strategyId: string, objective: string | { ok: boolean; strategy_id: string; run_id: string } | 1 |
| `guardianCreateCombination` | POST | `/api/backtest/guardian/combinations/create` | a: string, b: string | { ok: boolean; strategy_id: string; created: boolean } | 1 |
| `guardianDrop` | POST | `/api/backtest/guardian/${encodeURIComponent(strategyId)}/drop` | strategyId: string | { ok: boolean; strategy_id: string } | 1 |
| `guardianOverview` | GET | `/api/backtest/guardian/overview` | — | GuardianOverview | 1 |
| `guardianPatchConfig` | PATCH | `/api/backtest/guardian/config` | patch: Partial<Pick<GuardianConfig, 'guardian_schedule_enabled' \| 'guardian_watch_pct' \| 'guardian_retire_pct' \| 'gua | GuardianConfig | 1 |
| `guardianRerun` | POST | `/api/backtest/guardian/${encodeURIComponent(strategyId)}/rerun` | strategyId: string | { ok: boolean; strategy_id: string; run_id: string } | 1 |
| `guardianRunAll` | POST | `/api/backtest/guardian/run` | — | { ok: boolean; run_id: string } | 1 |
| `guardianScanCombinations` | POST | `/api/backtest/guardian/combinations/scan` | — | { ok: boolean; run_id: string } | 1 |
| `instrumentSearch` | GET | `/api/kline/instruments/search?q=${encodeURIComponent(q)}&limit=${limit}${assetTypes ? `&asset_types=${encodeURIComponent(assetTypes)}` : ''}` | q: string, limit = 20, assetTypes?: string | { results: { symbol: string; name: string; code: string; asset_type?: string }[] } | 1 |
| `labReport` | GET | `/api/backtest/lab/report` | — | LabReport | 1 |
| `miningAutoStart` | POST | `/api/backtest/mining/auto` | payload: MiningAutoStartPayload | MiningAutoStartResponse | 1 |
| `miningCancel` | POST | `/api/backtest/mining/runs/${encodeURIComponent(runId)}/cancel` | runId: string | MiningRun | 1 |
| `miningPromote` | POST | `/api/backtest/mining/runs/${encodeURIComponent(runId)}/candidates/${encodeURIComponent(signature)}/promote` | runId: string, signature: string | ResearchCandidate | 1 |
| `miningPublish` | POST | `/api/backtest/mining/runs/${encodeURIComponent(runId)}/candidates/${encodeURIComponent(signature)}/publish` | runId: string, signature: string | { ok: boolean; strategy_id: string } | 1 |
| `miningResult` | GET | `/api/backtest/mining/runs/${encodeURIComponent(runId)}/result` | runId: string | MiningResult | 1 |
| `miningStart` | POST | `/api/backtest/mining/runs` | payload: MiningRequestV1 | MiningRun | 1 |
| `researchCandidateUpdate` | PATCH | `/api/backtest/candidates/${encodeURIComponent(id)}` | id: string, payload: { name?: string; status?: ResearchCandidateStatus } | ResearchCandidate | 1 |
| `robustOptimizePreview` | GET | `/api/backtest/optimize-robust/preview?${new URLSearchParams({ start, end, k_segments: String(kSegments) })}` | start: string, end: string, kSegments: number | { k_segments: number; windows: { start: string; end: string; days: number }[]; warnings: string[] } | 1 |
| `screenerStrategies` | GET | `/api/strategies?${assetType ? `asset_type=${assetType}&` : ''}${timeframe !== 'all' ? `timeframe=${timeframe}` : ''}` | assetType?: 'stock' \| 'etf' \| 'index', timeframe: '1d' \| '1m' \| 'all' = '1d' | { strategies: StrategyDetail[] load_errors?: StrategyLoadError[] legacy_migration?: { seeded_signals?: number; seeded_strategies?: number; archived_files?: stri | 1 |
| `strategyPatchConfig` | PATCH | `/api/strategies/config` | strategyId: string, overrides: Record<string, any> | { ok: boolean } | 1 |
| `strategySaveConfig` | POST | `/api/strategies/config` | strategyId: string, overrides: Record<string, any> | { ok: boolean } | 1 |
| `updateMiningConfig` | PATCH | `/api/backtest/mining/config` | payload: Partial<MiningScheduleConfig> | MiningScheduleConfig | 1 |
| `value` | — | `（流式/动态）` | — | （流式或未标注） | 1 |
| `walkforwardPreview` | GET | `/api/backtest/walkforward/preview?${new URLSearchParams({ start, end, train_days: String(trainDays), test_days: String(testDays), step_days: String(stepDays), })}` | start: string, end: string, trainDays: number, testDays: number, stepDays: number | { n_folds: number; folds: { index: number; train_start: string; train_end: string; test_start: string; test_end: string }[]; warnings: string[] } | 1 |
| `watchlistList` | GET | `/api/watchlist` | — | { symbols: WatchlistEntry[] } | 1 |
| `customSignalsOptions` | GET | `/api/custom-signals/options` | — | CustomSignalOptions | 引用 |
| `dataStatus` | GET | `/api/data/status` | — | DataStatus | 引用 |
| `factorColumns` | GET | `/api/backtest/factor/columns` | — | { columns: FactorColumn[] } | 引用 |
| `miningConfig` | GET | `/api/backtest/mining/config` | — | MiningScheduleConfig | 引用 |
| `miningForceReleaseLock` | POST | `/api/backtest/mining/lock/force-release` | expectedPid?: number | { released: boolean; terminated_pid: number; reacquired: boolean } | 引用 |
| `miningLockStatus` | GET | `/api/backtest/mining/lock` | — | MiningLockStatus | 引用 |
| `miningRecoverLock` | POST | `/api/backtest/mining/lock/recover` | — | MiningLockStatus | 引用 |
| `miningRuns` | GET | `/api/backtest/mining/runs` | — | { items: MiningRun[] } | 引用 |
| `positionPolicyList` | GET | `/api/backtest/position-policies` | — | { policies: PositionPolicyInfo[] errors: Record<string, string> } | 引用 |
| `regimeLatest` | GET | `/api/regime/latest` | — | { row: RegimeRow \| null } | 引用 |
| `researchCandidateDelete` | DELETE | `/api/backtest/candidates/${encodeURIComponent(id)}` | id: string | { ok: boolean } | 引用 |
| `researchCandidates` | GET | `/api/backtest/candidates` | — | { items: ResearchCandidate[] } | 引用 |

</details>

### 3.6 因子库 — `/factors`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 因子库 |
| 2. 页面路由 | `/factors` |
| 3. 当前使用的 API | 11 个方法 / 12 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/factors.py` + `app/factors/`（因子表达式求值、组合因子、有效性检验） |
| 7. 依赖的数据模型 | `factor_definitions`（id / expr / group / status / version）、`factor_composites`（权重与成分）、`factor_trials`（检验结果） |
| 8. 本地替代方案 | 因子定义与组合落 SQLite；表达式求值改本地执行（`native-core/analytics/factors.ts` 已有 momentum / low-vol / volume-surprise / range-position 四类，其余需补齐） |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `pages/factors/GenerateFactorStrategyDialog.test.tsx` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `factorLibrary` | GET | `/api/factors${assetType ? `?asset_type=${assetType}` : ''}` | assetType?: 'stock' \| 'etf' | { factors: FactorLibraryItem[] } | 3 |
| `factorCompositeCreate` | POST | `/api/factors/composite` | payload: { id?: string label: string group?: string members: Record<string, number> description?: string direction?: 'hi | { ok: boolean; id: string; version: number } | 1 |
| `factorCustomCreate` | POST | `/api/factors/custom` | payload: { id?: string label: string group?: string formula: string description?: string direction?: 'high' \| 'low' \|  | { ok: boolean; id: string; version: number } | 1 |
| `factorCustomUpdate` | POST | `/api/factors/custom/${encodeURIComponent(factorId)}/update` | factorId: string, payload: { label: string group?: string formula: string description?: string direction?: 'high' \| 'lo | { ok: boolean; id: string; version: number; status: string } | 1 |
| `factorDelete` | DELETE | `/api/factors/custom/${encodeURIComponent(factorId)}${force ? '?force=true' : ''}` | factorId: string, force = false | { ok: boolean; id: string; removed_references?: string[] } | 1 |
| `factorSetGroup` | POST | `/api/factors/custom/${encodeURIComponent(factorId)}/group` | factorId: string, group: string | { ok: boolean; id: string; group: string } | 1 |
| `factorSetStatus` | POST | `/api/factors/custom/${encodeURIComponent(factorId)}/status` | factorId: string, status: 'draft' \| 'active' \| 'watch' \| 'retired' | { ok: boolean; id: string; status: string } | 1 |
| `factorTrial` | POST | `/api/factors/trial` | payload: { formula: string; asset_type?: 'stock' \| 'etf'; days?: number } | FactorTrialResponse | 1 |
| `factorValidate` | POST | `/api/factors/validate` | formula: string | FactorValidateResponse | 1 |
| `strategySaveCodeV2` | POST | `/api/strategies/code/save` | payload: { strategy_id: string code: string target_source: 'ai' \| 'custom' mode: 'create' \| 'update' name?: string des | StrategyCodeSaveResult | 1 |
| `factorColumns` | GET | `/api/backtest/factor/columns` | — | { columns: FactorColumn[] } | 引用 |

</details>

### 3.7 数据中心 — `/data`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 数据中心 |
| 2. 页面路由 | `/data` |
| 3. 当前使用的 API | 49 个方法 / 49 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/data.py`、`api/ext_data.py` + `services/ext_pull.py`（外部数据拉取）、`api/import_center.py`（CSV/Excel 导入）、`services/kline_sync.py`（行情同步）、`services/financial_sync.py`、`services/data_integrity.py` |
| 7. 依赖的数据模型 | `ext_data_config`（字段定义 / 拉取配置 / 密钥）、`ext_data_rows`（按 config 分表）、`data_status`（各表最新日期与缺口）、`import_jobs` |
| 8. 本地替代方案 | 本页天然就是「本地数据库管理台」：`ext_data_config` / `ext_data_rows` / `data_status` 直接落 SQLite；拉取与导入改为本地适配器 + 文件导入；插件元数据保留只读展示 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `pages/Data.status.test.tsx`、`components/data/DailyDataHealthNotice.test.tsx`、`DataIntegrityPanel.test.tsx`、`MinuteSyncConfig.test.tsx`、`PluginMetadata.test.tsx`、`components/ext-data/ExtConfigTransfer.test.tsx` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `extDataPullConfig` | PUT | `/api/ext-data/${id}/pull` | id: string, body: { url: string; method?: string; headers?: Record<string, string>; body?: string; response_path?: strin | { status: string; pull: PullConfig } | 5 |
| `extDataPullRun` | POST | `/api/ext-data/${id}/pull/run` | id: string, timeoutSeconds?: number | { status: string; rows: number; date: string } | 3 |
| `extDataDetectFields` | POST | `/api/ext-data/detect-fields` | file: File | { fields: { name: string; dtype: string; label: string }[]; rows: number; symbol_candidates: string[]; code_candidates: string[] } | 2 |
| `clearMinute` | POST | `/api/kline/clear_minute` | — | { status: string; removed: number } | 1 |
| `enrichedSchema` | GET | `/api/data/schema/${table}` | table: string | EnrichedField[] | 1 |
| `extDataApiKey` | GET | `/api/ext-data/${encodeURIComponent(id)}/api-key` | id: string | { key_set: boolean; masked_key: string } | 1 |
| `extDataApiKeySet` | PUT | `/api/ext-data/${encodeURIComponent(id)}/api-key` | id: string, key: string | { status: string; key_set: boolean; masked_key: string } | 1 |
| `extDataBackfill` | POST | `/api/ext-data/${encodeURIComponent(id)}/backfill?start=${start}&end=${end}` | id: string, start: string, end: string, timeoutMs?: number | ExtDataBackfillResult | 1 |
| `extDataConfigExport` | GET | `/api/ext-data/${encodeURIComponent(id)}/config/export` | id: string | Blob | 1 |
| `extDataConfigImport` | POST | `/api/ext-data/config/import` | file: File, id: string | ExtDataConfig | 1 |
| `extDataConfigInspect` | POST | `/api/ext-data/config/inspect` | file: File | ExtDataConfigPreview | 1 |
| `extDataCreate` | POST | `/api/ext-data` | body: { id: string; label: string; mode: 'snapshot' \| 'timeseries'; fields: { name: string; dtype: string; label: strin | ExtDataConfig | 1 |
| `extDataDelete` | DELETE | `/api/ext-data/${id}` | id: string | { status: string } | 1 |
| `extDataDetectUrl` | POST | `/api/ext-data/detect-url` | body: ExtDataDetectUrlRequest | ExtDataDetectUrlResult | 1 |
| `extDataFixSymbol` | POST | `/api/ext-data/${id}/fix-symbol` | id: string | { status: string; fixed_files: number } | 1 |
| `extDataPullTest` | POST | `/api/ext-data/${id}/pull/test` | id: string, timeoutSeconds?: number | { status: string; total_rows: number; preview: Record<string, unknown>[]; has_symbol: boolean } | 1 |
| `extDataUpdate` | PUT | `/api/ext-data/${id}` | id: string, body: { label?: string; fields?: { name: string; dtype: string; label: string }[]; description?: string; sym | ExtDataConfig | 1 |
| `extDataUpload` | POST | `/api/ext-data/${id}/upload${snapshotDate ? `?snapshot_date=${snapshotDate}` : ''}` | id: string, file: File, snapshotDate?: string | { status: string; rows: number; date: string } | 1 |
| `extendHistory` | POST | `/api/kline/extend_history` | value: number, unit: 'day' \| 'month' \| 'year' | { status: string; job_id: string } | 1 |
| `minuteGaps` | GET | `/api/kline/minute-gaps${qs ? `?${qs}` : ''}` | params?: { symbols?: string[]; dates?: string[]; limit?: number } | { status: string scanned_dates: number scanned_symbols: number complete_dates: string[] inactive_symbol_days?: number gaps: MinuteGapRow[] summary_by_date: { da | 1 |
| `pipelineAdjFactorRun` | POST | `/api/pipeline/adj-factor/run` | — | { job_id: string; reused: boolean } | 1 |
| `pipelineJob` | GET | `/api/pipeline/jobs/${id}` | id: string | PipelineJob | 1 |
| `pipelineJobCancel` | POST | `/api/pipeline/jobs/${id}/cancel` | id: string | { cancelled: string } | 1 |
| `pipelineJobs` | GET | `/api/pipeline/jobs?limit=${limit}` | limit = 20 | { active_id: string \| null; jobs: PipelineJobSummary[] } | 1 |
| `regimeCoverage` | GET | `/api/regime/coverage` | — | RegimeCoverage | 1 |
| `repairDaily` | POST | `/api/kline/repair_daily` | startDate: string | { status: string; job_id: string } | 1 |
| `repairDataIntegrity` | POST | `/api/data/integrity/repair` | reportId: string | { job_id: string } | 1 |
| `repairMinuteGaps` | POST | `/api/kline/repair_minute_gaps` | symbols: string[] | { status: string; job_id: string } | 1 |
| `scanDataIntegrity` | POST | `/api/data/integrity/scan` | lookbackDays: number, assetTypes: IntegrityAsset[] | { job_id: string } | 1 |
| `syncIndexDaily` | POST | `/api/index/sync_daily?days=${days}` | days = 365 | { status: string; index_count: number; rows_written: number } | 1 |
| `syncMinute` | POST | `/api/kline/sync_minute` | days?: number, extend?: boolean | { status: string; job_id: string } | 1 |
| `syncMinuteSingle` | POST | `/api/kline/sync_minute_single` | symbol: string, days?: number | { status: string; symbol: string; rows: number } | 1 |
| `updateDepthFinalizeTime` | PUT | `/api/settings/preferences/depth-finalize-time` | hour: number, minute: number | { hour: number; minute: number } | 1 |
| `updateDepthPollingInterval` | PUT | `/api/settings/preferences/depth-polling-interval` | interval: number | { depth_polling_interval: number } | 1 |
| `updateEnrichedBatchSize` | PUT | `/api/settings/preferences/enriched-batch-size` | size: number | { enriched_batch_size: number } | 1 |
| `updateIndexDailyBatchSize` | PUT | `/api/settings/preferences/index-daily-batch-size` | size: number | { index_daily_batch_size: number } | 1 |
| `updateInstrumentsSchedule` | PUT | `/api/settings/preferences/instruments-schedule` | hour: number, minute: number | { hour: number; minute: number } | 1 |
| `updateMinuteSync` | PUT | `/api/settings/preferences/minute-sync` | enabled: boolean, days: number, segmentDays?: number | Preferences | 1 |
| `updatePipelinePullTypes` | PUT | `/api/settings/preferences/pipeline-pull-types` | cfg: Partial<Pick<Preferences, 'pipeline_pull_a_share' \| 'pipeline_pull_etf' \| 'pipeline_pull_index'>> | { pipeline_pull_a_share: boolean pipeline_pull_etf: boolean pipeline_pull_index: boolean } | 1 |
| `updatePipelineRegimeEnabled` | PUT | `/api/settings/preferences/pipeline-regime-enabled` | enabled: boolean | { pipeline_regime_enabled: boolean } | 1 |
| `updatePipelineSchedule` | PUT | `/api/settings/preferences/pipeline-schedule` | hour: number, minute: number | { hour: number; minute: number } | 1 |
| `updateRegimeBatchParams` | PUT | `/api/settings/preferences/regime-batch-params` | params: { batch_days?: number; warmup_days?: number } | { regime_batch_days: number; regime_warmup_days: number } | 1 |
| `dataClear` | POST | `/api/data/clear` | — | { deleted_files: number } | 引用 |
| `dataIntegrity` | GET | `/api/data/integrity` | — | { report: IntegrityReport \| null blocking_assets?: IntegrityAsset[] data_revisions?: DailyDataRevisions } | 引用 |
| `dataSources` | GET | `/api/settings/data-sources` | — | DataSourcesResponse | 引用 |
| `extDataList` | GET | `/api/ext-data` | — | { items: ExtDataConfig[] } | 引用 |
| `pipelineRun` | POST | `/api/pipeline/run` | — | { job_id: string; reused: boolean } | 引用 |
| `preferences` | GET | `/api/settings/preferences` | — | Preferences | 引用 |
| `rebuildEnriched` | POST | `/api/kline/rebuild_enriched` | — | { status: string; job_id: string } | 引用 |

</details>

### 3.8 指数 — `/indices`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 指数 |
| 2. 页面路由 | `/indices` |
| 3. 当前使用的 API | 4 个方法 / 4 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/indices.py`（指数日线/分时）、`api/intraday.py`（指数快照）、`services/kline_sync.py`（指数同步） |
| 7. 依赖的数据模型 | `kline_index_daily`、`kline_index_minute`、`kline_index_enriched` |
| 8. 本地替代方案 | 指数行情并入统一 `kline` 表（instrument_type=index）；同步改本地适配器；快照由本地缓存计算 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `pages/Indices.test.tsx` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `indexDaily` | GET | `dateRange ? `/api/index/daily?symbol=${encodeURIComponent(symbol)}&start_date=${dateRange.start}&end_date=${dateRange.end}` : `/api/index/daily?symbol=${encodeURIComponent(symbol)}&days=${days}`` | symbol: string, days = 120, dateRange?: { start: string; end: string } | { symbol: string name?: string index_info?: IndexInstrument rows: KlineRow[] source?: string } | 1 |
| `indexMinute` | GET | `/api/index/minute?symbol=${encodeURIComponent(symbol)}${date ? `&date=${date}` : ''}` | symbol: string, date?: string | { symbol: string name?: string date: string \| null rows: MinuteKlineRow[] source?: string } | 1 |
| `indexQuotes` | GET | `/api/intraday/indices${symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(','))}` : ''}` | symbols?: string[] | { rows: IndexQuote[]; count: number } | 1 |
| `syncIndexDaily` | POST | `/api/index/sync_daily?days=${days}` | days = 365 | { status: string; index_count: number; rows_written: number } | 1 |

</details>

### 3.9 市场环境 — `/regime`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 市场环境 |
| 2. 页面路由 | `/regime` |
| 3. 当前使用的 API | 8 个方法 / 9 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/regime.py` + `services/regime_builder.py`（每日状态批算：EMA 方向、ADX、相对波动）、`api/settings.py`（主线过滤条件） |
| 7. 依赖的数据模型 | `regime_states`（date / phase / 多维指标）、`regime_mainline`、`preferences.mainline_filter` |
| 8. 本地替代方案 | **已具备可直接复用的本地算法**：`native-core/analytics/regime.ts` 实现 EMA/ADX/相对波动的尾部状态分类，可在本地重算并写 `regime_states` 表，无需后端 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `pages/Regime.test.tsx` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `regimeRecompute` | POST | `/api/regime/recompute${qs ? `?${qs}` : ''}` | start?: string, end?: string | { ok: boolean; computed: number; phase_days?: number; mainline_rows?: number } | 2 |
| `mainlineFilterUpdate` | PUT | `/api/settings/preferences/mainline-filter` | payload: { min_members?: number; max_members?: number; blacklist?: string[]; exclude_st?: boolean } | MainlineFilter | 1 |
| `regimeCoverage` | GET | `/api/regime/coverage` | — | RegimeCoverage | 1 |
| `regimeHistory` | GET | `/api/regime/history${qs ? `?${qs}` : ''}` | start?: string, end?: string, limit?: number | RegimeHistory | 1 |
| `regimeMainline` | GET | `/api/regime/mainline?${params.toString()}` | start?: string, end?: string, top = 10, kind: 'concept' \| 'industry' = 'concept' | MainlineResult | 1 |
| `regimeMainlineRecompute` | POST | `/api/regime/mainline/recompute` | — | { ok: boolean; rows: number } | 1 |
| `regimePhases` | GET | `/api/regime/phases${qs ? `?${qs}` : ''}` | start?: string, end?: string | PhaseSegments | 1 |
| `regimeStates` | GET | `/api/regime/states?days=${days}` | days = 60 | RegimeStates | 1 |

</details>

### 3.10 设置 — `/settings`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 设置 |
| 2. 页面路由 | `/settings` |
| 3. 当前使用的 API | 80 个方法 / 83 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/settings.py`（偏好读写、数据源、API Token）、`api/config_backup.py`、`api/import_center.py`、`api/pages_admin.py`、`api/upgrade_guard.py`、`secrets_store.py`（密钥存储） |
| 7. 依赖的数据模型 | `preferences`（单例 JSON，含 40+ 字段）、`data_sources`、`api_tokens`、`ext_pages`、`plugins`、`secrets` |
| 8. 本地替代方案 | `preferences` 改为 SQLite 单行表（保留全部字段，迁移时逐字段对齐）；密钥改 iOS Keychain / 本地加密；升级守卫、配置备份、插件安装属桌面/服务端能力，移动端隐藏并标注「不可用」 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `pages/settings/ImportCenter.test.tsx` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `sendTestWebhook` | POST | `/api/settings/preferences/webhook-test` | channel: 'feishu' \| 'wecom' \| 'custom' \| 'email' | { ok: boolean; detail: string } | 4 |
| `updateDataProviders` | PUT | `/api/settings/preferences/data-providers` | cfg: Partial<Pick<Preferences, ProviderField>> | Pick<Preferences, ProviderField> | 4 |
| `extPagesPutManifest` | PUT | `/api/ext-pages/${encodeURIComponent(id)}/manifest` | id: string, body: { label: string; path: string; error: string } | RuntimePagePack | 3 |
| `analysisMenuSave` | POST | `/api/analysis-menus/${encodeURIComponent(id)}` | id: string, body: Omit<AnalysisMenu, 'id' \| 'created_at' \| 'updated_at' \| 'builtin'> | AnalysisMenu | 2 |
| `configBackupApply` | POST | `/api/config-backup/apply` | file: File, allowOverwrite: boolean, categoryKeys: readonly string[] | ConfigBackupApplyResult | 2 |
| `dataSource` | GET | `/api/settings/data-sources/${encodeURIComponent(name)}` | name: string | CustomSourceConfig | 2 |
| `extPagesDelete` | DELETE | `/api/ext-pages/${encodeURIComponent(id)}` | id: string | { ok: boolean } | 2 |
| `extPagesPutEnabled` | PUT | `/api/ext-pages/${encodeURIComponent(id)}/enabled` | id: string, enabled: boolean | RuntimePagePack | 2 |
| `redetectCapabilities` | POST | `/api/capabilities/redetect` | — | CapabilitiesResponse | 2 |
| `updateDailyBatchCompress` | PUT | `/api/settings/preferences/daily-batch-compress` | enabled: boolean | Pick<Preferences, 'daily_batch_compress'> | 2 |
| `updateMinuteBatchCompress` | PUT | `/api/settings/preferences/minute-batch-compress` | enabled: boolean | Pick<Preferences, 'minute_batch_compress'> | 2 |
| `updateRealtimeMonitorConfig` | PUT | `/api/settings/preferences/realtime-monitor` | cfg: { sse_refresh_pages?: Record<string, boolean> strategy_monitor_enabled?: boolean strategy_monitor_ids?: string[] sc | { sse_refresh_pages: Record<string, boolean> strategy_monitor_enabled: boolean strategy_monitor_ids: string[] screener_auto_run: boolean minute_intraday_refresh | 2 |
| `upgradeGuardRestore` | POST | `/api/upgrade-guard/restore` | reportId: string, relpath: string | { ok: boolean; restored: string } | 2 |
| `apiTokenCreate` | POST | `/api/settings/api-tokens` | name: string, scopes: string[] | { token: ApiTokenRecord; plaintext: string } | 1 |
| `apiTokenRevoke` | DELETE | `/api/settings/api-tokens/${encodeURIComponent(id)}` | id: string | { status: string; id: string } | 1 |
| `clearAiSettings` | DELETE | `/api/settings/ai` | — | { ok: boolean } | 1 |
| `clearPluginKey` | DELETE | `/api/settings/plugin-key/${encodeURIComponent(plugin)}` | plugin: string | PluginKeyResult | 1 |
| `clearTickflowKey` | DELETE | `/api/settings/tickflow-key` | — | any | 1 |
| `configBackupExportUrl` | GET | `（流式/动态）` | categoryKeys: readonly string[] | （流式或未标注） | 1 |
| `configBackupInspect` | POST | `/api/config-backup/inspect` | file: File | ConfigBackupInspect | 1 |
| `deleteDataSource` | DELETE | `/api/settings/data-sources/${encodeURIComponent(name)}` | name: string | DataSourcesResponse | 1 |
| `deleteSoundPack` | DELETE | `/api/settings/sound-packs/${encodeURIComponent(name)}` | name: string | { status: string } | 1 |
| `extPagesImportFromProject` | POST | `/api/ext-pages/import-source/from-project` | namespace: string | RuntimePagePack | 1 |
| `extPagesImportSource` | POST | `/api/ext-pages/import-source` | file: File, id?: string | RuntimePagePack | 1 |
| `extPagesUpload` | POST | `/api/ext-pages/upload` | id: string, file: File | RuntimePagePack | 1 |
| `extensionPackageFrontend` | POST | `/api/extension-packages/frontend` | file: File, digest: string | Blob | 1 |
| `importCenterInspect` | POST | `/api/import-center/inspect` | files: File[] | ImportCenterPreview | 1 |
| `importCenterInstallPage` | POST | `/api/import-center/page` | file: File, id: string, digest: string, overwrite: boolean | RuntimePagePack | 1 |
| `importCenterProjectPage` | POST | `/api/import-center/project` | namespace: string, id: string, overwrite: boolean | RuntimePagePack | 1 |
| `installExtensionPackage` | POST | `/api/extension-packages/install` | file: File, digest: string, revision: string | { id: string; message: string } | 1 |
| `installPlugin` | POST | `/api/settings/plugins/${encodeURIComponent(name)}/install` | name: string | DataSourcesResponse & { install_ok: boolean; install_message: string } | 1 |
| `installSourcePackage` | POST | `/api/custom/source-packages/install` | file: File, digest: string, revision?: string | { name: string; message: string } | 1 |
| `manageExtensionPackage` | POST | `'/api/extension-packages/' + encodeURIComponent(id) + '/manage'` | id: string, action: string, revision?: string | { id: string; message: string } | 1 |
| `pageAdminBackupUrl` | GET | `（流式/动态）` | filename: string | （流式或未标注） | 1 |
| `pageAdminDeleteSourceExtension` | DELETE | `/api/pages-admin/source-extensions/${encodeURIComponent(namespace)}` | namespace: string | { deleted: string; backup: string } | 1 |
| `positionPolicyDelete` | DELETE | `/api/backtest/position-policies/${id}` | id: string | { ok: boolean } | 1 |
| `positionPolicyGet` | GET | `/api/backtest/position-policies/${id}` | id: string | { id: string; meta: PositionPolicyMeta; code: string } | 1 |
| `positionPolicySave` | POST | `/api/backtest/position-policies` | payload: PositionPolicySavePayload | { ok: boolean; id: string; issues: string[] } | 1 |
| `positionPolicyValidate` | POST | `/api/backtest/position-policies/validate` | payload: PositionPolicySavePayload | { ok: boolean issues: string[] smoke: { weights: number[]; budget_scale: number } \| null } | 1 |
| `resourcesApply` | POST | `/api/definitions/resources/apply` | files: File[], selected: string[], overwrite: string[], revision: string | ResourceTransferResult | 1 |
| `runLimitLadderFix` | POST | `/api/settings/preferences/limit-ladder-monitor/run` | — | { ok: boolean; count: number; msg: string } | 1 |
| `saveAiSettings` | POST | `/api/settings/ai` | ai: { provider?: string; base_url?: string; api_key?: string; model?: string; protocol?: string; reasoning_effort?: stri | { ok: boolean; ai_provider?: string; ai_protocol?: string; ai_model?: string; ai_openai_model?: string; ai_reasoning_effort?: string; ai_codex_model?: string; a | 1 |
| `saveDataSource` | POST | `/api/settings/data-sources` | config: CustomSourceConfig | DataSourcesResponse | 1 |
| `saveNavHidden` | PUT | `/api/settings/preferences/nav-hidden` | nav_hidden: string[] | { nav_hidden: string[] } | 1 |
| `saveNavOrder` | PUT | `/api/settings/preferences/nav-order` | nav_order: string[] | { nav_order: string[] } | 1 |
| `savePluginKey` | POST | `/api/settings/plugin-key` | plugin: string, apiKey: string | PluginKeyResult | 1 |
| `saveTickflowKey` | POST | `/api/settings/tickflow-key` | api_key: string | SaveTickflowKeyResult | 1 |
| `testAiSettings` | POST | `/api/settings/ai/test` | ai: { provider?: string; base_url?: string; api_key?: string; model?: string; protocol?: string }, opts?: { timeoutMs?:  | { ok: boolean; model?: string; response?: string; error?: string; error_type?: string } | 1 |
| `testDataSource` | POST | `/api/settings/data-sources/test` | provider: string, dataset: string, symbols?: string[], config?: CustomSourceConfig | DataSourceTestResult | 1 |
| `toggleWecomBot` | PUT | `/api/settings/preferences/wecom-bot-toggle` | enabled: boolean | { wecom_bot_enabled: boolean; wecom_bot_status: WecomBotStatus } | 1 |
| `uninstallPlugin` | DELETE | `/api/settings/plugins/${encodeURIComponent(name)}/install` | name: string | DataSourcesResponse & { uninstall_ok: boolean; uninstall_message: string } | 1 |
| `updateBacktestWorkerRssLimit` | PUT | `/api/settings/preferences/backtest-worker-rss-limit` | gib: number | { backtest_worker_rss_limit_gib: number } | 1 |
| `updateCustomWebhook` | PUT | `/api/settings/preferences/custom-webhook` | url: string, secret?: string | { custom_webhook_url: string; custom_webhook_secret_set: boolean } | 1 |
| `updateDailyBatchSymbols` | PUT | `/api/settings/preferences/daily-batch-symbols` | size: number | { daily_batch_symbols: number } | 1 |
| `updateDataSourceJobTimeouts` | PUT | `/api/settings/preferences/data-source-job-timeouts` | dataSourceJobTimeoutS: number, dataSourceLongJobTimeoutS: number | Pick<Preferences, 'data_source_job_timeout_s' \| 'data_source_long_job_timeout_s'> | 1 |
| `updateEmailSmtp` | PUT | `/api/settings/preferences/email-smtp` | config: EmailSmtpConfig, password?: string | { email_smtp_config: EmailSmtpConfig; email_smtp_password_set: boolean } | 1 |
| `updateFeishuWebhook` | PUT | `/api/settings/preferences/feishu-webhook` | url: string, secret: string = '' | { feishu_webhook_url: string; feishu_webhook_secret: string } | 1 |
| `updateLimitLadderMonitor` | PUT | `/api/settings/preferences/limit-ladder-monitor` | enabled: boolean | { limit_ladder_monitor_enabled: boolean } | 1 |
| `updateMinuteBatchSymbols` | PUT | `/api/settings/preferences/minute-batch-symbols` | size: number | { minute_batch_symbols: number } | 1 |
| `updateWebhookDefaultChannels` | PUT | `/api/settings/preferences/webhook-default-channels` | channels: string[] | { webhook_default_channels: string[] } | 1 |
| `updateWecomBot` | PUT | `/api/settings/preferences/wecom-bot` | botId: string, secret: string, enabled: boolean = true | { wecom_bot_id: string wecom_bot_secret: string wecom_bot_enabled: boolean wecom_bot_status: WecomBotStatus } | 1 |
| `updateWecomWebhook` | PUT | `/api/settings/preferences/wecom-webhook` | url: string | { wecom_webhook_url: string } | 1 |
| `upgradeGuardDismiss` | POST | `/api/upgrade-guard/dismiss-report` | — | { ok: boolean } | 1 |
| `upgradeGuardScan` | POST | `/api/upgrade-guard/scan` | — | UpgradeGuardStatus | 1 |
| `uploadSoundPack` | POST | `/api/settings/sound-packs` | file: File | { status: string; pack: SoundPack } | 1 |
| `analysisMenuDelete` | DELETE | `/api/analysis-menus/${encodeURIComponent(id)}` | id: string | { status: string } | 引用 |
| `analysisMenus` | GET | `/api/analysis-menus` | — | { items: AnalysisMenu[] } | 引用 |
| `apiTokensList` | GET | `/api/settings/api-tokens` | — | { tokens: ApiTokenRecord[] } | 引用 |
| `capabilityMatrix` | GET | `/api/settings/capability-matrix` | — | CapabilityMatrix | 引用 |
| `dataSources` | GET | `/api/settings/data-sources` | — | DataSourcesResponse | 引用 |
| `extDataList` | GET | `/api/ext-data` | — | { items: ExtDataConfig[] } | 引用 |
| `extPagesList` | GET | `/api/ext-pages` | — | RuntimePagePack[] | 引用 |
| `extPagesSourceNamespaces` | GET | `/api/ext-pages/import-source/namespaces` | — | string[] | 引用 |
| `extensionPackages` | GET | `/api/extension-packages` | — | ManagedExtensionPackage[] | 引用 |
| `listSoundPacks` | GET | `/api/settings/sound-packs` | — | { packs: SoundPack[] } | 引用 |
| `minuteRefreshStatus` | GET | `/api/settings/minute-refresh/status` | — | { available: boolean enabled?: boolean running?: boolean /** 读侧 freshness: 本地分区正被服务持续写入 (前端据此切本地读/解除截断) */ healthy?: boolean provider?: string provider_effectiv | 引用 |
| `positionPolicyList` | GET | `/api/backtest/position-policies` | — | { policies: PositionPolicyInfo[] errors: Record<string, string> } | 引用 |
| `positionPolicyTemplates` | GET | `/api/backtest/position-policies/templates` | — | { templates: PositionPolicyTemplate[] } | 引用 |
| `reloadDataSources` | POST | `/api/settings/data-sources/reload` | — | DataSourcesResponse | 引用 |
| `upgradeGuardStatus` | GET | `/api/upgrade-guard/status` | — | UpgradeGuardStatus | 引用 |

</details>

### 3.11 个股分析（扩展） — `/stock-analysis`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 个股分析（扩展） |
| 2. 页面路由 | `/stock-analysis` |
| 3. 当前使用的 API | 9 个方法 / 9 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/stock_analysis.py`（AI 个股分析流式生成、关键价位、报告归档）、`api/kline.py`、`api/monitor_rules.py` |
| 7. 依赖的数据模型 | `ai_stock_reports`（symbol / 正文 / 模型 / 时间）、`stock_levels`（支撑压力位）、`monitor_rules` |
| 8. 本地替代方案 | 报告与价位落 SQLite；流式生成依赖 LLM，离线时只读历史报告并显式标注「生成需联网」；价位可由本地 K 线计算 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | 无专项测试（`lib/aiReportStore.ts` 无测试） |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `monitorRuleSave` | POST | `/api/monitor-rules` | rule: MonitorRule | { ok: boolean; rule: MonitorRule } | 2 |
| `stockAnalysisLevels` | GET | `/api/stock-analysis/levels?symbol=${encodeURIComponent(symbol)}&days=${days}` | symbol: string, days = 120 | StockLevels | 2 |
| `klineDaily` | GET | `(dateRange ? `/api/kline/daily?symbol=${encodeURIComponent(symbol)}&start_date=${dateRange.start}&end_date=${dateRange.end}` : `/api/kline/daily?symbol=${encodeURIComponent(symbol)}&days=${days}`) + (extColumns ? `&ext_columns=${encodeURIComponent(extColumns)}` : '')` | symbol: string, days = 120, dateRange?: { start: string; end: string }, extColumns?: string | KlineDailyResponse | 1 |
| `stockAnalysisReportDelete` | DELETE | `/api/stock-analysis/reports/${encodeURIComponent(reportId)}` | reportId: string | { ok: boolean } | 1 |
| `stockAnalysisReportSave` | POST | `/api/stock-analysis/reports` | r: { symbol: string; name?: string; focus?: string; content: string summary?: string; close?: number \| null levels?: Re | { ok: boolean; report: AiStockReport } | 1 |
| `stockAnalysisReportsList` | GET | `/api/stock-analysis/reports` | — | { reports: AiStockReport[] } | 1 |
| `stockAnalyzeStream` | — | `（流式/动态）` | — | （流式或未标注） | 1 |
| `monitorRuleDelete` | DELETE | `/api/monitor-rules/${encodeURIComponent(id)}` | id: string | { ok: boolean } | 引用 |
| `monitorRulesList` | GET | `/api/monitor-rules` | — | { rules: MonitorRule[] } | 引用 |

</details>

### 3.12 连板梯队 — `/limit-ladder`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 连板梯队 |
| 2. 页面路由 | `/limit-ladder` |
| 3. 当前使用的 API | 5 个方法 / 4 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/screener.py`（`/limit-ladder` 连板梯队计算）、`api/monitor_rules.py` |
| 7. 依赖的数据模型 | 连板结果（实时计算，无持久表）、`monitor_rules` |
| 8. 本地替代方案 | 需将涨停判定（`price_limits.py` 的 10%/20%/ST 规则）与连板计数移植到本地，基于本地日线计算；规则存 SQLite |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | 无 |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `limitLadder` | GET | `/api/screener/limit-ladder${qs ? `?${qs}` : ''}` | asOf?: string, extColumns?: string, direction?: 'up' \| 'down' | LimitLadderResult | 1 |
| `monitorRuleDelete` | DELETE | `/api/monitor-rules/${encodeURIComponent(id)}` | id: string | { ok: boolean } | 1 |
| `monitorRuleSave` | POST | `/api/monitor-rules` | rule: MonitorRule | { ok: boolean; rule: MonitorRule } | 1 |
| `monitorRulesList` | GET | `/api/monitor-rules` | — | { rules: MonitorRule[] } | 1 |
| `extDataSchemaAll` | GET | `/api/ext-data/schema-all` | — | { items: { id: string; label: string; mode: string; time_field?: string \| null; granularity?: 'intraday' \| 'daily' \| null; columns: { name: string; type: str | 引用 |

</details>

### 3.13 概念板块 — `/concept-analysis`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 概念板块 |
| 2. 页面路由 | `/concept-analysis` |
| 3. 当前使用的 API | 4 个方法 / 2 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/ext_data.py`（概念板块数据行与拉取） |
| 7. 依赖的数据模型 | `ext_data_config`（概念板块配置）、`ext_data_rows` |
| 8. 本地替代方案 | 配置与数据行落 SQLite；拉取改本地适配器，保留「数据来源 + 更新时间」字段 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | 无 |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `extDataPullRun` | POST | `/api/ext-data/${id}/pull/run` | id: string, timeoutSeconds?: number | { status: string; rows: number; date: string } | 1 |
| `extDataRows` | GET | `/api/ext-data/${encodeURIComponent(id)}/rows${suffix ? `?${suffix}` : ''}` | id: string, opts?: { date?: string; limit?: number; columns?: string[] } | ExtDataRowsResult | 1 |
| `extDataList` | GET | `/api/ext-data` | — | { items: ExtDataConfig[] } | 引用 |
| `marketSnapshot` | GET | `/api/screener/market-snapshot` | — | { as_of: string \| null; rows: MarketSnapshotRow[] } | 引用 |

</details>

### 3.14 行业板块 — `/industry-analysis`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 行业板块 |
| 2. 页面路由 | `/industry-analysis` |
| 3. 当前使用的 API | 4 个方法 / 2 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/ext_data.py`（行业板块数据行与拉取） |
| 7. 依赖的数据模型 | `ext_data_config`、`ext_data_rows` |
| 8. 本地替代方案 | 同概念板块：SQLite 存配置与行数据，拉取走本地适配器 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | 无 |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `extDataPullRun` | POST | `/api/ext-data/${id}/pull/run` | id: string, timeoutSeconds?: number | { status: string; rows: number; date: string } | 1 |
| `extDataRows` | GET | `/api/ext-data/${encodeURIComponent(id)}/rows${suffix ? `?${suffix}` : ''}` | id: string, opts?: { date?: string; limit?: number; columns?: string[] } | ExtDataRowsResult | 1 |
| `extDataList` | GET | `/api/ext-data` | — | { items: ExtDataConfig[] } | 引用 |
| `marketSnapshot` | GET | `/api/screener/market-snapshot` | — | { as_of: string \| null; rows: MarketSnapshotRow[] } | 引用 |

</details>

### 3.15 财务概况 — `/financials`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 财务概况 |
| 2. 页面路由 | `/financials` |
| 3. 当前使用的 API | 8 个方法 / 8 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/financials.py` + `services/financial_sync.py`（五张财务报表同步与查询） |
| 7. 依赖的数据模型 | `financial_income`、`financial_balance_sheet`、`financial_cash_flow`、`financial_metrics`、`financial_shares` |
| 8. 本地替代方案 | 五张表落 SQLite（字段与后端 parquet 对齐）；同步改本地导入或按需拉取；缺失时显示「无本地数据」而非空图 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `components/financials/MarkdownRenderer.test.tsx`（仅渲染层） |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `financialBalanceSheet` | GET | `/api/financials/balance-sheet${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}` | symbol?: string | { data: FinancialBalanceSheetRecord[] } | 1 |
| `financialCashFlow` | GET | `/api/financials/cash-flow${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}` | symbol?: string | { data: FinancialCashFlowRecord[] } | 1 |
| `financialIncome` | GET | `/api/financials/income${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}` | symbol?: string | { data: FinancialIncomeRecord[] } | 1 |
| `financialMetrics` | GET | `/api/financials/metrics${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}` | symbol?: string | { data: FinancialMetricRecord[] } | 1 |
| `financialShares` | GET | `/api/financials/shares${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}` | symbol?: string | { data: FinancialSharesRecord[] } | 1 |
| `financialStatus` | GET | `/api/financials/status` | — | FinancialStatus | 1 |
| `financialSync` | POST | `/api/financials/sync/${table}` | table: string | { status: string; synced: { started: boolean; reason?: string } } | 1 |
| `instrumentSearch` | GET | `/api/kline/instruments/search?q=${encodeURIComponent(q)}&limit=${limit}${assetTypes ? `&asset_types=${encodeURIComponent(assetTypes)}` : ''}` | q: string, limit = 20, assetTypes?: string | { results: { symbol: string; name: string; code: string; asset_type?: string }[] } | 1 |

</details>

### 3.16 监控中心 — `/monitor`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 监控中心 |
| 2. 页面路由 | `/monitor` |
| 3. 当前使用的 API | 14 个方法 / 11 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/monitor_rules.py`（规则 CRUD 与试算）、`api/alerts.py`（提醒读写） |
| 7. 依赖的数据模型 | `monitor_rules`（条件 DSL / 作用域 / 启用态）、`alerts`（事件流） |
| 8. 本地替代方案 | 规则与提醒落 SQLite；规则求值改本地引擎（定时轮询本地行情），提醒走本地通知；`/api/kline/instruments/names` 改读本地 `instruments` 表 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | 无 |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `instrumentNames` | POST | `/api/kline/instruments/names` | symbols: string[] | { names: Record<string, string> } | 3 |
| `monitorRuleSave` | POST | `/api/monitor-rules` | rule: MonitorRule | { ok: boolean; rule: MonitorRule } | 2 |
| `alertDelete` | DELETE | `/api/alerts/${ts}` | ts: number | { ok: boolean } | 1 |
| `alertsList` | GET | `/api/alerts${s ? `?${s}` : ''}` | params?: { days?: number; limit?: number; source?: string; type?: string; extColumns?: string } | { alerts: AlertEvent[]; total: number } | 1 |
| `instrumentSearch` | GET | `/api/kline/instruments/search?q=${encodeURIComponent(q)}&limit=${limit}${assetTypes ? `&asset_types=${encodeURIComponent(assetTypes)}` : ''}` | q: string, limit = 20, assetTypes?: string | { results: { symbol: string; name: string; code: string; asset_type?: string }[] } | 1 |
| `monitorRuleDelete` | DELETE | `/api/monitor-rules/${encodeURIComponent(id)}` | id: string | { ok: boolean } | 1 |
| `screenerStrategies` | GET | `/api/strategies?${assetType ? `asset_type=${assetType}&` : ''}${timeframe !== 'all' ? `timeframe=${timeframe}` : ''}` | assetType?: 'stock' \| 'etf' \| 'index', timeframe: '1d' \| '1m' \| 'all' = '1d' | { strategies: StrategyDetail[] load_errors?: StrategyLoadError[] legacy_migration?: { seeded_signals?: number; seeded_strategies?: number; archived_files?: stri | 1 |
| `updateRealtimeMonitorConfig` | PUT | `/api/settings/preferences/realtime-monitor` | cfg: { sse_refresh_pages?: Record<string, boolean> strategy_monitor_enabled?: boolean strategy_monitor_ids?: string[] sc | { sse_refresh_pages: Record<string, boolean> strategy_monitor_enabled: boolean strategy_monitor_ids: string[] screener_auto_run: boolean minute_intraday_refresh | 1 |
| `alertsClear` | DELETE | `/api/alerts` | — | { ok: boolean; cleared: number } | 引用 |
| `extDataSchemaAll` | GET | `/api/ext-data/schema-all` | — | { items: { id: string; label: string; mode: string; time_field?: string \| null; granularity?: 'intraday' \| 'daily' \| null; columns: { name: string; type: str | 引用 |
| `monitorRuleOptions` | GET | `/api/monitor-rules/options` | — | MonitorRuleOptions | 引用 |
| `monitorRulesList` | GET | `/api/monitor-rules` | — | { rules: MonitorRule[] } | 引用 |
| `watchlistGroups` | GET | `/api/watchlist/groups` | — | { groups: WatchlistGroup[] } | 引用 |
| `watchlistList` | GET | `/api/watchlist` | — | { symbols: WatchlistEntry[] } | 引用 |

</details>

### 3.17 异动监控 — `/abnormal`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 异动监控 |
| 2. 页面路由 | `/abnormal` |
| 3. 当前使用的 API | 4 个方法 / 3 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/abnormal.py` + `services/abnormal_moves.py`（盘中异动：涨速、封单、量比）、`api/market_recap.py`（集合竞价基准） |
| 7. 依赖的数据模型 | 异动结果（实时计算）、`auction_benchmark` |
| 8. 本地替代方案 | 基于本地分时缓存 + 阈值规则本地计算；集合竞价基准落 SQLite 按日缓存 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | 无 |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `abnormalIntraday` | GET | `/api/abnormal/intraday?limit=${limit}` | limit = 500 | AbnormalIntradayPayload | 1 |
| `abnormalOverview` | GET | `/api/abnormal/overview?min_closeness=${minCloseness}&limit=${limit}` | minCloseness = 0.5, limit = 200 | AbnormalOverview | 1 |
| `auctionBenchmark` | GET | `/api/market-recap/auction-benchmark${date ? `?date=${encodeURIComponent(date)}` : ''}` | date?: string | AuctionBenchmarkPayload | 1 |
| `watchlistList` | GET | `/api/watchlist` | — | { symbols: WatchlistEntry[] } | 引用 |

</details>

### 3.18 持仓提醒 — `/lots`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 持仓提醒 |
| 2. 页面路由 | `/lots` |
| 3. 当前使用的 API | 5 个方法 / 3 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/lots.py`（持仓批次增删改查） |
| 7. 依赖的数据模型 | `lots`（symbol / 数量 / 成本 / 日期 / 备注） |
| 8. 本地替代方案 | 单表落 SQLite，CRUD 直连 Repository，无计算依赖 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | 无 |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `instrumentNames` | POST | `/api/kline/instruments/names` | symbols: string[] | { names: Record<string, string> } | 1 |
| `instrumentSearch` | GET | `/api/kline/instruments/search?q=${encodeURIComponent(q)}&limit=${limit}${assetTypes ? `&asset_types=${encodeURIComponent(assetTypes)}` : ''}` | q: string, limit = 20, assetTypes?: string | { results: { symbol: string; name: string; code: string; asset_type?: string }[] } | 1 |
| `lotSave` | POST | `/api/lots` | lot: Lot | { ok: boolean; lot: Lot } | 1 |
| `lotDelete` | DELETE | `/api/lots/${encodeURIComponent(id)}` | id: string | { ok: boolean } | 引用 |
| `lotsList` | GET | `/api/lots` | — | { lots: Lot[] } | 引用 |

</details>

### 3.19 模拟盘 — `/paper`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 模拟盘 |
| 2. 页面路由 | `/paper` |
| 3. 当前使用的 API | 23 个方法 / 26 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/paper.py` + `strategy/paper.py`（账户、订单、净值、持仓 JSON 落盘）、`strategy/paper_auto.py`（自动规则）、`custom/paper_execution`（策略执行面板） |
| 7. 依赖的数据模型 | `paper_accounts`（account.json）、`paper_orders`（order_*.json）、`paper_nav`、`paper_positions`、`paper_auto_rules` |
| 8. 本地替代方案 | 五类实体全部落 SQLite（原每账户多 JSON 文件改为关系表 + 事务）；撮合与估值改本地引擎，按本地行情逐日重算净值 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `custom/paper/executionClient.test.ts`、`custom/paper/StrategyExecutionPanel.test.tsx` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `screenerStrategies` | GET | `/api/strategies?${assetType ? `asset_type=${assetType}&` : ''}${timeframe !== 'all' ? `timeframe=${timeframe}` : ''}` | assetType?: 'stock' \| 'etf' \| 'index', timeframe: '1d' \| '1m' \| 'all' = '1d' | { strategies: StrategyDetail[] load_errors?: StrategyLoadError[] legacy_migration?: { seeded_signals?: number; seeded_strategies?: number; archived_files?: stri | 4 |
| `paperAutoRuleCreate` | POST | `accUrl('/api/paper/auto_rules', account)` | body: Omit<PaperAutoRule, 'id' \| 'created_at'>, account?: string | { rule: PaperAutoRule } | 2 |
| `paperFreeze` | POST | `accUrl('/api/paper/freeze?frozen=' + frozen, account)` | frozen: boolean, account?: string | { account: PaperAccount } | 2 |
| `paperSettings` | POST | `accUrl('/api/paper/settings', account)` | body: { queue_limit_orders?: boolean; commission_pct?: number; stamp_tax_pct?: number; slippage_bps?: number }, account? | { account: PaperAccount } | 2 |
| `instrumentNames` | POST | `/api/kline/instruments/names` | symbols: string[] | { names: Record<string, string> } | 1 |
| `instrumentSearch` | GET | `/api/kline/instruments/search?q=${encodeURIComponent(q)}&limit=${limit}${assetTypes ? `&asset_types=${encodeURIComponent(assetTypes)}` : ''}` | q: string, limit = 20, assetTypes?: string | { results: { symbol: string; name: string; code: string; asset_type?: string }[] } | 1 |
| `paperArenaCreate` | POST | `/api/paper/arena/batch_create` | body: { initial_cash: number; sources: PaperArenaSource[]; name_prefix?: string; commission_pct?: number; stamp_tax_pct? | { created: Array<{ account: string; name: string; rule_id: string }> } | 1 |
| `paperAutoRuleDelete` | DELETE | `accUrl(`/api/paper/auto_rules/${encodeURIComponent(id)}`, account)` | id: string, account?: string | { ok: boolean } | 1 |
| `paperAutoRuleSetEnabled` | POST | `accUrl(`/api/paper/auto_rules/${encodeURIComponent(id)}/enabled?enabled=${enabled}`, account)` | id: string, enabled: boolean, account?: string | { rule: PaperAutoRule } | 1 |
| `paperAutoRules` | GET | `accUrl('/api/paper/auto_rules', account)` | account?: string | { rules: PaperAutoRule[] } | 1 |
| `paperCreateAccount` | POST | `/api/paper/account` | body: { initial_cash: number; account_id?: string; name?: string; commission_pct?: number; stamp_tax_pct?: number; slipp | { account: PaperAccount } | 1 |
| `paperDeleteAccount` | DELETE | `accUrl(`/api/paper/account?force=${force}`, account)` | force: boolean, account?: string | { ok: boolean; deleted: string; holdings?: number; pending_orders?: number } | 1 |
| `paperNav` | GET | `accUrl('/api/paper/nav', account)` | account?: string | { nav: Array<{ date: string; cash: number; mv: number; nav: number }> } | 1 |
| `paperOrderCancel` | DELETE | `accUrl(`/api/paper/orders/${encodeURIComponent(id)}`, account)` | id: string, account?: string | { order: PaperOrder } | 1 |
| `paperOrderCreate` | POST | `accUrl('/api/paper/orders', account)` | body: { symbol: string; side: 'buy' \| 'sell'; qty?: number; amount?: number; order_type: 'market' \| 'next_open' \| 'cl | { order: PaperOrder } | 1 |
| `paperOrders` | GET | `/api/paper/orders${q ? `?${q}` : ''}` | status?: string, account?: string | { orders: PaperOrder[] } | 1 |
| `paperOverview` | GET | `accUrl('/api/paper/overview', account)` | account?: string | PaperOverview | 1 |
| `paperRounds` | GET | `accUrl('/api/paper/rounds', account)` | account?: string | { rounds: PaperRound[] } | 1 |
| `paperStats` | GET | `accUrl('/api/paper/stats', account)` | account?: string | { rounds: number; win_rate: number; profit_loss_ratio: number \| null; avg_holding_days: number; realized_pnl: number; max_drawdown: number \| null } | 1 |
| `paperTrades` | GET | `accUrl('/api/paper/trades', account)` | account?: string | { fills: PaperFill[] } | 1 |
| `backtestCandidates` | GET | `/api/backtest/candidates` | — | { items: BacktestCandidate[] } | 引用 |
| `monitorRulesList` | GET | `/api/monitor-rules` | — | { rules: MonitorRule[] } | 引用 |
| `paperCompare` | GET | `/api/paper/compare` | — | { accounts: PaperCompareRow[] } | 引用 |

</details>

### 3.20 信号库 — `/signals`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 信号库 |
| 2. 页面路由 | `/signals` |
| 3. 当前使用的 API | 6 个方法 / 4 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/signals.py` + `strategy/custom_signals.py`（自定义信号 CRUD）、`api/strategy.py`（AI 状态查询） |
| 7. 依赖的数据模型 | `custom_signals`（条件树 / 作用域 / 版本） |
| 8. 本地替代方案 | 信号定义落 SQLite；条件求值改本地（与 monitor 规则共用求值器）；AI 生成保留联网可选 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `custom/signals/Signals.numeric-right.test.tsx`、`components/signals/ConditionEditor.test.tsx` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `customSignalSave` | POST | `/api/custom-signals` | signal: CustomSignal | { ok: boolean; signal: CustomSignal } | 2 |
| `customSignalsAiGenerate` | POST | `/api/custom-signals/ai/generate` | description: string | CustomSignalAIGenerateResult | 1 |
| `strategyAiStatus` | GET | `/api/strategies/ai/status` | — | { configured: boolean; has_key: boolean; has_model: boolean; provider?: string } | 1 |
| `customSignalDelete` | DELETE | `/api/custom-signals/${encodeURIComponent(id)}` | id: string | { ok: boolean } | 引用 |
| `customSignalsList` | GET | `/api/custom-signals` | — | { signals: CustomSignal[] } | 引用 |
| `customSignalsOptions` | GET | `/api/custom-signals/options` | — | CustomSignalOptions | 引用 |

</details>

### 3.21 复盘 — `/review`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 复盘 |
| 2. 页面路由 | `/review` |
| 3. 当前使用的 API | 10 个方法 / 10 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | `api/market_recap.py`（大盘复盘报告、龙虎榜）、`services/ai_reports.py`（流式生成与归档）、`api/overview.py` |
| 7. 依赖的数据模型 | `ai_review_reports`、`dragon_tiger`（按日缓存）、`preferences.review_schedule` |
| 8. 本地替代方案 | 报告与龙虎榜落 SQLite；生成依赖 LLM（联网），离线只读历史并标注；推送计划改本地通知/取消 |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `custom/review/DragonTiger.nullThscode.test.tsx` |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|
| `updateReviewPush` | PUT | `/api/settings/preferences/review-push` | channels: string[], mode?: 'auto' \| 'manual' | { review_push_channels: string[]; review_push_mode: 'auto' \| 'manual' } | 2 |
| `dragonTiger` | GET | `/api/market-recap/dragon-tiger${date ? `?date=${encodeURIComponent(date)}` : ''}` | date?: string | DragonTigerPayload | 1 |
| `overviewMarket` | GET | `/api/overview/market${asOf ? `?as_of=${asOf}` : ''}` | asOf?: string | OverviewMarket | 1 |
| `reviewReportDelete` | DELETE | `/api/market-recap/reports/${encodeURIComponent(reportId)}` | reportId: string | { ok: boolean } | 1 |
| `reviewReportSave` | POST | `/api/market-recap/reports` | r: { as_of: string; focus?: string; content: string summary?: string; emotion_score?: number \| null; emotion_label?: st | { ok: boolean; report: AiReviewReport } | 1 |
| `reviewReportsList` | GET | `/api/market-recap/reports` | — | { reports: AiReviewReport[] } | 1 |
| `reviewStream` | — | `（流式/动态）` | — | （流式或未标注） | 1 |
| `updateMarketRecapPrompt` | PUT | `/api/settings/preferences/market-recap-prompt` | prompt: string | { custom: string; customized: boolean } | 1 |
| `updateReviewSchedule` | PUT | `/api/settings/preferences/review-schedule` | enabled: boolean, hour: number, minute: number | { enabled: boolean; hour: number; minute: number } | 1 |
| `getMarketRecapPrompt` | GET | `/api/settings/preferences/market-recap-prompt` | — | { custom: string; default: string; customized: boolean } | 引用 |

</details>

### 3.22 量化研究实验室 — `/quant-lab`

| 项 | 内容 |
|---|---|
| 1. 页面名称 | 量化研究实验室 |
| 2. 页面路由 | `/quant-lab` |
| 3. 当前使用的 API | 0 个方法 / 0 处调用（明细见下表） |
| 6. 依赖的后端业务逻辑 | 无。该页只依赖 `@quant-desk/native-core`（`analytics/*` + `indicators/advanced.ts`），CSV 在浏览器内解析计算 |
| 7. 依赖的数据模型 | 无持久模型（CSV 仅驻留内存） |
| 8. 本地替代方案 | **已满足 Local-first**，缺的是持久化：需把导入的数据集、计算结果、参数落 SQLite，才能在重启后恢复（否则每次重传 CSV） |
| 9. 当前迁移状态 | **NOT_STARTED** |
| 10. 对应测试 | `native-core/test/analytics.test.ts`、`native-core/test/indicators.test.ts`（跨包，非页面级） |

<details><summary>API 明细（4. 输入参数 / 5. 返回结构）</summary>

| 方法 | HTTP | 路径 | 输入参数 | 返回结构 | 调用/引用 |
|---|---|---|---|---|---:|

</details>

---

## 4. 本地数据库选型（阶段 2 第二步的前置结论）

### 4.1 现状核查

| 检查项 | 结果 |
|---|---|
| 前端 SQLite | 无。`package.json` 无 `@capacitor-community/sqlite`、无 `sql.js`、无 `wa-sqlite` |
| 前端 IndexedDB / Dexie | 无。全仓 0 处 `indexedDB` / `idb` / `Dexie` 引用 |
| 现有持久化 | 仅 `localStorage`（141 处），用于 UI 偏好与少量缓存，无结构化查询能力 |
| 后端存储 | **DuckDB + 分区 parquet**（`tickflow/repository.py` 注册 11 张视图），无 SQLite |

### 4.2 Capacitor SQLite 兼容性（已实测 npm 元数据）

```
@capacitor-community/sqlite@8.1.1   peerDependencies: { "@capacitor/core": ">=8.0.0" }
项目当前: @capacitor/core ^8.0.0 (实际 8.6.2), @capacitor/ios ^8.0.0
```

结论：**主版本匹配，可直接采用**。`>=8.0.0` 的 peer 范围覆盖 8.6.2，无需降级 Capacitor。

### 4.3 选型结论

| 方案 | 判定 | 理由 |
|---|---|---|
| **Capacitor SQLite（原生）** | **采用** | 真 SQLite 文件、支持事务/索引/迁移、iOS 原生实现；离线可靠性最高 |
| jeep-sqlite（WASM，浏览器回退） | 采用（仅开发/浏览器） | 让同一套 Repository 在 `pnpm dev` 下可跑；不作为 iOS 运行时 |
| IndexedDB | 不采用为主存储 | 无 SQL、无事务跨表约束、iOS WebView 在存储压力下可能被清理；仅可作 OTA 内容缓存 |

**注意**：后端是 DuckDB/parquet 列存，不能「把后端库文件拷过来」。本地 schema 必须按前端查询模式重新设计，行情类数据用窄表 + 复合主键，用户态数据用关系表。

---

## 5. 分批迁移计划（待确认后执行）

| 批次 | 页面 | 前置 | 风险 |
|---|---|---|---|
| **A. 基础设施** | 无页面，仅 `core/ database/ repositories/ migrations/ adapters/` + 离线状态组件 | — | 低。纯新增，不动现有代码 |
| **B. 纯本地态** | 自选股、设置、持仓提醒（lots）、信号库、量化实验室持久化 | A | 低。数据模型清晰，无复杂计算 |
| **C. 数据与展示** | 数据中心、财务概况、指数、概念板块、行业板块、连板梯队、异动监控 | A | 中。依赖本地行情库与导入链路 |
| **D. 计算密集** | 市场环境、因子库、选股器、回测、模拟盘、监控中心、复盘、个股分析、看板 | A + C | 高。需要本地计算引擎与后端算法对拍 |

每批完成后的固定动作：`pnpm test` 全量 → 记录通过/失败数 → 更新本矩阵状态 → 单独提交。

状态流转只允许：`NOT_STARTED → IN_PROGRESS → IMPLEMENTED → TESTED → VERIFIED`。`TESTED` 必须有实际运行的测试输出，`VERIFIED` 必须在目标 iOS 环境实测。

---

## 6. 阶段 2 验收对照表

| 验收条件 | 当前 | 判定方式 |
|---|---|---|
| 22/22 页面迁移 | 0/22 | 本矩阵状态列全部为 `IMPLEMENTED` 以上 |
| 核心业务不依赖 FastAPI | 否 | 断网 + 停后端启动 App，逐页操作 |
| 本地数据库真实运行 | 否 | 设备上存在 `.sqlite` 文件，`sqlite3 .tables` 可列 |
| 重启后数据仍在 | 否 | 写入 → 杀进程 → 重启 → 读回比对 |
| 核心功能离线可用 | 否 | 飞行模式逐页验收 |
| 原有功能无丢失 | 未测 | 与 `ed553e9` 基线逐页对照 |
| 两份矩阵完整 | 本文件完成；API 矩阵待建 | `LOCAL_FIRST_API_MIGRATION_MATRIX.md` |
| 关键功能测试通过 | 未开始 | 保持 ≥501 通过 / 0 新增失败 |
| iOS 真机验证 | 未开始 | 需签名设备，当前环境无法执行 |

