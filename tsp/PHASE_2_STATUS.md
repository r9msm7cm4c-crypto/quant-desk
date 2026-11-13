# 阶段 2 状态

```
PHASE_2_STATUS   = IN_PROGRESS        # 仅批次 A（基础设施），页面迁移仍未开始
MIGRATED_PAGES   = 0/22
LOCAL_DATABASE   = IMPLEMENTED_NOT_DEVICE_VERIFIED
LAST_UPDATED     = 2026-11-13
BASELINE_COMMIT  = ed553e9
```

本文件是阶段 2 唯一的状态源。任何进度汇报必须先改这里，再改矩阵，二者的值必须一致。

## 事实核查（2026-11-13 实测）

| 检查项 | 结果 | 核查方式 |
|---|---|---|
| 已迁移页面 | 0 | `LOCAL_FIRST_PAGE_MIGRATION_MATRIX.md` 22 页全部 `NOT_STARTED` |
| SQLite 依赖 | 已安装（frontend） | `@capacitor-community/sqlite@8.1.1`、`jeep-sqlite@2.8.0`、`sql.js@1.13.0`(dev, 仅供 wasm)；`tsp/mobile` 尚未安装，阶段 5 同步 |
| IndexedDB 使用 | 0 处 | 全仓检索 `indexedDB` / `idb` / `Dexie` 无命中 |
| 本地数据库 | Schema v1 已建，19 条单测通过 | `src/core/database/`，详见矩阵批次 A 记录 |
| 页面接入 | 0 个 | 22 页仍 `NOT_STARTED` |
| iOS 真机 | NOT TESTED | 无 macOS/Xcode 与签名设备 |
| 后端存储形态 | DuckDB + 分区 parquet | `app/tickflow/repository.py` 注册 11 张 parquet 视图，无 SQLite |

## 测试基线（2026-11-13 20:12 实测，批次 A 之后）

```
Test Files  5 failed | 72 passed (77)
Tests      30 failed | 520 passed (550)
```

新增 19 条本地数据库测试全部通过；失败数仍为 30，与阶段 1 结束时相同，无回归。
30 个失败中 29 个是 `MiniIntraday` / `MiniChart` 的 SVG 断言，1 个是 `Signals.numeric-right`（列表为空，因 jsdom 内同样请求后端）。

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
