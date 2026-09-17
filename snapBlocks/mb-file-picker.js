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
		const button = new TriggerMorph(this, selector, localized(name), 9, null, null, null, null, true);
		button.color = MB_FilePicker.colors.client;
		button.highlightColor = MB_FilePicker.colors.highlight;

		// The icon above the name, as GP draws both into one 70 by 50 bitmap.
		const icon = new Morph();
		const image = new Image();
		image.onload = () => icon.rerender();
		image.src = MB_FilePicker.icons[name];
		icon.render = (ctx) => { if (image.complete) ctx.drawImage(image, 0, 0, 32, 32); };
		icon.setExtent(new Point(32, 32));
		button.add(icon);
		button.fixLayout = function () {
			icon.setPosition(new Point(this.left() + 19, this.top()));
			this.label.setPosition(new Point(this.center().x - (this.label.width() / 2), this.bottom() - this.label.height()));
		};
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

MB_FilePicker.icons = {
	// 64 by 64 PNGs, drawn at 32 by 32 so they stay sharp on a high-density screen.
	Computer: 'data:image/png;base64,' +
		'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' +
		'AfgXKCaphJhXjRgAAAAASUVORK5CYII=',
	Examples: 'data:image/png;base64,' +
		'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' +
		'tJIAAAAASUVORK5CYII=',
	Libraries: 'data:image/png;base64,' +
		'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',
	Cloud: 'data:image/png;base64,' +
		'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',
};
