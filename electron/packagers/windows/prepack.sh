#!/bin/sh
tag=$1

if [ ! -f electron-$tag-win32-x64.zip ]; then
	echo "Fetching Electron $tag for Windows..."
	wget https://github.com/electron/electron/releases/download/$tag/electron-$tag-win32-x64.zip
fi
echo "Building Electron file tree for Windows..."
rm -Rf prepack/windows
mkdir -p prepack/windows/
cd prepack/windows/
unzip -q ../../electron-$tag-win32-x64.zip
mv electron.exe microblocks.exe
cp -rL ../../../chromeApp/webapp resources
cd locales
mv en-US.pak ..
rm -f *
mv ../en-US.pak .
cd ..
cd resources
npx asar extract default_app.asar default_app
cp ../../../index.js default_app
cp ../../../preload.js default_app
cp ../../../package.json default_app

rm default_app/index.html
rm default_app/main.js
rm default_app/default_app.js
rm default_app/styles.css
cp ../../../../electron/MicroBlocks.png default_app/icon.png
rm -r default_app/octicon

npx asar pack default_app default_app.asar
rm -r default_app
cd ../../..
