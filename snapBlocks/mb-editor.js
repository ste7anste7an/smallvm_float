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
		this.runningChunks = new Map(); // used for block highlighting
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
		this.palette.reactToWorldResize = () => this.fixLayout(world);
		this.scriptsFrame.reactToWorldResize = () => this.fixLayout(world);
		this.fixLayout(world);
	}

	fixLayout(world) {
		// Two panes, filling the window.

		this.palette.setPosition(world.position());
		this.palette.setExtent(new Point(this.paletteWidth, world.height()));
		this.scriptsFrame.setPosition(
			world.position().add(new Point(this.paletteWidth, 0)));
		this.scriptsFrame.setExtent(
			new Point(world.width() - this.paletteWidth, world.height()));
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
		this.removeAllScripts();
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

	justConnected() {
		if (this.readFromBoard) {
			this.readFromBoard = false;
			this.readCodeFromBoard();
		} else {
			const reuseCodeIfPossible = false; // set this to true to attempt to reuse code on board
			if (!reuseCodeIfPossible || !this.boardHasSameProject()) {
				if (reuseCodeIfPossible) console.log('Full download');
				MB_connection.clearBoardIfConnected();
				this.runningChunks = new Map();
			} else {
				console.log('Incremental download', this.vmVersion, this.boardType);
			}
			MB_editor.showDownloadProgress(2, 0);
			this.codeManager.stopAndSyncScripts(true);
		}
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

	showResult(chunkID, value) {
		console.log(value);
	}

	showError(blockMorph, errorString) {
		// XXX TO DO
		console.log('Error:', errorString);
	}

	showChunkError(chunkID, errorString)  {
		// Report a runtime error from the board in the given chunk .

		console.log(errorString, 'in chunk', chunkID);
	}

	addLoggedData(value) {
		// Used for debugging.
		console.log(value);
	}

	showDownloadProgress(phase, percent) {
		// XXX TO DO
	}

	clearRunningHighlights() {
		// XXX TO DO
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
