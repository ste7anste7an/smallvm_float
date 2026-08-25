#!/bin/bash

# build GP runtime
echo "Building GP runtime"
cd ../chromeApp/emscripten
./buildEmcc.sh
cd ../../snapBlocks

# copy GP runtime system (wasm files) from webapp built by chromeApp/emscripten/buildEmcc.sh
rm -f gp_wasm.*
cp ../chromeApp/webapp/gp_wasm.* .

# copy Libraries folder
echo "Copying Library and Examples folders"
rm -rf Libraries
cp -r ../Libraries .
find Libraries -name ".DS_Store" -type f -delete

# copy Examples folder
rm -rf Examples
cp -r ../Examples .
find Examples -name ".DS_Store" -type f -delete

# create a files directory "files.txt"
echo "Creating files.txt"
rm -f files.txt
find Libraries -type f >> files.txt
find Examples -type f >> files.txt

echo "Done!"
