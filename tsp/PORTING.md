# 移植说明（相对上游 tick-stock-panel）

- 上游：<https://github.com/shy3130/tick-stock-panel>（MIT）
- 基线版本：`v0.3.30`
- 移植方式：整套代码原样放入 `tsp/`，**未删减任何业务功能与端点**；只做了下面四处增量改动。

## 改动清单

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `backend/app/main.py` | 在 SPA 全路径回退**之前**挂载 `/pwa` 静态目录 | 让轻量 PWA 与主站同源共存；不先挂载会被回退成主站 index.html |
| `frontend/src/components/Layout.tsx` | 侧栏新增 `PwaNavLink`（`/pwa/` 存在时才显示） | 主站里能直接进离线版；独立部署（无 `/pwa`）时自动隐藏，不影响上游行为 |
| `scripts/seed_demo_data.py` | 新增：生成 8 只标的 × 620 交易日的合成日线 + 标的维表 | 没有数据源凭据时也能把「数据 → 指标 → 因子 → 筛选 → 回测」走通 |
| `../union.sh` | 新增：双端统一启动/构建脚本 | 一条命令完成「装依赖 → 构建前端 → 灌 PWA → 起服务」 |

其余文件与上游完全一致，包括 364 个 API 路径、策略引擎、回测、因子平台与挖掘、监控中心、AI 助手、开放接口与 MCP。

## 演示数据的边界

`seed_demo_data.py` 写的是**合成数据**，仅用于验证界面与流程：

- 价格由随机游走生成后按末值对齐到给定价位，走势与真实个股无关；
- 只有日线、标的维表，没有财务、分钟线、除权因子、指数、ETF；
- 缺财务字段会让依赖 ROE / 营收增速的因子与策略筛不出结果，这是数据缺失，不是功能缺陷；
- 真实使用请接入数据源（`tsp/docs/configuration.md`、`tsp/docs/custom-data-source.md`）。

脚本检测到 `data/kline_daily` 已有数据时会拒绝执行，避免覆盖真实行情；重建演示数据用 `--force`。

## 策略池为什么是空的

上游从 v0.3.x 起把策略改为用户自定义文件（`data/strategies/custom/`），新装环境策略库为空，
老版本升级才自动补回 25 个原内置策略。移植过来属于新装环境，因此策略页初始为空 ——
按 `tsp/docs/strategy.md` 添加（自定义 `.py` / AI 生成 / 手写代码三种方式）即可。

## 升级上游

`tsp/` 在本仓库里是普通目录（不带上游 `.git`），升级时另开一份 clone 做对比：

```bash
git clone https://github.com/shy3130/tick-stock-panel.git /tmp/tsp-upstream
cd /tmp/tsp-upstream && git diff v0.3.30 <新版本> -- \
  backend/app/main.py frontend/src/components/Layout.tsx
```

再按差异把同样的改动落到本仓库的 `tsp/` 上。

三处改动都集中在单点，冲突时按上表重新落一遍即可；`scripts/seed_demo_data.py` 与 `union.sh` 在仓库外层，不受上游影响。
