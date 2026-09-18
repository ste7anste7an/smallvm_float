// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-editor.js - MicroBlocks top-level editor.

/* global MB_Files, MB_FilePicker, MB_Parser, MB_Specs, MB_Project, Color, Point, BlockMorph, ScriptsMorph, ScrollFrameMorph, StringMorph, world */

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
		this.runningChunks = new Map(); // used for block highlighting
		this.resultBubbles = new Map(); // block -> the bubble showing its value
		this.chunkErrorListeners = []; // called with each decoded board error
		// Turns the board's four location bytes into a site, called with the bytes
		// and then the message's own chunk id; the chunk the fault is in is the
		// low byte of the location. Null sends every error to the task's chunk.
		this.errorDecoder = (location, chunkID) => this.decodeErrorLocation(location, chunkID);
		this.saveNeeded = false; // the scripts changed since the last step
		this.category = null; // the selected palette category, or null while a library is
		this.library = null; // the selected library's name, or null while a category is
		this.paletteY = 0; // where the next block goes while the palette is being filled
	}

	open(world) {
		this.paletteWidth = 200;

		this.palette = new ScrollFrameMorph();
		this.palette.color = new Color(180, 180, 180);
		this.palette.contents.acceptsDrops = true;
		this.palette.contents.reactToDropOf = (droppedMorph) => {
			if (droppedMorph instanceof BlockMorph) {
				droppedMorph.destroy();
				this.scriptChanged(); // its chunk is deleted at the next step
			}
		};

		// The scripting pane scrolls, so a script taller than the window can
		// be reached without dragging it off the pane.
		this.scripts = new ScriptsMorph();
		this.scripts.color = new Color(150, 150, 150);
		this.scriptsFrame = new ScrollFrameMorph(this.scripts);
		this.scriptsFrame.color = this.scripts.color;
		// What FrameMorph's constructor would have set; ScriptsMorph takes no
		// scroll frame, and adjustBounds does nothing without one.
		this.scripts.scrollFrame = this.scriptsFrame;

		world.add(this.palette);
		world.add(this.scriptsFrame);

		// While a chrome dialog's field has the keys, a click on the world does not take them
		// back, as gpSupport.js passes GP no keys while GP.delegateKeyboardEvents is set.
		if (world.keyboardHandler) world.keyboardHandler.focus = function () {
			if (!((typeof GP === 'object') && GP.delegateKeyboardEvents)) HTMLTextAreaElement.prototype.focus.call(this);
		};

		// Escape with nothing being edited goes to the chrome, as GP's Page sends it. Until
		// morphic refocuses its keyboard textarea after a click, the key goes to the body.
		if (world.keyboardHandler) document.addEventListener('keydown', (event) => {
			if (('Escape' === event.key) && !world.keyboardFocus &&
				[document.body, world.keyboardHandler].includes(event.target)) {
				fireIDEEvent('ide.keyPressed', 'ESC');
			}
		});

		// A block released on the world rather than on a pane, as under the tip bar, slides back
		// to where it was picked up. A duplicate with nowhere to return to is discarded, and one
		// grabbed again mid-slide comes back here with no hand, so it is kept in view.
		world.reactToDropOf = (morph, hand) => {
			if (!(morph instanceof BlockMorph)) return;
			if (hand && hand.grabOrigin) morph.slideBackTo(hand.grabOrigin);
			else if (hand) morph.destroy();
			else {
				this.scripts.add(morph);
				morph.keepWithin(this.scriptsFrame);
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
	}

	scriptsPane() { return this.scripts; }

	removeAllScripts() {
		let allScripts = this.scriptsPane().children.slice();
		allScripts.forEach((m) => { m.destroy(); });
	}

	addBlockToScripts(b) {
		// For testing. Add the given block to the scripts pane at a random position.

		let scriptsPane = this.scriptsPane();
		b.setPosition(new Point(this.randomBetween(200, 800), this.randomBetween(10, 300)));
		scriptsPane.add(b);
		scriptsPane.adjustBounds();
		scriptsPane.changed();
	}

	addBlockToScriptsAt(b, x, y) {
		// Add the given block to the scripts pane at the given position.
		// x and y are relative to the pane, which is what updateProject records.

		let scriptsPane = this.scriptsPane();
		b.setPosition(scriptsPane.position().add(new Point(x, y)));
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
			blockScale: () => 1, // the pane holds script-file units unscaled
		};
	}

	installLibraryNamed(libName) {
		if (this.project.libraryNamed(libName)) return;
		console.log('XXX TO DO: install library by name:', libName);
	}

	scriptStringFor(aBlock) {
		// The text that copying the script aBlock is in writes.

		const exporter = new MB_ScriptExchange(this.project);
		return 'GP Script\n' + exporter.exportScripts(this.exchangeScripter(), [aBlock.topBlock()]);
	}

	allScriptsString() {
		// The text that copying the whole scripts pane writes.

		const blocks = this.scriptsPane().children.filter((m) => m instanceof BlockMorph);
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
		let s = event.data;
		if (!s.startsWith('GP Script')) return; // ignore non-script paste
		return this.pasteScripts(s.slice(s.indexOf('\n') + 1));
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
		importer.importScripts(this.exchangeScripter(), scriptString, pane.left() + dst.x, pane.top() + dst.y);
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
		for (const m of this.scriptsPane().children.slice()) {
			if (m instanceof BlockMorph && m.selector === 'to' && m.argList()[0] === funcName) m.destroy();
		}
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

	libraryList() {
		// The project's libraries as the IDE's library buttons want them. An
		// implementation library holds another library's working parts and is not offered.

		let result = [];
		for (const lib of this.project.libraries.values()) {
			if (!lib.isImplementationLib()) {
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

	devMode() {
		// Developer mode. The pure Javascript build keeps it in its IDE object's
		// preferences (userPreference, ide.js); a page without one reads off.

		try {
			return (typeof IDE != 'undefined') && (IDE.userPreference('devMode') == true);
		} catch (e) {
			return false;
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
		label.toggleWeight();
		label.setPosition(new Point(this.palette.contents.left() + 5, this.paletteY));
		this.palette.contents.add(label);
		this.paletteY += label.height() + 15;
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
			} else if (!op.startsWith('_')) {
				let spec = MB_Specs.specArrayForProjectSpec(this.project.blockSpecs.get(op))
					|| MB_Specs.specArrayForSelector(op);
				this.addPaletteBlockForSpec(spec, lib.moduleCategory);
			}
		}
	}

	addVariableBlocks() {
		// Set and change default to the project's first variable and each variable
		// gets a reporter. Names starting with an underscore are a library's own
		// and are not shown.

		let varNames = this.project.allVariableNames().filter((v) => !v.startsWith('_'));
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
		// The main module's functions. A library's functions belong to the library.

		for (const func of this.project.main.functions) {
			if (func.functionName.startsWith('_')) continue; // hidden
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

	// Run/stop

	async startAll() {
		try {
			this.updateProject();
			await this.codeManager.syncAndStartAll();
		} catch (e) {
			this.reportError(e);
		}
	}

	async stopAll() {
		try {
			this.updateProject();
			await this.codeManager.stopAndSyncScripts();
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

		if (isRunning) {
			runningBlock.addHighlight();
			this.runningChunks.set(runningBlock, chunkID);
		} else {
			runningBlock.removeHighlight();
			this.runningChunks.delete(runningBlock);
		}
	}

	// Project updating

	scriptChanged() {
		// The next step sends the change to the board, as in GP's MicroBlocksScripter.
		this.saveNeeded = true;
	}

	async step() {
		// Called four times a second. Send the scripts to a connected board if they
		// changed, as GP's MicroBlocksScripter step does. Wait while another download runs.
		if (!this.saveNeeded || this.codeManager.savesInProgress > 0) return;
		this.saveNeeded = false; // an edit made during the sync below sets it again
		try {
			this.updateProject();
			await this.codeManager.syncScripts();
		} catch (e) {
			this.reportError(e);
		}
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

	async reloadLibrary(libName) {
		// Replace a library with the shipped file of its name and show it. Only a
		// library with a shipped path qualifies; one that arrived with the project
		// or from elsewhere has none and is left alone.

		let lib = this.project.libraryNamed(libName);
		if (!lib || (lib.path == null) || lib.path.startsWith('/')) return;
		const libFileName = '/' + libName + '.ubl';
		for (const filePath of MB_Files.allFilesIn('Libraries')) {
			if (!filePath.endsWith(libFileName)) continue;
			const data = await MB_Files.readFile(filePath);
			if (!data) return;
			let moduleName = this.project.addLibraryFromString(data, libName, '//' + filePath);
			this.codeManager.recompileNeeded(); // its functions were loaded anew
			this.librariesChanged();
			this.updateLibraryList();
			this.selectLibrary(moduleName);
			return;
		}
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

	createVariable(name) {
		// Add a global to main under a unique form of name. Answers the name
		// added, or null for a blank answer.
		const varName = String(name).trim();
		if ('' === varName) return null;
		const result = this.uniqueVarName(varName);
		this.project.addVariable(result);
		return result;
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
		return hat;
	}

	hasCallsTo(op) {
		// Answer whether any function or script calls op.
		let found = false;
		const scan = (node) => forEachExpression(node, (n) => { found = found || (n.selector === op); });
		for (const f of this.project.allFunctions()) if (f.cmdList) scan(f.cmdList.expression());
		for (const entry of this.project.scriptsToScan()) if (entry[2]) scan(entry[2].expression());
		return found;
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
		this.updateCallsOf(op, colourSlots);
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

	// File operations

	async canReplaceCurrentProject() {
		// Ask before discarding work, as GP does (MicroBlocksEditor.gp:203).
		// updateProject() first, or a block the user has just dragged into the
		// pane is not in the project yet and does not count as work.
		this.updateProject();
		if (!this.project.hasUserCode()) return true;
		return this.confirm(localized('Discard current project?'));
	}

	confirm(question) {
		// Answer a promise of true or false from the chrome's dialog, as GP's Page confirm
		// does, or from the browser's own on a page without the chrome.
		if (typeof FloatingWindow === 'undefined') return Promise.resolve(confirm(question));
		return new Promise((resolve) => askChrome('window.confirm',
			{ title: null, text: question, yesLabel: null, noLabel: null }, resolve));
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
		this.project = new MB_Project();
		this.codeManager = new MB_CodeManager(this.project);
		this.projectName = null;
		MB_connection.setCodeManager(this.codeManager);
		this.removeAllScripts();
		this.updateProjectProperties();

		// GP clears the board on every project replacement, right after making
		// the new project (MicroBlocksScripter.gp:553). Not awaited: nothing
		// here downloads, and sendMsg keeps the wire in order on its own.
		MB_connection.clearBoardIfConnected();
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
		let name = this.projectName || 'untitled.ubp';
		if (!name.endsWith('.ubp')) name += '.ubp';
		this.saveTextAsFile(this.project.codeString(), name);
	}

	saveTextAsFile(text, fileName) {
		// A download is all a web page can do; there is no file system to
		// write to and no path to write it at.

		const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
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

	async openProjectFromString(contents, name) {
		if (!(await MB_editor.canReplaceCurrentProject())) return;
		MB_editor.saveNeeded = false; // don't save scripts while project is loading, as GP does
		MB_editor.project = new MB_Project();
		MB_editor.project.loadFromString(contents);
		MB_editor.removeAllScripts();
		MB_editor.project.main.scripts.forEach( (entry) => {
			let x = entry[0], y = entry[1], script = entry[2];
			MB_editor.addBlockToScriptsAt(script, x, y);
		});
		MB_editor.codeManager = new MB_CodeManager(MB_editor.project);
		MB_editor.projectName = name;
		MB_connection.setCodeManager(MB_editor.codeManager);
		MB_editor.updateProjectProperties();

		// Without the erase the project that was open keeps running on the board.
		// Awaited: the download below must not overtake the erase.
		await MB_connection.clearBoardIfConnected();
		MB_editor.updateLibraryList(); // its libraries, variables and functions reach the palette
		console.log("Loaded:", name,
			MB_editor.project.main.scripts.length, 'scripts,',
			MB_editor.project.allFunctions().length, 'functions'
		);
		// Opening a project ends by downloading it to a connected board.
		await MB_editor.codeManager.saveAllChunksAfterLoad();
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
		// the extension if one is given. The file goes to processDroppedFile.

		const inp = document.createElement('input');
		inp.type = 'file';
		inp.style.display = 'none';
		if (ext) inp.accept = '.' + ext;
		inp.addEventListener('cancel', () => inp.remove());
		inp.addEventListener('change', async () => {
			inp.remove();
			const file = inp.files[0];
			if (file) await this.processDroppedFile(file.name, await file.text());
		});
		document.body.appendChild(inp);
		inp.click();
	}

	async processDroppedFile(fileName, data) {
		// Act on a file by its extension. Only projects are handled so far.

		const name = fileName.toLowerCase();
		if (name.endsWith('.ubp') || name.endsWith('.ubp.txt')) await this.openProjectFromString(data, fileName);
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
		this.project = project;
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
		// Bottom left of the bubble at the block's right edge, where GP puts it.
		bubble.setPosition(block.rightCenter().add(new Point(2, -bubble.height())));
		bubble.keepWithin(world);
		this.resultBubbles.set(block, bubble);
	}

	removeResultBubble(aBlock) {
		const bubble = this.resultBubbles.get(aBlock);
		if (bubble == null) return;
		bubble.destroy();
		this.resultBubbles.delete(aBlock);
	}

	showError(blockMorph, errorString) {
		// XXX TO DO
		console.log('Error:', errorString);
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
		for (const block of [...this.resultBubbles.keys()]) this.removeResultBubble(block);
		for (const block of this.runningChunks.keys()) block.removeHighlight();
		this.runningChunks = new Map();
	}
}

// Announce something to whatever chrome is listening. Sent on the document
// rather than through IDE.fireEvent, which is the same dispatch, so that the
// port does not require the chrome to be loaded.
function fireIDEEvent(name, value) {
	// Both guards: the port is also loaded with no DOM, and into contexts that
	// supply a partial one where document exists and CustomEvent does not.
	if (typeof document === 'undefined' || typeof CustomEvent === 'undefined') { return; }
	document.dispatchEvent(new CustomEvent(name, { detail: { value: value } }));
}

// The hand's position as the chrome expects GP's: menus.js adds the offset of
// #canvas.emscripten, while the hand is relative to the world's own canvas.
function chromePoint(aWorld) {
	const page = aWorld.worldCanvas.getBoundingClientRect();
	const canvas = document.querySelector('#canvas.emscripten');
	const hand = aWorld.hand.position();
	return { x: hand.x + page.left - canvas.offsetLeft, y: hand.y + page.top - canvas.offsetTop };
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
	// Show items, each '-' or [label, action, tip], as GP's menuFor does.
	const p = chromePoint(aWorld);
	const descriptors = items.map((item) => ('-' === item) ? { label: '-' } : { label: item[0], tip: item[2] });
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
	// XXX TODO: Use actual localization system
	return s;
}

function isMobile() {
	return false;
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
