#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
swift build --package-path macos -j 1
APP="$PWD/build/LocalBot.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/runtime"
cp macos/.build/debug/LocalBot "$APP/Contents/MacOS/LocalBot"
cp runtime/dist/*.js "$APP/Contents/Resources/runtime/"
NODE_VERSION=22.22.2
NODE_ARCH="$(uname -m)"
if [ "$NODE_ARCH" = x86_64 ]; then NODE_ARCH=x64; fi
NODE_DIST="node-v${NODE_VERSION}-darwin-${NODE_ARCH}"
mkdir -p build/vendor
if [ ! -x "build/vendor/$NODE_DIST/bin/node" ]; then
  curl --fail --location --silent --show-error "https://nodejs.org/dist/v$NODE_VERSION/$NODE_DIST.tar.gz" -o "build/vendor/$NODE_DIST.tar.gz"
  curl --fail --location --silent --show-error "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o build/vendor/SHASUMS256.txt
  (cd build/vendor && grep " $NODE_DIST.tar.gz\$" SHASUMS256.txt | shasum -a 256 -c -)
  tar -xzf "build/vendor/$NODE_DIST.tar.gz" -C build/vendor
fi
if [ -f "$APP/Contents/Resources/node" ]; then chmod u+w "$APP/Contents/Resources/node"; fi
cp "build/vendor/$NODE_DIST/bin/node" "$APP/Contents/Resources/node"
cp "build/vendor/$NODE_DIST/LICENSE" "$APP/Contents/Resources/Node-LICENSE"
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
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"
echo "Built: $APP"
