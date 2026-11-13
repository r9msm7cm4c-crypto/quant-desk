# WorkBuddy 执行任务：Quant Desk OTA 应用内内容更新

## 目标

在当前 Quant Desk Capacitor 8 工程中完成并验证「设置 → 关于 → 应用内内容更新」。使用 Capawesome `@capawesome/capacitor-live-update` 8.x 的 self-hosted bundle 模式，GitHub Releases 承载版本化 ZIP，仓库 `ota/stable.json` 承载静态清单。不部署 FastAPI，不要求自建服务器。

## 已落入源码的内容

- `frontend/src/lib/otaUpdate.ts`：manifest 校验、版本比较、防回退、签名/哈希下载、bundle 暂存。
- `frontend/src/components/SettingsOtaUpdatePanel.tsx`：检查按钮、下载按钮、进度和状态提示。
- `frontend/src/pages/settings/About.tsx`：已嵌入设置页。
- `frontend/src/main.tsx`：React 首帧提交后调用 `LiveUpdate.ready()`。
- `mobile/capacitor.config.ts`：stable 通道、签名公钥、rollback、ready timeout。
- `mobile/PrivacyInfo.xcprivacy.template`：插件所需 UserDefaults privacy manifest 声明。
- `ota/stable.json`：初始 `enabled=false` 的安全占位清单。
- `scripts/publish-ota.sh`：构建、签名并发布版本化 GitHub Release ZIP，生成新清单。
- `OTA_UPDATE_GUIDE.md`：密钥初始化、发布和限制说明。

## 必须执行

1. 检查 `frontend/package.json` 和 `mobile/package.json` 的 `@capacitor/core`、`@capawesome/capacitor-live-update` 均为 Capacitor 8 兼容的 8.x。
2. 在 `frontend/` 使用项目锁文件对应的 pnpm 执行 `pnpm install --no-frozen-lockfile`，重新生成并提交 `pnpm-lock.yaml`。在 `mobile/` 执行 `npm install`，生成并提交 `package-lock.json`（如果项目统一使用 pnpm，则按现有 monorepo 规范统一，不要混用锁文件）。
3. 在安全构建环境生成 RSA 3072 key pair。私钥只保存在安全位置 / CI Secret；绝不写入 ZIP、Git、日志、IPA 或任何用户交付文件。将 PEM 公钥通过 `OTA_PUBLIC_KEY` 环境变量注入 Capacitor config。
4. 同一构建环境设置 `VITE_OTA_PUBLIC_KEY_CONFIGURED=true`、`VITE_OTA_BUNDLED_VERSION=0.1.0`、`VITE_OTA_MANIFEST_URL=https://raw.githubusercontent.com/r9msm7cm4c-crypto/quant-desk/main/ota/stable.json`。没有正确注入公钥时必须保持 `VITE_OTA_PUBLIC_KEY_CONFIGURED=false`，App 必须拒绝下载更新。
5. 构建 iOS 前执行 `npx cap sync ios`。把 `mobile/PrivacyInfo.xcprivacy.template` 合并到 `ios/App/App/PrivacyInfo.xcprivacy`；如果该文件已存在，合并 `NSPrivacyAccessedAPICategoryUserDefaults` / `CA92.1`，不要覆盖其他声明。
6. 确认 `mobile/capacitor.config.ts` 最终生成的原生配置中含有 PEM 公钥、`readyTimeout=20000`、`autoBlockRolledBackBundles=true`、`autoDeleteBundles=true`、`autoUpdateStrategy=none`。
7. 检查更新页面只在 iOS/Android 原生 App 显示可用状态；Web 端显示不支持。确认用户主动点击检查、下载；不能静默自动切换。
8. 运行 `pnpm --dir frontend test --run`（或仓库实际 Vitest 命令）、`pnpm --dir frontend build`、`bash -n scripts/publish-ota.sh`。修复所有由本次变更引起的 TypeScript / lint / build 错误。
9. 用测试 RSA key 在临时环境构建一个测试 ZIP，计算 SHA-256 并签名，确认 `downloadBundle` 对有效包接受、错误 hash / 错误 signature 拒绝。不要发布测试包到 stable 通道。
10. 在真机上测试：manifest 404、断网、无公钥、错误签名、正确下载、切换后启动、坏包 rollback、数据/IndexedDB 保留、旧版本不会覆盖新版本。
11. 不要宣称 IPA 已完成，除非 Xcode Archive / IPA 导出和实际安装测试成功。

## Apple 平台限制

OTA 只能交付与当前原生二进制兼容的 Web 资源。任何新增原生插件、Swift 代码、权限、entitlements 或原生桥接必须重新构建 IPA。若未来通过 App Store / TestFlight 分发，必须遵守 Apple Review Guideline 2.5.2，不得利用 OTA 绕过审核或在审核后下载会引入/改变 App 功能的代码；上架方案需另行核对 Apple 当前政策。

## 交付

- 修改后的完整源码 ZIP。
- 更新后的 lockfiles。
- 密钥配置说明（不包含私钥）。
- OTA manifest / Release 发布步骤。
- 构建、测试和真机测试报告。
- 如果 Xcode 构建环境可用，提供已验证 IPA；否则明确标记待 Mac/Xcode 构建。
