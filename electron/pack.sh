#!/bin/bash
echo "Querying latest electron version..."
tag=`curl --silent -m 10 --connect-timeout 5 "https://api.github.com/repos/electron/electron/releases/latest" | grep tag_name | sed -E 's/.*"([^"]+)".*/\1/'`

system=$1
version=$2

if test -n "$version"; then
	sed -i.bak -E "s/(.*version.*)\".*\"/\1\"$version\"/" package.json
fi

if [[ "$system" == 'all' || "$system" == 'linux' ]]; then
./packagers/linux/prepack.sh $tag
echo "Linux file tree built"
fi

if [[ "$system" == 'all' || "$system" == 'macos' ]]; then
./packagers/macos/prepack.sh $tag
echo "MacOS file tree built"
fi

if [[ "$system" == 'all' || "$system" == 'windows' ]]; then
./packagers/windows/prepack.sh $tag
echo "Windows file tree built"
fi

echo "Ensuring 'out' directory exists"
mkdir -p out
cd out

echo "Creating standalone zip releases..."

if [[ "$system" == 'all' || "$system" == 'linux' ]]; then
echo "Zipping Linux release..."
rm -rf microblocks-linux
mv ../prepack/linux microblocks-linux
rm -f microblocks-linux.zip
zip -rq microblocks-linux.zip microblocks-linux
echo "Building .deb installer..."
cd ../packagers/linux/deb/
./build-deb.sh ../../../out/microblocks-linux ../../../out $version amd64
cd ../../../out
rm -rf microblocks-linux
fi

if [[ "$system" == 'all' || "$system" == 'macos' ]]; then
echo "Zipping MacOS release..."
rm -rf MicroBlocks.app
mv ../prepack/macos/MicroBlocks.app .
rm -f microblocks-macos.zip
zip -ryq microblocks-macos.zip MicroBlocks.app
rm -rf MicroBlocks.app
fi

if [[ "$system" == 'all' || "$system" == 'windows' ]]; then
echo "Zipping Windows release..."
rm -f microblocks-windows
mv ../prepack/windows microblocks-windows
rm -f microblocks-windows.zip
zip -rq microblocks-windows.zip microblocks-windows
cd ../packagers/windows/
./build-installer.sh ../../out/microblocks-windows ../../out $version
cd ../../out
rm -rf microblocks-windows
fi

exit 0
echo "Cleaning up..."
cd ..
rm -rf prepack
