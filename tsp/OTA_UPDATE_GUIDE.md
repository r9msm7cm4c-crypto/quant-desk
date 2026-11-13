# Quant Desk 应用内内容更新（OTA）

## 能做到什么

- 用户在 App 的「设置 → 关于 → 应用内内容更新」点“检查内容更新”。
- App 从公开 GitHub 仓库读取 `ota/stable.json`，只接受 HTTPS GitHub Release ZIP。
- 下载前后由 Capawesome Capacitor Live Update 校验 SHA-256 和 RSA 签名。
- 用户确认后下载并暂存；关闭并重新打开 App 后切换到新 bundle。
- 新 bundle 未能在 `readyTimeout` 内报告启动成功时，插件回滚到 IPA 内置 bundle，并屏蔽失败 bundle。
- 不需要 Quant Desk 自己运行服务器；GitHub 仓库 / Releases 作为静态更新分发点。首次构建、检查更新和下载更新仍需要网络。

## 不能通过 OTA 更新的内容

OTA 只适用于与当前原生二进制兼容的 Web 资源，例如 HTML、CSS、JavaScript、图表页面、文案、研究规则和可在 JS 层实现的修复。

以下变化必须重新构建并安装 IPA：新增或升级 Capacitor 原生插件、修改 Swift/Objective-C、iOS 权限或 entitlements、Keychain / 文件系统原生桥接、Info.plist / Privacy Manifest、原生运行时兼容层。

如果某项功能需要 FastAPI/Python 服务端才能运行，OTA 不能把 Python 后端凭空变成本地代码；这类功能仍需先完成本地化迁移。

## 重要的 iOS 分发规则

如果未来通过 App Store / TestFlight 分发，必须遵守 Apple 当期审核规则。Apple App Review Guideline 2.5.2 对下载会引入或改变 App 功能的代码有严格限制；不要用 OTA 绕过审核、安装原生代码或在审核后偷偷改变 App 的核心功能。上架场景下应让 OTA 只承担合规的兼容资源/内容更新，并在提交前核对 Apple 当前规则；有疑问时使用正常 IPA / App Store 更新流程。

## 一次性密钥初始化（由 WorkBuddy 在构建机执行）

1. 生成 RSA 私钥和公钥：

   ```bash
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out ota-private.pem
   openssl pkey -in ota-private.pem -pubout -out ota-public.pem
   ```

2. 将 `ota-private.pem` 保存在安全位置或 CI Secret，绝不提交 Git、绝不放进 IPA、绝不放进 ZIP 交付包。
3. 将 `ota-public.pem` 的完整 PEM 内容通过构建环境变量注入 `OTA_PUBLIC_KEY`。
4. 构建 Web bundle 时同时设置：

   ```bash
   export OTA_PUBLIC_KEY="$(cat /secure/path/ota-public.pem)"
   export VITE_OTA_PUBLIC_KEY_CONFIGURED=true
   export VITE_OTA_MANIFEST_URL="https://raw.githubusercontent.com/r9msm7cm4c-crypto/quant-desk/main/ota/stable.json"
   npm --prefix frontend run build
   ```

5. 从 `mobile/` 目录运行 `npx cap sync ios` 时，必须在同一环境中保留 `OTA_PUBLIC_KEY`，确保公钥写入原生插件配置。第一次加入 Live Update 插件后必须重新生成并安装 IPA。
6. 把 `ota-public.pem` 备份到安全位置。私钥丢失后，旧 App 无法验证使用新密钥签名的包，通常需要重新构建 IPA 来轮换公钥。

## 发布一次 Web 内容更新

先 beta，后 stable。两条通道各自的清单文件是 `ota/beta.json` 和 `ota/stable.json`，互不影响。

1. 修改前端源码，运行测试和生产构建。
2. 确认 `frontend/dist/index.html` 存在。
3. 在构建机设置 `OTA_PRIVATE_KEY`（私钥路径），可选设置 `OTA_MIN_APP_VERSION`、`OTA_GITHUB_REPO`、`OTA_RELEASE_NOTES`。
4. 先发 beta：

   ```bash
   OTA_CHANNEL=beta \
   OTA_PRIVATE_KEY=/secure/path/ota-private.pem \
   OTA_RELEASE_NOTES="修复图表显示并更新研究页面" \
   ./scripts/publish-ota.sh 0.1.1-beta.1
   ```

