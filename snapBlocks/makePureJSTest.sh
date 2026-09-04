#!/bin/bash
#
# This script creates or updates a temporary test folder named test-pureJS that
# combines the webapp UI with the pure Javascript runtime system (i.e. no GP code).
# The test app can be run by running a web server (e.g. ws --https)
# in the test-pureJS folder and opening purejs.html.
#
# During development, this script can be run after changing any file ot update the
# test-pureJS folder (it's fast!). You can then reload the browser page to test.

# ensure test-pureJS folder exists
mkdir -p test-pureJS

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

# mv Libraries, Examples, and files.txt into test folder
mv Libraries test-pureJS/Libraries
mv Examples test-pureJS/Examples
mv files.txt test-pureJS

# copy javascript files from webapp into test folder, with a few exceptions
echo "Copying webapp UI files"
cp ../chromeApp/webapp/*.js test-pureJS
rm -f test-pureJS/gp_wasm.js
rm -f test-pureJS/gpSupport.js
rm -f test-pureJS/sw.js

# copy other files and folders from webapp into test folder
cp ../chromeApp/webapp/emscripten.css test-pureJS
cp ../chromeApp/webapp/favicon.ico test-pureJS
cp ../chromeApp/webapp/manifest.json test-pureJS

# copy the version file the IDE reports its version from
cp ../gp/runtime/versions test-pureJS

cp -r ../chromeApp/webapp/boardie test-pureJS
cp -r ../chromeApp/webapp/icons test-pureJS
cp -r ../chromeApp/webapp/img test-pureJS
cp -r ../chromeApp/webapp/lib test-pureJS
cp -r ../chromeApp/webapp/precompiled test-pureJS
cp -r ../chromeApp/webapp/styles test-pureJS
cp -r ../chromeApp/webapp/translations test-pureJS

# copy snapBlocks files into test folder
echo "Copying snapBlock files"
cp *.js test-pureJS
cp purejs.html test-pureJS

echo "Done!"
