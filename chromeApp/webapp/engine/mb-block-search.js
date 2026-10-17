// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-block-search.js - the block and variable search box, opened with Ctrl-Space.
//
// It searches the project's variables, My Blocks, the palette's built-in blocks,
// the loaded libraries and every shipped library, loaded or not. The box goes
// away when a block is taken from it, when Escape is pressed, or when the
// keyboard moves elsewhere with no results showing.

/* global MB_editor, MB_Files, MB_Parser, MB_Specs, localized, parsedSpecs, stringArg, blockScale,
	BoxMorph, Color, CursorMorph, MenuItemMorph, MenuMorph, Morph, Point, StringMorph, GetText, newCanvas,
	world */

class MB_BlockSearchBox {
	static recents = []; // descriptors of the blocks most recently taken, newest first
	static builtinIndex = null; // [language, devMode, entries]
	static libraryIndex = null; // [language, devMode, promise of entries]
	static maxMatches = 10;
	static keyTaken = false; // the box acted on the key the IDE is about to see
	static imports = new Map(); // library name -> its loading, while it loads

	static open() {
		// Show the box, or give the keys back to the one already showing.

		const existing = world.children.find((m) => m.searchBox instanceof MB_BlockSearchBox);
		if (existing) {
			existing.searchBox.startEditing();
			return existing.searchBox;
		}
		const box = new MB_BlockSearchBox();
		world.add(box.morph);
		box.startEditing();
		box.showRecents();
		// Reading every shipped library takes a while, so start while the box opens.
		box.libraryEntries();
		return box;
	}

	static tookKey() {
		// Whether the box acted on the key now reaching the IDE's listener. Enter and
		// Escape end the edit before that listener runs, so it cannot tell by the focus.

		const taken = this.keyTaken;
		this.keyTaken = false;
		return taken;
	}

	constructor() {
		const dark = MB_editor.darkMode();
		const textColor = dark ? new Color(230, 230, 230) : new Color(30, 30, 30);
		const hintColor = dark ? new Color(130, 145, 160) : new Color(150, 150, 150);

		this.morph = new BoxMorph(8, 1, dark ? new Color(100, 115, 130) : new Color(150, 150, 150));
		this.morph.color = dark ? new Color(50, 60, 70) : new Color(240, 240, 240);
		this.morph.setExtent(new Point(Math.min(440, world.width() - 20), 40));
		this.morph.setCenter(new Point(world.center().x, 0));
		this.morph.setTop(world.top() + 8);
		this.morph.searchBox = this;
		this.morph.fps = 10;
		this.morph.step = () => this.step();
		this.morph.mouseClickLeft = () => this.startEditing();
		this.morph.reactToInput = () => this.textEdited();
		this.morph.reactToKeystroke = (event) => this.keystroke(event);
		this.morph.nextTab = () => this.selectMatch(1);
		this.morph.previousTab = () => this.selectMatch(-1);
		this.morph.accept = () => { MB_BlockSearchBox.keyTaken = true; this.placeSelectedMatch(); };
		this.morph.cancel = () => { MB_BlockSearchBox.keyTaken = true; this.dismiss(); };
		this.morph.destroy = () => this.destroyed();

		this.morph.add(this.searchIcon());
		this.searchText = new StringMorph('', 20);
		this.searchText.isEditable = true;
		this.searchText.color = textColor;
		this.searchText.setPosition(this.morph.position().add(new Point(40, 8)));
		this.morph.add(this.searchText);
		this.hintText = new StringMorph(localized('search blocks and variables...'), 20);
		this.hintText.color = hintColor;
		this.hintText.setPosition(this.searchText.position());
		this.morph.add(this.hintText);

		this.menu = null;
		this.matches = [];
		this.pendingSearch = null;
		this.lastEditMSecs = 0;
		this.buildIndex();
	}

	searchIcon() {
		// A magnifying glass at the left of the box.

		const icon = new Morph();
		icon.setExtent(new Point(20, 20));
		icon.setPosition(this.morph.position().add(new Point(12, 10)));
		icon.render = (ctx) => {
			ctx.strokeStyle = 'rgb(150, 150, 150)';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(8, 8, 6, 0, 2 * Math.PI);
			ctx.moveTo(12.5, 12.5);
			ctx.lineTo(18, 18);
			ctx.stroke();
		};
		return icon;
	}

	startEditing() {
		world.edit(this.searchText);
	}

	isEditing() {
		return (world.cursor instanceof CursorMorph) && (world.cursor.target === this.searchText);
	}

