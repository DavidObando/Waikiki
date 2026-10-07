#!/bin/bash
set -euo pipefail

# Builds Waikiki.app and a DMG (plus a zip of the app) for macOS.
# Usage: ./build-macos.sh [--runtime osx-arm64|osx-x64] [--configuration Release] [--output ./artifacts]
#                         [--codesign-identity "Developer ID Application: ..."] [--entitlements file] [--notarize]
#
# Without --codesign-identity the bundle is ad-hoc signed, which is enough to run on the machine that
# built it. With an identity every nested binary and the bundle are signed with the hardened runtime and
# a secure timestamp, and the DMG is signed too. --notarize submits the DMG to Apple and staples the ticket;
# it reads APPLE_ID, APPLE_ID_PASSWORD (an app-specific password) and APPLE_TEAM_ID from the environment so
# they never appear on a command line.

APP_NAME="Waikiki"
CONFIGURATION="Release"
RUNTIME=""
OUTPUT_DIR="./artifacts"
IDENTITY="-"
ENTITLEMENTS=""
NOTARIZE="false"

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
    --entitlements)      ENTITLEMENTS="$2"; shift 2 ;;
    --notarize)          NOTARIZE="true"; shift ;;
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

if [[ "$NOTARIZE" == "true" && "$IDENTITY" == "-" ]]; then
  echo "--notarize requires --codesign-identity (a Developer ID Application certificate)"; exit 1
fi

if [[ "$IDENTITY" == "-" ]]; then
  echo "==> Signing (ad-hoc)..."
  codesign --force --deep --sign "-" "$APP_BUNDLE"
else
  echo "==> Signing with: $IDENTITY"
  [[ -z "$ENTITLEMENTS" ]] && ENTITLEMENTS="$SCRIPT_DIR/entitlements.plist"
  [[ -f "$ENTITLEMENTS" ]] || { echo "Entitlements file not found: $ENTITLEMENTS"; exit 1; }
  # Sign nested code first (dylibs and helper executables), then the bundle itself. The main executable is
  # skipped here: signed on its own inside the bundle, codesign validates the whole bundle too early and
  # fails on files that are not signed yet. The bundle signature below covers it.
  while IFS= read -r bin; do
    if [[ "$bin" != "$APP_BUNDLE/Contents/MacOS/Waikiki" ]] && file "$bin" | grep -q "Mach-O"; then
      codesign --force --options runtime --timestamp --entitlements "$ENTITLEMENTS" --sign "$IDENTITY" "$bin"
    fi
  done < <(find "$APP_BUNDLE" -type f \( -name "*.dylib" -o -perm +111 \))
  codesign --force --deep --options runtime --timestamp --entitlements "$ENTITLEMENTS" --sign "$IDENTITY" "$APP_BUNDLE"
fi
codesign --verify --deep --strict "$APP_BUNDLE"
echo "  Signature OK"

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

if [[ "$IDENTITY" != "-" ]]; then
  echo "==> Signing DMG..."
  codesign --force --timestamp --sign "$IDENTITY" "$OUTPUT_DIR/$NAME.dmg"
fi

if [[ "$NOTARIZE" == "true" ]]; then
  : "${APPLE_ID:?APPLE_ID is not set}" "${APPLE_ID_PASSWORD:?APPLE_ID_PASSWORD is not set}" "${APPLE_TEAM_ID:?APPLE_TEAM_ID is not set}"
  echo "==> Submitting DMG for notarization (this can take several minutes)..."
  RESULT="$(xcrun notarytool submit "$OUTPUT_DIR/$NAME.dmg" \
    --apple-id "$APPLE_ID" --password "$APPLE_ID_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait 2>&1)" || true
  echo "$RESULT"
  if ! grep -q "status: Accepted" <<< "$RESULT"; then
    SUBMISSION_ID="$(grep -m1 '  id:' <<< "$RESULT" | awk '{print $2}')"
    if [[ -n "$SUBMISSION_ID" ]]; then
      echo "==> Notarization was not accepted. Apple's log:"
      xcrun notarytool log "$SUBMISSION_ID" \
        --apple-id "$APPLE_ID" --password "$APPLE_ID_PASSWORD" --team-id "$APPLE_TEAM_ID" || true
    fi
    echo "Notarization failed."; exit 1
  fi
  echo "==> Stapling ticket to the DMG..."
  xcrun stapler staple "$OUTPUT_DIR/$NAME.dmg"
fi

echo ""
echo "Artifacts in $OUTPUT_DIR:"
echo "  $APP_NAME.app"
echo "  $NAME.dmg"
echo "  $NAME.zip"
