// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-library-widgets.js - dialogs that show what a library is.
//
// The import dialog shows the selected library file's properties beside its
// list; the information dialog shows those of a library in the project.

/* global MB_FilePicker, MB_Files, MB_Module, MB_Parser, localized, BoxMorph, Color, FrameMorph, HandleMorph, Morph,
	Point, ScrollFrameMorph, StringMorph, TextMorph, TriggerMorph */

class MB_LibraryPropertiesFrame {
	constructor() {
		const colors = MB_LibraryPropertiesFrame.colors;
		this.library = null;
		this.morph = new Morph();
		this.morph.alpha = 0;

		this.descriptionText = new TextMorph('', 16);
		this.descriptionText.isEditable = true; // editable, as in GP, so a URL in it can be copied
		this.descriptionFrame = new ScrollFrameMorph();
		this.descriptionFrame.color = colors.field;
		this.descriptionFrame.acceptsDrops = false;
		this.descriptionFrame.contents.acceptsDrops = false;
		this.descriptionFrame.addContents(this.descriptionText);
		this.morph.add(this.descriptionFrame);

		this.versionFrame = this.field();
		this.versionText = this.versionFrame.children[0];
		this.authorFrame = this.field();
		this.authorText = this.authorFrame.children[0];

		this.depsView = new FrameMorph(); // clips a dependency name wider than the pane
		this.depsView.alpha = 0;
		this.depsView.acceptsDrops = false;
		this.morph.add(this.depsView);
		this.fixLayout();
	}

	field() {
		// A white box holding one line of text, clipped at its edges.

		const box = new FrameMorph();
		box.color = MB_LibraryPropertiesFrame.colors.field;
		box.acceptsDrops = false;
		const text = new StringMorph('', 16);
		text.rootForGrab = () => this.dialog().rootForGrab();
		box.add(text);
		this.morph.add(box);
		return box;
	}

	dialog() {
		// A grab on a text row moves the whole dialog; the pane's frames would stop it at the pane.

		return this.morph.parent;
	}

	setLibrary(lib) {
		this.library = lib;
		this.updateFields();
		this.fixLayout();
	}

	clearFields() {
		this.library = null;
		this.updateFields();
		this.fixLayout();
	}

	updateFields() {
		const lib = this.library;
		this.setText(this.descriptionText, lib ? lib.description : '');
		this.setText(this.versionText, lib ? 'v' + lib.version[0] + '.' + lib.version[1] : '');
		this.setText(this.authorText, lib ? MB_LibraryPropertiesFrame.byLabel() + ' ' + lib.author : '');
		this.buildDependencies(lib ? lib.dependencies.map((dep) => lib.dependencyName(dep)) : []);
	}

	setText(aMorph, s) {
		aMorph.text = String(s);
		aMorph.fixLayout();
		aMorph.rerender();
	}

	buildDependencies(names) {
		// A 'Depends:' label and one item per dependency, or nothing at all. A
		// leading underscore marks an implementation library and is not shown.

		for (const m of this.depsView.children.slice()) m.destroy();
		if (names.length === 0) return;
		const heading = new StringMorph(localized('Depends:'), 14, null, true);
		heading.rootForGrab = () => this.dialog().rootForGrab();
		this.depsView.add(heading);
		for (const name of names) {
			const item = new Morph();
			item.color = MB_LibraryPropertiesFrame.colors.item;
			const label = new StringMorph(name.startsWith('_') ? name.slice(1) : name, 14);
			item.rootForGrab = label.rootForGrab = () => this.dialog().rootForGrab();
			item.add(label);
			item.setExtent(new Point(label.width() + 10, label.height() + 6));
			this.depsView.add(item);
		}
	}