	// search index

	buildIndex() {
		// Entries are { words, kind, ... } where words are the uppercased words a
		// query is matched against. Their order is the ranking: variables, then My
		// Blocks, then the palette's blocks, then the loaded libraries' blocks.

		const index = [];
		const seenOps = new Set();
		const project = MB_editor.project;
		const showHidden = MB_editor.showHiddenBlocks();

		// A reporter per variable, then one set and one change block that also
		// match any variable's name and show the variable the query names.
		const upper = (v) => v.toUpperCase();
		const varNames = MB_editor.visibleVars().sort((a, b) => (upper(a) < upper(b)) ? -1 : ((upper(a) > upper(b)) ? 1 : 0));
		const allVarWords = [];
		for (const varName of varNames) {
			const words = this.wordsOf(varName.toUpperCase());
			index.push({ words, kind: 'var', varName });
			allVarWords.push(...words);
		}
		for (const [op, kind] of [['=', 'varSet'], ['+=', 'varChange']]) {
			const spec = MB_Specs.specArrayForSelector(op);
			if (spec) index.push({ words: MB_BlockSearchBox.searchWords(spec).concat(allVarWords), kind, spec, varNames });
		}

		for (const func of project.main.functions) {
			const op = func.functionName;
			if (seenOps.has(op) || (op.startsWith('_') && !showHidden)) continue;
			seenOps.add(op);
			const spec = MB_editor.paletteSpecForFunction(func);
			index.push({ words: MB_BlockSearchBox.searchWords(spec), kind: 'spec', spec, category: 'My Blocks' });
		}

		for (const entry of MB_BlockSearchBox.builtinEntries()) {
			if (seenOps.has(entry.spec[1])) continue;
			seenOps.add(entry.spec[1]);
			index.push(entry);
		}

		// The library name and its tags match too. As in the palette, the blocks
		// after an 'advanced' marker are left out unless developer mode is on.
		for (const libName of Array.from(project.libraries.keys()).sort()) {
			const lib = project.libraries.get(libName);
			const libWords = [lib.moduleName].concat(lib.tags).join(' ');
			for (const op of lib.blockList) {
				if (('advanced' === op) && !MB_editor.devMode()) break;
				if (('-' === op) || ('advanced' === op) || seenOps.has(op)) continue;
				if (op.startsWith('_') && !showHidden) continue;
				seenOps.add(op);
				const spec = MB_Specs.specArrayForProjectSpec(project.blockSpecs.get(op))
					|| MB_Specs.specArrayForSelector(op);
				if (spec) {
					index.push({ words: MB_BlockSearchBox.searchWords(spec, libWords), kind: 'spec', spec,
						category: lib.moduleCategory });
				}
			}
		}
		this.searchIndex = index;
	}

	wordsOf(s) {
		return s.split(/\s+/).filter((w) => w.length > 0);
	}

	static searchWords(spec, extraWords) {
		// The uppercased words a block is found by: its label in the current
		// language, its English label when that differs, and any extra words.

		const english = spec[2];
		const translated = english.split(':').map((section) => localized(section.trim())).join(' : ');
		let s = (translated === english) ? english : (translated + ' ' + english);
		if (extraWords) s += ' ' + extraWords;
		return s.toUpperCase().split(/\s+/).filter((w) => (w.length > 0) && (w !== '_'));
	}

	static builtinEntries() {
		// The palette's own blocks, other than the variable blocks, which the box
		// offers per variable. Kept until the language or developer mode changes.

		const lang = GetText.currentLocale, dev = MB_editor.devMode();
		const cached = this.builtinIndex;
		if (cached && (cached[0] === lang) && (cached[1] === dev)) return cached[2];
		const categories = MB_Specs.paletteCategories();
		const entries = [];
		const seenOps = new Set();
		let visible = false, category = '';
		for (const item of MB_Specs.paletteSpecList()) {
			if (typeof item === 'string') {
				if ('-' === item) continue;
				const base = item.endsWith('-Advanced') ? item.slice(0, -9) : item;
				visible = ('cat;Variables' !== base) && categories.includes(base)
					&& (dev || !item.endsWith('-Advanced'));
				category = base.slice(4);
			} else if (visible && !seenOps.has(item[1])) {
				seenOps.add(item[1]);
				entries.push({ words: this.searchWords(item), kind: 'spec', spec: item, category });
			}
		}
		this.builtinIndex = [lang, dev, entries];
		return entries;
	}

