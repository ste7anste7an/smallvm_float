// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-editor.js - MicroBlocks top-level editor.

/* global MB_BlockSearchBox, MB_Files, MB_FilePicker, MB_LibraryImportDialog, MB_LibraryInfoDialog, MB_Parser, MB_Specs, MB_Project, Color, Point, BlockMorph, ReporterBlockMorph, ScriptsMorph, ScrollFrameMorph, StringMorph, world */

class MB_Editor {
	constructor() {
		this.palette = null;
		this.scripts = null;
		this.project = new MB_Project();
		this.codeManager = new MB_CodeManager(this.project);
		MB_connection.setCodeManager(this.codeManager); // so chunk CRCs from the board reach it
		this.readFromBoard = false;
		this.projectName = null; // the file name a save should use
		this.lastProjectFolder = 'Examples'; // where the file picker opens
		this.lastLibraryFolder = 'Libraries'; // and where it opens for a library
		this.runningChunks = new Map(); // used for block highlighting
		this.stoppingHighlights = new Map(); // block -> timer that unhighlights it
		this.resultBubbles = new Map(); // block -> the bubble showing its value
		this.blockForResultImage = null; // the script to save a picture of when its result arrives
		this.chunkErrorListeners = []; // called with each decoded board error
		// Turns the board's four location bytes into a site, called with the bytes
		// and then the message's own chunk id; the chunk the fault is in is the
		// low byte of the location. Null sends every error to the task's chunk.
		this.errorDecoder = (location, chunkID) => this.decodeErrorLocation(location, chunkID);
		this.saveNeeded = false; // the scripts changed since the last step
		this.exportedScriptScale = 0.65; // block scale of a script picture, set by the chrome
		this.lastTransferPercent = null; // the last transfer percentage sent to the chrome
		this.spinnerShowing = false; // the chrome is showing the spinner this port raised
		this.unsavedEdits = false; // the project changed since it was last opened or saved
		this.category = null; // the selected palette category, or null while a library is
		this.library = null; // the selected library's name, or null while a category is
		this.paletteY = 0; // where the next block goes while the palette is being filled
		this.undoStack = [];
		this.redoStack = [];
		this.watchProjectVariables();
		this.blockSize = 100;
	}

	open(world) {
		this.paletteWidth = 208;

		this.palette = new ScrollFrameMorph();
		this.palette.contents.acceptsDrops = true;
		this.palette.contents.reactToDropOf = (droppedMorph) => {
			if ((droppedMorph instanceof BlockMorph) || (droppedMorph instanceof SelectedScriptsMorph)) {
				droppedMorph.destroy();
				this.scriptChanged(); // its chunk is deleted at the next step
			}
		};

		// The scripting pane scrolls, so a script taller than the window can
		// be reached without dragging it off the pane.
		this.scripts = new ScriptsMorph();
		this.scriptsFrame = new ScrollFrameMorph(this.scripts);
		// What FrameMorph's constructor would have set; ScriptsMorph takes no
		// scroll frame, and adjustBounds does nothing without one.
		this.scripts.scrollFrame = this.scriptsFrame;
		// The scripting pane scrolls itself while a block is dragged near its edge; the palette does not.
		this.scriptsFrame.enableAutoScrolling = false;
		this.palette.enableAutoScrolling = false;

		// The panes exist now, so they can take their colours. This is the only
		// place that gives them one, here and on every later change.
		this.applyDarkMode();

		world.add(this.palette);
		world.add(this.scriptsFrame);
		this.paletteResizer = this.newPaneResizer();
		world.add(this.paletteResizer); // after the panes, so it is in front

		// A right-click that no morph answers opens nothing.
		world.contextMenu = () => null;

		// morphic asks each of the world's own morphs whether the page is holding
		// work, and warns before the browser unloads it if any says yes
		// (WorldMorph.hasUnsavedEdits, morphic.js).
		this.scriptsFrame.hasUnsavedEdits = () => this.hasUnsavedEdits();

		// While a chrome dialog's field has the keys, a click on the world does not take them
		// back, as gpSupport.js passes GP no keys while GP.delegateKeyboardEvents is set.
		if (world.keyboardHandler) world.keyboardHandler.focus = function () {
			if (!((typeof GP === 'object') && GP.delegateKeyboardEvents)) HTMLTextAreaElement.prototype.focus.call(this);
		};

		// Escape with nothing being edited goes to the chrome, as GP's Page sends it. Until
		// morphic refocuses its keyboard textarea after a click, the key goes to the body.
		// The IDE's keys act unless a chrome dialog has them. Morphic handles a key before
		// this listener, ending an edit or closing a menu, so who had the keys is read first.
		// A key aimed at text no longer in the world frees the keys and goes no further,
		// not even to morphic. A removed morph keeps its parent, so the text is gone when
		// any ancestor has let it go.
		const gone = (m) => (m.parent !== null) && (!m.parent.children.includes(m) || gone(m.parent));
		if (world.keyboardHandler) document.addEventListener('keydown', (event) => {
			if (!world.cursor || !gone(world.cursor.target)) return;
			world.stopEditing();
			event.stopPropagation();
			event.preventDefault();
		}, true);
		let morphicHadKeys = false;
		document.addEventListener('keydown', () => { morphicHadKeys = !!(world.keyboardFocus || world.activeMenu); }, true);
		if (world.keyboardHandler) document.addEventListener('keydown', (event) => {
			if (MB_BlockSearchBox.tookKey()) return; // first, so the mark never outlives its key
			if (morphicHadKeys || ![document.body, world.keyboardHandler].includes(event.target)) return;
			if (event.isComposing || (229 === event.keyCode)) return; // an input method is composing
			const spinnerWasUp = this.spinnerShowing; // Escape below cancels it
			if ('Escape' === event.key) fireIDEEvent('ide.keyPressed', 'ESC');
			if ((typeof GP === 'object') && GP.delegateKeyboardEvents) return;
			if (this.shortcutKey(event, spinnerWasUp) || this.searchKey(event) || this.scripts.selectionKey(event)
				|| this.scrollKey(event)) event.preventDefault();
		});

		// A block released on the world rather than on a pane, as under the tip bar, slides back
		// to where it was picked up. A duplicate with nowhere to return to is discarded, and one
		// grabbed again mid-slide comes back here with no hand, so it is kept in view.
		world.reactToDropOf = (morph, hand) => {
			if (!((morph instanceof BlockMorph) || (morph instanceof SelectedScriptsMorph))) return;
			if (hand && hand.grabOrigin) morph.slideBackTo(hand.grabOrigin);
			else if (hand) morph.destroy();
			else {
				this.scripts.add(morph);
				morph.keepWithin(this.scriptsFrame);
				if (morph instanceof SelectedScriptsMorph) morph.unpackInto(this.scripts);
			}
		};

		// WorldMorph.fillPage hands every direct child the new bounds when the
		// browser window resizes.
		this.palette.reactToWorldResize = () => this.fixLayout();
		this.scriptsFrame.reactToWorldResize = () => this.fixLayout();
		this.fixLayout();

		// The tip bar sits at the bottom of the window and says what the block
		// under the pointer does.
		if (typeof MB_Tips !== 'undefined') MB_Tips.open();

		// Start on Control, the category shown whenever no library is selected.
		this.selectCategory('cat;Control');
		return this;
	}

	fixLayout() {
		// Two panes, filling the world canvas above the tip bar, if there is one.
		// open lays out before MB_Tips.open builds the bar, so this uses its fixed height.

		let height = world.height();
		if (typeof MB_Tips !== 'undefined') height -= MB_Tips.height;
		this.palette.setPosition(world.position());
		this.palette.setExtent(new Point(this.paletteWidth, height));
		this.scriptsFrame.setPosition(
			world.position().add(new Point(this.paletteWidth, 0)));
		this.scriptsFrame.setExtent(
			new Point(world.width() - this.paletteWidth,
			this.palette.height()
		));
		if (this.paletteResizer) {
			this.paletteResizer.setPosition(this.palette.topRight());
			this.paletteResizer.setExtent(new Point(15, this.palette.height()));
		}
	}

	newPaneResizer() {
		// A strip over the left edge of the scripting area. Dragging it sets the
		// palette's width, from 90 to 600 and no closer than 25 to the world's right edge.
		const resizer = new Morph();
		resizer.color = new Color(180, 180, 255);
		resizer.alpha = 0; // drawn only while the pointer is over it
		let offset = 0;
		const highlight = (on) => {
			resizer.alpha = on ? 0.6 : 0;
			resizer.changed();
		};
		// A block being carried passes through to the scripting area below.
		resizer.topMorphAt = (point) => (world.hand.children.length ? null : Morph.prototype.topMorphAt.call(resizer, point));
		resizer.mouseEnter = () => highlight(true);
		resizer.mouseLeave = () => highlight(false);
		resizer.mouseDownLeft = (pos) => {
			offset = pos.x - resizer.left();
			resizer.lockMouseFocus();
		};
		resizer.mouseMove = (pos, button) => {
			if (button !== 'left') return;
			const right = pos.x - offset - this.palette.left();
			this.paletteWidth = Math.max(90, Math.min(right, 600, world.width() - 25));
			this.fixLayout();
		};
		return resizer;
	}

	scriptsPane() { return this.scripts; }

	removeAllScripts() {
		this.scriptsPane().cancelSelection();
		let allScripts = this.scriptsPane().children.slice();
		allScripts.forEach((m) => { m.destroy(); });
		this.removeResultBubbles(); // they sit on the world, not in the pane
	}

	addBlockToScriptsAt(b, x, y) {
		// Add the given block to the scripts pane at the given position.
		// x and y are relative to the pane, which is what updateProject records.

		let scriptsPane = this.scriptsPane();
		b.setPosition(scriptsPane.position().add(new Point(x, y)));
		b.category = MB_Specs.categoryForSelector(b.selector);
		b.setColor(b.colorFor(b.category));
		scriptsPane.add(b);
		scriptsPane.adjustBounds();
		scriptsPane.changed();
	}

