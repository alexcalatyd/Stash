#!/bin/zsh
# Compila Stash.app en build/. Con --install la copia a /Applications y la abre.
set -euo pipefail
cd "${0:A:h}"

APP="build/Stash.app"

echo "→ Interfaz"
(cd ui && { [[ -d node_modules ]] || npm install --silent; } && npm run build --silent)

echo "→ App nativa"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O -swift-version 5 -target arm64-apple-macos14.0 \
  -framework AppKit -framework WebKit -framework ServiceManagement -framework Carbon \
  native/main.swift -o "$APP/Contents/MacOS/Stash"
cp native/Info.plist "$APP/Contents/Info.plist"
cp -R ui/dist "$APP/Contents/Resources/ui"

echo "→ Icono"
if [[ ! -f build/AppIcon.icns || native/icon.swift -nt build/AppIcon.icns ]]; then
  swift native/icon.swift build/icon-1024.png
  rm -rf build/AppIcon.iconset && mkdir build/AppIcon.iconset
  for s in 16 32 128 256 512; do
    sips -z $s $s build/icon-1024.png --out build/AppIcon.iconset/icon_${s}x${s}.png >/dev/null
    sips -z $((s * 2)) $((s * 2)) build/icon-1024.png --out build/AppIcon.iconset/icon_${s}x${s}@2x.png >/dev/null
  done
  iconutil -c icns build/AppIcon.iconset -o build/AppIcon.icns
fi
cp build/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"

codesign --force --sign - "$APP" >/dev/null 2>&1
echo "✓ $APP"

if [[ "${1:-}" == "--install" ]]; then
  pkill -x Stash 2>/dev/null && sleep 0.5 || true
  rm -rf "/Applications/Stash.app"
  cp -R "$APP" "/Applications/Stash.app"
  open "/Applications/Stash.app"
  echo "✓ Instalada en /Applications y abierta"
fi
