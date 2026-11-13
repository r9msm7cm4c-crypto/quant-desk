# iOS 构建与签名说明（正式 Capacitor 工程）

本文件只描述 **`tsp/mobile/ios/`** 这一套工程。仓库根目录 `ios/` 是早期的 Objective-C PWA 外壳，
两者产物不同、用途不同，不要混用。

## 1. 构建在哪跑

| 项 | 值 |
|---|---|
| 唯一构建入口 | `.github/workflows/ios-build.yml` |
| Runner | `macos-15`（GitHub 托管，自带 Xcode） |
| Xcode | 16.4（`swift-tools-version:6.1` 的插件要求 16.3+） |
| 产物 | `QuantDesk-<version>-unsigned.ipa` |
| 发布位置 | GitHub Release，tag 形如 `ios-v0.2.0-b3` |
| 签名 | 不签名（`CODE_SIGNING_ALLOWED=NO`），由使用者自行签名 |

触发方式：

- 推送到 `main` 且改动了 `tsp/mobile/**`、`tsp/frontend/**`、workflow 自身；
- 或在 Actions 页面手动 `Run workflow`，可指定 `marketing_version` / `build_number`。

沙箱环境（Linux）没有 `xcodebuild`、没有 Swift 工具链、没有 iphoneos SDK，
**无法在本地产出 IPA**。CI 是当前唯一可复现的构建路径。

## 2. 构建前会校验什么

workflow 里每一步失败都会让整条流水线失败，不会产出半成品：

1. 前端 `pnpm build` 必须产出 `dist/index.html`；
2. `cap sync ios` 必须生成 `ios/App/App/public`；
3. `CapApp-SPM/Package.swift` 必须包含 `CapacitorCommunitySqlite`（原生 SQLite 插件）；
4. `xcodebuild archive` 必须成功；
5. IPA 内必须存在 `public/index.html` 与 `PrivacyInfo.xcprivacy`；
6. 最后打印二进制架构与签名状态（应为未签名）。

## 3. 包内有什么

```
QuantDesk.app/
├── App                       # arm64 Mach-O
├── Info.plist                # com.quantdesk.mobile / 0.2.0 (2) / iOS 15.0
├── PrivacyInfo.xcprivacy     # 隐私清单
├── Frameworks/               # SPM 产物：Capacitor、Alamofire、ZIPFoundation 等
└── public/                   # 前端构建产物 + pwa/（单文件离线界面）
```

`public/pwa/` 是仓库根目录那份单文件量化工作台（`index.html` + `manifest` + `icons`），
构建时由 `vite.config.ts` 的 `offlinePwaPlugin` 复制进来。它完全不依赖后端。

## 4. 怎么签名安装

包是未签名的（没有 `_CodeSignature`），必须用你自己的证书重签。

**Sideloadly（Windows / macOS）**

1. 数据线连接 iPhone，打开 Sideloadly；
2. 把 ipa 拖进窗口，填 Apple ID；
3. 建议改 Bundle ID（如 `com.yourname.quantdesk`），避免与他人冲突；
4. Start，然后在手机上「设置 → 通用 → VPN 与设备管理」信任开发者证书。

**AltStore / SideStore**：装好 AltStore，登录 Apple ID，My Apps → 加号 → 选择 ipa。
免费账号 7 天到期，需重签。

**TrollStore**：仅限 iOS 14.0–17.0 且设备在支持列表内，可直接安装未签名 ipa，永久有效。

## 5. 装好后第一件事：什么都不用配

这一版是**本机模式（local-first）**：行情直连公开行情源，自选/偏好存手机本地 SQLite，
打开就能用，**不需要电脑、不需要服务器、不需要填任何地址**。

首次启动会自动预置 5 只示例（贵州茅台、平安银行、宁德时代、上证指数、创业板指），
直接看到真实报价与涨跌幅，按需删除、按需添加。

| 能力 | 本机模式 | 需要服务器 |
|---|---|---|
| 自选 / 分组 / 偏好 | ✅ 本地 SQLite | — |
| 实时报价、日线、分时 | ✅ 直连公开源 | — |
| MA / MACD / KDJ / RSI / BOLL / ATR / 动量 / 连板 / 信号 | ✅ 本地计算 | — |
| 指数、代码搜索 | ✅ | — |
| 回测、选股策略、AI 研报、扩展数据、监控告警 | ❌ | ✅ |

需要联网。行情来自公开行情站的只读快照，延迟与行情页一致；公开源不可达时该行显示 `—`，
不会编造数据。

### 如果你以后有服务器

**设置 → 服务器连接** 里填地址即可切回完整模式（回测/选股/AI 全部恢复），
填了地址就自动停用本机模式；清空地址即回到本机模式。

## 5.1 本机模式下你会看到什么

1. 打开即进入**自选页**（不是看板——看板的涨跌分布/连板梯队需要全市场聚合，本机取不到）；
2. 5 行示例数据，现价、涨跌幅、换手率、量比、RSI、60D 动量、连板、信号均为实算；
3. 左下角显示「实时行情 · 本机直连 · 运行中」；
4. 点任意标的可看日 K 与分时；
5. 进入回测/策略/监控等页面会明确提示「本地模式暂不支持该功能」，不会假装有数据。

## 6. 已知限制

| 限制 | 说明 |
|---|---|
| 未在真机验证 | 只做了结构、架构、版本、资源检查；需自签安装后实测 |
| 本机模式不覆盖重计算 | 回测、选股、AI、扩展数据需要后端；界面会明确提示，不返回假数据 |
| 公开行情源 | 腾讯快照 + 新浪日线，属只读公开接口；源站调整字段时需同步适配 `src/core/local/sources.ts` |
| OTA 未启用 | `tsp/ota/stable.json` 保持 `enabled=false`；公钥已注入 `capacitor.config.json` |
| 横/竖屏 | 工程为全方向；界面按桌面宽度设计，横屏体验更好 |
| Service Worker | 在 `capacitor://` 下不生效，离线能力由本地文件保证，不依赖缓存 |

## 7. 回滚

```bash
# 回到阶段 2 开工前
git reset --hard pre-phase2

# 只看这一版构建对应的提交
git log --oneline -1 d8256a1
```

IPA 版本之间互相独立，装新版本不会读取旧版本的数据目录（Bundle ID 相同则会覆盖安装）。
