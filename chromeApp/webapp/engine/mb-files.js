// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

//	mb-files.js - Server-based "built-in" file system for Libraries, Examples, etc.

const MB_Files = {
	fileNames: null
}

MB_Files.initialize = async function () {
	// Create a list of available files by reading files.txt.

	if (this.fileNames) return; // already initialized

	this.fileNames = [];
	let s = await this.readFile('files.txt');
	if (!s) return; // could not read files.txt from server; empty file system

	this.fileNames = s.split('\n');
	if (this.fileNames.at(-1) == '') this.fileNames.pop();
}

MB_Files.readFile = async function (url) {
	if (!url) return undefined;
	try {
		const response = await fetch(url);
		if (!response.ok) return undefined;
		// awaited, so that a failed body read is caught below rather than returned
		return await response.text();
	} catch (error) {
		console.error("Could not read:", url, error);
	}
}

MB_Files.listFiles = function (dir) {
	// Return an array of files with the given directory prefix. Do not include subfolders.

	const prefixEnd = dir.length + 1;
	let result = [];
	for (const path of this.fileNames) {
		if (path.startsWith(dir) && (path.indexOf('/', prefixEnd) == -1)) {
			result.push(path);
		}
	}
	return result;
}

MB_Files.allFilesIn = function (dir) {
	// Return an array of files with the given directory prefix including files in subfolders.

	let result = [];
	for (const path of this.fileNames) {
		if (path.startsWith(dir)) result.push(path);
	}
	return result;
}

MB_Files.listFolders = function (dir) {
	const prefixEnd = dir.length + 1;
	let result = [];
	for (const path of this.fileNames) {
		if (path.startsWith(dir)) {
			let nextSlash = path.indexOf('/', prefixEnd);
			if (nextSlash != -1) {
				let folderName = path.substring(0, nextSlash);
				if (!result.includes(folderName)) result.push(folderName);
			}
		}
	}
	return result;
}

MB_Files.initialize();
