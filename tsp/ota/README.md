# Quant Desk OTA 更新通道

本目录保存公开的 OTA 更新清单。更新包本身放在 GitHub Releases，不需要运行自己的后端服务器。

- `stable.json`：App 在“设置 → 关于 → 应用内内容更新”读取的稳定通道清单。
- 更新 ZIP：由 `scripts/publish-ota.sh` 构建并上传到 GitHub Release。
- `runtimeVersion`：必须与 App 内 `OTA_RUNTIME_VERSION` 一致；涉及 Capacitor 原生插件、权限、Keychain、文件系统桥接或 iOS 原生代码的变更必须提升原生版本并重新构建 IPA。

`stable.json` 初始 `enabled=false`，这不是可安装更新。完成密钥配置并发布真实签名包后，脚本会生成新的清单。

不要把 OTA 私钥、证书或签名原始文件提交到 Git 仓库。仓库中只能包含公开公钥（实际构建时通过 `OTA_PUBLIC_KEY` 环境变量注入）和已签名的公开更新产物。