	libraryEntries() {
		// Every shipped library's blocks, loaded or not, as { words, libName, spec,
		// category, isKit }, once they have been read. Read on first use and again
		// when the language or developer mode changes.

		const lang = GetText.currentLocale, dev = MB_editor.devMode();
		let cached = MB_BlockSearchBox.libraryIndex;
		if (!cached || (cached[0] !== lang) || (cached[1] !== dev)) {
			// An index built before the file list arrives, or short a file that could
			// not be read, serves this box but is not kept, so the next box reads again.
			const paths = MB_Files.allFilesIn('Libraries').filter((p) => p.endsWith('.ubl') && !p.includes('Other/System'));
			const index = [lang, dev, null];
			const forget = () => { if (MB_BlockSearchBox.libraryIndex === index) MB_BlockSearchBox.libraryIndex = null; };
			index[2] = Promise.all(paths.map((p) => MB_Files.readFile(p))).then((texts) => {
				const entries = [];
				texts.forEach((data, i) => { if (data !== undefined) this.addLibraryEntries(entries, data, paths[i], dev); });
				if ((paths.length === 0) || texts.includes(undefined)) forget();
				return entries;
			});
			index[2].catch(forget);
			cached = MB_BlockSearchBox.libraryIndex = index;
		}
		cached[2].then((entries) => {
			this.libraryIndexEntries = entries;
			this.libraryIndexReady();
		}, () => null);
	}

	addLibraryEntries(entries, data, filePath, dev) {
		let cmdList;
		try { cmdList = MB_Parser.parse(String(data)); } catch (e) { return; }
		const moduleCmd = cmdList[0];
		if (!Array.isArray(moduleCmd) || ('module' !== moduleCmd[0])) return;
		const libName = String(stringArg(moduleCmd[1]));
		if (libName.startsWith('_')) return; // a library that serves other libraries
		let category = (moduleCmd.length > 2) ? String(stringArg(moduleCmd[2])) : 'Library';
		if (category.startsWith('cat;')) category = category.slice(4);
		// Kit and board libraries bring many others with them, so they rank below the rest.
		const isKit = filePath.includes('Kits and Boards');
		let extraWords = libName;
		for (const cmd of cmdList) {
			if (Array.isArray(cmd) && ('tags' === cmd[0])) extraWords += ' ' + cmd.slice(1).map(stringArg).join(' ');
		}
		const specs = parsedSpecs(cmdList);
		const seenOps = new Set();
		for (const cmd of cmdList) {
			if (!Array.isArray(cmd)) continue;
			if (('advanced' === cmd[0]) && !dev) break;
			if ('spec' !== cmd[0]) continue;
			const op = String(stringArg(cmd[2]));
			const spec = MB_Specs.specArrayForProjectSpec(specs.get(op));
			if (!spec || op.startsWith('_') || seenOps.has(op)) continue;
			seenOps.add(op);
			entries.push({ words: MB_BlockSearchBox.searchWords(spec, extraWords), libName, spec, category, isKit });
		}
	}

	libraryIndexReady() {
		// Show the shipped libraries' matches for a query typed before they were read.

		if (!this.morph.parent || this.pendingSearch) return;
		const s = this.searchText.text;
		if ('' !== s) {
			this.matches = this.findMatches(s);
			this.showMatchesMenu(true);
		}
	}

	// incremental search

	textEdited() {
		const s = this.searchText.text;
		if ('' === s) {
			this.hintText.show();
			this.pendingSearch = null;
			this.showRecents();
			return;
		}
		this.hintText.hide();
		// Searching on every keystroke lags on a slow machine, so the search
		// runs from step once typing pauses.
		this.pendingSearch = s;
		this.lastEditMSecs = Date.now();
	}

	runPendingSearch() {
		if (null === this.pendingSearch) return;
		const s = this.pendingSearch;
		this.pendingSearch = null;
		this.matches = this.findMatches(s);
		this.showMatchesMenu(true);
	}

