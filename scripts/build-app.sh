#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
swift build --package-path macos -j 1
APP="$PWD/build/LocalBot.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/runtime"
cp macos/.build/debug/LocalBot "$APP/Contents/MacOS/LocalBot"
cp runtime/dist/*.js "$APP/Contents/Resources/runtime/"
cp "$(command -v node)" "$APP/Contents/Resources/node"
printf '{"type":"module"}\n' > "$APP/Contents/Resources/runtime/package.json"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>LocalBot</string><key>CFBundleDisplayName</key><string>LocalBot</string>
<key>CFBundleIdentifier</key><string>app.localbot.mac</string><key>CFBundleExecutable</key><string>LocalBot</string>
<key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>1</string><key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
codesign --force --deep --sign - "$APP"
echo "Built: $APP"
