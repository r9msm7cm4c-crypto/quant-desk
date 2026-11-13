#!/usr/bin/env bash
#
# publish-ota.sh — 构建、签名并发布一个 Quant Desk 应用内更新包
#
# 用法：
#   OTA_PRIVATE_KEY=/secure/ota-private.pem ./scripts/publish-ota.sh 0.1.1
#   OTA_CHANNEL=beta OTA_PRIVATE_KEY=... ./scripts/publish-ota.sh 0.1.2-beta.1
#   OTA_CHANNEL=stable OTA_ALLOW_STABLE=1 OTA_PRIVATE_KEY=... ./scripts/publish-ota.sh 0.1.1
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${OTA_DIST_DIR:-$ROOT_DIR/frontend/dist}"
VERSION="${1:-}"
CHANNEL="${OTA_CHANNEL:-stable}"
MIN_APP_VERSION="${OTA_MIN_APP_VERSION:-0.1.0}"
REPO="${OTA_GITHUB_REPO:-r9msm7cm4c-crypto/quant-desk}"
PRIVATE_KEY="${OTA_PRIVATE_KEY:-}"
NOTES="${OTA_RELEASE_NOTES:-Quant Desk 内容更新与问题修复。}"

die() { echo "$*" >&2; exit 2; }

[[ -n "$VERSION" ]] || die "Usage: OTA_PRIVATE_KEY=/secure/path/ota-private.pem $0 <version>"
[[ "$CHANNEL" == "stable" || "$CHANNEL" == "beta" ]] || die "OTA_CHANNEL 只能是 stable 或 beta（当前：$CHANNEL）"
[[ -n "$PRIVATE_KEY" && -f "$PRIVATE_KEY" ]] || die "OTA_PRIVATE_KEY 必须指向离线保存的 RSA 私钥"
[[ -f "$DIST_DIR/index.html" ]] || die "找不到构建产物 $DIST_DIR/index.html，请先执行生产构建"

for cmd in openssl zip gh node python3; do
  command -v "$cmd" >/dev/null 2>&1 || die "缺少命令：$cmd"
done
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  die "缺少 SHA-256 工具（sha256sum 或 shasum）"
fi

# 私钥必须是不小于 3072 位的 RSA，且不得是公钥文件
KEY_LINE="$(openssl rsa -in "$PRIVATE_KEY" -text -noout 2>/dev/null | head -1 || true)"
[[ "$KEY_LINE" == *"Private-Key"* ]] || die "OTA_PRIVATE_KEY 不是有效的 RSA 私钥"
KEY_BITS="$(echo "$KEY_LINE" | grep -oE '[0-9]+ bit' | grep -oE '[0-9]+' || echo 0)"
[[ "${KEY_BITS:-0}" -ge 3072 ]] || die "私钥只有 ${KEY_BITS} 位，要求至少 3072 位"

if [[ "$CHANNEL" == "stable" && "${OTA_ALLOW_STABLE:-0}" != "1" ]]; then
  die "发布到 stable 需要显式设置 OTA_ALLOW_STABLE=1。请先发布 beta 并在真机验证，再切换 stable。"
fi

ARTIFACT_DIR="$ROOT_DIR/artifacts/ota"
mkdir -p "$ARTIFACT_DIR"
BUNDLE_NAME="quant-desk-ota-${VERSION}.zip"
BUNDLE_PATH="$ARTIFACT_DIR/$BUNDLE_NAME"
SIGNATURE_PATH="$ARTIFACT_DIR/$BUNDLE_NAME.sig"
TAG="ota-v${VERSION}"
BUNDLE_ID="qd-web-${VERSION}"
MANIFEST_PATH="$ROOT_DIR/ota/${CHANNEL}.json"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

rm -f "$BUNDLE_PATH" "$SIGNATURE_PATH"
( cd "$DIST_DIR" && zip -qr "$BUNDLE_PATH" . )

if command -v sha256sum >/dev/null 2>&1; then
  SHA256="$(sha256sum "$BUNDLE_PATH" | awk '{print $1}')"
else
  SHA256="$(shasum -a 256 "$BUNDLE_PATH" | awk '{print $1}')"
fi
openssl dgst -sha256 -sign "$PRIVATE_KEY" -out "$SIGNATURE_PATH" "$BUNDLE_PATH"
SIGNATURE="$(base64 < "$SIGNATURE_PATH" | tr -d '\n')"

BUNDLE_URL="https://github.com/${REPO}/releases/download/${TAG}/${BUNDLE_NAME}"
PUBLISHED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 先用公钥自检：发出的包必须能被安装端验证通过，否则不发布
openssl rsa -in "$PRIVATE_KEY" -pubout -out "$TMP_DIR/public.pem" 2>/dev/null
python3 - "$TMP_DIR/manifest.json" "$VERSION" "$MIN_APP_VERSION" "$BUNDLE_ID" "$BUNDLE_URL" \
  "$SHA256" "$SIGNATURE" "$PUBLISHED_AT" "$NOTES" "$CHANNEL" <<'PY'
import json, pathlib, sys
path, version, min_app, bundle_id, url, sha256, signature, published_at, notes, channel = sys.argv[1:]
manifest = {
  "schemaVersion": 1,
  "enabled": True,
  "appId": "com.quantdesk.mobile",
  "channel": channel,
  "runtimeVersion": "qd-cap8-v1",
  "version": version,
  "bundleId": bundle_id,
  "minAppVersion": min_app,
  "bundleUrl": url,
  "sha256": sha256,
  "signature": signature,
  "publishedAt": published_at,
  "releaseNotes": notes[:4000],
}
pathlib.Path(path).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

echo "--- 发布前自检 ---"
node "$ROOT_DIR/scripts/verify-ota-bundle.mjs" \
  --bundle "$BUNDLE_PATH" \
  --manifest "$TMP_DIR/manifest.json" \
  --public-key "$TMP_DIR/public.pem" || die "自检未通过，已中止发布（未创建 Release、未改动清单）"

# 不可变版本资产：不覆盖已有 tag
GH_ARGS=(release create "$TAG" "$BUNDLE_PATH" --repo "$REPO"
  --title "Quant Desk OTA ${VERSION} (${CHANNEL})" --notes "$NOTES")
if [[ "$CHANNEL" == "beta" ]]; then
  GH_ARGS+=(--prerelease)
fi
gh "${GH_ARGS[@]}" || die "Release 创建失败（tag 可能已存在，OTA 包不可覆盖）"

cp "$TMP_DIR/manifest.json" "$MANIFEST_PATH"

echo
echo "OTA bundle published: $BUNDLE_URL"
echo "Manifest written:     $MANIFEST_PATH"
echo "Next: commit and push ota/${CHANNEL}.json so installed apps can discover it."
echo "Never commit: $PRIVATE_KEY or $SIGNATURE_PATH"