	findMatches(searchString) {
		// Matches are { kind: 'block', block } for a block the project has, or
		// { kind: 'lib', libName, spec, category } for one from a shipped library
		// that is not loaded yet. A prefix of a word ranks above a part of one.

		const max = MB_BlockSearchBox.maxMatches;
		const sought = this.wordsOf(searchString.toUpperCase());
		if (sought.length === 0) return [];
		const prefixEntries = [], substringEntries = [];
		// A later part-of-a-word match could not displace enough prefix matches.
		for (const entry of this.searchIndex) {
			if (prefixEntries.length >= max) break;
			if (this.allWordsMatch(sought, entry.words)) {
				prefixEntries.push(entry);
			} else if (this.allWordsContained(sought, entry.words)) {
				substringEntries.push(entry);
			}
		}
		const result = prefixEntries.concat(substringEntries).slice(0, max)
			.map((entry) => ({ kind: 'block', block: this.blockForEntry(entry, sought) }));

		const remaining = max - result.length;
		if (remaining < 1 || !this.libraryIndexEntries) return result;
		const libMatches = [], kitMatches = [];
		for (const entry of this.libraryIndexEntries) {
			if (libMatches.length >= remaining) break;
			if (MB_editor.project.libraryNamed(entry.libName)) continue;
			if (this.allWordsMatch(sought, entry.words) || this.allWordsContained(sought, entry.words)) {
				const m = { kind: 'lib', libName: entry.libName, spec: entry.spec, category: entry.category };
				(entry.isKit ? kitMatches : libMatches).push(m);
			}
		}
		return result.concat(libMatches, kitMatches).slice(0, max);
	}

	blockForEntry(entry, sought) {
		if ('var' === entry.kind) return this.variableBlock('v', entry.varName);
		if ('varSet' === entry.kind) return this.variableBlock('=', this.varForQuery(entry.varNames, sought));
		if ('varChange' === entry.kind) return this.variableBlock('+=', this.varForQuery(entry.varNames, sought));
		return MB_Specs.blockForSpec(entry.spec, entry.category);
	}

	variableBlock(op, varName) {
		const spec = MB_Specs.specArrayForSelector(op).slice();
		spec[4] = varName;
		return MB_Specs.blockForSpec(spec, 'Variables');
	}

	varForQuery(varNames, sought) {
		// The variable the query names best: a whole word beats the start of
		// one, which beats a part of one. So 'set x' shows x even when another
		// variable has an x in it. Otherwise the first variable, or none.

		let best = null, bestScore = 0;
		for (const varName of varNames) {
			for (const w of this.wordsOf(varName.toUpperCase())) {
				for (const s of sought) {
					const score = (s === w) ? 3 : (w.startsWith(s) ? 2 : (w.includes(s) ? 1 : 0));
					if (score > bestScore) {
						bestScore = score;
						best = varName;
					}
				}
			}
		}
		if (best !== null) return best;
		return (varNames.length > 0) ? varNames[0] : '';
	}

	allWordsMatch(sought, words) {
		// Whether every sought word starts some word of the block.
		return sought.every((s) => words.some((w) => w.startsWith(s)));
	}

	allWordsContained(sought, words) {
		// Whether every sought word is part of some word of the block.
		return sought.every((s) => words.some((w) => w.includes(s)));
	}

	// results menu

	showMatchesMenu(showNoMatch) {
		if (this.menu) this.menu.destroy();
		this.menu = null;
		if (this.matches.length === 0) {
			if (!showNoMatch) return;
			this.menu = new MenuMorph(this);
			this.menu.addItem(localized('no matches'), () => null, null, new Color(150, 150, 150), false, true,
				null, null, true);
			this.popUpMenu();
			return;
		}
		this.menu = new MenuMorph(this);

		// Every row is drawn first so they can share one width, with any library
		// name against its right edge, and the names line up in a column.
		const rows = this.matches.map((m) => {
			if ('block' === m.kind) return [m.kind, this.resultImage(m.block), null, () => this.grabBlock(m.block)];
			const b = MB_Specs.blockForSpec(m.spec, m.category);
			return [m.kind, this.resultImage(b), this.libraryLabel(m.libName),
				() => this.grabLibraryBlock(m.libName, m.spec)];
		});
		let rowW = this.morph.width() - 12;
		for (const row of rows) rowW = Math.max(rowW, row[1].width + (row[2] ? row[2].width + 16 : 0));
		let lastKind = null;
		for (const [kind, image, label, action] of rows) {
			if (('lib' === kind) && ('block' === lastKind)) this.menu.addLine();
			lastKind = kind;
			this.menu.addItem(this.rowImage(image, label, rowW), action, null, null, false, false, null, null, true);
		}
		this.popUpMenu();
		this.menu.selectFirst(); // Enter takes the highlighted match and the arrows move it
	}

