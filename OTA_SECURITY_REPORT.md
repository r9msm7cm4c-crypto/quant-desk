# OTA_SECURITY_REPORT

> 阶段 1 — OTA 系统修复与安全审计
> 基线提交：`907561d`　修复提交：见仓库 `阶段1` 提交
> 日期：2026-11-13

---

## 1. 威胁模型

OTA 的本质是「让远端内容进入已安装的 App 并执行」。因此需要防的是：

| 威胁 | 攻击路径 | 现有防线 |
|---|---|---|
| T1 伪造更新源 | 篡改 Manifest 指向攻击者服务器 | HTTPS + 域名白名单 |
| T2 篡改包体 | 中间人替换 ZIP | SHA-256 校验 |
| T3 伪造签名 | 自签一个包冒充官方 | RSA-3072 验签（公钥内置原生层） |
| T4 版本降级 | 重放旧 Manifest | 版本单调性 + bundleId 去重 |
| T5 跨应用投毒 | 用别的 App 的包更新本 App | appId 强校验 |
| T6 原生不兼容 | 新包依赖新原生能力 | runtimeVersion 契约 |
| T7 系统降级 | 新包要求更高版本 App | minAppVersion 校验 |
| T8 路径注入 | bundleId 含 `../` | bundleId 正则 + 保留值拦截 |

---

## 2. 校验链路（实际代码路径）

```
checkOtaUpdate()
  ├─ Capacitor.isNativePlatform()        非原生直接 unsupported
  ├─ 原生公钥已配置？                     否 → unconfigured，不发起任何下载
  ├─ fetch manifest（12s 超时，no-store）
  └─ validateManifest()
       ├─ schemaVersion === 1
       ├─ enabled 必须为布尔
       ├─ appId === com.quantdesk.mobile
       ├─ channel ∈ {stable, beta}
       ├─ runtimeVersion 非空
       ├─ version 可解析（SemVer）
       ├─ bundleId 正则 + 拒绝保留值 public
       ├─ minAppVersion 可解析
       ├─ bundleUrl：https + 主机白名单
       ├─ sha256：64 位十六进制
       ├─ signature：Base64 格式
       ├─ publishedAt 可解析
       └─ releaseNotes ≤ 4000 字符
  ├─ enabled === false                    → disabled
  ├─ runtimeVersion === 常量              否则 incompatible
  ├─ 当前 App 版本 ≥ minAppVersion        否则 incompatible
  └─ manifest.version > 当前内容版本       否则 latest（防重放/降级）

stageOtaUpdate()
  ├─ validateManifest() 再校验一次        防调用方绕过 check
  ├─ 公钥已配置
  ├─ runtimeVersion 匹配
  └─ 当前 App 版本 ≥ minAppVersion
  → LiveUpdate.downloadBundle({ url, bundleId, checksum, signature })
  → LiveUpdate.setNextBundle()
```

**关键点：SHA-256 与签名不是前端算的**，是 `@capawesome/capacitor-live-update` 在 Swift 层用 `Security.framework` 验的。前端只负责把 `checksum` / `signature` 传下去。即使前端被绕过，包体仍会被原生层拒绝。

---

## 3. 本次修复（阶段 1）

| # | 问题 | 修复 | 验证方式 |
|---|---|---|---|
| 1 | Manifest 默认地址为 `.../main/ota/stable.json`，实际文件在 `tsp/ota/`，请求返回 **404** | 改为 `.../main/tsp/ota/stable.json` | 单测断言 + 实际 HTTP 请求 |
| 2 | `.env.ota.example` 与两份文档同样含错误路径 | 同步修正 | `grep` 全仓库无残留 |
| 3 | `parseVersion` 用 `[-+].*` 丢弃预发布标识 → `0.1.1-beta.1` 与 `0.1.1` 判为相等 | 重写为 SemVer 2.0.0 §11 规则 | 新增 5 条排序测试 |
| 4 | `stageOtaUpdate` 信任传入对象，绕过 check 即可下载 | 下载前重新 `validateManifest` + 补 minAppVersion 校验 | 代码审查 + 类型检查 |
| 5 | `stable.json` `enabled=true`，但真机从未验证 | 回滚为 `false` | 读取清单确认 |

### SemVer 实现要点

```
1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta
         < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0
```

- 有预发布标识 < 同号正式版
- 数字标识符按数值比较（`beta.2 < beta.10`）
- 数字标识符 < 字母标识符
- 主版本更高的预发布仍高于低版本正式版（`0.1.2-alpha.1 > 0.1.1`）

---

## 4. 密钥管理

