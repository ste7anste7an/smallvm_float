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
//
// MB_BlockSearch finds the blocks and hands them over; MB_BlockSearchBox is the
// box drawn on it. A view of another kind needs only MB_BlockSearch.

/* global MB_editor, MB_Files, MB_Parser, MB_Specs, localized, parsedSpecs, stringArg, blockScale, screenPixels,
	BoxMorph, Color, CursorMorph, MenuItemMorph, MenuMorph, Morph, Point, StringMorph, GetText, newCanvas,
	renderBlockString, world, ZOOM */

function zoomedImage(aMorph) {
	// A morph's full image drawn at the world's zoom. The world draws a cached image
	// under its zoom, so a picture at world units would be scaled up and blurred at
	// any block size above 100%; this one is drawn back at 1 / ZOOM of its size.

	const bounds = aMorph.fullBounds();
	const image = newCanvas(bounds.extent().multiplyBy(ZOOM));
	const ctx = image.getContext('2d');
	ctx.scale(ZOOM, ZOOM);
	ctx.translate(-bounds.origin.x, -bounds.origin.y);
	aMorph.drawnAtZoom = true;
	aMorph.fullDrawOn(ctx, bounds);
	delete aMorph.drawnAtZoom;
	return image;
}

class MB_BlockSearch {
	// A search of the open project's blocks. search() and recents() answer entries,
	// { kind: 'block', block } for a block the project has or { kind: 'lib', libName,
	// spec, category } for one from a shipped library it lacks, and the other methods
	// take one: pictureFor() to show it, place() or pickUp() to take it. The index is
	// rebuilt after a take loads a library; after other project changes, call buildIndex().

	static recents = []; // descriptors of the blocks most recently taken, newest first
	static builtinIndex = null; // [language, devMode, entries]
	static libraryIndex = null; // [language, devMode, promise of entries]
	static maxMatches = 10;
	static imports = new Map(); // library name -> its loading, while it loads

	constructor() {
		this.libraryIndexEntries = null;
		this.buildIndex();
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
			if (spec) index.push({ words: MB_BlockSearch.searchWords(spec).concat(allVarWords), kind, spec, varNames });
		}

		for (const func of project.main.functions) {
			const op = func.functionName;
			if (seenOps.has(op) || (op.startsWith('_') && !showHidden)) continue;
			seenOps.add(op);
			const spec = MB_editor.paletteSpecForFunction(func);
			index.push({ words: MB_BlockSearch.searchWords(spec), kind: 'spec', spec, category: 'My Blocks' });
		}

