#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
APP="$PWD/build/LocalBot.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -parse-as-library -target arm64-apple-macos14.0 -swift-version 5 -O -framework AppKit -framework WebKit -framework Security -framework PDFKit -framework UserNotifications native/Main.swift native/Computer.swift native/FilePicker.swift -o "$APP/Contents/MacOS/LocalBot"
rm -rf "$APP/Contents/Resources/runtime" "$APP/Contents/Resources/ui"
cp -R runtime ui "$APP/Contents/Resources/"
cp ui/assets/LocalBot.icns "$APP/Contents/Resources/LocalBot.icns"
if [ ! -f "$APP/Contents/Resources/node" ]; then
 if [ -f "$HOME/Applications/LocalBot.app/Contents/Resources/node" ]; then
  cp "$HOME/Applications/LocalBot.app/Contents/Resources/node" "$APP/Contents/Resources/node"
 else
  cp "$(command -v node)" "$APP/Contents/Resources/node"
 fi
fi
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>LocalBot</string><key>CFBundleDisplayName</key><string>LocalBot</string>
<key>CFBundleIdentifier</key><string>com.localbot.rebuilt</string>
<key>CFBundleExecutable</key><string>LocalBot</string>
<key>CFBundleVersion</key><string>120</string><key>CFBundleShortVersionString</key><string>1.2.0</string>
<key>CFBundleIconFile</key><string>LocalBot.icns</string>
<key>CFBundlePackageType</key><string>APPL</string><key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
# A stable signing identity keeps Keychain trust across rebuilds (no password prompts).
# Override with LOCALBOT_SIGN_ID; falls back to ad-hoc when no identity is installed.
SIGN_ID="${LOCALBOT_SIGN_ID:-$(security find-identity -v -p codesigning 2>/dev/null | grep -Eo '"(Developer ID Application|Apple Development)[^"]*"' | head -1 | tr -d '"')}"
codesign --force --deep --sign "${SIGN_ID:--}" "$APP"
codesign --verify --deep --strict "$APP"
echo "Built $APP"