	fixLayout() {
		// Dependencies along the bottom, version and author above them, and the
		// description in the space that is left.

		const margin = 8, box = this.morph;
		let bottom = box.bottom(), descriptionHeight = box.height();

		this.layoutDependencies();
		if (this.depsView.children.length > 0) {
			this.depsView.setPosition(new Point(box.left(), bottom - this.depsView.height()));
			bottom = this.depsView.top() - margin;
			descriptionHeight -= this.depsView.height() + margin;
		}

		const lineHeight = this.versionText.height() + 6;
		this.versionFrame.setExtent(new Point(this.versionText.width() + 10, lineHeight));
		this.versionFrame.setPosition(new Point(box.left(), bottom - lineHeight));
		this.authorFrame.setExtent(new Point(Math.max(0, box.width() - (this.versionFrame.width() + margin)), lineHeight));
		this.authorFrame.setPosition(new Point(this.versionFrame.right() + margin, this.versionFrame.top()));
		this.versionText.setPosition(this.versionFrame.position().add(new Point(5, 3)));
		this.authorText.setPosition(this.authorFrame.position().add(new Point(5, 3)));
		descriptionHeight -= lineHeight + margin;

		this.descriptionFrame.setPosition(box.position());
		this.descriptionFrame.setExtent(new Point(box.width(), Math.max(0, descriptionHeight)));
		this.descriptionText.maxWidth = Math.max(10, box.width() - 18);
		this.descriptionText.fixLayout();
		this.descriptionText.rerender();
		this.descriptionText.setPosition(this.descriptionFrame.position().add(new Point(5, 5)));
		this.descriptionFrame.adjustScrollBars();
	}

	layoutDependencies() {
		// Lay the items out left to right, wrapping at the frame's width.

		const margin = 6, width = this.morph.width();
		let x = 0, y = 0, rowHeight = 0;
		for (const m of this.depsView.children) {
			if ((x > 0) && (x + m.width() > width)) {
				x = 0;
				y += rowHeight + margin;
				rowHeight = 0;
			}
			const isItem = m.children.length > 0; // the label has no box around it
			m.setPosition(this.depsView.position().add(new Point(x, y + (isItem ? 0 : 3))));
			if (isItem) m.children[0].setCenter(m.center());
			x += m.width() + margin;
			rowHeight = Math.max(rowHeight, m.height());
		}
		this.depsView.bounds.setExtent(new Point(width, y + rowHeight));
	}
}

MB_LibraryPropertiesFrame.colors = {
	field: new Color(255, 255, 255),
	item: new Color(200, 200, 200),
};

MB_LibraryPropertiesFrame.byLabel = function () {
	// 'by', as in "by Jane Doe"; the key carries a context prefix.

	const key = 'libdata;by';
	const s = localized(key);
	return (s === key) ? 'by' : s;
};

class MB_LibraryImportDialog {
	// The file picker on the shipped libraries, with the properties of the
	// selected library file beside its list.

	constructor(anAction, defaultPath) {
		this.filePicker = new MB_FilePicker(anAction, defaultPath, ['.ubl']);
		this.propertiesFrame = new MB_LibraryPropertiesFrame();
		this.requestCount = 0;
		this.filePicker.onFileSelect((path) => this.updateLibraryInfo(path));
		this.filePicker.onFolderSelect(() => this.clearLibraryInfo());
	}

	open(aWorld) {
		const picker = this.filePicker;
		picker.open(aWorld);
		const box = picker.morph;
		box.add(this.propertiesFrame.morph);
		box.fixLayout = () => this.fixLayout();
		const width = Math.min(600, Math.round(0.9 * aWorld.width()));
		const height = Math.min(466, Math.round(0.8 * aWorld.height()));
		box.setExtent(new Point(width, height));
		box.setPosition(new Point(aWorld.left() + Math.round((aWorld.width() - width) / 2), aWorld.top() + 40));
		picker.resizer.minExtent = new Point(width, height);
		this.fixLayout();
		box.fullChanged();
		return this;
	}

