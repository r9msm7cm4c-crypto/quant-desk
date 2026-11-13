# Quant Desk iOS 外壳（未签名 IPA）

把离线版 PWA 包成一个原生 iOS App：Swift 层不存在，全部是 ObjC + `WKWebView`，**零网络依赖**，不连后端、不读远程行情，打开即用本地已缓存的数据。

产物：`dist/QuantDesk-1.0.0-unsigned.ipa`（约 500 KB）

---

## 1. 这个包能做什么、不能做什么

| 能力 | 状态 |
|---|---|
| 离线量化工作台（回测、因子、组合、执行成本） | ✅ 内嵌完整 PWA，与网页版同一份 `index.html` |
| 自选、设置、回测记录持久化 | ✅ 走 `localStorage`，不可用时自动降级到 `NSUserDefaults` 桥 |
| 实时行情 / 因子扫描 / AI 助手 | ❌ 这些依赖 FastAPI 后端，App 内没有后端，也不该有 |
| 竖屏使用 | ❌ 锁定横屏（PWA 的 `manifest` 与版式本身就是横屏终端） |

> 一句话：这是「量化工作台离线版」的 iOS 壳，不是把整套 React 前端 + Python 后端塞进手机。

---

## 2. 包结构

```
Payload/QuantDesk.app/
├── QuantDesk              # arm64 Mach-O，platform=iOS, minos=15.0
├── Info.plist             # com.quantdesk.terminal / 1.0.0 (1)
├── AppIcon60x60@2x.png    # 120
├── AppIcon60x60@3x.png    # 180
├── AppIcon76x76@2x~ipad.png
├── AppIcon83.5x83.5@2x~ipad.png
└── web/
    ├── index.html         # 离线 PWA 单文件
    ├── manifest.webmanifest
    └── icons/*.png
```

签名状态：`ldid -S` ad-hoc（`cryptid=0`），**必须由你重签后才能安装**。

---

## 3. 安装（三条路，选一条）

### A. Sideloadly（最省事，Windows / macOS）

1. 下载 [Sideloadly](https://sideloadly.io/)，装好 iTunes / Apple Devices 驱动。
2. iPhone 用数据线连电脑，信任此电脑。
3. 把 `QuantDesk-1.0.0-unsigned.ipa` 拖进 Sideloadly。
4. `Apple account` 填你的 Apple ID（免费账号即可），点 Start。
5. 手机上：设置 → 通用 → VPN与设备管理 → 信任该开发者证书。
6. **免费账号 7 天过期**，过期后重跑一次 Sideloadly 覆盖安装。

### B. AltStore / SideStore（免数据线，需自签 AltServer）

适合长期自用：装一次 AltServer，之后同一个 Wi-Fi 下自动续签。

### C. 手动 codesign（有 Mac + 开发者证书）

```bash
unzip QuantDesk-1.0.0-unsigned.ipa
codesign -f -s "Apple Development: Your Name (TEAMID)" \
         --entitlements entitlements.plist \
         Payload/QuantDesk.app
zip -qry QuantDesk-signed.ipa Payload
```

`entitlements.plist` 至少需要：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>application-identifier</key>
  <string>TEAMID.com.quantdesk.terminal</string>
  <key>com.apple.developer.team-identifier</key>
  <string>TEAMID</string>
  <key>get-task-allow</key>
  <true/>
</dict>
</plist>
```

> TrollStore 用户可以直接装未签名 IPA，它用 ldid 做永久签名，不过期。

---

## 4. 重新构建

```bash
cd quant-desk/ios
./build_ipa.sh                      # 默认 1.0.0 (1)
VERSION=1.0.1 BUILD_NUM=2 ./build_ipa.sh
SDK_VERSION=15.6 MIN_IOS=14.0 ./build_ipa.sh   # 兼容更老系统
```

脚本会：下载 `theos/sdks` 的 iPhoneOS SDK（走 `ghfast.top` 镜像，可 `MIRROR=` 覆盖）→ 取 `ldid` → 组装 bundle → `clang -target arm64-apple-ios<ver>` 交叉编译 → ad-hoc 签名 → `zip` 出 IPA。

缓存落在 `ios/.cache/`，产物落 `ios/dist/`。

依赖：`clang`、`lld`（提供 `ld64.lld`）、`zip`、`python3` + `Pillow`。

---

## 5. 改了 PWA 之后

`build_ipa.sh` 每次都从仓库根的 `index.html` / `manifest.webmanifest` / `icons/` 重新拷贝，**不需要手动同步**。改完网页版直接重跑脚本即可。

注意两点：

- PWA 的 Service Worker 只在 `https:` 下注册，App 内是 `file://`，会自动跳过，不影响功能。
- 页面若新增了 `fetch('./data.json')` 这类请求，在 `file://` 下会失败。这个 App 的定位是纯本地计算，新增网络请求前要先想清楚。

---

## 6. 已知限制与风险

1. **未在真机验证**。构建环境是 Linux 交叉编译，只能保证：Mach-O 架构为 arm64、`LC_BUILD_VERSION` 为 iOS 15.0、依赖仅系统框架、bundle 结构与 `Info.plist` 合法。实际启动行为需要你装上去才知道。
2. **图标走的是 `CFBundleIconFiles` 旧机制**，没有 `Assets.car`（Linux 上没有 `actool`）。绝大多数系统能正常显示；个别 iOS 版本可能显示为默认图标。
3. **没有 `LaunchScreen.storyboard`**，用的是 `UILaunchScreen` 空字典，启动瞬间可能闪一下系统底色。
4. **横屏锁定**：`UIRequiresFullScreen=true` + 仅 Landscape。若你希望竖屏可用，改 `Info.plist` 的 `UISupportedInterfaceOrientations`，但 PWA 的 `ls-rotated` 旋转逻辑只在首帧计算，竖屏下版式可能错位。
5. **localStorage 兜底桥有性能上限**：一旦走到 `prompt` 桥，每次读写都是一次原生同步调用。单页只有 3 处存储调用，够用；如果以后大量遍历 `localStorage`，要换 `WKScriptMessageHandler` 异步方案。
