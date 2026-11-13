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

## 5. 首次启动会看到什么（重要）

`tsp/frontend` 是一套依赖 FastAPI 的 22 页应用。**包内不含后端，也不会自动启动后端。**

因此首次启动的真实行为是：

1. 约 8 秒内显示启动占位（等 `/api/settings`），超时后自动放行；
2. 进入主界面，左侧导航、主题、路由都正常；
3. 各页面数据区显示「加载失败 / 重试」，底部提示「与服务连接已断开 · 正在重连」；
4. 点底部提示旁边的 **「打开离线版」**，或左栏 **离线版**，进入内置的单文件量化工作台——
   这部分是纯前端、自带数据、可离线操作的。

也就是说：**外壳与离线模块可用，全栈页面需要后端。** 这正是阶段 2（Local-first 迁移）
尚未完成的部分，`tsp/PHASE_2_STATUS.md` 里 `MIGRATED_PAGES = 0/22` 是准数。

## 6. 已知限制

| 限制 | 说明 |
|---|---|
| 未在真机验证 | 只做了结构、架构、版本、资源检查；需自签安装后实测 |
| 无后端 | 364 个 API 方法全部指向 `/api`，包内没有 FastAPI |
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
