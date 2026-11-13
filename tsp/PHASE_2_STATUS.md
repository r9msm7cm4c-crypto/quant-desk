# 阶段 2 状态

```
PHASE_2_STATUS   = IN_PROGRESS        # 批次 A/B 完成；页面迁移仍未开始
MIGRATED_PAGES   = 0/22
LOCAL_DATABASE   = IMPLEMENTED_NOT_DEVICE_VERIFIED
LOCAL_MARKET     = IMPLEMENTED_SERVER_FREE   # 无后端可用：行情直连公开源 + 本地指标计算
LAST_UPDATED     = 2026-11-13
BASELINE_COMMIT  = ed553e9
```

本文件是阶段 2 唯一的状态源。任何进度汇报必须先改这里，再改矩阵，二者的值必须一致。

## 事实核查（2026-11-13 实测）

| 检查项 | 结果 | 核查方式 |
|---|---|---|
| 已迁移页面 | 0 | `LOCAL_FIRST_PAGE_MIGRATION_MATRIX.md` 22 页全部 `NOT_STARTED` |
| SQLite 依赖 | 两端已安装 | `tsp/frontend`：`@capacitor-community/sqlite@8.1.1` + `jeep-sqlite@2.8.0` + `sql.js@1.13.0`(dev)；`tsp/mobile`：同版本，`cap sync` 后已进入 `CapApp-SPM/Package.swift` |
| IndexedDB 使用 | 0 处 | 全仓检索 `indexedDB` / `idb` / `Dexie` 无命中 |
| 本地数据库 | Schema v1 已建，19 条单测通过 | `src/core/database/`，详见矩阵批次 A 记录 |
| 页面接入 | 0 个 | 22 页仍 `NOT_STARTED` |
| 后端连接 | **已可配置并实测连通** | `src/lib/endpoint.ts`：基址持久化 + 探活；`api.ts`/SSE/8 个裸请求全部改走绝对地址 |
| 无后端可用性 | **已实现（本机模式）** | `src/core/local/*`：`/api/*` 由设备内应答；行情走腾讯+新浪；指标纯 TS 计算；实测自选 5 只出真实价格与涨跌幅 |
| iOS 构建 | **已产出未签名 IPA** | GitHub Actions `macos-15` + Xcode 16.4，`ios-v0.2.0` Release；`xcodebuild archive` 全流程 exit 0 |
| iOS 真机 | NOT TESTED | 未签名，需用户自签安装后验收 |
| 后端存储形态 | DuckDB + 分区 parquet | `app/tickflow/repository.py` 注册 11 张 parquet 视图，无 SQLite |

## 测试基线（2026-11-13 23:45 实测，批次 B 之后）

```
Test Files  6 failed | 75 passed (81)
Tests      32 failed | 585 passed (617)
```

批次 B 新增 41 条测试（symbol 11 / indicators 15 / backend 路由 15），全部通过。
失败数 32 = 既有 30（`MiniCandlestick`/`MiniIntraday` SVG 像素断言）+ 2 条并发抖动
（`useStrategyPool` / `assistant store`，单跑均通过，属既有环境竞争问题，非本次改动引入）。

## 历史文档的定位

| 文档 | 定位 |
|---|---|
| `tsp/LOCAL_FIRST_PHASE2_REPORT.md` | **历史**。原始上传包附带，描述 native-core 算法扩展，不代表本阶段进度 |
| `tsp/LOCAL_FIRST_ARCHITECTURE.md` | 架构构想，未执行 |
| `tsp/LOCAL_FIRST_MIGRATION_MATRIX.md` | 早期矩阵草案，粒度不足（无 API 入参/返回/后端逻辑），以本阶段新矩阵为准 |
| `tsp/LOCAL_FIRST_PAGE_MIGRATION_MATRIX.md` | **现行账本**，22 页 × 10 项，全部由源码静态扫描生成 |

## 状态变更日志

| 日期 | 变更 | 依据 |
|---|---|---|
| 2026-11-13 | 初始化为 `NOT_STARTED` / `0/22` / `NOT_IMPLEMENTED` | 完成 22 页盘点，未写任何迁移代码 |
| 2026-11-13 | 批次 A：SQLite 基础设施落地，19 条测试通过 | `src/core/database/*`、`src/core/repositories/*`；页面仍 0/22 |
| 2026-11-13 | iOS 0.1.0 首次真实构建成功（CI `macos-15`），暴露启动卡死问题 | `QuantDesk-0.1.0-unsigned.ipa`，5.89 MB，SHA-256 `01c9793c…` |
| 2026-11-13 | 可用性修复：启动 8s 兜底放行、顶层 ErrorBoundary、内置离线版 PWA 入口 | 浏览器侧实测：入口可达、页面可开可关、无渲染错误；测试 550/520/30 与基线一致 |
| 2026-11-13 | **连接层修复**：后端地址可配置（设置 → 服务器连接），消除永久「连接中断」 | 真实后端联调：未配置时提示可操作、配置后看板正常渲染、SSE 连通；新增 22 条测试全过；全量 572/542/30 |
| 2026-11-13 | **批次 B：本机模式（无服务器可用）**。`/api/*` 由设备内实现：自选/分组（SQLite 或 localStorage 降级）、实时快照、日线/分时、指标与信号、指数、搜索；未实现能力返回 501 并给出原因，不返回空数组 | 生产构建浏览器实测：自选 5 只真实报价（茅台 1435.26 +1.77% / 平安 12.07 +2.37% / 宁德 237.70 -0.96% / 上证 3634.35 -0.59% / 创业板 2426.08 -3.32%），无断连提示、无 4xx/5xx；node 侧实测 enriched 指标（ma20/rsi14/macd/momentum）与信号命中 |