		for (const entry of MB_BlockSearch.builtinEntries()) {
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
					index.push({ words: MB_BlockSearch.searchWords(spec, libWords), kind: 'spec', spec,
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
		// The palette's own blocks, other than the variable blocks, which are
		// offered per variable. Kept until the language or developer mode changes.

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

	readLibraries() {
		// Read every shipped library's blocks, loaded or not. Answers a promise of
		// whether the reading finished; search() includes what was read from then on.
		// They are read on first use and again when the language or developer mode changes.

		const lang = GetText.currentLocale, dev = MB_editor.devMode();
		let cached = MB_BlockSearch.libraryIndex;
		if (!cached || (cached[0] !== lang) || (cached[1] !== dev)) {
			// An index built before the file list arrives, or short a file that could
			// not be read, serves this search but is not kept, so the next one reads again.
			const paths = MB_Files.allFilesIn('Libraries').filter((p) => p.endsWith('.ubl') && !p.includes('Other/System'));
			const index = [lang, dev, null];
			const forget = () => { if (MB_BlockSearch.libraryIndex === index) MB_BlockSearch.libraryIndex = null; };
			index[2] = Promise.all(paths.map((p) => MB_Files.readFile(p))).then((texts) => {
				const entries = [];
				texts.forEach((data, i) => { if (data !== undefined) this.addLibraryEntries(entries, data, paths[i], dev); });
				if ((paths.length === 0) || texts.includes(undefined)) forget();
				return entries;
			});
			index[2].catch(forget);
			cached = MB_BlockSearch.libraryIndex = index;
		}
		return cached[2].then((entries) => {
			// Entries are { words, libName, spec, category, isKit }.
			this.libraryIndexEntries = entries;
			return true;
		}, () => false);
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
			entries.push({ words: MB_BlockSearch.searchWords(spec, extraWords), libName, spec, category, isKit });
		}
	}

	// searching

	search(searchString) {
		// The entries matching the query, best first, ten at most. A prefix of a
		// word ranks above a part of one, and the shipped libraries' blocks fill
		// what rows are left once readLibraries() has read them.

		const max = MB_BlockSearch.maxMatches;
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

	pictureFor(entry) {
		// A canvas of the entry's block at the world's zoom (see zoomedImage), redrawn
		// smaller when it is taller than two rows, so that a few tall blocks cannot
		// crowd out the rest of a list.

		const aBlock = ('lib' === entry.kind) ? MB_Specs.blockForSpec(entry.spec, entry.category) : entry.block;
		aBlock.fixLayout();
		const height = aBlock.fullBounds().height();
		const maxHeight = 62 * blockScale();
		if (height <= maxHeight) return zoomedImage(aBlock);
		const factor = maxHeight / height;
		const smaller = aBlock.fullCopy();
		MB_editor.resizeBlock(smaller, factor, blockScale() * factor);
		const small = smaller.fullBounds().extent();
		if (small.y <= maxHeight) return zoomedImage(smaller);
		// Block layout does not scale quite linearly, so trim what is left over.
		const w = Math.floor((small.x * maxHeight) / small.y);
		const result = newCanvas(new Point(w, maxHeight).multiplyBy(ZOOM));
		result.getContext('2d').drawImage(zoomedImage(smaller), 0, 0, w * ZOOM, maxHeight * ZOOM);
		return result;
	}

	// recently taken blocks

	recents() {
		// Entries for the blocks last taken, newest first, without any the project no longer has.

		const result = [];
		const vars = MB_editor.visibleVars();
		for (const desc of MB_BlockSearch.recents) {
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
		return result.map((block) => ({ kind: 'block', block }));
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

	pickUp(entry) {
		// Put the entry's block in an empty hand, to be dropped as one dragged from the
		// palette is, and answer whether it went. A block the project has is in the hand
		// when this returns; one from a library comes once it has loaded, so this answers
		// a promise of it, and the block follows the pointer until the next click.

		if ('lib' === entry.kind) {
			return this.importedLibraryBlock(entry.libName, entry.spec).then((block) => this.grabNewBlock(block));
		}
		return this.grabNewBlock(entry.block);
	}

	async place(entry) {
		// Add the entry's block below the scripts and scroll to it, for the keyboard,
		// as the pointer may be anywhere while it is in use.

		let block;
		if ('lib' === entry.kind) {
			MB_BlockSearch.recordRecent('op ' + entry.spec[1]);
			block = await this.importedLibraryBlock(entry.libName, entry.spec);
		} else {
			block = entry.block;
			MB_BlockSearch.recordRecent(this.recentDescriptorFor(block));
		}
		block.isTemplate = false;
		block.isDraggable = true;
		MB_editor.addToBottom(block);
		MB_editor.scriptChanged(); // as a dropped block is
		MB_editor.scrollScriptsToShow(block.fullBounds());
	}

	async importedLibraryBlock(libName, spec) {
		// Load the library, with the libraries it depends on, and answer a block
		// for the spec, as the loaded library defines it.

		// Two quick takes from one library load it once.
		let loading = MB_BlockSearch.imports.get(libName);
		if (!loading) {
			const unread = [];
			loading = MB_editor.installLibraryNamed(libName, unread)
				.then(() => MB_editor.informCouldNotRead(unread))
				.finally(() => MB_BlockSearch.imports.delete(libName));
			MB_BlockSearch.imports.set(libName, loading);
		}
		await loading;
		this.buildIndex();
		const project = MB_editor.project;
		const lib = project.libraryNamed(libName);
		const loaded = MB_Specs.specArrayForProjectSpec(project.blockSpecs.get(spec[1]));
		return MB_Specs.blockForSpec(loaded || spec, lib ? lib.moduleCategory : 'Library');
	}

	grabNewBlock(aBlock) {
		// Put the block in the hand if it is empty, and count it as taken. It is a copy
		// of nothing, so it is not a template.

		if (world.hand.children.length > 0) return false;
		MB_BlockSearch.recordRecent(this.recentDescriptorFor(aBlock));
		aBlock.isTemplate = false;
		aBlock.isDraggable = true;
		aBlock.fixLayout();
		aBlock.setPosition(world.hand.position().subtract(10));
		world.hand.grab(aBlock);
		return true;
	}
}

class MB_BlockSearchBox {
	static keyTaken = false; // the box acted on the key the IDE is about to see

	static open() {
		// Show the box, or give the keys back to the one already showing.

		const existing = world.children.find((m) => m.searchBox instanceof MB_BlockSearchBox);
		if (existing) {
			existing.searchBox.startEditing();
			return existing.searchBox;
		}
		const box = new MB_BlockSearchBox();
		world.add(box.morph);
		box.morph.fullChanged(); // nothing else paints it until the pointer passes over
		box.startEditing();
		box.showRecents();
		// Reading every shipped library takes a while, so start while the box opens.
		box.blockSearch.readLibraries().then((read) => { if (read) box.libraryIndexReady(); });
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
		// GP's colours: blueGray 700 with a blueGray 500 outline and a blueGray 400 hint
		// in dark mode.
		const textColor = dark ? new Color(230, 230, 230) : new Color(30, 30, 30);
		const hintColor = dark ? new Color(120, 126, 156) : new Color(150, 150, 150);

		// GP's size at every block size: screen pixels, not world units.
		const px = screenPixels;
		this.morph = new BoxMorph(px(8), px(1), dark ? new Color(96, 103, 139) : new Color(150, 150, 150));
		this.morph.color = dark ? new Color(69, 74, 100) : new Color(240, 240, 240);
		this.morph.setExtent(new Point(Math.min(px(440), world.width() - px(20)), px(40)));
		this.morph.setCenter(new Point(world.center().x, 0));
		this.morph.setTop(world.top() + px(8));
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
		// GP's Text: Arial, on the baseline GP's block text is drawn on.
		this.searchText = new StringMorph('', px(20), null, false, false, false, null, null, textColor, 'Arial');
		this.searchText.render = renderBlockString;
		this.searchText.isEditable = true;
		this.searchText.setPosition(this.morph.position().add(new Point(px(40), px(8))));
		this.morph.add(this.searchText);
		this.hintText = new StringMorph(localized('search blocks and variables...'), px(20), null, false, false,
			false, null, null, hintColor, 'Arial');
		this.hintText.render = renderBlockString;
		this.hintText.setPosition(this.searchText.position());
		this.morph.add(this.hintText);

		this.menu = null;
		this.matches = [];
		this.pendingSearch = null;
		this.lastEditMSecs = 0;
		this.blockSearch = new MB_BlockSearch();
	}

	searchIcon() {
		// A magnifying glass at the left of the box, GP's: a 15 pixel glass in gray
		// 150, drawn at a little over half opacity.

		const icon = new Morph();
		icon.setExtent(new Point(screenPixels(15), screenPixels(15)));
		icon.setPosition(this.morph.position().add(new Point(screenPixels(12), screenPixels(12))));
		icon.render = (ctx) => {
			ctx.scale(screenPixels(1), screenPixels(1)); // drawn in screen pixels
			ctx.globalAlpha = 130 / 255;
			ctx.strokeStyle = 'rgb(150, 150, 150)';
			ctx.lineWidth = 1.5;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.arc(6, 6, 4.5, 0, 2 * Math.PI);
			ctx.moveTo(9.5, 9);
			ctx.lineTo(9.5 + (6.5 * Math.SQRT1_2), 9 + (6.5 * Math.SQRT1_2));
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

	libraryIndexReady() {
		// Show the shipped libraries' matches for a query typed before they were read.

		if (!this.morph.parent || this.pendingSearch) return;
		const s = this.searchText.text;
		if ('' !== s) {
			this.matches = this.blockSearch.search(s);
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
		this.matches = this.blockSearch.search(s);
		this.showMatchesMenu(true);
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
		const rows = this.matches.map((m) => [m.kind, this.blockSearch.pictureFor(m),
			('lib' === m.kind) ? this.libraryLabel(m.libName) : null, () => this.grab(m)]);
		let rowW = this.morph.width() - screenPixels(12);
		for (const row of rows) rowW = Math.max(rowW, (row[1].width + (row[2] ? row[2].width + 16 : 0)) / ZOOM);
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
		// GP's menu: blueGray 50 with a blueGray 100 border, the row under the
		// pointer or the arrow keys yellow.
		const yellow = new Color(254, 215, 34);
		menu.color = new Color(236, 237, 241);
		menu.borderColor = new Color(207, 209, 220);
		menu.edge = screenPixels(2);
		for (const item of menu.children) {
			if (item instanceof MenuItemMorph) {
				item.color = menu.color;
				item.highlightColor = yellow;
				item.pressColor = yellow;
			} else {
				item.color = menu.borderColor; // the line above the library blocks
			}
			item.rerender();
		}
		if (this.matches.length > 0) this.layOutRows(menu);
		menu.rerender();
		menu.setPosition(this.morph.bottomLeft());
		if (menu.right() > world.right()) menu.setLeft(Math.max(world.left(), world.right() - menu.width()));
		const maxHeight = Math.floor(world.bottom() - this.morph.bottom()) - screenPixels(12);
		if (menu.height() > maxHeight) {
			const scroller = menu.scroll();
			menu.bounds.corner.y = menu.top() + maxHeight;
			scroller.setHeight(menu.bottom() - scroller.top() - screenPixels(4));
			scroller.adjustScrollBars();
		}
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

	layOutRows(menu) {
		// GP's menu of pictures (Menu's buildMorph): every row the menu's full width one
		// pixel inside its border, with no gap above the first, and its picture 6 pixels
		// in and 1 down. Morphic insets its rows by 4 and its labels by 4 more.

		const px = screenPixels;
		const items = menu.children;
		const w = Math.max(...items.map((m) => (m instanceof MenuItemMorph) ? m.label.width() : 0)) + px(12);
		let y = menu.top() + px(1);
		for (const item of items) {
			const isRow = item instanceof MenuItemMorph;
			item.setPosition(new Point(menu.left() + px(1), y));
			item.setExtent(new Point(w, isRow ? item.label.height() + px(2) : px(1)));
			if (isRow) item.label.setPosition(item.position().add(new Point(px(6), px(1))));
			y = item.bottom();
		}
		menu.setExtent(new Point(w + px(2), y + px(1) - menu.top()));
	}

	libraryLabel(libName) {
		// The gray name shown on a block from a library the project does not have yet,
		// in GP's Arial rather than the menu's sans-serif.
		const label = new StringMorph(libName, screenPixels(11), null, false, false, false, null, null,
			new Color(120, 120, 120), 'Arial');
		return zoomedImage(label);
	}

	rowImage(blockImage, labelImage, rowW) {
		// One result row as a morph: the block, and any library name against the right
		// edge. The pictures are at the world's zoom, as is the row.

		let row = blockImage;
		if (labelImage || (blockImage.width < (rowW * ZOOM))) {
			row = newCanvas(new Point(rowW * ZOOM, blockImage.height));
			const ctx = row.getContext('2d');
			ctx.drawImage(blockImage, 0, 0);
			if (labelImage) {
				ctx.drawImage(labelImage, row.width - (labelImage.width + 4),
					Math.floor(Math.max(0, blockImage.height - labelImage.height) / 2));
			}
		}
		const morph = new Morph();
		morph.bounds.setExtent(new Point(row.width, row.height).divideBy(ZOOM));
		morph.render = (ctx) => ctx.drawImage(row, 0, 0, morph.width(), morph.height());
		return morph;
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

	showRecents() {
		// While the query is empty, the blocks last taken.

		this.matches = this.blockSearch.recents();
		this.showMatchesMenu(false);
	}

	// taking a block

	grab(match) {
		this.dismiss();
		this.blockSearch.pickUp(match);
	}

	placeSelectedMatch() {
		// Enter: place the highlighted match. With nothing to place, keep typing.

		this.runPendingSearch();
		if (!this.menuIsOpen() || (this.matches.length === 0)) {
			this.startEditing();
			return;
		}
		const m = this.selectedMatch();
		this.dismiss();
		this.blockSearch.place(m);
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
				this.matches = this.blockSearch.search(s);
				this.showMatchesMenu(true);
			} else if (MB_BlockSearch.recents.length > 0) {
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
