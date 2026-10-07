#!/bin/bash
set -euo pipefail

# Builds a self-contained Linux tarball.
# Usage: ./build-linux.sh [--runtime linux-x64|linux-arm64] [--configuration Release] [--output ./artifacts]

APP_NAME="Waikiki"
CONFIGURATION="Release"
RUNTIME=""
OUTPUT_DIR="./artifacts"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/src/Waikiki.App"
PROJECT="$APP_DIR/Waikiki.App.gsproj"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --configuration) CONFIGURATION="$2"; shift 2 ;;
    --runtime)       RUNTIME="$2"; shift 2 ;;
    --output)        OUTPUT_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$RUNTIME" ]]; then
  case "$(uname -m)" in aarch64|arm64) RUNTIME="linux-arm64" ;; *) RUNTIME="linux-x64" ;; esac
fi

cd "$REPO_ROOT"
dotnet tool restore > /dev/null
VERSION="$(dotnet nbgv get-version -v SimpleVersion --project "$APP_DIR")"
echo "=== Waikiki Linux build: $VERSION ($RUNTIME, $CONFIGURATION) ==="

OUTPUT_DIR="$(mkdir -p "$OUTPUT_DIR" && cd "$OUTPUT_DIR" && pwd)"
NAME="$APP_NAME-$VERSION-$RUNTIME"
STAGE="$OUTPUT_DIR/$NAME"
rm -rf "$STAGE" "$OUTPUT_DIR/$NAME.tar.gz"

dotnet publish "$PROJECT" -c "$CONFIGURATION" -r "$RUNTIME" --self-contained true \
  -p:PublishSingleFile=false -p:PublishTrimmed=false -o "$STAGE"
chmod +x "$STAGE/Waikiki"
cp "$APP_DIR/Resources/waikiki.png" "$STAGE/waikiki.png"
cat > "$STAGE/waikiki.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Waikiki
Comment=Turn audiobooks into Yoto cards
Exec=/opt/waikiki/Waikiki
Icon=/opt/waikiki/waikiki.png
Terminal=false
Categories=AudioVideo;Audio;
DESKTOP

tar -czf "$OUTPUT_DIR/$NAME.tar.gz" -C "$OUTPUT_DIR" "$NAME"
rm -rf "$STAGE"
echo ""
echo "Artifact: $OUTPUT_DIR/$NAME.tar.gz"
echo "Extract it (for example to /opt/waikiki) and edit the Exec/Icon paths in waikiki.desktop if you want a menu entry."
