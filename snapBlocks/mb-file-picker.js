// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-file-picker.js - dialog for choosing a built-in file to open.
//
// It lists the Examples and Libraries the page is served with. A file on the
// user's own computer comes through the browser's file chooser instead,
// which the Computer button opens.

/* global MB_editor, MB_Files, localized */

class MB_FilePicker {
	constructor(anAction, defaultPath, extensionList) {
		// Set up the picker on defaultPath. Nothing is drawn until open().

		if (typeof extensionList === 'string') extensionList = [extensionList];
		this.action = anAction;
		this.extensions = extensionList || null;
		this.topDir = '';
		this.currentDir = '';
		this.selection = null; // the value of the marked row
		this.isDone = false;
		this.answer = '';
		this.fileSelectAction = null;
		this.folderSelectAction = null;
		this.cloudSelectAction = null;
		this.morph = null;

		this.folderTranslationPrefix = '';
		if (this.extensions && (this.extensions.includes('.ubl') || this.extensions.includes('.ubp'))) {
			this.folderTranslationPrefix = 'folder;';
		}

		let path = defaultPath || '';
		if ((path.length > 1) && path.endsWith('/')) path = path.slice(0, -1);
		this.showFolder(path, !path.includes('/'));
	}

	shortcuts() {
		// The names of the shortcut buttons, in order. The library dialog also
		// has New in developer mode, which the port does not have.

		const ext = this.extensions || [];
		const forLibraries = ext.includes('.ubl');
		const result = [];
		if (ext.includes('.gpp')) result.push('Examples');
		if (forLibraries) result.push('Libraries');
		result.push('Computer');
		if (forLibraries) result.push('Cloud');
		return result;
	}

	// actions

	onFileSelect(anAction) { this.fileSelectAction = anAction; }
	onFolderSelect(anAction) { this.folderSelectAction = anAction; }
	onSelectCloud(anAction) { this.cloudSelectAction = anAction; }

	cloudAction() {
		if (this.cloudSelectAction) this.cloudSelectAction();
	}

	setExamples() { this.showFolder('Examples', true); }
	setLibraries() { this.showFolder('Libraries', true); }

	setComputer() {
		// Close, and let the browser's file chooser pick a file of the first extension.

		this.isDone = true;
		this.removeFromOwner();
		let ext = this.extensions ? this.extensions[0] : '';
		if (ext.startsWith('.')) ext = ext.slice(1);
		MB_editor.browserReadFile(ext);
	}

	parentFolder() {
		const i = this.currentDir.lastIndexOf('/');
		if (i < 0) return;
		this.showFolder(this.currentDir.slice(0, i), false);
	}

	showFolder(path, isTop) {
		this.currentDir = path;
		if (isTop) this.topDir = path;
		this.selection = null;
		if (this.folderSelectAction) this.folderSelectAction(path);
	}

	localizeDir(folderName) {
		// A folder label is translated under 'folder;<name>'. An untranslated
		// one shows its plain name rather than the key.

		const key = this.folderTranslationPrefix + folderName;
		const label = localized(key);
		return (label === key) ? folderName : label;
	}

	folderContents() {
		// Rows of [label, value]: folders first, then the files that match the
		// extensions, each group in GP's case-insensitive order, dot names hidden.

		const ext = this.extensions;
		const showExtension = !ext ||
			!(ext.includes('.ubl') || ext.includes('.ubp') || ext.includes('.gpp'));
		const { dirs, files } = MB_FilePicker.listFolder(this.currentDir);
		const result = [];
		for (const dir of dirs.sort(MB_FilePicker.caseInsensitiveOrder)) {
			if (!dir.startsWith('.')) {
				result.push(['[ ] ' + this.localizeDir(dir), '[ ] ' + dir]);
			}
		}
		for (const fn of files.sort(MB_FilePicker.caseInsensitiveOrder)) {
			if (fn.startsWith('.')) continue;
			if (ext && !ext.some((e) => fn.endsWith(e))) continue;
			if (showExtension) {
				result.push([fn, fn]);
			} else {
				const dot = fn.lastIndexOf('.');
				result.push([localized((dot < 0) ? fn : fn.slice(0, dot)), fn]);
			}
		}
		return result;
	}

	okay() {
		// Answer the marked file, or enter the marked folder and stay open.

		this.answer = '';
		const sel = this.selection;
		if (sel) {
			if (sel.startsWith('[ ] ')) {
				this.fileOrFolderSelected(sel);
				return;
			}
			this.answer = this.currentDir + '/' + sel;
		}
		this.removeFromOwner();
		if (this.action && this.answer) this.action(this.answer);
		this.isDone = true;
	}

	fileOrFolderSelected(value, ignoreDirectories) {
		// Mark a row. A folder row is entered unless ignoreDirectories is set.

		this.selection = value;
		if (value.startsWith('[ ] ')) {
			if (ignoreDirectories) return;
			this.showFolder(this.currentDir + '/' + value.slice(4), false);
		} else if (this.fileSelectAction) {
			this.fileSelectAction(this.currentDir + '/' + value);
		}
	}

	fileOrFolderDoubleClicked(value) {
		this.selection = value;
		if (value.startsWith('[ ] ')) {
			this.showFolder(this.currentDir + '/' + value.slice(4), false);
		} else {
			this.answer = this.currentDir + '/' + value;
			if (this.action) this.action(this.answer);
			this.removeFromOwner();
		}
	}

	removeFromOwner() {
		if (this.morph) this.morph.destroy();
	}
}

MB_FilePicker.listFolder = function (dir) {
	// The folders and files directly inside dir, from the built-in file list.

	const prefix = dir ? dir + '/' : '';
	const dirs = new Set();
	const files = [];
	for (const path of (MB_Files.fileNames || [])) {
		if (!path.startsWith(prefix)) continue;
		const rest = path.slice(prefix.length);
		const slash = rest.indexOf('/');
		if (slash < 0) {
			files.push(rest);
		} else {
			dirs.add(rest.slice(0, slash));
		}
	}
	return { dirs: [...dirs], files };
};

MB_FilePicker.caseInsensitiveOrder = function (a, b) {
	// Compare a character at a time with a-z folded to upper case, so '_'
	// sorts after the letters; a shorter string first when one is a prefix.

	const fold = (ch) => ((ch >= 'a') && (ch <= 'z')) ? ch.toUpperCase() : ch;
	const x = Array.from(a, fold), y = Array.from(b, fold);
	for (let i = 0; i < Math.min(x.length, y.length); i++) {
		if (x[i] < y[i]) return -1;
		if (x[i] > y[i]) return 1;
	}
	return x.length - y.length;
};
