// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-library-widgets.js - dialogs that show what a library is.
//
// The import dialog shows the selected library file's properties beside its
// list; the information dialog shows those of a library in the project, and in
// developer mode lets the user change them.

/* global MB_FilePicker, MB_Files, MB_LibraryEditor, MB_Module, MB_Parser, MB_editor, chromeMenuFor, localized,
	BlockMorph, BoxMorph, Color, FrameMorph, HandleMorph, Morph, Point, ScrollFrameMorph, StringMorph, TextMorph,
	TriggerMorph */

class MB_LibraryPropertiesFrame {
	constructor(forEditing) {
		const colors = MB_LibraryPropertiesFrame.colors;
		this.editFlag = !!forEditing;
		this.library = null;
		this.edits = null; // an MB_LibraryEditor on the library
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
		this.versionText.isEditable = this.authorText.isEditable = this.editFlag;

		if (this.editFlag) {
			this.categoryBox = new Morph();
			this.categoryBox.mouseClickLeft = () => this.pickCategory();
			this.morph.add(this.categoryBox);
			this.sourceFrame = this.field();
			this.sourceText = this.sourceFrame.children[0];
		}

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
		this.edits = lib ? new MB_LibraryEditor(lib) : null;
		this.updateFields();
		this.fixLayout();
	}

	clearFields() {
		this.setLibrary(null);
	}

	updateFields() {
		const edits = this.edits;
		this.setText(this.descriptionText, edits ? edits.description : '');
		this.setText(this.versionText, edits ? edits.versionText : '');
		this.setText(this.authorText, edits ? edits.authorText : '');
		if (this.editFlag) {
			this.setText(this.sourceText, this.sourceLine());
			this.updateCategoryColor();
		}
		this.buildDependencies();
	}

