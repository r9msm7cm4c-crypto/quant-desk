# OTA 应用内更新 — 实施报告

日期：2026-11-13
输入：`quant-desk-ota-integration(1).zip`（WorkBuddy OTA 交接包）
环境：Linux x86_64 / Node 22.13.1 / pnpm 10.28.2 / OpenSSL 3.0.13，**无 macOS、无 Xcode、无 iOS 设备**

---

## 一、结论摘要

| 项目 | 状态 |
|---|---|
| 源码集成（前端 + Capacitor 配置 + 发布脚本） | 完成 |
| 依赖与锁文件（Capacitor 8.6.2 / live-update 8.8.1） | 完成 |
| TypeScript 类型检查 | 通过（修复 1 处既有错误） |
| Vite 生产构建 | 通过（13.4s） |
| OTA 单元测试 | 10/10 通过 |
| 全量前端测试 | 494 通过 / 30 失败（失败项与 OTA 无关，见 §5） |
| RSA 3072 密钥生成 | 完成，私钥未离开沙箱安全目录 |
| 公钥注入原生配置 | 完成并逐字段核对 |
| PrivacyInfo.xcprivacy 合并进 Xcode 工程 | 完成（含 pbxproj 资源引用） |
| iOS 工程生成（iOS 15.0 / SPM） | 完成 |
| 签名链路端到端验证（正常 / 篡改 / 伪造） | 完成，三条均符合预期 |
| Xcode Archive / IPA | **未完成**（无 macOS） |
| 真机验证 | **未完成**（无设备） |
| stable 通道启用 | **未启用**（按交接要求，真机验证前保持 `enabled=false`） |

---

## 二、本次实际改动

### 2.1 工程合并

上传包整体合并进主工程，保留原有的 `ios/`（ObjC 离线壳）目录不动。合并前已做完整备份（`pre-ota-backup.tar.gz`，51 MB）。

### 2.2 依赖与锁文件

- `frontend/`：`pnpm install --no-frozen-lockfile`，新增 `@capacitor/core@8.6.2`、`@capawesome/capacitor-live-update@8.8.1`，`pnpm-lock.yaml` 已更新。
- `mobile/`：`npm install`，生成 `package-lock.json`；补 `typescript@5.5.4`（TS 7 移除了 Capacitor CLI 依赖的编译器 API，用 7 会直接启动失败）。

### 2.3 代码修复

| 文件 | 改动 | 原因 |
|---|---|---|
| `native-core/src/analytics/risk.ts` | 删除未使用的 `average` 局部变量 | `tsc -b` 报 TS6133，阻断构建 |
| `frontend/package.json` | 新增 `"test": "vitest run"` | 交接要求 `pnpm test`，但原脚本只有 `test:indices` |
| `frontend/src/lib/otaUpdate.ts` | `validateManifest` 导出；`bundleId` 增加 `public` 保留值拦截 | 插件文档明确 `public` 为保留 ID，原校验会放行，下载时才失败 |
| `frontend/src/lib/otaUpdate.test.ts` | 从 2 条扩展到 10 条 | 原测试只覆盖版本比较，未覆盖清单校验 |

### 2.4 iOS 原生

- 生成 `mobile/ios/`（Capacitor 8 模板，`IPHONEOS_DEPLOYMENT_TARGET = 15.0`，SPM 依赖 `capacitor-swift-pm 8.6.2` + 本地 path 插件）。
- 新建 `ios/App/App/PrivacyInfo.xcprivacy`，含 `NSPrivacyTracking=false`、空的 TrackingDomains / CollectedDataTypes，以及 `NSPrivacyAccessedAPICategoryUserDefaults` / `CA92.1`。
- 修改 `project.pbxproj`：新增 PBXFileReference、PBXBuildFile，挂入 App group 与 Resources 阶段——只放文件不加引用的话，打包时不会进 bundle。
- `MARKETING_VERSION` 由 `1.0` 改为 `0.1.0`，与 `VITE_OTA_BUNDLED_VERSION` 及 `minAppVersion` 对齐。

### 2.5 发布工具

`scripts/publish-ota.sh` 重写，新增四道闸门：

1. 私钥必须是 RSA 且 ≥ 3072 位，2048 位直接拒绝。
2. `stable` 通道必须显式 `OTA_ALLOW_STABLE=1`，否则拒绝（实测输出：「发布到 stable 需要显式设置 OTA_ALLOW_STABLE=1」）。
3. 发布前用公钥自检 SHA-256 + RSA 签名，不通过则不创建 Release、不改写清单。
4. 支持 `OTA_CHANNEL=beta|stable`，分别写 `ota/beta.json` / `ota/stable.json`；beta 的 Release 标记为 prerelease。

新增 `scripts/verify-ota-bundle.mjs`：离线校验任意 ZIP + manifest 组合，算法与插件 iOS 端 `verifySignatureForFile` 对齐（先对文件流式 SHA-256，再用 RSA PKCS#1 v1.5 验签）。

---

## 三、验证记录

### 3.1 构建

```
npx tsc -b          → 无输出（通过）
npx vite build      → ✓ built in 13.44s
```

### 3.2 测试

```
npx vitest run src/lib/otaUpdate.test.ts
  → 10 passed (10)

npx vitest run
  → Test Files  5 failed | 70 passed (75)
    Tests      30 failed | 494 passed (524)
```

### 3.3 签名链路