5. 脚本会依次：打包 ZIP → 计算 SHA-256 → 用私钥签名 → **用公钥自检**（自检不过就中止，不创建 Release、不改清单）→ 创建不可变 Release `ota-v<version>` → 写出 `ota/beta.json`。
6. 把 `ota/beta.json` 提交推送，在真机上把 `VITE_OTA_MANIFEST_URL` 指向 beta 清单验证一遍，确认下载、切换、回滚、数据保留都正常。
7. 验证通过后再发 stable，必须显式加开关：

   ```bash
   OTA_CHANNEL=stable OTA_ALLOW_STABLE=1 \
   OTA_PRIVATE_KEY=/secure/path/ota-private.pem \
   ./scripts/publish-ota.sh 0.1.1
   ```

8. 提交并推送 `ota/stable.json`。
9. 在 iPhone 的「设置 → 关于 → 应用内内容更新」检查并安装，退出后重新打开 App 验证。

脚本内置的三道闸门：私钥必须是 RSA ≥3072 位；`stable` 未加 `OTA_ALLOW_STABLE=1` 直接拒绝；发布前自检不通过不落地任何产物。

单独校验一个已生成的包：

```bash
node scripts/verify-ota-bundle.mjs \
  --bundle artifacts/ota/quant-desk-ota-0.1.1.zip \
  --manifest ota/stable.json \
  --public-key ota/ota-public.pem
```

## 版本与安全约束

- `runtimeVersion` 必须与 `frontend/src/lib/otaUpdate.ts` 中的 `OTA_RUNTIME_VERSION` 精确一致。
- `bundleId` 每次发布必须唯一，脚本使用 `qd-web-<version>`。
- Release ZIP 必须将 `index.html` 放在 ZIP 根目录，不能多包一层 `dist/` 文件夹。
- 私钥只用于发布签名；App 内只包含公钥。
- App 只允许 HTTPS GitHub Release 地址，manifest 本身不能改变下载主机白名单。
- SHA-256 用于完整性检查，RSA 签名用于确认更新包来自持有私钥的发布者。
- 保持 `autoUpdateStrategy: none`：不在后台静默下载或自动切换，用户主动检查并确认。
- 不调用即时 `reload()`，避免 IndexedDB / WebSocket 等资源锁影响重载；暂存后在下次冷启动生效。

## 当前工程状态

已完成并验证（在 Linux 构建机上）：

- 代码、UI、Capacitor 配置、发布脚本、iOS 工程（iOS 15.0 / SPM）已就位。
- RSA 3072 密钥对已生成，公钥固化在 `ota/ota-public.pem` 与 `mobile/ota-public.pem`；**私钥不在仓库内**，也不在任何交付包中。
- `OTA_PUBLIC_KEY` 注入后 `ios/App/App/capacitor.config.json` 已确认含完整 PEM 公钥，`readyTimeout=20000`、`autoBlockRolledBackBundles=true`、`autoDeleteBundles=true`、`autoUpdateStrategy=none`。
- `PrivacyInfo.xcprivacy` 已合并并加入 Xcode 工程资源阶段（`NSPrivacyAccessedAPICategoryUserDefaults` / `CA92.1`）。
- 前端 `tsc -b` 与 `vite build` 通过；OTA 单测 10 条全绿。
- 端到端签名链路已实测：正常包通过、篡改包被 SHA-256 拦截、伪造签名被 RSA 验签拦截。

尚未完成（需要 macOS + 真机）：

- `npx cap sync ios` 之后的 Xcode Archive / IPA 导出。
- 真机上的检查、下载、切换、回滚、断网、清单 404 等场景验证。
- 首次 Release 的实际推送（当前环境无 GitHub 写权限）。

`ota/stable.json` 仍是 `enabled=false` 的安全占位文件：密钥虽已生成，但在没有完成一次真机验证之前不会开启 stable 通道。开启方式就是上面的第 7、8 步。

> 注意：`ios/App/App/capacitor.config.json` 是构建产物，每次 `cap sync` 都会按当前环境变量重写。未设置 `OTA_PUBLIC_KEY` 就 sync，会把公钥清空——发布构建必须在同一 shell 里带着公钥变量执行。
