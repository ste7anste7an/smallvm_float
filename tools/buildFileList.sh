#!/bin/bash

# create a files directory "files.txt"
echo "Creating files.txt"
rm -f chromeApp/webapp/files.txt
find Libraries -type f >> chromeApp/webapp/files.txt
find Examples -type f >> chromeApp/webapp/files.txt

echo "Done!"