	popUpMenu() {
		// Below the box and never over it: a list taller than the room below scrolls.

		const menu = this.menu;
		if (world.activeMenu && (world.activeMenu !== menu)) world.activeMenu.destroy();
		menu.createItems();
		menu.setPosition(this.morph.bottomLeft());
		if (menu.right() > world.right()) menu.setLeft(Math.max(world.left(), world.right() - menu.width()));
		const maxHeight = Math.floor(world.bottom() - this.morph.bottom()) - 12;
		if (menu.height() > maxHeight) {
			const scroller = menu.scroll();
			menu.bounds.corner.y = menu.top() + maxHeight;
			scroller.setHeight(menu.bottom() - scroller.top() - 4);
			scroller.adjustScrollBars();
		}
		menu.addShadow(new Point(2, 2), 80);
		// The text keeps the keys while the results show. Morphic gives the next key
		// to an open menu without the focus, and takes the keys away when a menu
		// with the focus closes.
		menu.hasFocus = true;
		menu.destroy = () => {
			menu.hasFocus = false;
			MenuMorph.prototype.destroy.call(menu);
		};
		world.add(menu);
		world.activeMenu = menu;
		menu.world = world;
		menu.fullChanged();
	}

	resultImage(aBlock) {
		// A block's picture, redrawn smaller when it is taller than two rows, so
		// that a few tall blocks cannot crowd out the rest of the list.

		aBlock.fixLayout();
		const image = aBlock.fullImage();
		const maxHeight = 62 * blockScale();
		if (image.height <= maxHeight) return image;
		const factor = maxHeight / image.height;
		const smaller = aBlock.fullCopy();
		MB_editor.resizeBlock(smaller, factor, blockScale() * factor);
		const smallImage = smaller.fullImage();
		if (smallImage.height <= maxHeight) return smallImage;
		// Block layout does not scale quite linearly, so trim what is left over.
		const w = Math.floor((smallImage.width * maxHeight) / smallImage.height);
		const result = newCanvas(new Point(w, maxHeight));
		result.getContext('2d').drawImage(smallImage, 0, 0, w, maxHeight);
		return result;
	}

	libraryLabel(libName) {
		// The gray name shown on a block from a library the project does not have yet.
		const label = new StringMorph(libName, 11, null, false, false, false, null, null, new Color(120, 120, 120));
		return label.fullImage();
	}

	rowImage(blockImage, labelImage, rowW) {
		if (!labelImage && (blockImage.width >= rowW)) return blockImage;
		const row = newCanvas(new Point(rowW, blockImage.height));
		const ctx = row.getContext('2d');
		ctx.drawImage(blockImage, 0, 0);
		if (labelImage) {
			ctx.drawImage(labelImage, rowW - (labelImage.width + 4),
				Math.floor(Math.max(0, blockImage.height - labelImage.height) / 2));
		}
		return row;
	}

	menuIsOpen() {
		return (this.menu !== null) && (this.menu.parent !== null);
	}

	keystroke(event) {
		if ('ArrowDown' === event.key) this.selectMatch(1);
		if ('ArrowUp' === event.key) this.selectMatch(-1);
	}

	selectMatch(direction) {
		if (!this.menuIsOpen() || (this.matches.length === 0)) return;
		if (direction > 0) this.menu.selectDown(); else this.menu.selectUp();
	}

	selectedMatch() {
		const items = this.menu.allChildren().filter((m) => m instanceof MenuItemMorph);
		const i = Math.max(0, items.indexOf(this.menu.selection));
		return this.matches[Math.min(i, this.matches.length - 1)];
	}

	// recently taken blocks, shown while the query is empty

	showRecents() {
		this.matches = this.recentBlocks().map((block) => ({ kind: 'block', block }));
		this.showMatchesMenu(false);
	}

	recentBlocks() {
		// Blocks for the recent list, without any the project no longer has.

		const result = [];
		const vars = MB_editor.visibleVars();
		for (const desc of MB_BlockSearchBox.recents) {
			const arg = desc.slice(4);
			if (desc.startsWith('var ')) {
				if (vars.includes(arg)) result.push(this.variableBlock('v', arg));
			} else if (desc.startsWith('set ')) {
				result.push(this.variableBlock('=', vars.includes(arg) ? arg : ''));
			} else if (desc.startsWith('chg ')) {
				result.push(this.variableBlock('+=', vars.includes(arg) ? arg : ''));
			} else if (desc.startsWith('op ')) {
				const entry = this.searchIndex.find((e) => ('spec' === e.kind) && (e.spec[1] === desc.slice(3)));
				if (entry) result.push(MB_Specs.blockForSpec(entry.spec, entry.category));
			}
		}
		return result;
	}