	async updateLibraryInfo(path) {
		// Show the properties of the library in the file at path. The project
		// is not changed. A later selection wins over a slower earlier read.

		const request = ++this.requestCount;
		const data = await MB_Files.readFile(path);
		if (request !== this.requestCount) return;
		if (!data) {
			this.propertiesFrame.clearFields();
			return;
		}
		const fileName = path.slice(path.lastIndexOf('/') + 1);
		const lib = new MB_Module(fileName.replace(/\.ubl$/, ''));
		const cmdList = MB_Parser.parse(data);
		lib.loadModuleNameAndCategory(cmdList);
		lib.loadVersion(cmdList);
		lib.loadAuthor(cmdList);
		lib.loadDependencies(cmdList);
		lib.loadDescription(cmdList);
		this.propertiesFrame.setLibrary(lib);
		this.filePicker.morph.changed();
	}

	clearLibraryInfo() {
		this.requestCount++;
		this.propertiesFrame.clearFields();
	}

	fixLayout() {
		// The list takes about half the width and the properties the rest.

		const picker = this.filePicker, box = picker.morph, list = picker.listPane;
		picker.fixLayout();
		if (!list) return;
		const margin = 10, topInset = 60, bottomInset = 40, leftInset = 110;
		const rightInset = Math.round(box.width() / 2) - 20;
		list.setPosition(new Point(box.left() + leftInset, box.top() + topInset));
		list.setExtent(new Point(box.width() - (leftInset + rightInset), box.height() - (topInset + bottomInset)));
		const frame = this.propertiesFrame.morph;
		frame.setPosition(new Point(list.right() + margin, list.top()));
		frame.setExtent(new Point(box.right() - (list.right() + (3 * margin)), list.height()));
		this.propertiesFrame.fixLayout();
		box.changed();
	}
}

class MB_LibraryInfoDialog {
	// A window showing the properties of a library in the project.

	constructor(lib) {
		this.library = lib;
		this.propertiesFrame = new MB_LibraryPropertiesFrame();
		this.propertiesFrame.setLibrary(lib);
		this.morph = null;
	}

	open(aWorld) {
		const colors = MB_FilePicker.colors;
		const width = Math.min(420, Math.round(0.9 * aWorld.width()));
		const height = Math.min(315, Math.round(0.8 * aWorld.height()));

		const box = new BoxMorph(4, 0);
		box.color = colors.frame;
		box.isDraggable = true;
		box.fixLayout = () => this.fixLayout();
		this.morph = box;

		this.client = new Morph();
		this.client.color = colors.client;
		box.add(this.client);
		this.titleLabel = new StringMorph(this.library.moduleName, 12, null, true, false, false, null, null, colors.client);
		box.add(this.titleLabel);
		this.closeButton = new TriggerMorph(this, 'close', 'X', 14, null, null, null, colors.client);
		this.closeButton.color = colors.frame;
		this.closeButton.highlightColor = colors.highlight;
		box.add(this.closeButton);
		box.add(this.propertiesFrame.morph);

		box.setExtent(new Point(width, height));
		box.setPosition(new Point(aWorld.left() + Math.round((aWorld.width() - width) / 2), aWorld.top() + 40));
		this.resizer = new HandleMorph(box, 320, 240, 6, 6);
		this.fixLayout();
		aWorld.add(box);
		box.fullChanged();
		return this;
	}

	close() {
		if (this.morph) this.morph.destroy();
	}

	fixLayout() {
		const box = this.morph, inset = 6, titleHeight = 24;
		if (!this.client) return;
		this.client.setPosition(new Point(box.left() + inset, box.top() + titleHeight));
		this.client.setExtent(new Point(box.width() - (2 * inset), box.height() - (titleHeight + inset)));
		this.titleLabel.setPosition(new Point(box.left() + 10, box.top() + 5));
		this.closeButton.setExtent(new Point(30, 20));
		this.closeButton.setPosition(new Point(box.right() - (inset + 30), box.top() + 2));
		const frame = this.propertiesFrame.morph;
		frame.setPosition(this.client.position().add(new Point(inset, inset)));
		frame.setExtent(this.client.extent().subtract(new Point(2 * inset, 2 * inset)));
		this.propertiesFrame.fixLayout();
		if (this.resizer) this.resizer.fixLayout();
		box.changed();
	}
}