| 项 | 状态 |
|---|---|
| 算法 | RSA 3072（PKCS#8 私钥 / SPKI 公钥） |
| 私钥位置 | 仅构建机安全目录，**不在仓库、不在 ZIP、不在本报告** |
| 公钥入库 | `tsp/ota/ota-public.pem`、`tsp/mobile/ota-public.pem` |
| 配对验证 | 从私钥导出公钥，与两份仓库公钥 `cmp` **字节一致** |
| 公钥指纹 | SHA-256 `c023f60108512a49e4700b9a5db4c8b4b3e157335684457554168672b38de2bc` |
| 发布脚本闸门 | 私钥 < 3072 位拒绝；stable 需 `OTA_ALLOW_STABLE=1`；发前自检 |

**任务书规则 5 核对**：私钥未进 Git、未进 ZIP、未写入普通配置、未输出到聊天。已遵守。

> 说明：为了让读者能验证配对关系，本报告给出了**公钥**指纹。公钥本身不构成秘密。

---

## 5. 已验证 / 未验证

### 已验证（实际执行）

| 项 | 结果 |
|---|---|
| OTA 单元测试 | **17 / 17 通过**（原 10 + 新增 7） |
| TypeScript 类型检查 | 通过 |
| 双公钥与私钥配对 | 字节一致 |
| Manifest 真实可达性 | `HTTP 200`（见第 6 节） |
| 发布包 sha256 == 清单声明 | 一致 |
| 发布包 RSA 验签（仓库公钥） | 通过 |
| 从 Release 下载 → 验签 | 通过，与本地包字节一致 |
| 篡改包体 | 拒绝（SHA-256 不匹配） |
| 伪造签名 | 拒绝 |
| 错误 bundleUrl 主机 | 拒绝（单测覆盖） |
| 错误 appId | 拒绝（单测覆盖） |

### 未验证（NOT RUN，不得视为通过）

| 项 | 原因 |
|---|---|
| 真机下载 / 切换 / 回滚 | 无 iOS 设备，且 Capacitor 工程未编译 |
| 原生层验签（Swift 侧） | 同上 |
| 断网中断恢复 | 同上 |
| stable 与 beta 通道隔离（运行时） | 同上 |
| 更新失败后自动回滚 | 同上 |

---

## 6. Manifest 可达性实测

```
GET https://raw.githubusercontent.com/r9msm7cm4c-crypto/quant-desk/main/tsp/ota/stable.json
→ 200，含 enabled / version / bundleUrl / sha256 / signature
```

修复前同一请求（去掉 `tsp/`）返回 **404**。这是本次修复的直接证据。

---

## 7. 残余风险

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 私钥仅存于构建机，无托管备份 | 丢失后无法发布兼容更新，只能换密钥并重发 IPA | 建议纳入密钥托管，并离线备份 |
| R2 | 清单托管在 GitHub raw | 仓库写权限被盗即可发恶意清单 | 已有签名兜底：无正确签名仍会被拒 |
| R3 | `autoUpdateStrategy: 'none'` | 用户不点检查就永远不更新 | 产品选择，非缺陷 |
| R4 | 无更新日志持久化 | 用户看不到历史更新记录 | 阶段 6 待补 |
| R5 | 前端未做 manifest 缓存 | 每次检查都拉网络 | 可接受 |

---

## 8. Stable 启用前置条件（对照任务书）

| # | 条件 | 当前 |
|---|---|---|
| 1 | GitHub Release 存在 | ✅ `ota-v0.1.1` |
| 2 | OTA ZIP 真实存在 | ✅ 3,251,220 B |
| 3 | 下载地址有效 | ✅ 可下载并验签 |
| 4 | SHA-256 校验通过 | ✅ |
| 5 | RSA 签名验证通过 | ✅ |
| 6 | App ID / 版本 / channel 匹配 | ✅ |
| 7 | **真机更新测试通过** | ❌ **NOT RUN** |

**结论：7 项中 6 项满足，第 7 项因无设备无法完成。因此 `enabled` 保持 `false`。**

这不是保守，是任务书明确规定的门槛：未过真机验证就开启 stable，等于把未测试的更新推给所有用户。

---

## 9. 阶段 1 结论

- OTA 链路在**代码层面**已闭环并通过 17 项测试。
- 两个 P0 缺陷（URL 404、enabled 误开）已修复。
- SemVer 预发布语义已按规范实现。
- **发布能力具备，启用能力暂缓**，等真机验证。
- 阶段 6（发布流程验证）中的真机部分标记 `BLOCKED`。