	randomBetween(min, max) {
		min = Math.ceil(min);
		max = Math.floor(max);
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	// ***** Copy and paste *****

	exchangeScripter() {
		// What MB_ScriptExchange asks of the scripter it imports into and exports from.
		return {
			project: () => this.project,
			scriptEditor: () => this.scriptsPane(),
			installLibraryNamed: (libName) => this.installLibraryNamed(libName),
			blockScale: () => 1, // the block size magnifies the whole world, so pane and file units are equal
		};
	}

	async installLibraryNamed(libName) {
		// Take a shipped library into the project by the name its own module line
		// declares, which is what a copied script's depends line carries.

		if (this.project.libraryNamed(libName)) return;
		const filePath = await this.fileNameForLibraryNamed(libName);
		if (!filePath) return; // a name no shipped library declares
		const data = await MB_Files.readFile(filePath);
		if (data === undefined) return;
		await this.importLibraryFromString(data, filePath);
	}

	// Scripts written before a library was renamed still name it the old way.
	static renamedLibraries = new Map([
		['HSV Colors', 'Color'],
		['VL53L0X', 'Distance (VL53L0X)'],
		['CutebotPRO', 'Cutebot Pro'],
	]);

	async fileNameForLibraryNamed(libName) {
		// The shipped file whose module line declares this name. Building the
		// index reads every shipped library once, so it is kept.

		const wanted = MB_Editor.renamedLibraries.get(libName) || libName;
		// Nearly every library is in a file named after the module it declares,
		// and checking one file is worth a second of reading the whole set.
		const named = this.findLibraryFile(wanted);
		if (named && (wanted === MB_Editor.libraryNameIn(await MB_Files.readFile(named)))) return named;

		// Kept as the promise, not the map: a caller arriving while the reads are
		// still going waits for the finished index rather than reading an empty one.
		// What is kept has to be worth keeping, so an index is not built before the
		// file list arrives, one whose reads failed is dropped, and one that is short
		// a file it could not read reads that file again when a name goes unfound.
		const paths = MB_Files.allFilesIn('Libraries').filter((p) => p.endsWith('.ubl'));
		if (0 === paths.length) return null;
		if (!this.embeddedLibraries) {
			this.embeddedLibraries = this.readLibraryIndex(paths);
			this.embeddedLibraries.catch(() => { this.embeddedLibraries = null; });
		}
		const index = await this.embeddedLibraries;
		// Every name the index holds was read out of a file, so a name it answers
		// for is right and only a name it does not answer for is in doubt. The files
		// that could not be read are the only ones that can settle that, so they are
		// the only ones read again: a file briefly out costs the next call one read,
		// where rebuilding the index would cost it all 223.
		if (!index.has(wanted) && this.unreadLibraryFiles.length) {
			this.embeddedLibraries = this.readLibrariesInto(index, this.unreadLibraryFiles);
			this.embeddedLibraries.catch(() => { this.embeddedLibraries = null; });
			await this.embeddedLibraries;
		}
		return index.get(wanted) || null;
	}

	async readLibraryIndex(paths) {
		// Every shipped library's declared name, against the file that declares it.
		return this.readLibrariesInto(new Map(), paths);
	}

	async readLibrariesInto(index, paths) {
		// The reads go out together: sequentially this is a second of waiting with
		// nothing on screen. A later file wins, so the order is kept. A file that
		// could not be read answers undefined, which declares no name at all, so it
		// is held aside as unread rather than taken for a file with nothing to say.
		const texts = await Promise.all(paths.map((p) => MB_Files.readFile(p)));
		const unread = [];
		paths.forEach((filePath, i) => {
			if (undefined === texts[i]) { unread.push(filePath); return; }
			const name = MB_Editor.libraryNameIn(texts[i]);
			if (name) index.set(name, filePath);
		});
		this.unreadLibraryFiles = unread;
		return index;
	}

	static libraryNameIn(data) {
		// The name a library file's module line declares. A quoted name ends at
		// its closing quote, because the line may carry a category after it.

		for (const line of String(data == null ? '' : data).split('\n')) {
			if (!line.startsWith('module')) continue;
			const rest = line.slice('module'.length).trim();
			if (!rest.startsWith("'")) return rest.split(/\s+/)[0] || null;
			const end = rest.indexOf("'", 1);
			return (end < 0) ? null : rest.slice(1, end);
		}
		return null;
	}

	async importEmbeddedLibrary(libName) {
		// Take the shipped library a dependency names into the project, by the
		// name of its file. A leading underscore asks for it as an implementation
		// library, whose blocks serve another library and are not offered alone.

		const asImplementation = libName.startsWith('_');
		const wanted = asImplementation ? libName.slice(1) : libName;
		const filePath = this.findLibraryFile(wanted);
		if (!filePath) return; // a name no shipped file answers to
		if (this.libraryHoldingFile(wanted, filePath)) return;
		const data = await MB_Files.readFile(filePath);
		if (data === undefined) return;
		await this.importLibraryFromString(data, filePath, asImplementation);
	}

	findLibraryFile(libName) {
		// The shipped file of a library's name. A name may carry a folder, as
		// 'Robots/CoCube Module' does, so the match is anchored at a separator,
		// which keeps a longer name ending the same way from answering for it.

		const suffix = '/' + libName + '.ubl';
		for (const filePath of MB_Files.allFilesIn('Libraries')) {
			if (filePath.endsWith(suffix)) return filePath;
		}
		return null;
	}

	libraryHoldingFile(libName, filePath) {
		// A library already in the project that a dependency name asks for. Its
		// module name and the name of its file differ for a handful of shipped
		// libraries, so both are worth asking about.

		const shippedPath = this.project.withoutExtension(filePath.slice('Libraries/'.length));
		for (const lib of this.project.libraries.values()) {
			if ((lib.moduleName === libName) || (lib.path === shippedPath)) return lib;
		}
		return null;
	}

	async installDependenciesOf(libName) {
		// Bring in the libraries a library names, and the ones those name in turn.

		const lib = this.project.libraryNamed(libName);
		if (!lib) return;
		for (const dependency of lib.dependencies) {
			// a loaded library already implements this dependency
			if (this.project.replacementFor(lib.dependencyName(dependency))) continue;
			if (dependency.startsWith('http')) {
				await this.importLibraryDependencyFromUrl(dependency);
			} else {
				await this.importEmbeddedLibrary(dependency);
			}
		}
	}

	async importLibraryDependencyFromUrl(dependency) {
		// Fetch a dependency named by its web address. A version requirement after a '#'
		// is not checked.

		const hash = dependency.lastIndexOf('#');
		await this.importLibraryFromUrl((hash < 0) ? dependency : dependency.slice(0, hash));
	}

	scriptStringFor(aBlock) {
		// The text that copying the script aBlock is in writes.

		const exporter = new MB_ScriptExchange(this.project);
		return 'GP Script\n' + exporter.exportScripts(this.exchangeScripter(), [aBlock.topBlock()]);
	}

	allScriptsString() {
		// The text that copying the whole scripts pane writes.

		return this.scriptsString(this.scriptsPane().children.filter((m) => m instanceof BlockMorph));
	}

	scriptsString(blocks) {
		// The text that copying the scripts with the given top blocks writes.

		const exporter = new MB_ScriptExchange(this.project);
		return 'GP Scripts\n' + exporter.exportScripts(this.exchangeScripter(), blocks);
	}

	scriptsURL(pageURL) {
		// A link that pastes every script in the pane when opened.
		return this.urlPrefix(pageURL) + '#scripts=' + MB_ScriptExchange.urlEncode(this.allScriptsString());
	}

	projectURL(pageURL) {
		// A link that opens this project when opened.
		this.updateProject();
		let code = this.project.codeString();
		if (this.projectName) {
			const title = this.projectName.replace(/\.ubp$/, '');
			code = "projectName '" + fixEmbeddedQuotes(title) + "'\n\n" + code;
		}
		return this.urlPrefix(pageURL) + '?project=' + MB_ScriptExchange.urlEncode(code);
	}

	urlPrefix(pageURL) {
		// The page address up to and including .html, else without its query and fragment.
		const i = pageURL.indexOf('.html');
		if (i >= 0) return pageURL.slice(0, i + 5);
		return pageURL.split(/[?#]/)[0];
	}

	handlePaste(event) {
		return this.pasteScriptText(event.data);
	}

	pasteScriptText(text) {
		// Both a browser paste event and the chrome's paste menu item arrive here.
		if (!text.startsWith('GP Script')) return; // ignore non-script paste
		return this.pasteScripts(text.slice(text.indexOf('\n') + 1));
	}

	async pasteScripts(scriptString, dst) {
		// Add the scripts and custom blocks in scriptString to the project, keeping the
		// distances between scripts. dst is the pane-relative top-left of the group;
		// by default the group goes below the lowest script.

		let pane = this.scriptsPane();
		scriptString = scriptString.replace(/\r\n?/g, '\n');
		for (const entry of MB_Parser.parse(scriptString) || []) {
			let script = Array.isArray(entry) && entry[0] === 'script' ? entry[entry.length - 1] : null;
			if (Array.isArray(script) && Array.isArray(script[0])) script = script[0];
			if (Array.isArray(script) && script[0] === 'to') this.hideDefinition(stringArg(script[1]));
		}
		if (!dst) dst = new Point(100, this.scriptsBottom() - pane.top() + (30 * blockScale()));
		const importer = new MB_ScriptExchange(this.project);
		await importer.importScripts(this.exchangeScripter(), scriptString, pane.left() + dst.x, pane.top() + dst.y);
		pane.adjustBounds();
		pane.changed();

		this.updateProject();
		try {
			await this.codeManager.saveAllChunksAfterLoad();
		} catch (e) {
			this.reportError(e);
		}
		this.scriptChanged();
	}

	importFromPNG(pngBytes) {
		// Paste the scripts a picture carries, if it carries any.
		let s = MB_ScriptPicture.getScriptText(pngBytes);
		if (s == null) return;
		return this.pasteScripts(s.slice(s.indexOf('\n') + 1));
	}

	hideDefinition(funcName) {
		// Remove the pane's definition hat for funcName; a paste that defines it brings its own.
		const pane = this.scriptsPane();
		for (const m of pane.children.slice()) {
			if (this.isDefinitionHatFor(m, funcName)) {
				if (pane.selection && pane.selection.includes(m)) pane.cancelSelection();
				m.destroy();
			}
		}
	}

	showDefinition(func) {
		// One definition hat per function, and never a second for the same one.
		if (func == null) return;
		if (this.definitionShown(func.functionName)) return;
		this.addToBottom(scriptForFunction(func));
	}

	definitionShown(funcName) {
		return this.definitionHatFor(funcName) != null;
	}

	showFunctions(functions) {
		for (const func of functions) this.showDefinition(func);
		this.updateProject();
	}

	hideFunctions(functions) {
		for (const func of functions) this.hideDefinition(func.functionName);
		this.updateProject();
	}

	functionsOfLibrary(libName) {
		const lib = this.project.libraryNamed(libName);
		return lib ? lib.functions : [];
	}

	exportMyBlocksAsLibrary() {
		// Main's own blocks as a library file, under the name the user gives it.
		// Nothing is written if the dialog is dismissed.

		return this.prompt(localized('Library name?'), 'my library').then((libName) => {
			if (!libName) return;
			this.updateProject();
			this.saveTextAsFile(this.project.main.codeString(this.project, libName), libName + '.ubl');
		});
	}

	scriptsBottom() {
		// The bottom of the lowest script in the pane, or the pane's top if it has none.
		let result = this.scriptsPane().top();
		for (const m of this.scriptsPane().children) {
			if (m instanceof BlockMorph) result = Math.max(result, m.fullBounds().bottom());
		}
		return result;
	}

	// ***** Populate the blocks palette *****

	currentCategory() { return this.category; }
	currentLibrary() { return this.library; }

	selectCategory(cat) {
		// Show one category's blocks and tell the IDE which. Deselects the library.

		this.category = cat;
		this.library = null;
		this.updatePalette();
		this.tellIDE('currentCategory', cat);
	}

	selectLibrary(libName) {
		// Show one library's blocks and tell the IDE which. Deselects the category.

		this.library = libName;
		this.category = null;
		this.updatePalette();
		this.tellIDE('currentCategory', libName);
	}

	applyUserPreferences() {
		// Resize, recolour and refill for a preference that changes the canvas,
		// and leave the user on the library or category they were showing. Only
		// a selection that is no longer there falls back.

		const percent = this.readUserPreferences().blockSizePercent;
		if (typeof percent === 'number' && Number.isFinite(percent)) {
			this.applyBlockSize(Math.max(25, Math.min(500, percent)));
		}
		this.applyDarkMode();
		this.tellIDE('libraryList', this.libraryList());
		const showing = this.library ? this.project.libraryNamed(this.library) : this.category;
		if (showing) {
			this.updatePalette();
		} else {
			this.selectCategory('cat;Control');
		}
	}

	libraryList() {
		// The project's libraries as the IDE's library buttons want them. An
		// implementation library holds another library's working parts and is
		// offered only where those are.

		let result = [];
		for (const lib of this.project.libraries.values()) {
			if (this.showHiddenBlocks() || !lib.isImplementationLib()) {
				result.push({ label: lib.moduleName, category: lib.moduleCategory });
			}
		}
		result.sort((a, b) => (a.label < b.label) ? -1 : ((a.label > b.label) ? 1 : 0));
		return result;
	}

	updateLibraryList() {
		// Tell the IDE which libraries the project has and, unless a library
		// that is still there is selected, select cat;Control. Called after a project change.

		this.tellIDE('libraryList', this.libraryList());
		if (this.library && this.project.libraryNamed(this.library)) {
			this.updatePalette();
		} else {
			this.selectCategory('cat;Control');
		}
	}

	updatePalette() {
		// Empty the palette and refill it from the current selection.

		if (!this.palette) return;
		let contents = this.palette.contents;
		contents.children.slice().forEach((m) => { m.destroy(); });
		contents.setPosition(this.palette.position()); // scroll back to the top
		this.paletteY = contents.top() + 10;
		if (this.library) {
			this.addBlocksForLibrary(this.library);
		} else if ('cat;Variables' == this.category) {
			this.addVariableBlocks();
			this.addAdvancedBlocksForCategory(this.category);
		} else if ('cat;My Blocks' == this.category) {
			this.addMyBlocks();
		} else {
			this.addBlocksForCategory(this.category);
		}
		contents.adjustBounds();
		this.palette.changed();
	}

	userPreference(pref) {
		// A preference from the IDE object the pure Javascript build keeps them
		// in (userPreference, ide.js); a page without one reads every one off.

		try {
			return (typeof IDE != 'undefined') && (IDE.userPreference(pref) == true);
		} catch (e) {
			return false;
		}
	}

	devMode() {
		return this.userPreference('devMode');
	}

	darkMode() {
		return this.userPreference('darkMode');
	}

	paneColors() {
		// The pane, scrollbar handle and section label colours for the mode the
		// IDE is in. The dark three are the IDE's blueGray family, the same
		// values the chrome's stylesheet uses either side of the canvas.

		return this.darkMode()
			? {
				palette: new Color(62, 66, 89),
				scripts: new Color(55, 59, 79),
				slider: new Color(144, 149, 174),
				label: new Color(144, 149, 174),
			}
			: {
				palette: new Color(180, 180, 180),
				scripts: new Color(150, 150, 150),
				slider: new Color(200, 200, 200),
				label: new Color(0, 0, 0),
			};
	}

	applyDarkMode() {
		// Recolour the panes and their scrollbar handles. setColor rather than
		// the colour field, because only setColor repaints what is already on
		// screen. Block colours are not touched: the mode changes the surfaces
		// blocks sit on and nothing about the blocks.
		//
		// The chrome applies its preferences while it is initialising, which is
		// before open() has built the panes. open() calls this once they exist,
		// so there is nothing to colour until then.

		if (!this.palette) return;
		const colors = this.paneColors();
		this.palette.setColor(colors.palette);
		this.scripts.setColor(colors.scripts);
		this.scriptsFrame.setColor(colors.scripts);
		for (const frame of [this.palette, this.scriptsFrame]) {
			frame.hBar.button.setColor(colors.slider);
			frame.vBar.button.setColor(colors.slider);
		}
	}

	tellIDE(path, value) {
		// The pure Javascript build's chrome reads these from its IDE object
		// (storeIDEProperty, mb-jsAPI.js); a page without that chrome has no one to tell.

		if (typeof storeIDEProperty == 'function') storeIDEProperty(path, value);
	}

	addPaletteBlock(b) {
		b.setPosition(new Point(this.palette.contents.left() + 15, this.paletteY));
		b.isTemplate = true;
		this.palette.contents.add(b);
		this.paletteY += b.height() + 10;
	}

	addPaletteLabel(text) {
		let label = new StringMorph(text, 14);
		label.setColor(this.paneColors().label); // labels are rebuilt, not recoloured
		label.toggleWeight();
		label.setPosition(new Point(this.palette.contents.left() + 5, this.paletteY));
		this.palette.contents.add(label);
		this.paletteY += label.height() + 15;
	}

	addPaletteButton(label, action) {
		// A push button in the palette, in the file picker's button style. The
		// action is a function or the name of a method on the editor.

		const button = new TriggerMorph(this, action, label, 14, null, null, null,
			new Color(20, 20, 20));
		button.color = new Color(220, 220, 220);
		button.highlightColor = new Color(240, 240, 240);
		button.setExtent(new Point(Math.max(30, button.label.width() + 20), 26));
		button.setPosition(new Point(this.palette.contents.left() + 15, this.paletteY));
		this.palette.contents.add(button);
		this.paletteY += button.height() + 7;
	}

	addPaletteBlockForSpec(spec, category) {
		// A spec read from a file may describe no block type blockForSpec knows.

		let b = spec ? MB_Specs.blockForSpec(spec, category) : undefined;
		if (b) this.addPaletteBlock(b);
	}

	addBlocksForSpecs(specs, category) {
		for (const spec of specs) {
			if ('-' == spec) { // separator
				this.paletteY += 15;
			} else {
				this.addPaletteBlockForSpec(spec, category);
			}
		}
	}

	addBlocksForCategory(cat) {
		// The category's blocks then its advanced section. No heading: the
		// selected button in the IDE already carries the name.

		if (!cat) return;
		let name = cat.substring(4); // without the 'cat;' prefix
		this.addBlocksForSpecs(MB_Specs.specsForCategory(cat), name);
		this.addAdvancedBlocksForCategory(cat);
	}

	showHiddenBlocks() {
		// Whether a library's working parts, the names starting with an
		// underscore, are offered. Developer mode as well as the preference:
		// the menu item that sets it is itself offered only in developer mode.

		return this.devMode() && this.userPreference('showImplementationBlocks');
	}

	addBlocksForLibrary(libName) {
		// A library's blocks in the order its block list gives them. Names
		// starting with an underscore are the library's own working parts.

		let lib = this.project.libraryNamed(libName);
		if (!lib) return;
		for (const op of lib.blockList) {
			if ('-' == op) { // separator
				this.paletteY += 15;
			} else if ('advanced' == op) {
				if (!this.devMode()) return; // the rest is for developer mode
				this.paletteY += 15;
				this.addPaletteLabel('Advanced:');
			} else if (this.showHiddenBlocks() || !op.startsWith('_')) {
				let spec = MB_Specs.specArrayForProjectSpec(this.project.blockSpecs.get(op))
					|| MB_Specs.specArrayForSelector(op);
				this.addPaletteBlockForSpec(spec, lib.moduleCategory);
			}
		}
	}

	addVariableBlocks() {
		// Set and change default to the project's first variable and each variable
		// gets a reporter. Delete a variable is offered only when the palette has
		// a variable to delete.

		this.addPaletteButton(localized('Add a variable'), () => this.promptForVariable());
		let varNames = this.visibleVars();
		if (varNames.length > 0) {
			this.addPaletteButton(localized('Delete a variable'), () => this.deleteVariableMenu());
		}
		this.paletteY += 20;
		let defaultVar = (varNames.length > 0) ? varNames[0] : '';
		for (const spec of MB_Specs.specsForCategory('cat;Variables')) {
			if ('-' == spec) { // separator
				this.paletteY += 15;
			} else if (('local' == spec[1]) && !this.devMode()) {
				continue; // initialize local is offered only in developer mode
			} else if ('v' != spec[1]) { // one reporter per variable follows instead
				let s = spec.slice();
				if (('=' == s[1]) || ('+=' == s[1])) s[4] = defaultVar;
				this.addPaletteBlock(MB_Specs.blockForSpec(s, 'Variables'));
			}
		}
		this.paletteY += 15;
		let varSpec = MB_Specs.specArrayForSelector('v');
		let upper = (v) => v.toUpperCase();
		varNames.sort((a, b) => (upper(a) < upper(b)) ? -1 : ((upper(a) > upper(b)) ? 1 : 0));
		for (const varName of varNames) {
			let s = varSpec.slice();
			s[4] = varName;
			this.addPaletteBlock(MB_Specs.blockForSpec(s, 'Variables'));
		}
	}

	addMyBlocks() {
		// The two buttons that make a block, then the main module's functions. A
		// library's functions belong to the library.

		this.addPaletteButton(localized('Add a command block'), () => this.promptForFunction(false));
		this.addPaletteButton(localized('Add a reporter block'), () => this.promptForFunction(true));
		this.paletteY += 8;
		for (const func of this.project.main.functions) {
			if (func.functionName.startsWith('_') && !this.showHiddenBlocks()) continue;
			this.addPaletteBlockForSpec(this.paletteSpecForFunction(func), 'My Blocks');
		}
	}

	paletteSpecForFunction(func) {
		return MB_Specs.specArrayForProjectSpec(this.project.blockSpecs.get(func.functionName))
			|| MB_Specs.specArrayForFunction(func);
	}

	addAdvancedBlocksForCategory(cat) {
		// The category's advanced blocks, shown only in developer mode.

		if (!this.devMode()) return;
		let specs = MB_Specs.specsForCategory(cat + '-Advanced');
		if (specs.length == 0) return;
		this.paletteY += 15;
		this.addPaletteLabel('Advanced:');
		this.addBlocksForSpecs(specs, cat.substring(4));
	}

	searchKey(event) {
		// Ctrl-Space opens the block search box, as does Cmd-Space where the system
		// leaves it to the page. Not while an input method is composing.
		if ((' ' !== event.key) || !(event.ctrlKey || event.metaKey) || event.isComposing) return false;
		MB_BlockSearchBox.open();
		return true;
	}

	scrollKey(event) {
		// The arrows, Page Up, Page Down, Home and End scroll the pane under the pointer,
		// and a held key keeps scrolling. With Cmd, Ctrl or Alt the key is the browser's.
		const steps = { ArrowLeft: [50, 0], ArrowRight: [-50, 0], ArrowUp: [0, 50], ArrowDown: [0, -50] };
		if (event.ctrlKey || event.metaKey || event.altKey) return false;
		if (!(event.key in steps) && !['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return false;
		if ((typeof Menus !== 'undefined') && Menus.current()) return false;
		const frame = world.hand.morphAtPointer().parentThatIsA(ScrollFrameMorph);
		if (!frame) return false;
		const page = Math.round(frame.height() / 3);
		const [dx, dy] = steps[event.key] || { PageUp: [0, page], PageDown: [0, -page], Home: [0, 1e6], End: [0, -1e6] }[event.key];
		if (dx) frame.scrollX(dx);
		if (dy) frame.scrollY(dy);
		frame.adjustScrollBars();
		return true;
	}

	// Run/stop

	async startAll() {
		try {
			this.updateProject();
			await this.codeManager.syncAndStartAll();
		} catch (e) {
			this.reportError(e);
		}
	}

	shortcutKey(event, spinnerWasUp) {
		// Answer whether a key pressed with no text being edited acted. An open chrome menu
		// takes Escape and blocks the rest. Otherwise Escape stops a read from the board first,
		// an open file picker takes Enter and Escape, and Escape stops every script only when
		// there is no spinner to cancel and no selection.
		const menu = (typeof Menus !== 'undefined') && Menus.current();
		const picker = world.children.find((m) => m.picker instanceof MB_FilePicker);
		const letter = (event.ctrlKey || event.metaKey) ? event.key.toLowerCase() : null;
		if (event.repeat || menu) { // a held key acts once
			if (menu && !event.repeat && ('Escape' === event.key)) Menus.close();
			return ['Escape', 'Enter', 'Delete'].includes(event.key) || ['z', 's', 'o', ' '].includes(letter);
		}
		if (('Escape' === event.key) && (this.readFromBoard || (MB_connection.decompiler != null))) {
			MB_connection.stopDecompilation(); // a read from the board, armed or running, goes first
		} else if (picker && ('Escape' === event.key)) {
			picker.picker.removeFromOwner();
		} else if (picker && ('Enter' === event.key)) {
			picker.picker.okay();
			return false; // a selection still runs
		} else if ('Escape' === event.key) {
			if (spinnerWasUp) return true;
			if (this.scripts.hasSelection()) return false;
			this.stopAll();
		} else if (('z' === letter) && (world.hand.children.length === 0)) {
			if (event.shiftKey) this.redo(); else this.undo();
		} else if (('s' === letter) && !event.shiftKey) {
			this.saveProject();
		} else if (('o' === letter) && !event.shiftKey) {
			this.openProjectMenu();
		} else {
			return false;
		}
		return true;
	}

	async stopAll(forceRecompile) {
		try {
			this.updateProject();
			await this.codeManager.stopAndSyncScripts(false, forceRecompile);
		} catch (e) {
			this.reportError(e);
		}
	}

	async stopSyncAndStartAll() {
		// Stop the board, bring it into line with the project, and start it.
		try {
			this.updateProject();
			await this.codeManager.stopAndSyncScripts();
			// Not codeManager.syncAndStartAll: that would sync a second time and can alert "not connected".
			MB_connection.sendMsg('startAllMsg', 1); // chunk type 1 means 16-bit instructions
			await MB_connection.sendQueue; // written before the caller closes the port
		} catch (e) {
			this.reportError(e);
		}
	}

	reportError(e) {
		// Report an error the way GP's error dialog would; inform is the hook the new UI fills in.
		console.error(e);
		this.inform(String(e));
	}

	toggleRunning(aBlock) {
		let top = aBlock.topBlock();
		// A definition is not run from the pane: its code goes to the board with
		// the function it defines, so running the hat would store the same body
		// under a second chunk.
		if (top.isFunctionDefinition()) return;
		let runningChunkID = this.runningChunks.get(top);
		if (runningChunkID !== undefined) {
			MB_connection.sendMsg('stopChunkMsg', runningChunkID);
		} else if ('not connected' == MB_connection.updateConnection()) {
			this.showError(top, localized('Board not connected'));
		} else {
			let chunkID = this.codeManager.ensureChunkIdFor(top);
			this.compileAndRun(top, chunkID);
		}
	}

	async compileAndRun(aBlock, chunkID) {
		// Compile and run the given block.
		if (MB_connection.vmTooOld()) return;

		let code = new MB_Compiler(this.project, this.codeManager).compiledBytesFor(aBlock);
		while ((code.length % 4) !== 0) {
			// pad code with zeros to make chunk length be a multiple of four bytes
			// this ensures 32-bit word chunk alignment in the code store
			code.push(0);
		}

		let chunkType = aBlock.chunkType();
		code.unshift(chunkType); // prepend the chunk type
		MB_connection.sendMsg('chunkCode16Msg', chunkID, code);
		MB_connection.sendMsg('startChunkMsg', chunkID);
	}

	updateRunning(chunkID, isRunning) {
		let runningBlock = this.codeManager.blockForChunkID(chunkID);
		if (!(runningBlock instanceof BlockMorph)) {
console.log('unknown');
			return; // unknown chunk
		}

		// A script that stops keeps its highlight for half a second, so one that
		// runs again at once does not flicker.
		clearTimeout(this.stoppingHighlights.get(runningBlock));
		this.stoppingHighlights.delete(runningBlock);
		if (isRunning) {
			if (!runningBlock.getHighlight()) runningBlock.addHighlight();
			this.runningChunks.set(runningBlock, chunkID);
		} else {
			this.runningChunks.delete(runningBlock);
			this.stoppingHighlights.set(runningBlock, setTimeout(() => {
				this.stoppingHighlights.delete(runningBlock);
				runningBlock.removeHighlight();
			}, 500));
		}
	}

	// Project updating

	scriptChanged() {
		// The next step sends the change to the board, as in GP's MicroBlocksScripter.
		this.saveNeeded = true;
		this.unsavedEdits = true; // until the project is written to a file
	}

	async step() {
		// Called four times a second. Send the scripts to a connected board if they
		// changed, as GP's MicroBlocksScripter step does. Wait while another download runs.
		this.sendTransferPercent(); // before the returns below: a transfer holds them both
		if (!this.saveNeeded || this.codeManager.savesInProgress > 0) return;
		this.saveNeeded = false; // an edit made during the sync below sets it again
		try {
			this.updateProject();
			this.storeUndoState();
			await this.codeManager.syncScripts();
		} catch (e) {
			this.reportError(e);
		}
	}

	sendTransferPercent() {
		// The chrome's spinner draws its ring from spinner.setPercent and has no
		// other source for it. A running transfer keeps its own percentage, so
		// send that on each step while it moves, and nothing while it does not.
		const percent = MB_connection.fileTransferProgress;
		if (percent === this.lastTransferPercent) return;
		this.lastTransferPercent = percent;
		if (percent != null) fireIDEEvent('spinner.setPercent', percent);
	}

	updateProject() {
		// Replace the project scripts with the scripts in the scripting pane.

		let newScripts = [];
		for (const aBlockMorph of this.scriptsPane().children) {
			if (aBlockMorph instanceof BlockMorph) {
				// An edit to a definition in the pane goes back to its function.
				if (aBlockMorph.isFunctionDefinition()) aBlockMorph.updateDefinedFunction();
				let x = Math.round(aBlockMorph.left() - this.scripts.left());
				let y = Math.round(aBlockMorph.top() - this.scripts.top());
				newScripts.push([x, y, aBlockMorph]);
			}
		}
		this.project.main.setScripts(newScripts);
		// Name anything new here: a pasted script, a duplicate, a block dragged
		// into its own script. Everything the pane holds comes through this.
		this.project.main.assignScriptIds();
	}

	// ***** Libraries *****

	librariesChanged() {
		// A library came or went: stop the board and forget the variable names it
		// was told.

		MB_connection.sendMsg('stopAllMsg');
		this.clearRunningHighlights();
		this.codeManager.clearVariableNames();
		this.scriptChanged(); // the next step sends the board the changed code
	}

	removeLibraryNamed(libName) {
		// Take a library out of the project, then tell the board and the IDE.

		this.project.removeLibraryNamed(libName);
		this.librariesChanged();
		this.updateLibraryList();
	}

	exportLibrary(libName) {
		// A library's own source in a file named after it.

		let lib = this.project.libraryNamed(libName);
		if (!lib) return;
		this.saveTextAsFile(lib.codeString(this.project), lib.moduleName + '.ubl');
	}

	showLibraryInfo(libName) {
		// A read-only window with a library's description, version, author and dependencies.

		const lib = this.project.libraryNamed(libName);
		if (!lib) return;
		new MB_LibraryInfoDialog(lib).open(world);
	}

	async reloadLibrary(libName) {
		// Replace a library with the shipped file of its name and show it. Only a
		// library with a shipped path qualifies; one that arrived with the project
		// or from elsewhere has none and is left alone.

		let lib = this.project.libraryNamed(libName);
		if (!lib || (lib.path == null) || lib.path.startsWith('/')) return;
		const filePath = this.findLibraryFile(libName);
		if (!filePath) return;
		const data = await MB_Files.readFile(filePath);
		if (!data) return;
		await this.importLibraryFromString(data, filePath);
	}

	importLibrary() {
		// Show the library picker on the shipped libraries. Its Computer button
		// leads to the browser's chooser, whose file arrives at processDroppedFile.

		const open = MB_FilePicker.findOpen(world);
		if (open) open.removeFromOwner();
		const dialog = new MB_LibraryImportDialog((path) => this.openLibraryFile(path), this.lastLibraryFolder);
		dialog.filePicker.onSelectCloud(() => this.promptLibraryURL(dialog.filePicker));
		dialog.open(world);
	}

	async promptLibraryURL(picker) {
		// Ask for the web address of a library and import it, closing the picker if it arrives.

		const url = await this.prompt(localized('Library URL?'), 'https://');
		if (!url) return;
		if (!(url.endsWith('.ubl') || url.endsWith('.ubp')) || (url.lastIndexOf('/') < 10)) {
			this.inform(localized('Invalid URL'));
			return;
		}
		if (!(await this.importLibraryFromUrl(url))) return;
		picker.removeFromOwner();
		await this.codeManager.saveAllChunksAfterLoad(); // a connected board takes the new chunks
	}

	async importLibraryFromUrl(fullUrl) {
		// Fetch a library from the web and import it. Answers true if it arrived.

		const failed = (msg) => {
			this.informAndWait(localized(msg), 'Could not fetch library');
			return false;
		};
		let response = null, text = null;
		try {
			response = await fetch(MB_Editor.codebergFileURL(fullUrl) || fullUrl);
			if (response.ok) text = await response.text();
		} catch (e) {
			// A host that is down and one whose answer the browser will not let a page
			// read (no Access-Control-Allow-Origin) both arrive here, and look the same.
			return failed('The host may be down, or may not allow web pages to read it.');
		}
		if (404 === response.status) return failed('File not found in server.');
		if (!text || !text.startsWith('module ')) {
			return failed('That URL does not return a MicroBlocks library.');
		}
		return null !== (await this.importLibraryFromString(text, fullUrl));
	}

	static codebergFileURL(fullUrl) {
		// The API address of a Codeberg file link, or null if it is not one:
		// OWNER/REPO/{src|raw}/{branch|commit|tag}/REF/PATH becomes api/v1/repos/OWNER/REPO/raw/PATH?ref=REF

		const prefix = ['https://codeberg.org/', 'http://codeberg.org/'].find((p) => fullUrl.startsWith(p));
		if (!prefix) return null;
		const parts = fullUrl.slice(prefix.length).split('?')[0].split('/');
		if (parts.length < 6) return null;
		const [owner, repo, route, refKind, ref] = parts;
		if (!['src', 'raw'].includes(route)) return null;
		if (!['branch', 'commit', 'tag'].includes(refKind)) return null;
		const filePath = parts.slice(5).join('/');
		if (!filePath) return null;
		return `https://codeberg.org/api/v1/repos/${owner}/${repo}/raw/${filePath}?ref=${ref}`;
	}

	async openLibraryFile(filePath) {
		// Take a library file the picker chose into the project.

		this.lastLibraryFolder = filePath.slice(0, filePath.lastIndexOf('/') + 1);
		const data = await MB_Files.readFile(filePath);
		if (data === undefined) {
			this.inform(localized('Could not read: ') + filePath);
			return;
		}
		if (await this.importLibraryFromString(data, filePath)) {
			await this.codeManager.saveAllChunksAfterLoad(); // a connected board takes the new chunks
		}
	}

	async importLibraryFromString(data, filePath, asImplementation) {
		// Add a library to the project with the libraries it depends on, and show
		// it, replacing one of the same name and any implementing the same library.
		// A filePath under Libraries leaves the library a path the reload verb can
		// read it back from, and a web address is passed on as its source; a bare
		// file name from the user's computer leaves neither. Answers the module
		// name, or null.

		const isURL = /^https?:\/\//.test(filePath);
		const namePath = isURL ? filePath.split('?')[0] : filePath;
		const fileName = namePath.slice(namePath.lastIndexOf('/') + 1);
		const libName = this.project.withoutExtension(fileName);
		const problems = [];
		if (!this.definesALibrary(data, problems)) {
			const msg = (problems.length > 0) ? 'Could not read: ' : 'No library found in: ';
			this.inform(localized(msg) + fileName);
			return null;
		}
		// A shown hat of a library being replaced would otherwise stay on the
		// pane, defining a block the project no longer has.
		const replacing = this.project.libraryNamed(libName);
		this.hideLibraryDefinitions(replacing);
		const oldLibs = Array.from(this.project.libraries.values());
		const moduleName = this.project.addLibraryFromString(data, libName, isURL ? filePath : '//' + filePath);
		for (const old of oldLibs) {
			if (!this.project.libraryNamed(old.moduleName)) this.hideLibraryDefinitions(old); // one it replaced
		}
		if (asImplementation && (!replacing || replacing.isImplementationLib())) {
			this.project.libraryNamed(moduleName).beImplementation();
		}
		// A library replacing one of its own name keeps the dependencies the
		// project already resolved for it; a new one needs them brought in.
		if (!replacing) await this.installDependenciesOf(moduleName);
		this.codeManager.recompileNeeded(); // its functions were loaded anew
		this.librariesChanged();
		this.updateLibraryList();
		this.selectLibrary(moduleName); // last, so a dependency's own select does not win
		this.reportReplacedLibraries(this.project.libraryNamed(moduleName), oldLibs);
		return moduleName;
	}

	reportReplacedLibraries(lib, oldLibs) {
		// Tell the user which of oldLibs, no longer in the project, lib replaced.

		if (!lib) return;
		const msg = [];
		for (const old of oldLibs) {
			if ((old.moduleName !== lib.moduleName) && !this.project.libraryNamed(old.moduleName) && lib.replaces(old)) {
				msg.push(localized('%1 replaces %2').replace('%1', lib.moduleName).replace('%2', old.moduleName) + '.');
			}
		}
		if (msg.length > 0) this.inform(msg.join('\n'));
	}

	definesALibrary(data, problems = []) {
		// Whether a file's text would give the project a library with anything in
		// it. A library's block specs are its 'spec' commands and its functions
		// its 'to' commands, so one of either is the whole question. A file with
		// neither, such as an empty one or a web page saved by mistake, would add
		// a library button over an empty palette and say nothing about why.

		let cmdList = null;
		try {
			cmdList = MB_Parser.parse(data, '<string>', problems);
		} catch (e) {
			return false;
		}
		if (problems.length > 0) return false; // only the part before the damage would load
		for (const cmd of cmdList || []) {
			if (Array.isArray(cmd) && (('spec' === cmd[0]) || ('to' === cmd[0]))) return true;
		}
		return false;
	}

	hideLibraryDefinitions(lib) {
		// Take the definition hats of a library's functions off the scripting pane.

		if (!lib) return;
		for (const func of lib.functions) this.hideDefinition(func.functionName);
	}

	// Custom blocks and variables. Each takes the answer the chrome's dialog
	// collected; none asks the user anything.

	uniqueFunctionName(baseSpec) {
		// Make the first word of baseSpec unlike any block op, built in or the
		// project's. A spec that starts with an input gets the word 'f' first.
		MB_Specs.initialize();
		const taken = [...MB_Specs.selectorToSpec.keys(), ...this.project.blockSpecs.keys()];
		let words = String(baseSpec).split(/\s+/).filter((w) => w.length > 0);
		if ('_' === words[0]) words.unshift('f');
		words[0] = uniqueNameNotIn(taken, words[0]);
		return words.join(' ');
	}

	uniqueVarName(varName, forScriptVar = false) {
		// Make varName unlike any global, and unless forScriptVar, unlike any
		// local or for-loop variable in a script. Function bodies are not read.
		this.updateProject();
		const taken = this.project.allVariableNames();
		if (!forScriptVar) {
			for (const entry of this.project.scriptsToScan()) {
				if (entry[2]) forEachExpression(entry[2].expression(), (node) => {
					if (['local', 'for'].includes(node.selector)) taken.push(node.args[0]);
				});
			}
		}
		return uniqueNameNotIn(taken, varName);
	}

	visibleVars() {
		// The globals the palette offers. A name starting with an underscore is a
		// library's own working variable, shown only with implementation blocks.

		return this.project.allVariableNames().filter((v) => this.showHiddenBlocks() || !v.startsWith('_'));
	}

	async promptForVariable() {
		// Ask for a name and make a global of it. An unanswered prompt gives null,
		// which createVariable would take for a name. Answers the name added.

		const name = await this.prompt(localized('New variable name?'), '');
		if (!name) return null;
		return this.createVariable(name);
	}

	deleteVariable(name) {
		// Remove the global from main and from every library that declares it.

		this.project.deleteVariable(name);
		this.updatePalette();
	}

	deleteVariableMenu() {
		// Offer the palette's variables and delete the one chosen.

		const names = this.visibleVars();
		if (0 === names.length) return;
		const menu = new MenuMorph((choice) => this.deleteVariable(choice));
		for (const name of names) menu.addItem(name, name);
		menu.popUpAtHand(this.palette.world());
	}

	createVariable(name) {
		// Add a global to main under a unique form of name. Answers the name
		// added, or null for a blank answer.
		const varName = String(name).trim();
		if ('' === varName) return null;
		const result = this.uniqueVarName(varName);
		this.project.addVariable(result);
		this.updatePalette();
		return result;
	}

	async promptForFunction(isReporter) {
		// Ask for a name and define a block of it, a command or a reporter. An
		// unanswered prompt gives null, which createFunction would take for a name.

		const name = await this.prompt(localized('Enter function name:'), 'myBlock');
		if (!name) return;
		this.createFunction(name, isReporter);
	}

	createFunction(name, isReporter) {
		// Define a function with no inputs under a unique form of name and park
		// its definition below the scripts. Answers the definition hat.
		name = String(name).trim();
		if ('' === name) return null;
		this.updateProject();
		const opName = this.uniqueFunctionName(name);
		const func = this.project.main.defineFunction(opName, [], null);
		if (this.hasCallsTo(opName)) recompileNeeded(); // a caller of a deleted function of this name
		this.project.recordBlockSpec(opName, { blockType: isReporter ? 'r' : ' ',
			opName, specString: opName, slotTypes: '', defaults: [] });
		const hat = scriptForFunction(func);
		if (isReporter) hat.nextBlock(MB_Parser.blockForDecompiled(
			{ selector: 'return', args: [0], isReporter: false, next: null }));
		this.addToBottom(hat);
		this.updatePalette();
		this.scriptChanged();
		return hat;
	}

	hasCallsTo(op) {
		// Answer whether any function or script calls op.
		return this.usersOf(op) > 0;
	}

	deleteFunction(name) {
		// Remove the function from the module that holds it, library or main,
		// with its spec and any definition of it in the pane. Calls to it stay.
		for (const m of this.scriptsPane().children.slice()) {
			if ((m instanceof BlockMorph) && m.isFunctionDefinition() &&
				(m.definedFunctionName() === name)) m.destroy();
		}
		this.updateProject();
		const func = this.project.functionNamed(name);
		if (func == null) return;
		const modules = [this.project.main, ...this.project.libraries.values()];
		modules.find((m) => m.functions.includes(func)).removeFunction(func);
		this.project.deleteBlockSpecFor(name);
		this.updatePalette();
		this.scriptChanged();
		this.updateProjectProperties();
	}

	usersOf(op) {
		// How many scripts and function bodies call op, counted the way the
		// warning before a delete counts them: once each, not once per call.
		const uses = (node) => {
			let found = false;
			forEachExpression(node, (n) => { found = found || (n.selector === op); });
			return found;
		};
		let count = 0;
		for (const f of this.project.allFunctions()) if (f.cmdList && uses(f.cmdList.expression())) count++;
		for (const entry of this.project.scriptsToScan()) if (entry[2] && uses(entry[2].expression())) count++;
		return count;
	}

	findUsers(aBlock, purpose) {
		// Show a menu of the functions, then the scripts in the pane, that use aBlock:
		// 'users' call it, 'accessors' read the variable it names, 'modifiers' set it.
		const isUse = this.useTest(aBlock, purpose);
		const functions = this.project.allFunctions().filter((f) => {
			if ('users' === purpose) return f.allCalls().includes(aBlock.selector);
			let found = false;
			f.forAllBlocks((b) => { found = found || isUse(b); });
			return found;
		});
		const scripts = [];
		for (const script of this.scriptsPane().children) {
			if (!(script instanceof BlockMorph)) continue;
			const user = script.allChildren().find((m) => (m instanceof BlockMorph) && isUse(m));
			if (user) scripts.push([script, user]);
		}
		if (functions.length + scripts.length === 0) {
			this.inform(localized({
				users: 'This block is not being used in this project',
				accessors: 'This variable is not being read anywhere in this project',
				modifiers: 'This variable is not being modified anywhere in this project',
			}[purpose]));
			return;
		}
		const items = [];
		let id = 1;
		for (const f of functions) {
			items.push([String(id++), () => this.jumpToUserIn(f.functionName, isUse), null,
				this.pictureOf(this.blockForFunction(f)), '--block']);
		}
		if (functions.length > 0) items.push('-');
		for (const [script, user] of scripts) {
			items.push([String(id++), () => this.jumpToBlock(user), null,
				this.pictureOf(script, 600, 200), '--script']);
		}
		chromeMenuFor(world, items);
	}

	useTest(aBlock, purpose) {
		// Answer a test of one block morph: does it call aBlock, read the variable
		// aBlock names, or set or change that variable.
		const varNameOf = (b) => ('v' === b.selector) ? b.blockSpec : b.inputs()[0].evaluate();
		if ('users' === purpose) return (b) => b.selector === aBlock.selector;
		const varName = varNameOf(aBlock);
		if ('accessors' === purpose) return (b) => ('v' === b.selector) && (b.blockSpec === varName);
		return (b) => ['=', '+='].includes(b.selector) && (varNameOf(b) === varName);
	}

	blockForFunction(func) {
		// A block that calls func, coloured as the palette colours it.
		const lib = [...this.project.libraries.values()].find((m) => m.functions.includes(func));
		return MB_Specs.blockForSpec(this.paletteSpecForFunction(func), lib ? lib.moduleCategory : 'My Blocks');
	}

	pictureOf(aMorph, maxWidth = 2000, maxHeight = 4000) {
		// A PNG data URL of aMorph and everything on it, cut off at maxWidth by maxHeight
		// image pixels. Morphic draws at the ceiling of the device pixel ratio.
		const ratio = Math.ceil(window.devicePixelRatio || 1);
		const pic = newCanvas(aMorph.fullBounds().extent().min(new Point(maxWidth / ratio, maxHeight / ratio)));
		pic.getContext('2d').drawImage(aMorph.fullImage(), 0, 0);
		return pic.toDataURL('image/png');
	}

	jumpToUserIn(funcName, isUse) {
		// Show the definition of funcName and point out the first block in it that isUse accepts.
		this.showAndScrollToDefinition(funcName);
		const hat = this.definitionHatFor(funcName);
		const user = hat && hat.allChildren().find((m) => (m instanceof BlockMorph) && isUse(m));
		if (user) this.jumpToBlock(user);
	}

	jumpToBlock(aBlock) {
		// Scroll aBlock into view and flash it yellow six times so the eye finds it.
		this.scrollScriptsToShow(aBlock.fullBounds());
		(async () => {
			for (let i = 0; i < 6; i++) {
				aBlock.flash(new Color(255, 255, 0));
				await waitMSecs(50);
				aBlock.unflash();
				await waitMSecs(80);
			}
		})();
	}

	definitionHatFor(funcName) {
		return this.scriptsPane().children.find((m) => this.isDefinitionHatFor(m, funcName));
	}

	isDefinitionHatFor(aMorph, funcName) {
		return aMorph instanceof BlockMorph && aMorph.selector === 'to' && aMorph.argList()[0] === funcName;
	}

	showAndScrollToDefinition(funcName) {
		// Show the definition of funcName, adding its hat below the scripts if the
		// pane has none, and scroll the pane to it.
		this.showDefinition(this.project.functionNamed(funcName));
		const hat = this.definitionHatFor(funcName);
		if (hat) this.scrollScriptsToShow(hat.fullBounds());
	}

	scrollScriptsToShow(aRect) {
		// Scroll the scripts pane the least distance that brings aRect into view, or
		// its top-left part when aRect is larger than the visible pane. The vertical
		// scroll bar's width is always kept clear.
		const frame = this.scriptsFrame, pane = this.scriptsPane();
		const right = frame.right() - frame.scrollBarSize;
		const bottom = frame.bottom() - (frame.hBar.isVisible ? frame.scrollBarSize : 0);
		const width = Math.min(aRect.width(), right - frame.left());
		const height = Math.min(aRect.height(), bottom - frame.top());
		let dx = 0, dy = 0;
		if (aRect.left() + width > right) dx = right - (aRect.left() + width);
		else if (aRect.left() < frame.left()) dx = frame.left() - aRect.left();
		if (aRect.top() + height > bottom) dy = bottom - (aRect.top() + height);
		else if (aRect.top() < frame.top()) dy = frame.top() - aRect.top();
		if ((dx === 0) && (dy === 0)) return;
		pane.moveBy(new Point(dx, dy));
		pane.adjustBounds();
		frame.adjustScrollBars();
	}

	async deleteFunctionWithConfirm(name) {
		// Ask before removing a block definition, saying how much of the project
		// still calls the block.
		this.updateProject();
		const users = this.usersOf(name);
		let question = localized('Are you sure you want to remove this block definition?');
		if (users > 0) {
			question = localized('This block is still being used in') + ' ' + users + ' ' +
				localized('scripts or functions.') + '\n\n' + question;
		}
		if (!(await this.confirm(question))) return;
		this.deleteFunction(name);
	}

	copyToClipboard(text) {
		// The chrome's clipboard where there is one, so its paste item can see
		// the text, and the browser's own on a page without the chrome.
		if (typeof setClipboard === 'function') setClipboard(text);
		else navigator.clipboard.writeText(text);
	}

	scriptURL(aBlock, pageURL) {
		// A link that pastes the script aBlock is in when opened.
		return this.urlPrefix(pageURL) + '#scripts=' +
			MB_ScriptExchange.urlEncode(this.scriptStringFor(aBlock));
	}

	helpURLFor(op) {
		// The wiki page for a block, or null. A block the user wrote has none.
		if (typeof MB_Help === 'undefined') return null;
		return MB_Help.wikiURLFor(op);
	}

	changeFunctionPrototype(op, blockType, specString, typeString, defaults, argNames) {
		// Give the function op the prototype the user edited, then fix every
		// call to it in main to match.
		this.updateProject();
		const func = this.project.functionNamed(op);
		if (func) {
			func.argNames = argNames.slice();
			func.localVars = func.collectLocalVars();
		}
		const oldSpec = this.project.blockSpecs.get(op);
		const colourSlots = oldSpec
			? specSlotInfo(oldSpec).map(([type]) => 'color' === type.split('.')[0]) : [];
		// Recorded first: rebuilt calls read their slots from the project's spec.
		this.project.recordBlockSpec(op, { blockType, opName: op, specString,
			slotTypes: typeString, defaults: defaults.slice() });
		// A reporter does not chain and a command does not fit a value slot, so
		// a call that changed shape has to leave the place it was standing in.
		if (oldSpec && (oldSpec.blockType !== blockType)) this.ejectCallsOf(op, 'r' === blockType);
		this.updateCallsOf(op, colourSlots);
		// Its own, because updateCallsOf answers early when the spec is missing.
		this.scriptChanged();
	}

	ejectCallsOf(op, becomesReporter) {
		// Take every call to op out of the script or the function body it sits
		// in and leave it in the scripting area on its own, in the shape its
		// new spec gives it, so the user can pick it up and put it back.
		// Sweeps again while anything moved: an ejected call can carry another
		// call to op inside it, and that one is in a slot of a block the last
		// sweep had not seen.
		let moved = true;
		for (let sweep = 0; moved && (sweep < 100); sweep += 1) {
			moved = false;
			for (const script of this.scriptsPane().children.slice()) {
				if (!(script instanceof BlockMorph)) continue;
				moved = this.ejectCallsFrom(op, becomesReporter, script, null) || moved;
			}
			for (const func of this.project.main.functions) {
				// A definition that is showing was reached through the pane
				// above, because the hat holds the function's own body.
				const showing = this.scriptsPane().children.some((m) => m.functionDefinition === func);
				if (!func.cmdList || showing) continue;
				moved = this.ejectCallsFrom(op, becomesReporter, null, func) || moved;
			}
		}
		this.updateProject();
	}

	ejectCallsFrom(op, becomesReporter, script, func) {
		// Eject each call to op from one script in the pane, or from the body of
		// one function whose definition is not showing, and answer whether any
		// moved. A call already standing on its own is where this would put it,
		// so it is left alone. Each ejection changes the tree, so the next call
		// is looked for afresh.
		const pane = this.scriptsPane();
		let moved = false;
		const gap = 10 * blockScale();
		let at = script ? script.fullBounds().topRight().add(new Point(gap, 0)) : null;
		for (;;) {
			const head = func ? func.cmdList : script;
			if (head == null) return moved;
			const call = head.allBlocks().find((b) => (b.selector === op) && (b.parent !== pane));
			if (call == null) return moved;
			moved = true;
			const node = call.expression();
			if (call === head) {
				// Nothing above it to reattach the rest to, so the rest becomes
				// the body.
				const tail = call.nextBlock();
				if (tail) call.removeChild(tail);
				func.cmdList = tail;
				call.destroy();
			} else if (call instanceof ReporterBlockMorph) {
				call.prepareToBeGrabbed(null);
				call.destroy();
			} else {
				call.extract();
			}
			// Rebuilt rather than reshaped: the shape is decided when a block is
			// built, and nothing turns a command block into a reporter in place.
			const fresh = MB_Parser.blockForDecompiled(
				{ selector: op, args: node.args, isReporter: becomesReporter, next: null });
			if (at) {
				this.addBlockToScriptsAt(fresh, at.x - pane.left(), at.y - pane.top());
				at = at.add(new Point(0, fresh.fullBounds().height() + gap));
			} else {
				this.addToBottom(fresh);
			}
		}
	}

	updateCallsOf(op, colourSlots = []) {
		// Pad or cut every call to op in main's functions and scripts to the
		// inputs its spec declares, and replace a literal of the wrong type with
		// the slot's default. colourSlots says which inputs were colour slots.
		const spec = this.project.blockSpecs.get(op);
		if (spec == null) return;
		const { sections, repeatLast } = specSections(spec);
		const rule = {
			colourSlots,
			minArgs: sections[0].split(/\s+/).filter((w) => '_' === w).length,
			isVariadic: (sections.length > 1) || repeatLast,
			slots: specSlotInfo(spec).map(([type, value]) => {
				type = type.split('.')[0];
				if (('color' === type) && (value == null)) {
					value = { selector: 'colorSwatch', args: [35, 190, 30, 255], isReporter: true, next: null };
				}
				if (('auto' === type) && (typeof value === 'string') && /^-?\d+$/.test(value)) {
					value = Number(value);
				}
				return [type, value];
			}),
		};
		const fixCalls = (node) => {
			let changed = false;
			forEachExpression(node, (n) => {
				if (n.selector === op) changed = fixedCallArgs(n, rule) || changed;
			});
			return changed;
		};

		for (const func of this.project.main.functions) {
			if (!func.cmdList) continue;
			const node = func.cmdList.expression();
			if (!fixCalls(node)) continue;
			func.cmdList = MB_Parser.blockForDecompiled(node);
			this.rehangDefinitionsOf(func);
		}
		// A rebuilt script keeps its id, so its chunk is replaced, not deleted.
		for (const old of this.scriptsPane().children.slice()) {
			if (!(old instanceof BlockMorph) || old.isFunctionDefinition()) continue;
			const node = old.expression();
			if (!fixCalls(node)) continue;
			const fresh = MB_Parser.blockForDecompiled(node);
			fresh.mbScriptId = old.mbScriptId;
			fresh.setPosition(old.position());
			old.destroy();
			this.scriptsPane().add(fresh);
			if (this.runningChunks.has(old)) {
				this.runningChunks.set(fresh, this.runningChunks.get(old));
				this.runningChunks.delete(old);
				fresh.addHighlight();
			}
		}
		this.updateProject();
		this.scriptChanged(); // every rebuilt call is a chunk the board has not got
	}

	rehangDefinitionsOf(func) {
		// Give each definition of func in the pane the function's current body.
		let first = true;
		for (const hat of this.scriptsPane().children) {
			if (!(hat instanceof BlockMorph) || (hat.functionDefinition !== func)) continue;
			if (hat.nextBlock()) hat.removeChild(hat.nextBlock());
			const body = (first || !func.cmdList) ? func.cmdList : func.cmdList.fullCopy();
			if (body) hat.nextBlock(body);
			first = false;
		}
	}

	addToBottom(aBlock) {
		// Put aBlock in the pane, below the lowest script and level with the
		// leftmost one.
		const pane = this.scriptsPane();
		const scripts = pane.children.filter((m) => m instanceof BlockMorph);
		let left = pane.left() + (50 * blockScale());
		let bottom = pane.top();
		for (const script of scripts) {
			left = Math.min(left, script.fullBounds().left());
			bottom = Math.max(bottom, script.fullBounds().bottom());
		}
		aBlock.setPosition(new Point(left, bottom + (10 * blockScale())));
		pane.add(aBlock);
		pane.adjustBounds();
		this.updateProject();
	}

	watchProjectVariables() {
		this.project.onVariableChange = () => this.storeUndoState();
	}

	storeUndoState() {
		// At most 51 code strings: the state being stored and 50 to step back through.
		if (this.undoStack.length > 50) this.undoStack.shift();
		this.undoStack.push(this.project.codeString());
		this.redoStack = [];
		this.undoStateChanged();
	}

	undoAvailable() { return this.undoStack.length > 0; }
	redoAvailable() { return this.redoStack.length > 0; }

	undoStateChanged() {
		fireIDEEvent('scripts.undoAvailable', this.undoAvailable());
		fireIDEEvent('scripts.redoAvailable', this.redoAvailable());
	}

	async restoreUndoState(source) {
		// Undo and redo share this path. Each hands over the code string it wants
		// shown and the project is rebuilt from it, rather than mutated in place.
		this.saveNeeded = false;
		this.project = new MB_Project();
		if (source != null) this.project.loadFromString(source);
		this.watchProjectVariables();
		this.removeAllScripts();
		for (const [x, y, script] of this.project.main.scripts) {
			this.addBlockToScriptsAt(script, x, y);
		}
		this.project.main.assignScriptIds();
		this.updatePalette(); // the restored project may declare other variables and blocks
		this.codeManager.project = this.project;
		this.codeManager.recompileNeeded();
		await this.codeManager.syncScripts();
	}

	async undo() {
		if (this.undoStack.length) this.redoStack.push(this.undoStack.pop());
		await this.restoreUndoState(this.undoStack.at(-1));
		this.undoStateChanged();
	}

	async redo() {
		if (this.redoStack.length) {
			const source = this.redoStack.pop();
			this.undoStack.push(source);
			await this.restoreUndoState(source);
		}
		this.undoStateChanged();
	}

	async updateAfterLanguageChange() {
		// Reconstruct all scripts with the new translation.

		if (this.scripts == null) return; // not yet initialized
		await this.restoreUndoState(this.project.codeString());
	}

	readCustomTranslationFile() {
		// Let the user choose a .po file and use it as a language named after the
		// file. It is not saved as the locale: the server has no such file to load.
		const inp = document.createElement('input');
		inp.type = 'file';
		inp.style.display = 'none';
		inp.accept = '.po';
		inp.addEventListener('cancel', () => inp.remove());
		inp.addEventListener('change', async () => {
			inp.remove();
			const file = inp.files[0];
			if (file) await this.installTranslation(await file.text(), file.name.replace(/\.[^.]*$/, ''));
		});
		document.body.appendChild(inp);
		inp.click();
	}

	async installTranslation(text, langName) {
		// Use the text of a .po file as the strings of the named language.
		GetText.locales[langName] = {};
		GetText.parseLocale(text, langName);
		GetText.currentLocale = langName;
		GetText.localizable.forEach((e) => e.localize());
		await this.updateAfterLanguageChange();
	}

	blockSizePercent() { return this.blockSize; }

	resizeBlock(block, fontFactor, scale = SyntaxElementMorph.prototype.scale) {
		// TextMorph includes multi-line input text, which is separate from StringMorph.
		const parts = block.allChildren();
		for (const part of parts) {
			if (part instanceof SyntaxElementMorph) part.setScale(scale);
			if (part instanceof BlockExpanderMorph) part.setExtent(part.extent().multiplyBy(fontFactor));
			if (part instanceof StringMorph || part instanceof TextMorph) {
				part.setFontSize(part.fontSize * fontFactor);
				part.fixLayout();
				part.rerender();
			}
		}
		for (const part of parts.reverse()) {
			if (part instanceof SyntaxElementMorph) part.fixLayout();
		}
	}

	applyBlockSize(percent) {
		// Keep script positions in project file units while changing the rendered scale.
		this.blockSize = percent;
		world.zoom(Math.max(Math.min(percent, 250), 50) / 100);
		IDE.resize();
	}

	async setBlockScalePercent(percent) {
		if (Number.isFinite(percent) && percent >= 25 && percent <= 300) {
			this.applyBlockSize(percent);
			const prefs = this.readUserPreferences();
			prefs.blockSizePercent = percent;
			localStorage['user-prefs'] = JSON.stringify(prefs);
			this.blockSize = percent;
		}
		await this.codeManager.syncScripts();
	}

	zoomIn() {
		for (const level of [50, 75, 100, 125, 150, 200, 250]) {
			if (level > this.blockSize) return this.setBlockScalePercent(level);
		}
	}

	zoomOut() {
		for (const level of [250, 200, 150, 125, 100, 75, 50]) {
			if (level < this.blockSize) return this.setBlockScalePercent(level);
		}
	}

	restoreZoom() {
		return this.setBlockScalePercent(isMobile() ? 125 : 100);
	}

	readUserPreferences() {
		try {
			const prefs = JSON.parse(localStorage['user-prefs'] || '{}');
			return prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? prefs : {};
		} catch (e) {
			return {};
		}
	}

	saveToUserPreferences(key, value) {
		const prefs = this.readUserPreferences();
		prefs[key] = value;
		localStorage['user-prefs'] = JSON.stringify(prefs);
	}

	// File operations

	async canReplaceCurrentProject() {
		// Ask before discarding work, as GP does (MicroBlocksEditor.gp:203).
		// updateProject() first, or a block the user has just dragged into the
		// pane is not in the project yet and does not count as work.
		this.updateProject();
		if (!this.project.hasUserCode()) return true;
		return this.confirm(localized('Discard current project?'));
	}

	hasUnsavedEdits() {
		// Whether a reload or a tab close would lose work: the project was edited
		// since it was last opened or saved, and there is something left in it.
		// updateProject() first, as canReplaceCurrentProject does, or a block the
		// user has just dragged into the pane is not in the project yet.
		this.updateProject();
		return this.unsavedEdits && this.project.hasUserCode();
	}

	confirm(question) {
		// Answer a promise of true or false from the chrome's dialog, as GP's Page confirm
		// does, or from the browser's own on a page without the chrome.
		if (typeof FloatingWindow === 'undefined') return Promise.resolve(confirm(question));
		return new Promise((resolve) => askChrome('window.confirm',
			{ title: null, text: question, yesLabel: null, noLabel: null }, resolve));
	}

	informAndWait(msg, title) {
		// Answer a promise of true once the user has read msg and clicked Ok. A window
		// closed without clicking Ok never answers.
		if (typeof FloatingWindow === 'undefined') { alert(msg); return Promise.resolve(true); }
		return new Promise((resolve) => askChrome('window.inform',
			{ title: title || null, text: String(msg) }, resolve));
	}

	prompt(question, defaultValue, editRule) {
		// Answer a promise of the text entered, or null, from the chrome's dialog, as GP's
		// Page prompt does, or from the browser's own on a page without the chrome.
		if (typeof FloatingWindow === 'undefined') return Promise.resolve(prompt(question, defaultValue));
		return new Promise((resolve) => askChrome('window.prompt',
			{ title: question, text: null, default: defaultValue, editRule: editRule }, resolve));
	}

	async newProject() {
		if (!(await this.canReplaceCurrentProject())) return;
		this.clearProject();
		// The libraries are gone, then a new project starts on Output.
		this.updateLibraryList();
		this.selectCategory('cat;Output');
	}

	clearProject() {
		this.closeAllDialogs();
		this.project = new MB_Project();
		this.watchProjectVariables();
		this.codeManager = new MB_CodeManager(this.project);
		this.projectName = null;
		MB_connection.setCodeManager(this.codeManager);
		this.removeAllScripts();
		this.updateProjectProperties();

		// Replacing the project erases what the board still holds. Answered rather
		// than awaited, so a caller that downloads afterwards can wait on it and
		// does not have to send a second erase of its own.
		const cleared = MB_connection.clearBoardIfConnected();
		// The empty project is an undo state of its own, so undo can return to it.
		this.storeUndoState();

		// Last before the return, because removeAllScripts above destroys blocks and
		// each of those is an edit. An empty project has nothing to lose.
		this.unsavedEdits = false;
		return cleared;
	}

	closeAllDialogs() {
		// Close whatever the old project left open: everything on the world but the
		// two panes and the divider between them, the chrome's windows (the graph among them),
		// the graph's samples and the spinner.
		// A block in the hand stays, since the hand is not a child of the world.
		const keep = [this.palette, this.scriptsFrame, this.paletteResizer];
		for (const m of world.children.slice()) {
			if (!keep.includes(m)) m.destroy();
		}
		// The port also runs with no DOM, and with a partial one.
		if ((typeof document !== 'undefined') && (typeof document.querySelectorAll === 'function')) {
			document.querySelectorAll('win-').forEach((w) => w.remove());
		}
		if (this.spinnerShowing) fireIDEEvent('spinner.hide');
		this.clearLoggedData();
	}

	updateProjectProperties() {
		// The chrome shows the title without its extension and offers the custom block
		// items when there are any, as GP's updateTitle and setProperty calls do.
		if (typeof storeIDEProperty !== 'function') return; // test.html has no chrome
		storeIDEProperty('project.title', (this.projectName || '').replace(/\.[^.]*$/, ''));
		storeIDEProperty('project.hasCustomBlocks', this.project.main.functions.length > 0);
	}

	saveProject() {
		// Write the project to a file the browser downloads.

		this.updateProject();
		let name = this.projectName || 'Untitled';
		if (!name.endsWith('.ubp')) name += '.ubp';
		this.saveTextAsFile(this.project.codeString(), name);
		this.unsavedEdits = false; // the file holds what the pane holds
	}

	saveTextAsFile(text, fileName) {
		this.saveDataAsFile(text, fileName, 'text/plain');
	}

	saveDataAsFile(data, fileName, mimeType = 'application/octet-stream') {
		// A download is all a web page can do; there is no file system to
		// write to and no path to write it at. data is text or bytes.

		const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	scriptsPicturePNG() {
		// The scripts pane as PNG bytes. A canvas is the only thing in a browser
		// that draws one, and toDataURL the only synchronous way to read it back;
		// a page without a real canvas answers an empty string, and gets null.

		const canvas = this.scriptsPane().scriptsPicture();
		if (!canvas) return null; // no scripts
		return this.canvasPNG(canvas);
	}

	canvasPNG(canvas) {
		const url = canvas.toDataURL('image/png');
		const base64 = url.slice(url.indexOf(',') + 1);
		if (!base64) return null;
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	}

	saveScriptsImage() {
		// A picture of every script, carrying the scripts as text so that the
		// wiki and any MicroBlocks IDE can read them back out of it. It uses the
		// current block scale rather than the export scale, on purpose, so that
		// what is saved is what is on screen.

		const pngBytes = this.scriptsPicturePNG();
		if (pngBytes == null) return;
		const withText = MB_ScriptPicture.addScriptText(pngBytes, this.allScriptsString());
		this.saveDataAsFile(new Uint8Array(withText), 'allScripts' + Date.now() + '.png', 'image/png');
	}

	exportScriptImage(topBlock, result = null, isError = false) {
		// Save a PNG picture of the given script at the export scale, carrying the script's text.
		// If result is not null, include a speech bubble showing the result.

		const start = Date.now();
		const scale = this.exportedScriptScale;
		const px = 2 * scale; // image pixels per block unit, doubled for high resolution
		const script = this.scaledScriptCopy(topBlock, px);
		const fb = script.fullBounds();
		let scriptW = fb.width();
		let scriptH = fb.height();
		if (this.isReporterScript(topBlock)) {
			scriptH += 2 * px; // padding to align reporter and command block bottoms in the Wiki
		}

		let bubble = null, bubbleW = 0, bubbleH = 0, bubbleInsetX = 0, bubbleInsetY = 0;
		if (result != null) {
			bubble = new SpeechBubbleMorph(this.exportBubbleText(String(result), px),
				isError ? new Color(255, 190, 190) : null, 6 * px, px);
			bubbleW = bubble.fullBounds().width();
			bubbleH = bubble.fullBounds().height();
			bubbleInsetX = 5 * scale;
			bubbleInsetY = 5 * scale;
			if (topBlock instanceof HatBlockMorph) bubbleInsetY = (script.height() / 2) + (3 * scale);
		}

		// add an extra pixel all around to allow for anti-aliasing
		scriptW += 2;
		scriptH += 2;

		let pic = newCanvas(new Point(scriptW + bubbleW - bubbleInsetX, scriptH + bubbleH - bubbleInsetY), true);
		const ctx = pic.getContext('2d');
		ctx.drawImage(script.fullImage(), 1, (bubbleH - bubbleInsetY) + 1);
		if (bubble) {
			const adjustment = Math.round(6 * scale); // the bubble's bounds are slightly too large
			const x = (script.width() - bubbleInsetX) + adjustment;
			ctx.drawImage(bubble.fullImage(), x, -adjustment);
			if (topBlock instanceof HatBlockMorph) pic = cropTransparent(pic); // remove extra space
		}

		const pngBytes = this.canvasPNG(pic);
		if (pngBytes == null) return;
		const withText = MB_ScriptPicture.addScriptText(pngBytes, this.scriptStringFor(topBlock));
		if ((Date.now() - start) > 4500) {
			// after ~4.5 seconds the browser wants a click before it will save a file
			this.inform(localized('PNG preparation complete.'));
		}
		this.saveDataAsFile(new Uint8Array(withText), 'scriptImage' + Math.round(performance.now()) + '.png', 'image/png');
	}

	scaledScriptCopy(topBlock, px) {
		// A copy of the script laid out at px pixels per block unit, so it draws sharp at that size.
		const copy = topBlock.fullCopy();
		this.resizeBlock(copy, px, px);
		return copy;
	}

	isReporterScript(topBlock) {
		// A definition counts as the block it defines.
		if (!topBlock.isFunctionDefinition()) return topBlock instanceof ReporterBlockMorph;
		const spec = this.project.blockSpecs.get(topBlock.definedFunctionName());
		return (spec != null) && ('r' === spec.blockType);
	}

	exportBubbleText(aString, px) {
		// The text of a result bubble in a script picture, wrapped at 200 image pixels.
		const text = new TextMorph(aString, 18 * px, 'sans-serif', false, false, 'center', null, 'Arial');
		if (text.width() <= 200) return text;
		return new TextMorph(aString, 18 * px, 'sans-serif', false, false, 'center', 200, 'Arial');
	}

	exportScriptImageWithResult(aBlock) {
		// Run the script and save its picture when the result arrives (see exportResultImage).

		const topBlock = aBlock.topBlock();
		if (topBlock.isFunctionDefinition()) return;
		this.blockForResultImage = topBlock;
		if (!this.codeManager.isRunning(topBlock)) this.codeManager.evalOnBoard(topBlock);
	}

	exportResultImage(aBlock, value, isError) {
		if ((aBlock == null) || (aBlock !== this.blockForResultImage)) return;
		this.blockForResultImage = null;
		// show the result bubble briefly before saving
		setTimeout(() => this.exportScriptImage(aBlock, value, isError), 500);
	}

	browserReadBytes(handler) {
		// Choose any file and hand its bytes to handler, for the board's own file
		// system, where a file is not a project and not text.

		const inp = document.createElement('input');
		inp.type = 'file';
		inp.style.display = 'none';
		inp.addEventListener('cancel', () => inp.remove());
		inp.addEventListener('change', async () => {
			inp.remove();
			const file = inp.files[0];
			if (file) await handler(file.name, new Uint8Array(await file.arrayBuffer()));
		});
		document.body.appendChild(inp);
		inp.click();
	}

	chromeMenu(items) {
		// The chrome draws the menu; items are '-' or [label, action, tip].
		return chromeMenuFor(world, items);
	}

	// ***** The board's file system *****

	async uploadFileToBoard() {
		// Put a file the user chooses onto the board. The chooser takes any file,
		// not just a project.

		await this.browserReadBytes((fileName, bytes) => this.writeFileToBoard(fileName, bytes));
	}

	async writeFileToBoard(fileName, bytes) {
		// Another transfer is running, and its spinner is the one showing.
		if (MB_connection.busy()) return false;
		fireIDEEvent('spinner.show', { title: localized('Writing file to board...'),
			subtitle: fileName, note: null, percent: 0 });
		try {
			return await MB_connection.writeFileToBoard(fileName, bytes);
		} finally {
			fireIDEEvent('spinner.hide');
		}
	}

	async downloadFileFromBoard() {
		// The order is the point: list, offer a menu, read the chosen file, ask,
		// then save.

		const files = await MB_connection.getFileListFromBoard();
		if (files == null) return;
		// The code store is a file on the board and is not one a user wants.
		const names = Object.keys(files).filter((name) => 'ublockscode' !== name).sort();
		if (0 === names.length) return this.inform(localized('No files on board.'));
		this.chromeMenu(names.map((name) => [name, () => this.readAndSaveFile(name, files[name])]));
	}

	async readAndSaveFile(fileName, fileSize) {
		fireIDEEvent('spinner.show', { title: localized('Reading file from board...'),
			subtitle: fileName, note: null, percent: 0 });
		let bytes;
		try {
			bytes = await MB_connection.readFileFromBoard(fileName, fileSize);
		} finally {
			fireIDEEvent('spinner.hide');
		}
		// Null is a transfer the board did not finish, which is not an empty file.
		if (bytes == null) return;
		if (!(await this.confirm(localized('Save file?')))) return;
		this.saveDataAsFile(bytes, fileName);
	}

	async snapshotCode() {
		// Ask the board to save its code in a file, named by the user.
		const title = (this.projectName || '').replace(/\.[^.]*$/, '');
		MB_connection.snapshotCode(await this.prompt(localized('Code file name?'), title));
	}

	openVMFolder() {
		// The server's folder of VM builds, the pilot one when the IDE is a pilot.
		const pilot = ['run-pilot', ':8000'].some((s) => location.href.includes(s));
		window.open('https://microblocks.fun/downloads/' + (pilot ? 'pilot' : 'latest') + '/vm/', '_blank');
	}

	async toggleBLE() {
		// Not a toggle, despite the endpoint's name: it asks and sends the answer
		// either way, so declining sends 0.
		const allow = await this.confirm(localized('Allow the attached board to be connected via BLE?'));
		MB_connection.sendMsg('enableBLEMsg', allow ? 1 : 0);
	}

	openProjectMenu() {
		// Show the file picker on the built-in projects. Its Computer button
		// leads to the browser's chooser.

		const open = MB_FilePicker.findOpen(world);
		if (open) open.removeFromOwner();
		new MB_FilePicker((path) => this.openProjectFromFile(path), this.lastProjectFolder, ['.ubp', '.gpp']).open(world);
	}

	openProject() {
		// Cancelling the picker asks nothing: openProjectFromString asks once a file is chosen.
		this.importLocalFile((fileName, contents) => this.openProjectFromString(contents, fileName));
	}

	async openProjectFromString(contents, name, clearFirst = true) {
		if (!MB_Project.isProjectText(contents)) {
			// Opening it would replace the project, and the board's code, with
			// whatever part of it could be read.
			alert(localized('Could not read: ') + name);
			return;
		}
		if (!(await MB_editor.canReplaceCurrentProject())) return;
		// Asked before anything is cleared, so the open project and the board stay as
		// they are until every question is answered.
		const libraryUpdates = await new MB_Project().checkForNewerLibraryVersions(contents);
		// clearFirst decides whether the empty project becomes an undo state before
		// the new one loads, because clearProject stores one. Clearing therefore
		// adds a step for undo to stop at. A dropped file passes false and skips it.
		const cleared = clearFirst ? MB_editor.clearProject() : null;
		// Without clearProject the old scripts stay on screen, and the next save keeps them.
		if (!clearFirst) MB_editor.removeAllScripts();
		MB_editor.saveNeeded = false; // don't save scripts while project is loading, as GP does
		MB_editor.project.onVariableChange = null;
		MB_editor.project.loadFromString(contents, libraryUpdates);
		MB_editor.watchProjectVariables();
		MB_editor.project.main.scripts.forEach( (entry) => {
			let x = entry[0], y = entry[1], script = entry[2];
			MB_editor.addBlockToScriptsAt(script, x, y);
		});
		MB_editor.codeManager = new MB_CodeManager(MB_editor.project);
		MB_editor.projectName = name;
		MB_connection.setCodeManager(MB_editor.codeManager);
		MB_editor.updateProjectProperties();

		// Without the erase the project that was open keeps running on the board.
		// Awaited: the download below must not overtake the erase. clearProject
		// has already sent one when it ran, so waiting on that is the whole of
		// it; sending a second erases an already empty board and stops it twice.
		await (cleared || MB_connection.clearBoardIfConnected());
		MB_editor.updateLibraryList(); // its libraries, variables and functions reach the palette
		console.log("Loaded:", name,
			MB_editor.project.main.scripts.length, 'scripts,',
			MB_editor.project.allFunctions().length, 'functions'
		);
		// Opening a project ends by downloading it to a connected board.
		await MB_editor.codeManager.saveAllChunksAfterLoad();
		// Keep the opened project as the state an edit can undo back to.
		MB_editor.storeUndoState();
		// Last, for the same reason as in clearProject: loading the project
		// destroys and builds blocks, and each of those is an edit.
		MB_editor.unsavedEdits = false;
	}

	async importFromURL(url) {
		// Open what a page address carries: a scripts fragment is pasted into the
		// project and a project parameter replaces it, fetched first when it names
		// a web address. An address carrying neither does nothing.

		const link = MB_ScriptExchange.fromURL(url);
		if (link == null) return;
		if ('scripts' === link.kind) return this.pasteScripts(link.text);
		if ('projectLink' === link.kind) {
			let text;
			try {
				const response = await fetch(link.url);
				if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
				text = await response.text();
			} catch (error) {
				console.error('Could not read:', link.url, error);
				alert(localized('Could not read: ') + link.url);
				return;
			}
			return this.openProjectFromString(text, link.name);
		}
		if (!MB_ScriptExchange.isCompleteProject(link.text)) {
			// Half a link loads half a project over the one the user had.
			alert(localized('This link is incomplete and was not opened.'));
			return;
		}
		return this.openProjectFromString(link.text, link.name);
	}

	async openProjectFromFile(location) {
		// Open a built-in project, such as one chosen in the file picker.

		this.lastProjectFolder = location.slice(0, location.lastIndexOf('/') + 1);
		const data = await MB_Files.readFile(location);
		if (data === undefined) {
			alert(localized('Could not read: ') + location);
			return;
		}
		await this.openProjectFromString(data, location.slice(location.lastIndexOf('/') + 1));
	}

	browserReadFile(ext) {
		// Let the user choose a file with the browser's file chooser, limited to
		// the extension if one is given. The file is read as a dropped one is.

		const inp = document.createElement('input');
		inp.type = 'file';
		inp.style.display = 'none';
		if (ext) inp.accept = '.' + ext;
		inp.addEventListener('cancel', () => inp.remove());
		inp.addEventListener('change', async () => {
			inp.remove();
			const file = inp.files[0];
			if (file) await this.openDroppedFile(file);
		});
		document.body.appendChild(inp);
		inp.click();
	}

	async processDroppedFile(fileName, data) {
		// Act on a file by its extension: a project, a library, graph data or a
		// picture. Any other file is written to the board, unless it is one the IDE
		// should open. data is the file's text for the first three, and its bytes otherwise.

		const name = fileName.toLowerCase();
		if (name.endsWith('.ubp') || name.endsWith('.ubp.txt')) await this.openProjectFromString(data, fileName, false);
		else if (name.endsWith('.ubl')) {
			if (await this.importLibraryFromString(data, fileName)) {
				await this.codeManager.saveAllChunksAfterLoad();
			}
		}
		else if (name.endsWith('.csv')) this.importLoggedData(data);
		else if (MB_Editor.isScriptPicture(name)) await this.importFromPNG(data);
		else if (name.endsWith('.po')) await this.installTranslation(data, MB_Editor.droppedTranslationName(fileName));
		else if (!MB_Editor.isUnsupportedIDEFile(name)) await this.writeFileToBoard(fileName, data);
	}

	importLoggedData(text) {
		// Replace the graph's data with the file's: one sample a line, its values
		// separated by a comma and a space.
		const lines = text.replaceAll(',', '').split(/\r\n|\r|\n/);
		if (lines[lines.length - 1] === '') lines.pop(); // the final newline
		this.clearLoggedData();
		for (const line of lines) this.addLoggedData(line);
	}

	static droppedTranslationName(fileName) {
		// A dropped .po replaces the current language's strings. English is what
		// every other language falls back to, so it keeps its own and the file
		// becomes a language named after it.
		const current = GetText.currentLocale;
		return (!current || current === 'en') ? fileName.replace(/\.[^.]*$/, '') : current;
	}

	static isTextFile(fileName) {
		// A project, a library, graph data or a translation. Every other file is read as bytes.
		const name = fileName.toLowerCase();
		return ['.ubp', '.ubp.txt', '.ubl', '.csv', '.po'].some((ext) => name.endsWith(ext));
	}

	static isUnsupportedIDEFile(fileName) {
		// Firmware: the IDE's to install, not the board's, though it does not
		// install it yet.
		return fileName.toLowerCase().endsWith('.bin');
	}

	static isScriptPicture(fileName) {
		// A picture has to be read as bytes: the scripts it carries are in a
		// chunk of the file that decoding it as text would not keep.
		return fileName.toLowerCase().endsWith('.png');
	}

	async openDroppedFiles(files) {
		// One at a time, in order: a project load and a board write must not overlap,
		// and the board takes one file transfer at a time.
		for (const file of files) {
			try {
				await this.openDroppedFile(file);
			} catch (e) {
				console.error(e);
			}
		}
	}

	async openDroppedFile(file) {
		// Read one file the user dropped or chose and act on it.
		const data = MB_Editor.isTextFile(file.name)
			? await file.text() : new Uint8Array(await file.arrayBuffer());
		await this.processDroppedFile(file.name, data);
	}

	importLocalFile(callback) {
		async function processFile(file) {
			let txt = await file.text();
			if (callback) callback(file.name, txt);
		}

		var inp = document.createElement('input');
		inp.type = 'file';
		inp.multiple = true;
		inp.addEventListener(
			'change',
			(evt) => {
				document.body.removeChild(inp);
				for (const file of inp.files) {
					processFile(file);
				}
			},
			false
		);
		document.body.appendChild(inp);
		inp.click(); // show the input dialog
	}

	// Connect/Disconnect

	async justConnected() {
		try {
			if (this.readFromBoard) {
				this.readFromBoard = false;
				// Not awaited: justConnected is synchronous here, and nothing after
				// this branch depends on the read having finished.
				this.openProjectFromBoard();
			} else {
				if (!(await this.codeManager.boardHasSameProject())) {
					console.log('Full download');
					await MB_connection.clearBoardIfConnected();
					this.runningChunks = new Map();
				} else {
					console.log('Incremental download', MB_connection.vmVersion, MB_connection.boardType);
					await this.codeManager.deleteChunksOnlyOnBoard(); // uses the CRCs boardHasSameProject just read
				}
				MB_editor.showDownloadProgress(2, 0);
				await this.codeManager.stopAndSyncScripts(true);
				MB_connection.sendMsg('systemResetMsg'); // start the board clean with the code it now holds
			}
		} catch (e) {
			this.reportError(e);
		}
	}

	async openFromBoard() {
		// GP's openFromBoard (MicroBlocksEditor.gp:296): clear the project, then
		// wait for the NEXT board to connect. A board that is already connected
		// is not read; justConnected does the reading, on the next connect.
		if (!(await this.canReplaceCurrentProject())) return;
		this.clearProject();
		this.updateLibraryList(); // no libraries left, so cat;Control
		this.readFromBoard = true;
		alert(localized('Connect board to proceed.'));
	}

	async openProjectFromBoard() {
		// Read what the board is holding and show it, the way openProject shows
		// a project read from a file. readCodeFromBoard is MB_connection's, not
		// this class's.

		// GP asks here too (MicroBlocksRuntime.gp:539), for the user who wrote
		// something between arming the read and connecting the board.
		if (!(await this.canReplaceCurrentProject())) return;

		// The chrome's spinner, with what GP's MicroBlocksSpinner shows while it reads.
		fireIDEEvent('spinner.show', { title: localized('Reading project from board...'),
			subtitle: localized('Do not switch browser tabs!'), note: localized('(press ESC to cancel)'), percent: 0 });
		let project;
		try {
			project = await MB_connection.readCodeFromBoard();
		} finally {
			fireIDEEvent('spinner.hide');
		}
		if (project == null) return;
		// Loaded the way a file is: a block takes its label from the editor's project,
		// so the blocks are built once this project is the editor's.
		this.project = new MB_Project();
		this.project.loadFromString(project.codeString());
		// The text does not record which libraries were loaded as implementations.
		for (const lib of project.libraries.values()) {
			if (lib.isImplementationLib()) this.project.libraryNamed(lib.moduleName).beImplementation();
		}
		this.watchProjectVariables();
		this.removeAllScripts();
		this.project.main.scripts.forEach(
			(entry) => this.addBlockToScriptsAt(entry[2], entry[0], entry[1]));
		this.codeManager = new MB_CodeManager(this.project);
		this.projectName = null;
		this.updateProjectProperties();
		MB_connection.setCodeManager(this.codeManager);
		this.updateLibraryList(); // its libraries, variables and functions reach the palette
		console.log('Read from board:', this.project.main.scripts.length, 'scripts,',
			this.project.allFunctions().length, 'functions');
		// Keep the decompiled project as the state redo can return to.
		this.storeUndoState();
		// The board still holds this project, so leaving the page loses nothing.
		this.unsavedEdits = false;
	}

	// Placeholder functions for UI actopms

	inform(msg) {
		// Shown by the chrome's window.inform dialog, which answers into GP.apiResponses[id].
		console.log(msg);
		this.informCount = (this.informCount || 0) + 1;
		fireIDEEvent('window.inform', { title: null, text: String(msg), id: 'inform' + this.informCount });
	}

	showResult(chunkID, value, isError) {
		// Show a value the board reported next to the block that reported it,
		// or take the last one away when there is nothing to show. GP does both
		// in this one method (MicroBlocksRuntime.gp:2730).
		const block = this.codeManager ? this.codeManager.blockForChunkID(chunkID) : null;
		if (!(block instanceof BlockMorph)) {
			console.log(value); // a chunk this editor does not know
			return;
		}
		this.showResultOn(block, value, isError);
		this.exportResultImage(block, value, isError);
	}

	showResultOn(block, value, isError) {
		this.removeResultBubble(block);
		if ((value == null) || ('' === value)) return;

		const world = block.world();
		if (!world) return;
		const bubble = new SpeechBubbleMorph(
			String(value),
			isError ? new Color(255, 190, 190) : null);
		world.add(bubble);
		bubble.step = () => this.followBlock(bubble, block);
		this.placeResultBubble(bubble, block);
		this.resultBubbles.set(block, bubble);
	}

	followBlock(bubble, block) {
		// Each frame: go when the block is deleted, move when it moves or scrolls.
		// A removed morph keeps its parent, so the block is gone when any link lets go.
		let m = block;
		while (m.parent && m.parent.children.includes(m)) m = m.parent;
		if (!(m instanceof WorldMorph) && !(m instanceof HandMorph)) {
			this.removeResultBubble(block);
			return;
		}
		if (!block.bounds.eq(bubble.blockBounds)) this.placeResultBubble(bubble, block);
	}

	placeResultBubble(bubble, block) {
		// Bottom left of the bubble at the block's right edge, where GP puts it.
		bubble.setPosition(block.rightCenter().add(new Point(2, -bubble.height())));
		bubble.keepWithin(block.world());
		bubble.blockBounds = block.bounds;
	}

	removeResultBubbles() {
		for (const block of [...this.resultBubbles.keys()]) this.removeResultBubble(block);
	}

	removeResultBubble(aBlock) {
		const bubble = this.resultBubbles.get(aBlock);
		if (bubble == null) return;
		bubble.destroy();
		this.resultBubbles.delete(aBlock);
	}

	showError(blockMorph, errorString) {
		// Put the message on the block in a red bubble, the channel a runtime
		// error from the board already uses. A block that is not on screen gets
		// nothing, the corner showChunkError leaves silent for the same reason.
		if (!(blockMorph instanceof BlockMorph)) {
			console.log('Error:', errorString); // for debugging
			return;
		}
		this.showResultOn(blockMorph, errorString, true);
	}

	showChunkError(chunkID, errorString, location)  {
		// Report a runtime error from the board. location is the VM's four
		// location bytes, which name the callee for a fault inside a called
		// function. The balloon goes on the block errorDecoder names when that
		// block is on screen, and otherwise on the chunk that started the task.
		const decoder = this.errorDecoder;
		const raw = (location == null) ? null : Array.from(location);
		const site = (typeof decoder === 'function') ? decoder(raw, chunkID) : null;
		const block = (site && (site.kind === 'block') && this.codeManager)
			? this.codeManager.blockForSite(site.chunkID, site.nodeId) : null;
		this.notifyChunkError({ chunkID: chunkID, errorString: errorString,
			location: raw, decoded: site });
		if ((block instanceof BlockMorph) && block.world()) {
			this.showResultOn(block, errorString, true);
			if (this.codeManager) this.exportResultImage(this.codeManager.blockForChunkID(chunkID), errorString, true);
			return;
		}
		this.showResult(chunkID, errorString, true);
	}

	decodeErrorLocation(location, taskChunkID) {
		// The port's own errorDecoder. Plain data and no morph, so whatever
		// records it can serialise it; blockForSite turns it back into a block.
		const where = MB_connection.errorLocation(location);
		if (where == null) return null;
		const site = this.codeManager
			? this.codeManager.siteForChunkWord(where.chunkID, where.word) : null;
		return { taskChunkID: taskChunkID, chunkID: where.chunkID, word: where.word,
			kind: site ? site.kind : null, scriptId: site ? site.scriptId : null,
			nodeId: site ? site.nodeId : null };
	}

	onChunkError(fn) {
		// Call fn with each board error as plain data: the message's chunk id,
		// the error string, the raw location bytes and the decoder's answer or
		// null. blockForSite turns a decoded site back into its block.
		this.chunkErrorListeners.push(fn);
	}

	notifyChunkError(info) {
		for (const fn of this.chunkErrorListeners) fn(info);
	}

	addLoggedData(value) {
		// One sample from the `graph` block, passed on as read: several series
		// arrive as one string with spaces in it and the graph splits it.
		fireIDEEvent('graph.data', value);
	}

	clearLoggedData() {
		// From the `clear graph` block, which sends clearGraphMsg unprompted.
		fireIDEEvent('graph.clear');
	}

	showDownloadProgress(phase, percent) {
		// phase is 1, 2 or 3 and percent is a fraction, which is the shape the
		// progress ring reads. Callers already pass both that way.
		fireIDEEvent('ide.downloadProgress', [phase, percent]);
	}

	clearRunningHighlights() {
		// Called on disconnect. Everything the board put on the screen goes with
		// it, bubbles included -- GP clears them together too (:2717).
		this.removeResultBubbles();
		for (const [block, timer] of this.stoppingHighlights) {
			clearTimeout(timer);
			block.removeHighlight();
		}
		this.stoppingHighlights = new Map();
		for (const block of this.runningChunks.keys()) block.removeHighlight();
		this.runningChunks = new Map();
	}
}

// Announce something to whatever chrome is listening. Sent on the document
// rather than through IDE.fireEvent, which is the same dispatch, so that the
// port does not require the chrome to be loaded.
function fireIDEEvent(name, value) {
	// The spinner is the chrome's, and no morph here stands for it, so what the
	// port last said about it is the only record that one is up.
	if ('spinner.show' === name) MB_editor.spinnerShowing = true;
	if ('spinner.hide' === name) MB_editor.spinnerShowing = false;
	// Both guards: the port is also loaded with no DOM, and into contexts that
	// supply a partial one where document exists and CustomEvent does not.
	if (typeof document === 'undefined' || typeof CustomEvent === 'undefined') { return; }
	document.dispatchEvent(new CustomEvent(name, { detail: { value: value } }));
}

// The hand's position as the chrome expects GP's: menus.js adds the offset of
// #canvas.emscripten, while the hand is in world units on the world's own canvas,
// which morphic draws ZOOM times larger.
function chromePoint(aWorld) {
	const page = aWorld.worldCanvas.getBoundingClientRect();
	const canvas = document.querySelector('#canvas.emscripten');
	const hand = aWorld.hand.position();
	return {
		x: (hand.x * ZOOM) + page.left - canvas.offsetLeft,
		y: (hand.y * ZOOM) + page.top - canvas.offsetTop
	};
}

// What contextMenu answers when the chrome draws the menu, so the hand opens no Morphic one.
const chromeDrawnMenu = { popUpAtHand() {} };

// Questions put to the chrome and not yet answered, by id. Its menus and dialogs answer
// by writing JSON into GP.apiResponses[id], which GP polls for in its UI loop.
const chromeQuestions = new Map();
let chromeQuestionsPolled = false;

function askChrome(eventName, options, callback) {
	// Fire a menu or dialog event and call back with the chrome's answer.
	const id = nextCallId();
	fireIDEEvent(eventName, Object.assign({ id: id }, options));
	const shown = ('menu' === eventName) ? Menus.current() : [...document.querySelectorAll('win-')].pop();
	chromeQuestions.set(id, { shown: shown, callback: callback });
	if (!chromeQuestionsPolled) {
		chromeQuestionsPolled = true;
		requestAnimationFrame(checkChromeAnswers);
	}
}

function checkChromeAnswers() {
	// A menu or window closed without an answer never gets one, so it is forgotten.
	try {
		for (const [id, question] of chromeQuestions) {
			const json = GP.apiResponses[id];
			if (json !== undefined) {
				delete GP.apiResponses[id];
				chromeQuestions.delete(id);
				question.callback(JSON.parse(json));
			} else if (!(question.shown && question.shown.isConnected)) {
				chromeQuestions.delete(id);
			}
		}
	} finally { // an answer whose action throws must not stop the answers after it
		chromeQuestionsPolled = (chromeQuestions.size > 0);
		if (chromeQuestionsPolled) requestAnimationFrame(checkChromeAnswers);
	}
}

function chromeMenuFor(aWorld, items) {
	// Show items, each '-' or [label, action, tip, image, class], in the chrome's menu.
	// An item with an image, a PNG data URL, shows the picture in place of its label.
	const p = chromePoint(aWorld);
	const descriptors = items.map((item) => {
		if ('-' === item) return { label: '-' };
		const d = { label: item[0], tip: item[2] };
		if (item[3]) Object.assign(d, { image: item[3], class: item[4] });
		return d;
	});
	askChrome('menu', { x: p.x, y: p.y, class: null, items: descriptors }, (label) => {
		const chosen = items.find((item) => item[0] === label);
		if (chosen) chosen[1]();
	});
	return chromeDrawnMenu;
}

// Global singleton instance
const MB_editor = new MB_Editor();

// Debugging Utility Function

function reload(scriptPath) {
	// Run in console to reload a Javascript file without reloading the page.
	// Example: reloadScript('mb-gui.js')
	const newScript = document.createElement('script');
	newScript.src = scriptPath + '?' + new Date().getTime(); // cache busting
	document.body.appendChild(newScript);
}

// --- Global Helper Functions ---

function quoteIfNeeded(s) {
	// Return a quoted version of the given string if necessary for parsing.
	// Otherwise, return the original string.
	// To be unquoted, the string must start with a letter or underscore and must
	// contain only alfanumeric characters (including underscore).

	let mustQuote = false;
	if ((s.length == 0) || !/[a-zA-Z_]/.test(s[0])) { // does not start with a letter or underscore
		mustQuote = true;
	}
	for (const ch of s) {
		if (!/[a-zA-Z0-9_]/.test(ch)) {
			mustQuote = true; // contains a non-alphanumeric character
			break;
		}
	}
	return mustQuote ? ('\'' + fixEmbeddedQuotes(s) + '\'') : s;
}

function fixEmbeddedQuotes(s) {
	// If the given string includes any single quote characters, double them so that the
	// the MicroBlocks parser will treat them as embedded quotes.

	if (!s.includes('\'')) return s;
	return s.replaceAll('\'', '\'\''); // double embedded single quotes
}

async function waitMSecs(msecs) {
	const sleep = function (msecs) {
		return (new Promise( resolve => setTimeout(resolve, msecs) ));
	}
	await sleep(msecs);
}

function localized(s) {
	return GetText.localize(s);
}

function isMobile() {
	return false;
}

function cropTransparent(canvas) {
	// The smallest part of a non-retina canvas that holds all of its non-transparent pixels.
	const w = canvas.width, h = canvas.height;
	const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
	let left = w, top = h, right = -1, bottom = -1;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (data[(((y * w) + x) * 4) + 3] === 0) continue;
			left = Math.min(left, x); right = Math.max(right, x);
			top = Math.min(top, y); bottom = Math.max(bottom, y);
		}
	}
	if (right < 0) return canvas; // nothing drawn
	const result = newCanvas(new Point((right - left) + 1, (bottom - top) + 1), true);
	result.getContext('2d').drawImage(canvas, -left, -top);
	return result;
}

function blockScale() {
	// The pixels-per-unit that block morphs lay themselves out with. GP's
	// blockScale is (global 'blockScale') * (global 'scale') and serves the
	// same purpose: it converts between pane pixels and script-file units.
	return SyntaxElementMorph.prototype.scale;
}

function uniqueNameNotIn(names, baseName) {
	// baseName, or baseName followed by the first of 2, 3, 4... not in names.
	let result = baseName;
	for (let i = 2; names.includes(result); i++) result = baseName + i;
	return result;
}

function forEachExpression(node, fn) {
	// Call fn on every block node in a model node tree: arguments, bodies and
	// the blocks that follow.
	for (let n = node; (n != null) && (typeof n.selector === 'string'); n = n.next) {
		fn(n);
		for (const arg of n.args || []) {
			if ((arg != null) && (typeof arg === 'object')) forEachExpression(arg, fn);
		}
	}
}

function fixedCallArgs(call, rule) {
	// Fix one call node's arguments in place by rule; answer whether any changed.
	// The call's shape, command or reporter, is left as it is.
	const before = JSON.stringify(call.args);
	const args = call.args;
	while (args.length < rule.minArgs) args.push(rule.slots[args.length][1]);
	if (!rule.isVariadic) args.length = rule.minArgs;
	const checked = Math.min(rule.minArgs, args.length, rule.slots.length);
	for (let i = 0; i < checked; i++) {
		const arg = args[i];
		if ((arg != null) && arg.isReporter) continue;
		const [type, value] = rule.slots[i];
		const fits = ('auto' === type) ? ['number', 'string'].includes(typeof arg)
			: ('bool' === type) ? ('boolean' === typeof arg)
			// A rebuilt colour slot holds its colour as a packed number, and a
			// number from any other slot is not a colour.
			: ('color' === type) ? ((('number' === typeof arg) && rule.colourSlots[i]) ||
				((arg != null) && (true === arg.isColor)))
			: true;
		if (!fits) args[i] = value;
	}
	return JSON.stringify(args) !== before;
}

function varMustBeQuoted(varName) {
	// Return true if varName must be enclosed in quotes when serialized.
	// A name must be quoted if it is empty, contains a space, or starts with a digit or '-'.
	if (varName === '') return true;
	if (varName.includes(' ')) return true;
	const ch = varName[0];
	return /\d/.test(ch) || ch === '-';
}

// Clipboard support (XXX TODO maybe move to own file?)

var MB = {};
MB.clipboard = document.createElement('textarea');
MB.clipboard.style.position = 'fixed';
MB.clipboard.style.left = '0px';
MB.clipboard.style.top = '0px';
MB.clipboard.style.width = '1px';
MB.clipboard.style.height = '1em';
MB.clipboard.style.border = '0';
MB.clipboard.style.padding = '0';
MB.clipboard.style.margin = '0';
MB.clipboard.style.outline = 'none';
MB.clipboard.style.opacity = '0';
document.body.appendChild(MB.clipboard);

function setGPClipboard(s) {
	// Called by GP's setClipboard primitive

	GP.clipboardBytes = toUTF8Array(s);
	MB.clipboard.value = s;

	if ((typeof navigator.clipboard !== 'undefined') && (navigator.clipboard.writeText)) {
		navigator.clipboard.writeText(s).catch(() => {});
	} else {
		MB.clipboard.focus();
		MB.clipboard.select();
		try {
			document.execCommand('copy');
		} catch (err) {
			console.error('setGPClipboard failed', err);
		}
	}
}

async function readGPClipboard(s) {
	if ((typeof navigator.clipboard !== 'undefined') && (navigator.clipboard.readText)) {
		var s = await navigator.clipboard.readText().catch(() => {});
		if (s) MB.clipboard.value = s;
	} else {
		MB.clipboard.focus();
		MB.clipboard.select();
		try {
			document.execCommand('paste');
		} catch (err) {
			console.error('readGPClipboard failed', err);
		}
	}
	GP.clipboardBytes = toUTF8Array(MB.clipboard.value);
	return GP.clipboardBytes.length;
}

function toUTF8Array(str) {
	// Convert a Javascript string into an array of UTF8 bytes.
	var utf8 = [];
	for (var i = 0; i < str.length; i++) {
		var charcode = str.charCodeAt(i);
		if (charcode < 0x80) utf8.push(charcode);
		else if (charcode < 0x800) {
			utf8.push(
				0xc0 | (charcode >> 6),
				0x80 | (charcode & 0x3f));
		}
		else if (charcode < 0x10000) {
			utf8.push(
				0xe0 | (charcode >> 12),
				0x80 | ((charcode >> 6) & 0x3f),
				0x80 | (charcode & 0x3f));
		} else if (charcode <= 0x10FFFF) {
			utf8.push(
				0xf0 | (charcode >> 18),
				0x80 | ((charcode >> 12) & 0x3f),
				0x80 | ((charcode >> 6) & 0x3f),
				0x80 | (charcode & 0x3f));
		}
	}
	return utf8;
}

function clipboardText() {
	return new TextDecoder().decode(new Uint8Array(GP.clipboardBytes).buffer);
}
