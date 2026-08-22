#!/bin/bash

# Exit immediately if any command fails
set -e

# --- CONFIGURATION ---
APP_PATH="MicroBlocks.app"
IDENTITY="Developer ID Application: John H Maloney (YU23V8C72W)"
ENTITLEMENTS="entitlements.plist"

echo "=== Remove top-level files that prevent signing ==="
rm -f "$APP_PATH/LICENSE"
rm -f "$APP_PATH/LICENSES.chromium.html"
rm -f "$APP_PATH/version"

# clear all old signature records and metadata flags recursively
xattr -cr MicroBlocks.app

echo "=== Starting Manual Inside-Out Signing Process ==="

# 1. Sign Native Node Modules (.node) and Dynamic Libraries (.dylib)
echo "Signing native modules and dynamic libraries..."
find "$APP_PATH/Contents" -type f \( -name "*.node" -o -name "*.dylib" \) 2>/dev/null | while read -r file; do
   echo "Signing native binary: $file"
   codesign --force --timestamp --options=runtime --sign "$IDENTITY" "$file"
done

# 2. Sign Frameworks (Inside-Out)
echo "Signing nested frameworks..."

# Electron Framework
codesign --force --timestamp --options=runtime --sign "$IDENTITY" "$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework"
codesign --force --timestamp --options=runtime --sign "$IDENTITY" "$APP_PATH/Contents/Frameworks/Electron Framework.framework"

# Mantle Framework
if [ -d "$APP_PATH/Contents/Frameworks/Mantle.framework" ]; then
    codesign --force --timestamp --options=runtime --sign "$IDENTITY" "$APP_PATH/Contents/Frameworks/Mantle.framework/Versions/A/Mantle"
    codesign --force --timestamp --options=runtime --sign "$IDENTITY" "$APP_PATH/Contents/Frameworks/Mantle.framework"
fi

# ReactiveObjC Framework
if [ -d "$APP_PATH/Contents/Frameworks/ReactiveObjC.framework" ]; then
    codesign --force --timestamp --options=runtime --sign "$IDENTITY" "$APP_PATH/Contents/Frameworks/ReactiveObjC.framework/Versions/A/ReactiveObjC"
    codesign --force --timestamp --options=runtime --sign "$IDENTITY" "$APP_PATH/Contents/Frameworks/ReactiveObjC.framework"
fi

# Squirrel Framework
if [ -d "$APP_PATH/Contents/Frameworks/Squirrel.framework" ]; then
    codesign --force --timestamp --options=runtime --sign "$IDENTITY" "$APP_PATH/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt"
    codesign --force --timestamp --options=runtime --sign "$IDENTITY" "$APP_PATH/Contents/Frameworks/Squirrel.framework/Versions/A/Squirrel"
    codesign --force --timestamp --options=runtime --sign "$IDENTITY" "$APP_PATH/Contents/Frameworks/Squirrel.framework"
fi

# 3. Sign Helper Apps safely as whole bundles
echo "Signing helper applications..."
find "$APP_PATH/Contents/Frameworks" -type d -name "*.app" | while read -r helper; do
    echo "Signing helper bundle: $helper"
    # Do NOT sign the inner binary separately. Sign the bundle unit.
    codesign --force --timestamp --options=runtime --sign "$IDENTITY" "$helper"
done

# 4. Sign the Main App Executable and Bundle
echo "Signing main application bundle..."
MAIN_EXE=$(defaults read "$(pwd)/$APP_PATH/Contents/Info.plist" CFBundleExecutable)
codesign --force --timestamp --options=runtime --entitlements "$ENTITLEMENTS" --sign "$IDENTITY" "$APP_PATH/Contents/MacOS/$MAIN_EXE"
codesign --force --timestamp --options=runtime --entitlements "$ENTITLEMENTS" --deep --sign "$IDENTITY" "$APP_PATH"

# 5. Verification
echo "=== Verifying Application Signature ==="
codesign --verify --verbose=4 --deep --strict "$APP_PATH"

echo "=== Signing Completed Successfully ==="
