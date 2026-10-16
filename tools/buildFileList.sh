#!/bin/bash

# buildFileList.sh - Create "files.txt" file listing the files in the Examples
# and Libraries directories for use by project and library open dialogs,
# the built-in VM firmware files in the precompiled directory, and the ESP32
# bootloader and partition images in the esp32 directory.

set -e

# switch to the smallvm directory; the listed paths are relative to the webapp folder
cd "$(dirname "$0")/.."

echo "Creating files.txt"
rm -f chromeApp/webapp/files.txt
touch chromeApp/webapp/files.txt
find Libraries -type f >> chromeApp/webapp/files.txt
find Examples -type f >> chromeApp/webapp/files.txt
find precompiled -maxdepth 1 -type f -name 'vm_*' >> chromeApp/webapp/files.txt
find esp32 -maxdepth 1 -type f -name '*.bin' >> chromeApp/webapp/files.txt

echo "Done!"
