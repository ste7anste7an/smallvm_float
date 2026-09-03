// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-editor.js - MicroBlocks top-level editor.

/* global MB_Parser, MB_Specs, MB_Project, Color, Point, BlockMorph, ScriptsMorph, ScrollFrameMorph, StringMorph, world */

class MB_Editor {
	constructor() {
		this.palette = null;
		this.scripts = null;
		this.project = new MB_Project();
		this.codeManager = new MB_CodeManager(this.project);
		this.readFromBoard = false;
		this.projectName = null; // the file name a save should use
		this.runningChunks = new Map(); // used for block highlighting
		this.resultBubbles = new Map(); // block -> the bubble showing its value
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

		// WorldMorph.fillPage hands every direct child the new bounds when the
		// browser window resizes.
		this.palette.reactToWorldResize = () => this.fixLayout();
		this.scriptsFrame.reactToWorldResize = () => this.fixLayout();
		this.fixLayout();
		return this;
	}

	fixLayout() {
		// Two panes, filling the world canvas.

		this.palette.setPosition(world.position());
		this.palette.setExtent(new Point(this.paletteWidth, world.height()));
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

	handlePaste(event) {
		let s = event.data;
		if (!s.startsWith('GP Script')) return; // ignore non-script paste

		let i = s.indexOf('script'); // find first script
		if (i < 0) return; // no scripts

		let p = new MB_Parser(s.slice(i));
		while (true) {
			let script = p.readCmd(false);
			if (script === null) break;
			if (script.length == 4) {
				this.addBlockToScripts(MB_Parser.blockFor(script[3]));
			}
		}
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

	startAll() {
		this.updateProject();
		this.codeManager.syncAndStartAll();
	}

	stopAll() {
		this.updateProject();
		this.codeManager.stopAndSyncScripts();
	}

	toggleRunning(aBlock) {
		let top = aBlock.topBlock();
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

	updateProject() {
		// Replace the project scripts with the scripts in the scripting pane.

		let newScripts = [];
		for (const aBlockMorph of this.scriptsPane().children) {
			if (aBlockMorph instanceof BlockMorph) {
				// A function definition in the pane belongs to the project's
				// functions, not to main.scripts. XXX TO DO: write an edited
				// definition back, as GP's updateFunctionOrMethod does.
				if (!aBlockMorph.isFunctionDefinition()) {
					let x = Math.round(aBlockMorph.left() - this.scripts.left());
					let y = Math.round(aBlockMorph.top() - this.scripts.top());
					newScripts.push([x, y, aBlockMorph]);
				}
			}
		}
		this.project.main.setScripts(newScripts);
	}

	// File operations

	newProject() {
		this.project = new MB_Project();
		this.codeManager = new MB_CodeManager(this.project);
		this.projectName = null;
		this.removeAllScripts();
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

	openProject() {
		function loadFile(fileName, contents) {
			MB_editor.project = new MB_Project();
			MB_editor.project.loadFromString(contents);
			MB_editor.removeAllScripts();
			MB_editor.project.main.scripts.forEach( (entry) => {
				let x = entry[0], y = entry[1], script = entry[2];
				MB_editor.addBlockToScriptsAt(script, x, y);
			});
			MB_editor.codeManager = new MB_CodeManager(MB_editor.project);
			MB_editor.projectName = fileName;
			MB_connection.setCodeManager(MB_editor.codeManager);
			console.log("Loaded:", fileName,
				MB_editor.project.main.scripts.length, 'scripts,',
				MB_editor.project.allFunctions().length, 'functions'
			);
		}
		this.importLocalFile(loadFile.bind(this));
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
		if (this.readFromBoard) {
			this.readFromBoard = false;
			// Not awaited: justConnected is synchronous here, and nothing after
			// this branch depends on the read having finished.
			this.openProjectFromBoard();
		} else {
			const reuseCodeIfPossible = false; // set this to true to attempt to reuse code on board
			if (!reuseCodeIfPossible || !this.boardHasSameProject()) {
				if (reuseCodeIfPossible) console.log('Full download');
				await MB_connection.clearBoardIfConnected();
				this.runningChunks = new Map();
			} else {
				console.log('Incremental download', this.vmVersion, this.boardType);
			}
			MB_editor.showDownloadProgress(2, 0);
			this.codeManager.stopAndSyncScripts(true);
		}
	}

	async openProjectFromBoard() {
		// Read what the board is holding and show it, the way openProject shows
		// a project read from a file. readCodeFromBoard is MB_connection's, not
		// this class's.
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

	boardHasSameProject() {
		// XXX TODO
		return false;
	}

	// Placeholder functions for UI actopms

	inform(msg) {
		// XXX TO DO
		console.log(msg);
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

	showChunkError(chunkID, errorString)  {
		// Report a runtime error from the board in the given chunk .

		this.showResult(chunkID, errorString, true);
	}

	addLoggedData(value) {
		// Used for debugging.
		console.log(value);
	}

	clearLoggedData() {
		// Used for debugging. A stub at the same level as addLoggedData above:
		// GP's clearLoggedData resets a ring buffer this port does not keep yet.
		console.log('clear graph');
	}

	showDownloadProgress(phase, percent) {
		// XXX TO DO
	}

	clearRunningHighlights() {
		// Called on disconnect. Everything the board put on the screen goes with
		// it, bubbles included -- GP clears them together too (:2717).
		for (const block of [...this.resultBubbles.keys()]) this.removeResultBubble(block);
		for (const block of this.runningChunks.keys()) block.removeHighlight();
		this.runningChunks = new Map();
	}
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

function varMustBeQuoted(varName) {
	// Return true if varName must be enclosed in quotes when serialized.
	// A name must be quoted if it is empty, contains a space, or starts with a digit or '-'.
	if (varName === '') return true;
	if (varName.includes(' ')) return true;
	const ch = varName[0];
	return /\d/.test(ch) || ch === '-';
}
