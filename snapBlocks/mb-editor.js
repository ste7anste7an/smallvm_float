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
	}

	open(world) {
		this.paletteWidth = 200;

		this.palette = new ScrollFrameMorph();
		this.palette.color = new Color(180, 180, 180);
		this.addBlocksToPalette(this.palette);
		this.palette.contents.adjustBounds();
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

	addBlocksToPalette(palette) {
		const specs = MB_Specs.mbBlockSpecs();
		let y = 10;
		let currentCategory = 'Output';
		for (let i = 0; i < 169; i++) {
			let item = specs[i];
			if (Array.isArray(item)) { // block spec
				let b = MB_Specs.blockForSpec(item, currentCategory);
				b.setPosition(new Point(15, y));
				b.isTemplate = true;
				palette.contents.add(b);
				y += b.height() + 10;
			} else if ('-' == item) { // separator
				y += 15;
			} else {
				if (item.indexOf('cat;') == 0) {
					item = item.substring(4);
				}
				let fullCategoryName = item;
				if (item.indexOf('-Advanced') > 0) {
					item = item.substring(0, item.indexOf('-Advanced'));
				}
				currentCategory = item;
				if (y > 10) y += 15;
				let label = new StringMorph(fullCategoryName, 14);
				label.toggleWeight();
				label.setPosition(new Point(5, y));
				palette.contents.add(label);
				y += label.height() + 15;
			}
		}
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

	// File operations

	canReplaceCurrentProject() {
		// Ask before discarding work, as GP does (MicroBlocksEditor.gp:203).
		// updateProject() first, or a block the user has just dragged into the
		// pane is not in the project yet and does not count as work.
		this.updateProject();
		if (!this.project.hasUserCode()) return true;
		return confirm(localized('Discard current project?'));
	}

	newProject() {
		if (!this.canReplaceCurrentProject()) return;
		this.clearProject();
	}

	clearProject() {
		this.project = new MB_Project();
		this.codeManager = new MB_CodeManager(this.project);
		this.projectName = null;
		MB_connection.setCodeManager(this.codeManager);
		this.removeAllScripts();

		// GP clears the board on every project replacement, right after making
		// the new project (MicroBlocksScripter.gp:553). Not awaited: nothing
		// here downloads, and sendMsg keeps the wire in order on its own.
		MB_connection.clearBoardIfConnected();
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

		// Without the erase the project that was open keeps running on the board.
		// Awaited: the download below must not overtake the erase.
		await MB_connection.clearBoardIfConnected();
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

	openFromBoard() {
		// GP's openFromBoard (MicroBlocksEditor.gp:296): clear the project, then
		// wait for the NEXT board to connect. A board that is already connected
		// is not read; justConnected does the reading, on the next connect.
		if (!this.canReplaceCurrentProject()) return;
		this.clearProject();
		this.readFromBoard = true;
		alert(localized('Connect board to proceed.'));
	}

	async openProjectFromBoard() {
		// Read what the board is holding and show it, the way openProject shows
		// a project read from a file. readCodeFromBoard is MB_connection's, not
		// this class's.

		// GP asks here too (MicroBlocksRuntime.gp:539), for the user who wrote
		// something between arming the read and connecting the board.
		if (!this.canReplaceCurrentProject()) return;

		const project = await MB_connection.readCodeFromBoard();
		if (project == null) return;
		this.project = project;
		this.removeAllScripts();
		this.project.main.scripts.forEach(
			(entry) => this.addBlockToScriptsAt(entry[2], entry[0], entry[1]));
		this.codeManager = new MB_CodeManager(this.project);
		this.projectName = null;
		MB_connection.setCodeManager(this.codeManager);
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

function varMustBeQuoted(varName) {
	// Return true if varName must be enclosed in quotes when serialized.
	// A name must be quoted if it is empty, contains a space, or starts with a digit or '-'.
	if (varName === '') return true;
	if (varName.includes(' ')) return true;
	const ch = varName[0];
	return /\d/.test(ch) || ch === '-';
}
