#!/usr/bin/env bash
#
# build_ipa.sh — 在 Linux 上交叉编译 Quant Desk 的 iOS 未签名 IPA
#
# 依赖：clang(含 ld64.lld)、curl、python3+Pillow、zip、tar
# 产物：dist/QuantDesk-<version>-unsigned.ipa
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"

SDK_VERSION="${SDK_VERSION:-16.5}"
MIN_IOS="${MIN_IOS:-15.0}"
VERSION="${VERSION:-1.0.0}"
BUILD_NUM="${BUILD_NUM:-1}"
BUNDLE_ID="${BUNDLE_ID:-com.quantdesk.terminal}"
APP_NAME="QuantDesk"

CACHE="$ROOT/.cache"
BUILD="$ROOT/.build"
DIST="$ROOT/dist"

MIRROR="${MIRROR:-https://ghfast.top}"

say() { printf '\033[36m[ios]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 0. 工具检查 ----------
command -v clang >/dev/null || die "缺少 clang"
command -v zip   >/dev/null || die "缺少 zip"
command -v python3 >/dev/null || die "缺少 python3"

CLANG_VER="$(clang --version | head -1)"
say "编译器: $CLANG_VER"

LD64="$(command -v ld64.lld || true)"
if [ -z "$LD64" ]; then
  for c in /usr/lib/llvm-*/bin/ld64.lld; do [ -x "$c" ] && LD64="$c" && break; done
fi
[ -n "$LD64" ] || die "缺少 ld64.lld（apt install lld）"
say "链接器: $LD64"

mkdir -p "$CACHE" "$BUILD" "$DIST"

# ---------- 1. SDK ----------
SDK_DIR="$CACHE/iPhoneOS${SDK_VERSION}.sdk"
if [ ! -d "$SDK_DIR" ]; then
  say "下载 iPhoneOS${SDK_VERSION}.sdk ..."
  TAR="$CACHE/sdk-${SDK_VERSION}.tar.xz"
  URL="${MIRROR}/https://github.com/theos/sdks/releases/download/master-146e41f/iPhoneOS${SDK_VERSION}.sdk.tar.xz"
  curl -fsSL --retry 3 --max-time 600 -o "$TAR" "$URL" \
    || curl -fsSL --retry 3 --max-time 600 -o "$TAR" \
       "https://github.com/theos/sdks/releases/download/master-146e41f/iPhoneOS${SDK_VERSION}.sdk.tar.xz" \
    || die "SDK 下载失败"
  tar -xf "$TAR" -C "$CACHE"
  [ -d "$SDK_DIR" ] || die "SDK 解压异常"
fi
say "SDK: $SDK_DIR"

# ---------- 2. ldid ----------
LDID="$CACHE/ldid"
if [ ! -x "$LDID" ]; then
  say "下载 ldid ..."
  curl -fsSL --retry 3 --max-time 300 -o "$LDID" \
    "${MIRROR}/https://github.com/ProcursusTeam/ldid/releases/download/v2.1.5-procursus7/ldid_linux_x86_64" \
    || curl -fsSL --retry 3 --max-time 300 -o "$LDID" \
       "https://github.com/ProcursusTeam/ldid/releases/download/v2.1.5-procursus7/ldid_linux_x86_64" \
    || die "ldid 下载失败"
  chmod +x "$LDID"
fi

# ---------- 3. 组装 bundle ----------
APP="$BUILD/Payload/$APP_NAME.app"
rm -rf "$BUILD"
mkdir -p "$APP/web"

say "拷贝离线 PWA 资源 ..."
cp "$REPO/index.html"                 "$APP/web/"
cp "$REPO/manifest.webmanifest"       "$APP/web/"
mkdir -p "$APP/web/icons"
cp "$REPO"/icons/*.png                "$APP/web/icons/"

cp "$ROOT/Info.plist" "$APP/Info.plist"
python3 - "$APP/Info.plist" "$VERSION" "$BUILD_NUM" "$BUNDLE_ID" <<'PY'
import plistlib, sys
path, ver, build, bid = sys.argv[1:5]
with open(path, 'rb') as f:
    p = plistlib.load(f)
p['CFBundleShortVersionString'] = ver
p['CFBundleVersion'] = build
p['CFBundleIdentifier'] = bid
with open(path, 'wb') as f:
    plistlib.dump(p, f)
PY

say "生成图标 ..."
python3 - "$REPO/icons/icon-1024.png" "$APP" <<'PY'
import sys
from PIL import Image
src = Image.open(sys.argv[1]).convert('RGBA')
out = sys.argv[2].rstrip('/') + '/'
for name, size in [('AppIcon60x60@2x.png',120), ('AppIcon60x60@3x.png',180),
                   ('AppIcon76x76@2x~ipad.png',152), ('AppIcon83.5x83.5@2x~ipad.png',167)]:
    src.resize((size, size), Image.LANCZOS).save(out + name, 'PNG')
PY

# ---------- 4. 编译 ----------
say "编译 $APP_NAME (arm64, iOS $MIN_IOS+) ..."
clang \
  -target "arm64-apple-ios${MIN_IOS}" \
  -isysroot "$SDK_DIR" \
  -mios-version-min="$MIN_IOS" \
  -fobjc-arc -O2 \
  -fuse-ld=lld \
  -framework UIKit -framework WebKit -framework Foundation \
  "$ROOT/QuantDesk.m" \
  -o "$APP/$APP_NAME"

file "$APP/$APP_NAME" | grep -q 'Mach-O 64-bit arm64' || die "产物不是 arm64 Mach-O"

# ---------- 5. 签名 + 打包 ----------
say "ad-hoc 签名 ..."
"$LDID" -S "$APP/$APP_NAME"

say "打包 IPA ..."
IPA="$DIST/${APP_NAME}-${VERSION}-unsigned.ipa"
rm -f "$IPA"
( cd "$BUILD" && zip -qry "$IPA" Payload )

SIZE="$(du -h "$IPA" | cut -f1)"
say "完成: $IPA ($SIZE)"
say "校验: $(unzip -l "$IPA" | tail -1 | awk '{print $2}') 个条目"