	static recordRecent(desc) {
		// The set and change blocks are one row each whatever variable they
		// show, so only the newest of each is kept.

		let recents = this.recents.filter((d) => d !== desc);
		for (const prefix of ['set ', 'chg ']) {
			if (desc.startsWith(prefix)) recents = recents.filter((d) => !d.startsWith(prefix));
		}
		recents.unshift(desc);
		this.recents = recents.slice(0, 6);
	}

	recentDescriptorFor(aBlock) {
		const op = aBlock.selector;
		if ('v' === op) return 'var ' + aBlock.blockSpec;
		if ('=' === op) return 'set ' + aBlock.inputs()[0].evaluate();
		if ('+=' === op) return 'chg ' + aBlock.inputs()[0].evaluate();
		return 'op ' + op;
	}

	// taking a block

	grabBlock(aBlock) {
		MB_BlockSearchBox.recordRecent(this.recentDescriptorFor(aBlock));
		this.dismiss();
		this.grabNewBlock(aBlock);
	}

	async importedLibraryBlock(libName, spec) {
		// Load the library, with the libraries it depends on, and answer a block
		// for the spec, as the loaded library defines it.

		MB_BlockSearchBox.recordRecent('op ' + spec[1]);
		this.dismiss();
		// Two quick takes from one library load it once.
		let loading = MB_BlockSearchBox.imports.get(libName);
		if (!loading) {
			loading = MB_editor.installLibraryNamed(libName).finally(() => MB_BlockSearchBox.imports.delete(libName));
			MB_BlockSearchBox.imports.set(libName, loading);
		}
		await loading;
		const project = MB_editor.project;
		const lib = project.libraryNamed(libName);
		const loaded = MB_Specs.specArrayForProjectSpec(project.blockSpecs.get(spec[1]));
		return MB_Specs.blockForSpec(loaded || spec, lib ? lib.moduleCategory : 'Library');
	}

	async grabLibraryBlock(libName, spec) {
		this.grabNewBlock(await this.importedLibraryBlock(libName, spec));
	}

	grabNewBlock(aBlock) {
		// Put the block in the hand. It is a copy of nothing, so it is not a template.

		aBlock.isTemplate = false;
		aBlock.isDraggable = true;
		aBlock.fixLayout();
		aBlock.setPosition(world.hand.position().subtract(10));
		world.hand.grab(aBlock);
	}

	async placeSelectedMatch() {
		// Enter: add the highlighted match below the scripts and scroll to it, as the
		// pointer may be anywhere while the keyboard is in use. With nothing to add,
		// keep typing.

		this.runPendingSearch();
		if (!this.menuIsOpen() || (this.matches.length === 0)) {
			this.startEditing();
			return;
		}
		const m = this.selectedMatch();
		let block;
		if ('lib' === m.kind) {
			block = await this.importedLibraryBlock(m.libName, m.spec);
		} else {
			block = m.block;
			MB_BlockSearchBox.recordRecent(this.recentDescriptorFor(block));
			this.dismiss();
		}
		block.isTemplate = false;
		block.isDraggable = true;
		MB_editor.addToBottom(block);
		MB_editor.scriptChanged(); // as a dropped block is
		MB_editor.scrollScriptsToShow(block.fullBounds());
	}

	// lifecycle

	step() {
		if ((null !== this.pendingSearch) && ((Date.now() - this.lastEditMSecs) >= 150)) {
			this.runPendingSearch();
		}
		const editing = this.isEditing();

		// Clicking in the text closes the results as a menu clicked outside of, so
		// they come back while the box still has the keys.
		if (editing && (null === this.pendingSearch) && !this.menuIsOpen()) {
			const s = this.searchText.text;
			if ('' !== s) {
				this.matches = this.findMatches(s);
				this.showMatchesMenu(true);
			} else if (MB_BlockSearchBox.recents.length > 0) {
				this.showRecents();
			}
		}
		if (!editing && !this.menuIsOpen()) this.dismiss();
	}

	dismiss() {
		this.morph.destroy();
	}

	destroyed() {
		// However the box goes, the keys and the results go with it. Left editing
		// text that is gone, the keyboard would reach nothing else.

		if (this.isEditing()) world.stopEditing();
		if (this.menuIsOpen()) this.menu.destroy();
		this.menu = null;
		BoxMorph.prototype.destroy.call(this.morph);
	}
}
