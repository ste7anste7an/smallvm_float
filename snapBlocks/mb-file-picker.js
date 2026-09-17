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

/* global MB_editor, MB_Files, localized, isString, BoxMorph, Color, HandleMorph, ListMorph, Morph, Point,
	StringMorph, TriggerMorph */

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
		this.morph = null; // the dialog, once open() has drawn it

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
		if (this.morph) this.updateView();
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

	// drawing

	open(aWorld) {
		// Draw the dialog and put it on aWorld, centred near the top.

		const colors = MB_FilePicker.colors;
		const width = Math.min(520, Math.round(0.9 * aWorld.width()));
		const height = Math.min(465, Math.round(0.8 * aWorld.height()));

		const box = new BoxMorph(4, 0);
		box.color = colors.frame;
		box.isDraggable = true;
		box.picker = this;
		box.fixLayout = () => this.fixLayout();
		this.morph = box;

		this.client = new Morph();
		this.client.color = colors.client;
		box.add(this.client);
		this.titleLabel = new StringMorph(localized('File Open'), 12, null, true, false, false, null, null, colors.client);
		box.add(this.titleLabel);
		this.closeButton = this.textButton('X', 'removeFromOwner');
		this.closeButton.color = colors.frame;
		this.closeButton.label.color = colors.client;
		this.closeButton.label.rerender();

		this.shortcutButtons = this.shortcuts().map((name) => this.shortcutButton(name));
		this.folderReadout = new StringMorph('', 16);
		box.add(this.folderReadout);
		this.parentButton = this.textButton('<', 'parentFolder');
		this.okayButton = this.textButton(localized('Open'), 'okay', true);
		this.cancelButton = this.textButton(localized('Cancel'), 'removeFromOwner');

		box.setExtent(new Point(width, height));
		box.setPosition(new Point(aWorld.left() + Math.round((aWorld.width() - width) / 2), aWorld.top() + 40));
		this.resizer = new HandleMorph(box, width, height, 6, 6);
		this.updateView();
		aWorld.add(box);
		box.fullChanged(); // its parts were laid out off the world, so none of them is damaged yet
		return this;
	}

	textButton(label, selector, isDefault) {
		const colors = MB_FilePicker.colors;
		const button = new TriggerMorph(this, selector, label, 14, null, null, null,
			isDefault ? colors.client : colors.frame);
		button.color = isDefault ? colors.frame : colors.button;
		button.highlightColor = colors.highlight;
		button.setExtent(new Point(Math.max(30, button.label.width() + 20), 26));
		this.morph.add(button);
		return button;
	}

	shortcutButton(name) {
		const selector = { Examples: 'setExamples', Libraries: 'setLibraries',
			Computer: 'setComputer', Cloud: 'cloudAction' }[name];
		const button = new TriggerMorph(this, selector, localized(name), 12);
		button.color = MB_FilePicker.colors.client;
		button.highlightColor = MB_FilePicker.colors.highlight;
		button.setExtent(new Point(70, 50));
		this.morph.add(button);
		return button;
	}

	updateView() {
		// Show currentDir: its name, the parent button, and its rows.

		const readout = this.folderReadout;
		readout.text = this.localizeDir(this.currentDir.slice(this.currentDir.lastIndexOf('/') + 1));
		readout.fixLayout();
		readout.rerender();
		const below = this.currentDir.startsWith(this.topDir) && (this.currentDir.length > this.topDir.length);
		if (below) this.parentButton.show(); else this.parentButton.hide();

		if (this.listPane) this.listPane.destroy();
		const list = new ListMorph(this.folderContents(), (row) => (isString(row) ? row : row[0]));
		list.color = MB_FilePicker.colors.list;
		list.action = (row) => { if (!isString(row)) this.fileOrFolderSelected(row[1]); };
		const shownAt = Date.now();
		for (const item of list.listContents.children) {
			item.doubleClickAction = () => {
				// Ignore a double click whose first click replaced the list.
				if ((Date.now() - shownAt < 500) || isString(item.action)) return;
				this.fileOrFolderDoubleClicked(item.action[1]);
			};
		}
		this.listPane = list;
		this.morph.add(list);
		this.fixLayout();
	}

	fixLayout() {
		// Place the parts for the dialog's current size.

		if (!this.listPane) return;
		const box = this.morph, left = box.left(), top = box.top();
		const inset = 6, titleHeight = 24;
		this.client.setPosition(new Point(left + inset, top + titleHeight));
		this.client.setExtent(new Point(box.width() - (2 * inset), box.height() - (titleHeight + inset)));
		this.titleLabel.setPosition(new Point(left + 10, top + 5));
		this.closeButton.setExtent(new Point(30, 20));
		this.closeButton.setPosition(new Point(box.right() - (inset + 30), top + 2));

		const leftInset = 113, topInset = 60, rightInset = 20, bottomInset = 48;
		this.listPane.setPosition(new Point(left + leftInset, top + topInset));
		this.listPane.setExtent(new Point(box.width() - (leftInset + rightInset), box.height() - (topInset + bottomInset)));
		this.folderReadout.setPosition(new Point(this.listPane.left(), top + 32));
		this.parentButton.setPosition(new Point(this.listPane.left() - (this.parentButton.width() + 13), top + 28));

		let y = top + 60;
		for (const button of this.shortcutButtons) {
			button.setPosition(new Point(left + 17, y));
			y += 66;
		}

		y = box.bottom() - 35;
		let x = box.right() - (this.okayButton.width() + 20);
		this.okayButton.setPosition(new Point(x, y));
		x -= this.cancelButton.width() + 10;
		this.cancelButton.setPosition(new Point(x, y));
		if (this.resizer) this.resizer.fixLayout();
	}
}

MB_FilePicker.colors = {
	frame: new Color(38, 41, 56),
	client: new Color(236, 237, 241),
	button: new Color(207, 209, 220),
	list: new Color(255, 255, 255),
	highlight: new Color(254, 215, 34),
};

MB_FilePicker.findOpen = function (aWorld) {
	// The picker open on aWorld, or null.

	const morph = aWorld.children.find((m) => m.picker instanceof MB_FilePicker);
	return morph ? morph.picker : null;
};

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
