#!/bin/bash

# buildFileList.sh - Create "files.txt" file listing the files in the Examples
# and Libraries directories for use by project and library open dialogs.

set -e

# switch to the smallvm directory; the listed paths are relative to the webapp folder
cd "$(dirname "$0")/.."

echo "Creating files.txt"
rm -f chromeApp/webapp/files.txt
touch chromeApp/webapp/files.txt
find Libraries -type f >> chromeApp/webapp/files.txt
find Examples -type f >> chromeApp/webapp/files.txt

echo "Done!"