用真实 `frontend/dist` 打出 3.2 MB ZIP，私钥签名，生成测试 manifest：

| 场景 | 结果 |
|---|---|
| 正常包 | `OK sha256 …` + `OK signature RSA-SHA256 验签通过` → PASS |
| 翻转 ZIP 中间 1 字节 | `FAIL SHA-256 不匹配` → 退出码 1 |
| 保留原包、替换签名 | `FAIL 数字签名验证失败` → 退出码 1 |
| ZIP 内 `index.html` 位于根目录 | 确认，无多余 `dist/` 层 |

### 3.4 原生配置核对

设置 `OTA_PUBLIC_KEY` 后 `npx cap sync ios`，`ios/App/App/capacitor.config.json` 实际值：

```
defaultChannel = stable
autoUpdateStrategy = none
autoBlockRolledBackBundles = True
autoDeleteBundles = True
readyTimeout = 20000
httpTimeout = 60000
publicKey 长度 = 624，含 BEGIN PUBLIC KEY
```

公钥未出现在 `frontend/dist` 任何文件中（`grep -rl 'BEGIN PUBLIC KEY' dist/` 计数为 0）。

---

## 四、密钥

- 算法：RSA 3072，PKCS#8 私钥 / SPKI 公钥。
- 公钥已固化：`tsp/ota/ota-public.pem`、`tsp/mobile/ota-public.pem`。
- **私钥存放于沙箱安全目录，未写入 `/workspace`，未进入 ZIP、未进 Git、未出现在任何日志或报告**。
- 若需要长期使用，请在本机重新生成并保管私钥；公钥一旦随 IPA 发布就无法更换（换钥必须重发 IPA）。
- 关于插件把 `kSecAttrKeySizeInBits` 写死为 2048：已查证 Apple 官方说明，`SecKeyCreateWithData` 会从密钥数据自行推断长度，该属性可忽略，因此 3072 位公钥不受影响。

---

## 五、未完成项与原因

| 项 | 原因 |
|---|---|
| Xcode Archive / IPA 导出 | 无 macOS 与 Xcode。Capacitor 工程依赖 Swift 运行时与 SPM 拉取 `capacitor-swift-pm`，Linux 交叉编译不可行（与之前 ObjC 离线壳不同，那个只用 UIKit/WebKit 系统框架） |
| 真机全场景验证 | 无 iOS 设备 |
| 首次 Release 推送 | 环境无 GitHub 写权限（此前 fine-grained token 缺 Contents 写权限） |
| stable 启用 | 按交接要求，真机验证前保持 `enabled=false` |
| 30 个失败测试 | 全部集中在 `MiniIntraday.*` / `MiniChart.*` 的 SVG 断言（期望 ≥1 个元素，实际 0），属既有 jsdom 渲染问题，与本次 OTA 改动无交集；OTA 相关测试全绿 |
| FastAPI 后端本地化 | 不在本次范围。OTA 只能更新 Web 资源，不能把 Python 后端变成手机本地代码 |

---

## 六、真机验证清单（需要在 Mac + iPhone 上完成）

前置：`OTA_PUBLIC_KEY` 与 `VITE_OTA_PUBLIC_KEY_CONFIGURED=true` 同环境构建，`npx cap sync ios`，Xcode Archive，导出 IPA，安装。

1. 设置 → 关于 → 应用内内容更新，点检查：`stable.json` 为 `enabled=false` → 应显示「暂时没有发布新内容」。
2. 把 `VITE_OTA_MANIFEST_URL` 指向 beta 清单，发布 beta 包 → 应显示「发现内容更新 v…」。
3. 断网后点检查 → 应在 12 秒内超时并给出可读错误，不崩溃。
4. 清单返回 404 → 应提示请求失败，不进入下载。
5. 清空原生配置里的公钥后构建 → 应显示「尚未配置 OTA 公钥」，且拒绝下载。
6. 正常下载 → 进度条推进 → 提示已暂存 → 冷启动后版本号变化。
7. 用一个故意损坏的包（改 `sha256`）→ 下载后校验失败，不切换。
8. 用一个签名不匹配的包 → 验签失败，不切换。
9. 让新 bundle 启动时报错 → 超过 `readyTimeout`（20s）后应自动回滚到内置 bundle，并被屏蔽（`autoBlockRolledBackBundles`）。
10. 回滚后检查自选、设置、回测记录是否保留（IndexedDB / localStorage 不随 bundle 切换清空）。
11. 发布 0.1.2 后，再手动把 manifest 改回 0.1.1 → 应被防回退逻辑拦住（`compareVersions <= 0` → latest）。

---

## 七、遗留风险

1. **未在真机验证**。App 端所有结论都来自静态核对与算法等价性推导，没有一次真实启动。
2. **`dist` 当前是「已配置」构建**（`VITE_OTA_PUBLIC_KEY_CONFIGURED=true`）。若要回到安全默认，重跑一次不带该变量的 `vite build`；`dist` 已被 gitignore，不会误提交。
3. **`cap sync` 会重写 `capacitor.config.json`**。忘记带 `OTA_PUBLIC_KEY` 就会把公钥清空，App 随即拒绝一切更新。建议把这条写进 CI 或 Makefile，而不是靠记忆。
4. **OTA 的边界**。任何新增原生插件、Swift 代码、权限、entitlements 都必须重发 IPA。若将来上架 App Store，需按 Guideline 2.5.2 复核 OTA 的合规边界。