	sourceLine() {
		const path = this.library && this.library.path;
		if (path == null) return localized('user library');
		if (path.startsWith('/')) return 'Libraries' + path + '.ubl';
		if (/^https?:\/\//.test(path)) return path;
		return localized('built-in library');
	}

	setText(aMorph, s) {
		aMorph.text = String(s);
		aMorph.fixLayout();
		aMorph.rerender();
	}

	saveChanges() {
		// Write the fields as they are now to the library.

		const world = this.morph.world();
		if (world) world.stopEditing();
		this.edits.setDescription(this.descriptionText.text);
		this.edits.setVersionText(this.versionText.text);
		this.edits.setAuthorText(this.authorText.text);
		this.edits.save();
	}

	// category

	static categoryColor(cat) {
		let name = String(cat);
		if (name.startsWith('cat;')) name = name.slice(4);
		if (name.endsWith('-Advanced')) name = name.slice(0, -9);
		return BlockMorph.prototype.colorFor(name);
	}

	static swatch(cat) {
		// A PNG of a box in the category's colour, for the chrome's menu.

		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 32;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = MB_LibraryPropertiesFrame.categoryColor(cat).toString();
		ctx.fillRect(0, 0, 32, 32);
		return canvas.toDataURL('image/png');
	}

	updateCategoryColor() {
		this.categoryBox.color = MB_LibraryPropertiesFrame.categoryColor(this.edits ? this.edits.category : 'Library');
		this.categoryBox.rerender();
	}

	pickCategory() {
		const items = MB_editor.libraryCategories().map((cat) => [
			localized(('Library' === cat) ? 'Generic' : cat),
			() => { this.edits.setCategory(cat); this.updateCategoryColor(); },
			null, MB_LibraryPropertiesFrame.swatch(cat), '--category-color']);
		this.openMenu(items);
	}

	openMenu(items) {
		// After the click that asked for it, which would otherwise close it.

		const world = this.morph.world();
		setTimeout(() => chromeMenuFor(world, items));
	}

	// dependencies

	buildDependencies() {
		// A 'Depends:' label and one item per dependency, or nothing at all. When
		// editing, the label always, then '-' to remove one and '+' to add one.

		for (const m of this.depsView.children.slice()) m.destroy();
		const names = this.edits ? this.edits.dependencyNames() : [];
		if ((names.length === 0) && !this.editFlag) return;
		const heading = new StringMorph(localized('Depends:'), 14, null, true);
		heading.rootForGrab = () => this.dialog().rootForGrab();
		this.depsView.add(heading);
		for (const name of names) this.depsView.add(this.item(name));
		if (this.editFlag) {
			if (names.length > 0) this.depsView.add(this.item('-', () => this.queryRemoveItem()));
			this.depsView.add(this.item('+', () => this.queryNewItem()));
		}
	}

	item(name, onClick) {
		// A grey box with a name. A dependency can be dragged out of the dialog to remove it
		// when editing; a button darkens under the pointer.

		const colors = MB_LibraryPropertiesFrame.colors;
		const item = new Morph();
		item.color = colors.item;
		const label = new StringMorph(name, 14);
		item.add(label);
		item.setExtent(new Point(label.width() + 10, label.height() + 6));
		if (onClick) {
			item.mouseClickLeft = onClick;
			item.mouseEnter = () => { item.color = colors.itemHover; item.rerender(); };
			item.mouseLeave = () => { item.color = colors.item; item.rerender(); };
			label.rootForGrab = item.rootForGrab = () => this.dialog().rootForGrab();
		} else if (this.editFlag) {
			item.isDraggable = true;
			label.rootForGrab = item.rootForGrab = () => item;
			item.justDropped = (hand) => this.itemDropped(item, name, hand);
		} else {
			label.rootForGrab = item.rootForGrab = () => this.dialog().rootForGrab();
		}
		return item;
	}

	itemDropped(item, name, hand) {
		// Dropped outside the dialog, a dependency is removed; inside, the dialog sends it back.

		if (!hand || this.dialog().bounds.containsPoint(hand.position())) return;
		this.edits.removeDependency(name);
		item.destroy();
		this.buildDependencies();
		this.fixLayout();
	}

	queryNewItem() {
		MB_editor.prompt(localized('Dependency path, name or URL?'), '', 'line', this.libraryImportHint()).then((s) => {
			if (s && this.edits.addDependency(s)) {
				this.buildDependencies();
				this.fixLayout();
			}
		});
	}

	queryRemoveItem() {
		this.openMenu(this.edits.dependencyNames().map((name) => [name, () => {
			this.edits.removeDependency(name);
			this.buildDependencies();
			this.fixLayout();
		}]));
	}

	libraryImportHint() {
		return [
			localized('If you are adding a library that\'s built into MicroBlocks, you can just enter its name.'),
			localized('If your library is in the Libraries folder in your local MicroBlocks project folder, you need to prefix it with a slash (/).'),
			localized('If the library is hosted online, please input its full URL.'),
		].join('\n');
	}

	fixLayout() {
		// Dependencies along the bottom, version and author above them, when editing
		// the category and source above those, and the description in the space that is left.

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

		if (this.editFlag) {
			const top = this.versionFrame.top() - (margin + lineHeight);
			this.categoryBox.setExtent(new Point(Math.round(box.width() / 6), lineHeight));
			this.categoryBox.setPosition(new Point(box.left(), top));
			this.sourceFrame.setExtent(new Point(Math.max(0, box.width() - (this.categoryBox.width() + margin)), lineHeight));
			this.sourceFrame.setPosition(new Point(this.categoryBox.right() + margin, top));
			this.sourceText.setPosition(this.sourceFrame.position().add(new Point(5, 3)));
			descriptionHeight -= lineHeight + margin;
		}

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
	itemHover: new Color(180, 180, 180),
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
	// A window showing the properties of a library in the project. Opened for
	// editing, it has Save and Cancel, and either one selects the library.

	constructor(lib, forEditing) {
		this.library = lib;
		this.editFlag = !!forEditing;
		this.propertiesFrame = new MB_LibraryPropertiesFrame(this.editFlag);
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

		if (this.editFlag) {
			this.saveButton = this.textButton(localized('Save'), 'saveChanges', true);
			this.cancelButton = this.textButton(localized('Cancel'), 'cancel');
			// A dependency dropped inside the window goes back to its place.
			box.wantsDropOf = () => aWorld.hand.grabOrigin?.origin === this.propertiesFrame.depsView;
			box.reactToDropOf = (m, hand) => m.slideBackTo(hand.grabOrigin);
		}

		box.setExtent(new Point(width, height));
		box.setPosition(new Point(aWorld.left() + Math.round((aWorld.width() - width) / 2), aWorld.top() + 40));
		this.resizer = new HandleMorph(box, 320, 240, 6, 6);
		this.fixLayout();
		aWorld.add(box);
		box.fullChanged();
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

	saveChanges() {
		this.propertiesFrame.saveChanges();
		this.cancel();
	}

	cancel() {
		MB_editor.selectLibrary(this.library.moduleName);
		this.close();
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
		let bottomInset = 0;
		if (this.editFlag) {
			this.saveButton.setPosition(new Point(box.right() - (3 * inset + this.saveButton.width()),
				box.bottom() - (3 * inset + this.saveButton.height())));
			this.cancelButton.setPosition(new Point(this.saveButton.left() - (inset + this.cancelButton.width()), this.saveButton.top()));
			bottomInset = this.saveButton.height() + inset;
		}
		const frame = this.propertiesFrame.morph;
		frame.setPosition(this.client.position().add(new Point(inset, inset)));
		frame.setExtent(this.client.extent().subtract(new Point(2 * inset, (2 * inset) + bottomInset)));
		this.propertiesFrame.fixLayout();
		if (this.resizer) this.resizer.fixLayout();
		box.changed();
	}
}
