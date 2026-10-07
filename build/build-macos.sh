#!/bin/bash
set -euo pipefail

# Builds Waikiki.app and a DMG (plus a zip of the app) for macOS.
# Usage: ./build-macos.sh [--runtime osx-arm64|osx-x64] [--configuration Release] [--output ./artifacts]
#                         [--codesign-identity "Developer ID Application: ..."]
# Without --codesign-identity the bundle is ad-hoc signed, which is enough to run on the machine that
# built it. Distributing it to other Macs needs a Developer ID signature and notarization (not set up yet).

APP_NAME="Waikiki"
CONFIGURATION="Release"
RUNTIME=""
OUTPUT_DIR="./artifacts"
IDENTITY="-"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/src/Waikiki.App"
PROJECT="$APP_DIR/Waikiki.App.gsproj"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --configuration)     CONFIGURATION="$2"; shift 2 ;;
    --runtime)           RUNTIME="$2"; shift 2 ;;
    --output)            OUTPUT_DIR="$2"; shift 2 ;;
    --codesign-identity) IDENTITY="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$RUNTIME" ]]; then
  if [[ "$(uname -m)" == "arm64" ]]; then RUNTIME="osx-arm64"; else RUNTIME="osx-x64"; fi
fi

cd "$REPO_ROOT"
dotnet tool restore > /dev/null
VERSION="$(dotnet nbgv get-version -v SimpleVersion --project "$APP_DIR")"
echo "=== Waikiki macOS build: $VERSION ($RUNTIME, $CONFIGURATION) ==="

OUTPUT_DIR="$(mkdir -p "$OUTPUT_DIR" && cd "$OUTPUT_DIR" && pwd)"
PUBLISH_DIR="$OUTPUT_DIR/publish-$RUNTIME"
rm -rf "$PUBLISH_DIR"

echo "==> Publishing (self-contained)..."
dotnet publish "$PROJECT" -c "$CONFIGURATION" -r "$RUNTIME" --self-contained true \
  -p:PublishSingleFile=false -p:PublishTrimmed=false -o "$PUBLISH_DIR"

APP_BUNDLE="$OUTPUT_DIR/$APP_NAME.app"
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
cp -R "$PUBLISH_DIR/"* "$APP_BUNDLE/Contents/MacOS/"
chmod +x "$APP_BUNDLE/Contents/MacOS/Waikiki"
sed "s/__VERSION__/$VERSION/g" "$APP_DIR/Info.plist" > "$APP_BUNDLE/Contents/Info.plist"

echo "==> Building icon..."
ICONSET="$(mktemp -d)/waikiki.iconset"
mkdir -p "$ICONSET"
PNG="$APP_DIR/Resources/waikiki.png"
for size in 16 32 128 256 512; do
  sips -z $size $size "$PNG" --out "$ICONSET/icon_${size}x${size}.png" > /dev/null
  sips -z $((size * 2)) $((size * 2)) "$PNG" --out "$ICONSET/icon_${size}x${size}@2x.png" > /dev/null
done
iconutil -c icns "$ICONSET" -o "$APP_BUNDLE/Contents/Resources/waikiki.icns"
rm -rf "$(dirname "$ICONSET")"

echo "==> Signing ($([[ "$IDENTITY" == "-" ]] && echo "ad-hoc" || echo "$IDENTITY"))..."
codesign --force --deep --sign "$IDENTITY" "$APP_BUNDLE"
codesign --verify --deep --strict "$APP_BUNDLE"

echo "==> Creating DMG and zip..."
NAME="$APP_NAME-$VERSION-$RUNTIME"
STAGING="$OUTPUT_DIR/dmg-staging"
rm -rf "$STAGING" "$OUTPUT_DIR/$NAME.dmg" "$OUTPUT_DIR/$NAME.zip"
mkdir -p "$STAGING"
cp -R "$APP_BUNDLE" "$STAGING/"
ln -s /Applications "$STAGING/Applications"
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGING" -ov -format UDZO "$OUTPUT_DIR/$NAME.dmg" > /dev/null
ditto -c -k --keepParent "$APP_BUNDLE" "$OUTPUT_DIR/$NAME.zip"
rm -rf "$STAGING" "$PUBLISH_DIR"

echo ""
echo "Artifacts in $OUTPUT_DIR:"
echo "  $APP_NAME.app"
echo "  $NAME.dmg"
echo "  $NAME.zip"
