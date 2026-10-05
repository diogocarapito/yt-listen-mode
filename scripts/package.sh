#!/usr/bin/env bash
# Build a release zip of the extension into dist/.
#
# Usage (from anywhere):  ./scripts/package.sh
# Output:                 dist/yt-listen-mode-v<version>.zip
#
# manifest.json sits at the root of the zip, which is what both
# "Load unpacked" (after unzipping) and the Chrome Web Store expect.
set -euo pipefail

cd "$(dirname "$0")/.."

NAME="yt-listen-mode"
MANIFEST="extension/manifest.json"

VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$MANIFEST" | head -n 1)"
if [[ -z "$VERSION" ]]; then
  echo "Could not read \"version\" from $MANIFEST" >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "zip is not installed (Arch: sudo pacman -S zip, Debian/Ubuntu: sudo apt install zip)" >&2
  exit 1
fi

OUT="dist/${NAME}-v${VERSION}.zip"
mkdir -p dist
rm -f "$OUT"

(
  cd extension
  zip -r -X -q "../$OUT" . -x '.*' -x '*/.*' -x '__MACOSX/*'
)

echo "Built $OUT"
unzip -l "$OUT" | tail -n 1
