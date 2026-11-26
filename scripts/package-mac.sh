#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
destination="${1:?Pass an absolute output directory.}"
if [[ "$destination" != /* ]]; then
  echo "Use an absolute output directory." >&2
  exit 1
fi
mkdir -p "$destination"
build="$(mktemp -d)"
trap 'rm -rf "$build"' EXIT
app="$build/Shelfmark.app"

mkdir -p "$app/Contents/"{MacOS,Resources}
for architecture in arm64 x86_64; do
  swiftc -O -target "$architecture-apple-macos12.0" "$root/scripts/Launcher.swift" -o "$build/$architecture"
done
lipo -create "$build/arm64" "$build/x86_64" -output "$app/Contents/MacOS/Shelfmark"
cp "$root/Shelfmark.html" "$root/scripts/Shelfmark.icns" "$app/Contents/Resources/"
cp "$root/scripts/Info.plist" "$app/Contents/"
xattr -cr "$app"
codesign --force --sign - "$app"
codesign --verify --deep --strict "$app"
ditto -c -k --norsrc --keepParent "$app" "$build/Shelfmark-macOS.zip"
cp "$build/Shelfmark-macOS.zip" "$destination/"
