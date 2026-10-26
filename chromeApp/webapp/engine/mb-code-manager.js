// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

/* globals MB_editor, MB_connection, MB_Compiler, waitMSecs */

class MB_CodeManager {
	constructor(aProject) {
		this.project = aProject;
		this.chunkIDs = new Map(); // key (Block or String) -> [id, crc, chunkType, lastSrc, functionMayHaveChanged, isFunction]
		this.functionChunkIDs = new Map(); // function name -> chunkID
		this.sourceMaps = new Map(); // chunk key -> { src, map: [[wordStart, wordCount, nodeID or null], ...] }
		this.recompileAll = true; // recompile and hold off code file updates on the first sync, as loading a project does
		this.codeStoreFull = false;
		this.savesInProgress = 0; // the editor's step waits while this is not zero
		this.compiler = null;
		this.oldVarNames = null;
		this.crcDict = null;
		this.lastCRC = null;
		this.lastRcvMSecs = null;
		this.crc32Table = null;
		this.buildCRC32Table();
		this.assignFunctionIDs();
	}

	// --- run/stop ---

	async evalOnBoard(aBlock, showBytes) {
		if (!(await MB_editor.saveBeforeRun())) return; // starting now could be stopped by that download
		if ('not connected' == MB_connection.updateConnection()) {
			MB_editor.showError(aBlock, localized('Board not connected'));
			return;
		}
		if (this.codeStoreFull) {
			MB_editor.showError(aBlock, 'Program is too large to store on board.');
			return;
		}
		if (!(aBlock.parent instanceof ScriptsMorph)) {
			// running a block from the palette
			await this.saveAllChunks(true, aBlock);
		}
		const chunkID = this.lookupChunkID(aBlock);
		if (chunkID != null) this.runChunk(chunkID); // null: nothing has been stored for it yet
	}

	isRunning(aBlock) {
		// The board's taskStarted/taskDone messages are recorded here, as GP
		// records them in chunkRunning (MicroBlocksRuntime.gp updateRunning).
		// Reading the block's highlight asks the view a question the runtime
		// already answers.
		return MB_editor.runningChunks.has(aBlock);
	}

	stopRunningBlock(aBlock) {
		if (this.isRunning(aBlock)) {
			this.stopRunningChunk(this.lookupChunkID(aBlock));
		}
	}

	async syncAndStartAll() {
		if (MB_connection.vmTooOld()) return;
		// Refuse before sending anything, as GP's startAll does (MicroBlocksRuntime.gp).
		if (!MB_connection.isConnected()) {
			MB_editor.inform(localized('Board not connected'));
			return;
		}
		if (this.codeStoreFull) {
			MB_editor.inform(localized('Program is too large to store on board.'));
			return;
		}
		if (!(await MB_editor.saveBeforeRun())) return; // a store still running could stop or restart a script after the start
		await this.syncScripts();
		MB_connection.sendMsg('startAllMsg', 1); // chunk type 1 means 16-bit instructions
	}

	async stopAndSyncScripts(alreadyStopped, forceRecompile) {
		// Stop, then a soft reset, then sync, as GP's stopAndSyncScripts does. The VM
		// clears its memory and variables on the reset, which stopAllMsg alone does not.
		if (MB_connection.isConnected() && (alreadyStopped !== true)) {
			// A store in progress restarts its script if it was running, which would undo
			// the stop, so let it finish first. Stop goes out even if that wait gives up.
			await MB_editor.saveBeforeRun();
			MB_connection.sendMsg('stopAllMsg');
			MB_connection.sendMsg('systemResetMsg');
		}
		MB_editor.clearRunningHighlights();
		if (true === forceRecompile) {
			// Shift-Stop. Not only a recompile: saveAllChunks also stops skipping
			// functions whose definitions are not in the scripting area, so this is
			// what puts a stale hidden function right.
			this.recompileAll = true;
		}
		// Check the board's CRCs as well, with code file updates held off during the sync.
		await MB_connection.suspendCodeFileUpdates();
		await this.syncScripts(true);
		MB_connection.resumeCodeFileUpdates();
		MB_editor.showDownloadProgress(3, 1);
	}

	// --- compiling ---

	recompileNeeded() { this.recompileAll = true; }

	boardCleared() {
		// The board has just been erased, so it holds nothing this code manager sent it.
		this.chunkIDs = new Map();
		this.functionChunkIDs = new Map();
		this.oldVarNames = null;
	}

	chunkTypeFor(aBlockOrFunction) {
		// Order matters, and it is GP's: SmallRuntime.chunkTypeFor tests the hat
		// selectors BEFORE falling through to Command and Reporter. A hat is a
		// command -- HatBlockMorph.prototype is a CommandBlockMorph -- so
		// testing for one first answers 1 for every hat there is and leaves the
		// selector tests below it unreachable.
		if (aBlockOrFunction instanceof MB_Function) return 3;
		if (aBlockOrFunction instanceof BlockMorph &&
			aBlockOrFunction.isFunctionDefinition()) {
				return 3;
		}

		const op = aBlockOrFunction.selector;
		if (op === 'whenStarted') return 4;
		if (op === 'whenCondition') return 5;
		if (op === 'whenBroadcastReceived') return 6;
		if (op === 'whenButtonPressed') {
			const button = aBlockOrFunction.inputs()[0].evaluate();
			if (button === 'A') return 7;
			if (button === 'B') return 8;
			return 9; // A+B
		}

		if (aBlockOrFunction instanceof CommandBlockMorph) return 1;
		if (aBlockOrFunction instanceof ReporterBlockMorph) return 2;

		throw new Error('Unexpected argument to chunkTypeFor');
	}

	compiledBytesFor(aBlockOrFunction) {
		// Compile the given block or function and return a list of code bytes.
		if (typeof aBlockOrFunction === 'string') {
			aBlockOrFunction = this.project.functionNamed(aBlockOrFunction);
			if (aBlockOrFunction == null) return [];
		}
		if (this.compiler == null) {
			this.compiler = new MB_Compiler(this.project, this); // needs functionID map
		}
		const code = this.compiler.instructionsFor(aBlockOrFunction);
		for (const item of code) {
			if (!Array.isArray(item) && (typeof item !== 'string')) {
				throw new Error('Instruction must be an Array or String: ' + item);
			}
		}
		const key = this.sourceMapKeyFor(aBlockOrFunction);
		const bytes = this.compiler.bytesForInstructions(code, aBlockOrFunction, key);
		// Filed with the source it describes, so a later lookup can tell whether
		// it still describes anything.
		this.sourceMaps.set(key,
			{ src: aBlockOrFunction.codeString(), map: this.compiler.sourceMap });
		return bytes;
	}

	sourceMapKeyFor(aBlockOrFunction) {
		// A chunk's source map is filed under the same name its chunk id is: a
		// function's own name, a script's session name from the scripts pane.
		if (aBlockOrFunction instanceof MB_Function) return aBlockOrFunction.functionName;
		return this.chunkKeyFor(aBlockOrFunction);
	}

	sourceMapFor(aBlockOrFunction) {
		// Only what a compile left here. Compiling from a lookup would assign
		// global variable indices (MB_Project indexForVar) in the order the
		// board's errors arrive, which is not the order the board was given.
		const record = this.sourceMaps.get(this.sourceMapKeyFor(aBlockOrFunction));
		return record ? record.map : null;
	}

	sourceMapIsStale(aBlockOrFunction) {
		// A map describes the bytes of one source text. It is worth nothing once
		// the block says something else, or once the chunk table says the board
		// was sent something else.
		const key = this.sourceMapKeyFor(aBlockOrFunction);
		const record = this.sourceMaps.get(key);
		if (record == null) return true;
		if (record.src !== aBlockOrFunction.codeString()) return true;
		const entry = this.chunkIDs.get(key);
		return (entry != null) && ('' !== entry[3]) && (entry[3] !== record.src);
	}

	siteForChunkWord(chunkID, word) {
		// What produced one word of one chunk, as plain data: a block, the chunk
		// itself, a word no map entry describes (a string literal, or past the end),
		// a map that no longer describes what the board is running, or no map at
		// all. blockForSite turns a block answer back into the morph.
		const thing = this.blockForChunkID(chunkID);
		if (thing == null) return null;
		const map = this.sourceMapFor(thing);
		if (map == null) return null;
		const scriptId = this.sourceMapKeyFor(thing);
		if (this.sourceMapIsStale(thing)) {
			return { kind: 'stale', scriptId: scriptId, nodeId: null };
		}
		for (const [start, count, nodeId] of map) {
			if ((word < start) || (word >= start + count)) continue;
			if (nodeId == null) return { kind: 'chunk', scriptId: scriptId, nodeId: null };
			return { kind: 'block', scriptId: scriptId, nodeId: nodeId };
		}
		return { kind: 'unknown', scriptId: scriptId, nodeId: null };
	}

	blockForNodeID(aBlockOrFunction, nodeID) {
		// The paths are computed from the tree on each call and never stored on a
		// morph: fullCopy copies own properties, so a stored one would travel.
		if (this.compiler == null) this.compiler = new MB_Compiler(this.project, this);
		const paths = this.compiler.nodePathsFor(aBlockOrFunction,
			this.sourceMapKeyFor(aBlockOrFunction));
		for (const [block, id] of paths) {
			if (id === nodeID) return block;
		}
		return null;
	}

	blockForSite(chunkID, nodeID) {
		// The block a decoded location names, taken from plain data, so nothing
		// that carries a site around has to carry a morph with it.
		const thing = (nodeID == null) ? null : this.blockForChunkID(chunkID);
		return (thing == null) ? null : this.blockForNodeID(thing, nodeID);
	}

	chunkBytesFor(aBlockOrFunction) {
		let bytes = this.compiledBytesFor(aBlockOrFunction);
		if (bytes.length > 1000) {
			// Replace compiled code with a stub that just reports a "Script too large" error.
			// Built through the parser: GP's `block` is a factory (MicroBlocksRuntime.gp
			// chunkBytesFor) but CommandBlockMorph's constructor takes no arguments, so a
			// block made that way has no selector and does not compile.
			bytes = this.compiledBytesFor(MB_Parser.blockFor(['[misc:scriptTooLarge]']));
		}
		return bytes;
	}

	// --- chunk management ---

	async syncScripts(checkCRCs) {
		// Called by editor when anything changes.
		if (!MB_connection.isConnected()) {
			console.log('Board not connected!');
			return;
		}

		// force re-save of any functions in the scripting area
		for (const aBlock of this.project.allScripts()) {
			if (aBlock.isFunctionDefinition()) {
				const fName = aBlock.definedFunctionName();
				const entry = this.chunkIDs.get(fName);
				if (entry != null) {
					// record that function is in scripting area so must be checked for changes
					entry[4] = true;
				}
			}
		}

		await this.saveAllChunks(checkCRCs === true);
	}

	async saveAllChunksAfterLoad() {
		// Put a just-loaded project on the board, as GP's saveAllChunksAfterLoad
		// does (MicroBlocksRuntime.gp:1419): nothing when no board is connected,
		// otherwise the whole download with code file updates held off around it.
		if (!MB_connection.connectedToBoard()) return;
		await MB_connection.suspendCodeFileUpdates();
		await this.saveAllChunks(true);
		MB_connection.resumeCodeFileUpdates();
		MB_editor.showDownloadProgress(3, 1);
	}

	chunkKeyFor(aBlockOrFunction) {
		// A script is keyed on its own name where it has one, so its chunk
		// survives the scripts being rebuilt from the project text.
		if (aBlockOrFunction instanceof BlockMorph && aBlockOrFunction.mbScriptId) {
			const name = aBlockOrFunction.mbScriptId;
			const entry = this.chunkIDs.get(aBlockOrFunction);
			if (entry && !this.chunkIDs.has(name)) { // clicked before it was named: keep that chunk
				this.chunkIDs.delete(aBlockOrFunction);
				this.chunkIDs.set(name, entry);
			}
			return name;
		}
		return aBlockOrFunction;
	}

	scriptForChunkKey(key) {
		// The script a key names, wherever the user has it, or null if it is
		// gone. A script being dragged is out of main.scripts and its chunk is
		// still live, so the hand is looked in as well as the project.
		if (key instanceof BlockMorph) return key;
		const named = (b) => b != null && b.mbScriptId === key;
		return this.project.allScripts().find(named) || this.grabbedScripts().find(named) || null;
	}

	grabbedScripts() {
		// What the hand is holding, which is one of the three places
		// removeObsoleteChunks accepts a script.
		const pane = (typeof MB_editor === 'undefined') ? null : MB_editor.scriptsPane();
		const world = (pane == null) ? null : pane.world();
		return (world == null || world.hand == null) ? [] : world.hand.children;
	}

	lookupChunkID(key) {
		// If the given block or function name has been assigned a chunkID, return it.
		// Otherwise, return null.
		const entry = this.chunkIDs.get(this.chunkKeyFor(key));
		if (entry == null) return null;
		return entry[0];
	}

	async removeObsoleteChunks() {
		// Remove obsolete chunks. Chunks become obsolete when they are deleted or inserted into
		// a script so they are no longer a stand-alone chunk. Functions become obsolete when
		// they are deleted or the library containing them is deleted.
		for (const [k, entry] of this.chunkIDs.entries()) {
			let isObsolete = false;
			if (entry[5]) { // a function, keyed on its name
				isObsolete = (this.project.functionNamed(k) == null);
			} else {
				// A script, keyed on its name or its morph, is obsolete unless the pane, the
				// hand or the palette holds it. Asked of children too: morphic's removeChild
				// (morphic.js:3096) leaves parent set.
				const block = this.scriptForChunkKey(k);
				const owner = (block == null) ? null : block.parent;
				isObsolete = (owner == null ||
					!owner.children.includes(block) ||
					!(owner instanceof HandMorph ||
					owner instanceof ScriptsMorph ||
					owner instanceof ScrollFrameMorph)) ||
					// keyed on the morph by a click, and its name already has a chunk
					(k === block && this.chunkIDs.has(block.mbScriptId));
			}
			if (isObsolete) await this.deleteChunkFor(k);
		}
	}

	unusedChunkID() {
		// Return an unused chunkID.
		const inUse = new Set();
		for (const entry of this.chunkIDs.values()) {
			inUse.add(entry[0]);
		}
		for (let id = 0; id < 256; id++) {
			if (!inUse.has(id)) return id;
		}
		throw new Error('Too many code chunks (functions and scripts). Max is 256.');
	}

	ensureChunkIdFor(aBlock) {
		// Return the chunkID for the given block. Functions are handled by assignFunctionIDs.
		// If necessary, register the block in the chunkIDs dictionary.
		const key = this.chunkKeyFor(aBlock);
		let entry = this.chunkIDs.get(key);
		if (entry == null) {
			const id = this.unusedChunkID();
			entry = [id, null, this.chunkTypeFor(aBlock), '', false, false];
			this.chunkIDs.set(key, entry); // key -> [id, crc, chunkType, lastSrc, functionMayHaveChanged, isFunction]
		}
		return entry[0];
	}

	chunkEntryForBlock(aBlock) {
		return this.chunkIDs.get(this.chunkKeyFor(aBlock)) || null;
	}

	blockForChunkID(chunkID) {
		let result = null;
		for (const [key, entry] of this.chunkIDs.entries()) {
			if (entry[0] === chunkID) {
				// A function's entry is keyed on its name, a script's by its own
				// name; either way the caller wants the thing, not the key.
				result = entry[5] ? this.project.functionNamed(key) : this.scriptForChunkKey(key);
				break;
			}
		}
		return result;
	}

	assignFunctionIDs() {
		// Ensure that there is a chunk ID for every user-defined function.
		// This must be done before generating any code to allow for recursive calls.
		if (!this.project) return; // no project: nothing to assign (e.g. the decompiler's opcode-table compiler)
		for (const func of this.project.allFunctions()) {
			const fName = func.functionName;
			if (!this.chunkIDs.has(fName)) {
				const id = this.unusedChunkID();
				const entry = [id, null, this.chunkTypeFor(func), '', true, true];
				this.chunkIDs.set(fName, entry); // fName -> [id, crc, chunkType, lastSrc, functionMayHaveChanged, isFunction]
				this.functionChunkIDs.set(fName, id);
			}
		}
	}

	functionNameForID(chunkID) {
		this.assignFunctionIDs();
		for (const [key, entry] of this.chunkIDs.entries()) {
			if (entry[0] === chunkID) return key; // return function name
		}
		return 'f' + chunkID;
	}

	async deleteChunkFor(key) {
		if (key instanceof BlockMorph && key.isFunctionDefinition()) {
			key = key.definedFunctionName();
		}
		const entry = this.chunkIDs.get(key);
		if (entry != null && MB_connection.isConnected()) {
			const chunkID = entry[0];
			await MB_connection.sendMsgSync('deleteChunkMsg', chunkID);
			this.chunkIDs.delete(key);
			if (entry[5]) this.functionChunkIDs.delete(key); // so calls to it compile as unknown ops, as in GP
		}
	}

	async saveAllChunks(checkCRCs, paletteBlock) {
		// Save the code for all scripts and user-defined functions.
		// Counted, so that the editor's step does not start a second download meanwhile.
		this.savesInProgress += 1;
		try {
			await this.saveAllChunksNow(checkCRCs, paletteBlock);
		} finally {
			this.savesInProgress -= 1;
		}
	}

	async saveAllChunksNow(checkCRCs, paletteBlock) {
		if (checkCRCs == null) checkCRCs = true;
		if (!MB_connection.connectedToBoard()) return;
		if (MB_connection.vmTooOld()) return;

		const t = Date.now();
		const totalScripts = this.project.allFunctions().length + this.project.allScripts().length;
		const progressInterval = Math.max(1, Math.floor(totalScripts / 20));
		let processedScripts = 0;
		let skipHiddenFunctions = true;
		await this.saveVariableNamesIfNeeded();
		this.codeStoreFull = false;
		if (this.recompileAll) {
			// Clear the source code field of all chunk entries to force script recompilation
			// and possible re-download since variable offsets have changed.
			await MB_connection.suspendCodeFileUpdates();
			for (const entry of this.chunkIDs.values()) {
				entry[3] = '';
				entry[4] = true;
			}
			skipHiddenFunctions = false;
		}
		this.assignFunctionIDs();
		await this.removeObsoleteChunks();

		const unusedFuncs = this.project.unusedFunctions(paletteBlock);
		let functionsSaved = 0;
		for (const aFunction of this.project.allFunctions()) {
			if (!unusedFuncs.includes(aFunction.functionName)) {
				if (await this.saveChunk(aFunction, skipHiddenFunctions)) {
					functionsSaved += 1;
					if ((functionsSaved % progressInterval) === 0) {
						MB_editor.showDownloadProgress(3, processedScripts / totalScripts);
					}
				}
			}
			if (this.codeStoreFull) {
				MB_editor.inform('Program is too large to store on board.');
				return;
			}
			if (!MB_connection.connectedToBoard()) { // connection closed
				console.log('Lost communication to the board in saveAllChunks');
				return;
			}
			processedScripts += 1;
		}
		if (functionsSaved > 0) {
			console.log('Downloaded', functionsSaved, 'functions to board', '(' + (Date.now() - t) + ' msecs)');
		}

		let scriptsSaved = 0;
		if (paletteBlock != null) {
			await this.saveChunk(paletteBlock, skipHiddenFunctions);
			scriptsSaved += 1;
		}
		for (const aBlock of this.project.allScripts()) {
			if (!aBlock.isFunctionDefinition()) { // skip function def hat; functions get saved above
				if (await this.saveChunk(aBlock, skipHiddenFunctions)) {
					scriptsSaved += 1;
					if ((scriptsSaved % progressInterval) === 0) {
						MB_editor.showDownloadProgress(3, processedScripts / totalScripts);
					}
				}
				if (this.codeStoreFull) {
					MB_editor.inform('Program is too large to store on board.');
					return;
				}
				if (!MB_connection.connectedToBoard()) { // connection closed
					console.log('Lost communication to the board in saveAllChunks');
					return;
				}
			}
			processedScripts += 1;
		}
		if (scriptsSaved > 0) {
			console.log('Downloaded', scriptsSaved, 'scripts to board', '(' + (Date.now() - t) + ' msecs)');
		}

		const globalVarCount = this.project.allVariableNames().length;
		if (globalVarCount > 128 && scriptsSaved > 0) {
			console.log('Error: Project has', globalVarCount, 'global variables! Limit is 128.');
			console.log('Project will behave unpredictably until this is fixed.');
		}

		this.recompileAll = false;
		if (checkCRCs) await this.verifyCRCs();
		MB_connection.resumeCodeFileUpdates();
		MB_editor.showDownloadProgress(3, 1);
	}

	async forceSaveChunk(aBlockOrFunction) {
		// Save the chunk for the given block or function even if it was previously saved.
		const key = this.chunkKeyFor(aBlockOrFunction);
		if (this.chunkIDs.has(key)) {
			const entry = this.chunkIDs.get(key);
			entry[1] = null; // clear the old CRC
			entry[3] = '';	 // clear the old source
		}
		await this.saveChunk(aBlockOrFunction, false);
	}

	async saveChunk(aBlockOrFunction, skipHiddenFunctions) {
		// Save the given script or function as an executable code "chunk".
		// Also save the source code (in GP format) and the script position.
		if (this.codeStoreFull) return;
		if (skipHiddenFunctions == null) skipHiddenFunctions = true; // optimize by default

		if (typeof aBlockOrFunction === 'string') {
			aBlockOrFunction = this.scriptForChunkKey(aBlockOrFunction) ||
				this.project.functionNamed(aBlockOrFunction);
			if (aBlockOrFunction == null) return false;
		}

		let chunkID, entry, currentSrc;
		if (aBlockOrFunction instanceof MB_Function) {
			const functionName = aBlockOrFunction.functionName;
			chunkID = this.lookupChunkID(functionName);
			entry = this.chunkIDs.get(functionName);
			if (skipHiddenFunctions && !entry[4]) return false; // function is not in scripting area so has not changed
			entry[4] = false;
			currentSrc = aBlockOrFunction.codeString();
		} else {
			currentSrc = aBlockOrFunction.codeString();
			chunkID = this.ensureChunkIdFor(aBlockOrFunction);
			entry = this.chunkIDs.get(this.chunkKeyFor(aBlockOrFunction));
			if (entry[2] !== this.chunkTypeFor(aBlockOrFunction)) {
				// user changed A/B/A+B button hat type with menu
				entry[2] = this.chunkTypeFor(aBlockOrFunction);
				entry[3] = ''; // clear lastSrc to force save
			}
		}

		if (currentSrc === entry[3]) return false; // source hasn't changed; save not needed
		entry[3] = currentSrc; // remember the source of the code we're about to save

		// save the binary code for the chunk
		const chunkType = this.chunkTypeFor(aBlockOrFunction);
		const chunkBytes = this.chunkBytesFor(aBlockOrFunction);

		while ((chunkBytes.length % 4) !== 0) {
			// pad with zeros to make chunk byte count be an even multiple of four
			// this ensures 32-bit word chunk alignment in the code store
			chunkBytes.push(0);
		}

		const data = [chunkType, ...chunkBytes];
		if (data.length > 1000) {
			if (aBlockOrFunction instanceof MB_Function) {
				MB_editor.inform(aBlockOrFunction.functionName + 'Function is too large to send to board.');
			} else {
				MB_editor.showError(aBlockOrFunction, 'Script is too large to send to board.');
			}
			return false;
		}

		// don't save the chunk if its CRC has not changed unless is a button or broadcast
		// hat because the CRC does not reflect changes to the button or broadcast name
		let crcOptimization = true;
		if (aBlockOrFunction instanceof BlockMorph) {
			const op = aBlockOrFunction.selector;
			if ((op === 'whenButtonPressed' || op === 'whenBroadcastReceived')) {
				crcOptimization = false;
			}
		}
		if (crcOptimization && this.arraysEqual(entry[1], this.computeCRC(chunkBytes))) {
			return false;
		}

		// record if chunk is running
		const restartChunk = (aBlockOrFunction instanceof BlockMorph && this.isRunning(aBlockOrFunction));

		const chunkCRC = this.computeCRC(chunkBytes);
		if (await this.storeChunkOnBoard(chunkID, data, chunkCRC)) {
			entry[1] = chunkCRC; // remember the CRC of the code we just saved
		} else {
			console.log('Failed to save chunk:', chunkID);
			entry[1] = null; // save failed; clear CRC
		}

		// restart the chunk if it was running
		if (restartChunk) {
			this.stopRunningChunk(chunkID);
			await MB_connection.waitForResponse();
			this.runChunk(chunkID);
			await MB_connection.waitForResponse();
		}
		return true;
	}

	async storeChunkOnBoard(chunkID, data, chunkCRC) {
		// Send the given chunk to the board and wait for the board to return the CRC.
		// That ensures that the chunk has been saved to Flash memory.
		// This can take several seconds if the board does a Flash compaction.

		this.lastCRC = null;
		await MB_connection.sendMsg('chunkCode16Msg', chunkID, data); // start the clock once it is sent

		// wait for CRC to be reported
		const timeout = 3000; // must be less than ping timeout
		const startT = Date.now();
		while (!this.arraysEqual(this.lastCRC, chunkCRC) && (Date.now() - startT) < timeout) {
			MB_connection.processMessages();
			if (this.codeStoreFull) return false;
			await waitMSecs(1);
		}
		return this.arraysEqual(this.lastCRC, chunkCRC);
	}

	computeCRC(chunkData) {
		// Return the CRC for the given compiled code as a 4-byte array.
		const crcVal = this.crc32(new Uint8Array(chunkData));
		const result = new Array(4);
		for (let i = 0; i < 4; i++) result[i] = (crcVal >>> (i * 8)) & 0xFF;
		return result;
	}

	arraysEqual(a, b) {
		if (a == null || b == null) return a === b;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}

	async verifyCRCs() {
		// Check that the CRCs of the chunks on the board match the ones in the IDE.
		// Resend the code of any chunks whose CRC's do not match.
		if (!MB_connection.connectedToBoard()) return;

		// For testing: control type of CRC collection (default: forceIndividual = false)
		// collectCRCsIndividually is slower and less reliable than collectCRCsBulk but since
		// it works incrementally on the board it interferes less with real-time music performance.
		const forceIndividual = false;

		// collect CRCs from the board
		this.crcDict = new Map();
		if (forceIndividual) {
			await this.collectCRCsIndividually();
		} else {
			await this.collectCRCsBulk();
		}

		// build dictionaries and unused function list
		//	 ideChunks: maps chunkID -> block or functionName
		//	 crcForChunkID: maps chunkID -> CRC
		//	 unusedFuncs: list of unused function names
		const ideChunks = new Map();
		const crcForChunkID = new Map();
		const unusedFuncs = this.project.unusedFunctions();
		for (const [key, entry] of this.chunkIDs.entries()) {
			const id = entry[0];
			if (entry[5]) { // a function, keyed on its name
				if (this.project.functionNamed(key) == null) {
					this.chunkIDs.delete(key); // remove reference to deleted function (rarely needed)
				}
				if (unusedFuncs.includes(key)) {
					this.chunkIDs.delete(key); // unused function; does not need to be saved to board
				}
				if (this.chunkIDs.has(key)) { // function is still in use, so verify it like any other chunk
					ideChunks.set(id, key);
					crcForChunkID.set(id, entry[1]);
				}
			} else {
				ideChunks.set(id, key);
				crcForChunkID.set(id, entry[1]);
			}
		}

		const totalCount = this.crcDict.size + ideChunks.size;
		let processedCount = 0;

		// process CRCs
		for (const chunkID of this.crcDict.keys()) {
			const sourceItem = ideChunks.get(chunkID);
			if (sourceItem != null && !this.arraysEqual(this.crcDict.get(chunkID), crcForChunkID.get(chunkID))) {
				console.log('CRC mismatch; resaving chunk:', chunkID);
				await this.forceSaveChunk(sourceItem);
				MB_editor.showDownloadProgress(3, processedCount / totalCount);
			}
			processedCount += 1;
		}

		// check for missing chunks
		for (const chunkID of ideChunks.keys()) {
			if (!this.crcDict.has(chunkID)) {
				console.log('Resaving missing chunk:', chunkID);
				const sourceItem = ideChunks.get(chunkID);
				await this.forceSaveChunk(sourceItem);
				MB_editor.showDownloadProgress(3, processedCount / totalCount);
			}
			processedCount += 1;
		}
		MB_editor.showDownloadProgress(3, 1);
	}

	async boardHasSameProject() {
		// Return true if the board appears to have the same project as the IDE.
		if (!MB_connection.connectedToBoard()) return false;
		if (this.chunkIDs.size === 0) return false; // empty project

		// update chunkIDs dictionary for script/function additions or removals while disconnected
		this.assignFunctionIDs();
		for (const aBlock of this.project.allScripts()) {
			if (!aBlock.isFunctionDefinition()) { // skip function def hat; functions get IDs above
				this.ensureChunkIdFor(aBlock);
			}
		}

		// collect CRCs from the board
		this.crcDict = new Map();
		await this.collectCRCsBulk();

		// build dictionaries:
		//	 ideChunks: chunkID -> block or functionName
		//	 crcForChunkID: chunkID -> CRC
		const ideChunks = new Map();
		const crcForChunkID = new Map();
		for (const [key, entry] of this.chunkIDs.entries()) {
			const chunkID = entry[0];
			const crc2 = entry[1];
			ideChunks.set(chunkID, key);
			crcForChunkID.set(chunkID, crc2);
		}

		// whether the board holds an unused function says nothing either way
		const unusedFuncs = this.project.unusedFunctions();
		const unusedIDs = new Set();
		for (const [key, entry] of this.chunkIDs.entries()) {
			if (unusedFuncs.includes(key)) unusedIDs.add(entry[0]);
		}

		// count matching chunks
		let matchCount = 0;
		for (const chunkID of this.crcDict.keys()) {
			if (unusedIDs.has(chunkID)) continue;
			const entry = ideChunks.get(chunkID);
			if (entry != null && this.arraysEqual(this.crcDict.get(chunkID), crcForChunkID.get(chunkID))) {
				matchCount += 1;
			}
		}

		// count chunks that have changed or are entirely missing from the board
		let changedOrMissingCount = 0;
		for (const chunkID of ideChunks.keys()) {
			if (unusedIDs.has(chunkID)) continue;
			if (!this.crcDict.has(chunkID) ||
				!this.arraysEqual(this.crcDict.get(chunkID), crcForChunkID.get(chunkID))) {
				changedOrMissingCount += 1;
			}
		}

		return (matchCount > 3 && matchCount > changedOrMissingCount);
	}

	async deleteChunksOnlyOnBoard() {
		// Delete the chunks in the board's CRC list that no script or used function in this
		// IDE owns, so an incremental download leaves the board as a full download would.
		if (MB_connection.vmVersion == null) return;
		const unusedFuncs = this.project.unusedFunctions(); // never saved, as in verifyCRCs
		const knownIDs = new Set();
		const unusedKeys = new Map(); // chunkID -> unused function name
		for (const [key, entry] of this.chunkIDs.entries()) {
			if (unusedFuncs.includes(key)) unusedKeys.set(entry[0], key);
			else knownIDs.add(entry[0]);
		}
		for (const chunkID of Array.from(this.crcDict.keys())) {
			if (!knownIDs.has(chunkID)) {
				console.log('Deleting chunk not in project:', chunkID);
				if (!(await MB_connection.sendMsgSync('deleteChunkMsg', chunkID))) return;
				// forget it too, so a later call to the function sends it again
				if (unusedKeys.has(chunkID)) this.chunkIDs.delete(unusedKeys.get(chunkID));
			}
		}
	}

	async collectCRCsIndividually() {
		// Collect the CRC's from all chunks on the board by requesting them individually
		this.crcDict = new Map();

		// request a CRC for every chunk
		for (const entry of this.chunkIDs.values()) {
			MB_connection.sendMsg('getChunkCRCMsg', entry[0]);
			MB_connection.processMessages();
		}

		// if there are any chunks, wait for first CRC to arrive
		if (this.chunkIDs.size > 0) {
			const timeoutFirstCRC = 4000; // max time to wait for first CRC
			const waitStartT = Date.now();
			while (this.crcDict.size === 0 && (Date.now() - waitStartT) < timeoutFirstCRC) {
				MB_connection.processMessages();
				await waitMSecs(10);
			}
		}

		const timeout = 120;
		this.lastRcvMSecs = Date.now();
		while ((Date.now() - this.lastRcvMSecs) < timeout) {
			MB_connection.processMessages();
			await waitMSecs(10);
		}
	}

	crcReceived(chunkID, chunkCRC) {
		// Received an individual CRC message from board.
		// Record the CRC for the given chunkID.
		this.lastRcvMSecs = Date.now();
		this.lastCRC = chunkCRC;
		if (this.crcDict != null) {
			this.crcDict.set(chunkID, chunkCRC);
		}
	}

	async collectCRCsBulk() {
		// Collect the CRC's from all chunks on the board via a bulk CRC request.
		this.crcDict = null;

		// request CRCs for all chunks on board
		await MB_connection.sendMsgSync('getAllCRCsMsg', 1);

		// wait until crcDict is filled in or timeout
		const startT = Date.now();
		while (this.crcDict == null && (Date.now() - startT) < 2000) {
			MB_connection.processMessages();
			await waitMSecs(5);
		}

		if (this.crcDict == null) this.crcDict = new Map(); // timeout
	}

	allCRCsReceived(data) {
		// Received a message from board with the CRCs of all chunks.
		// Create crcDict and record the (possibly empty) list of CRCs.
		// Each CRC record is 5 bytes: <chunkID (one byte)> <CRC (four bytes)>
		this.crcDict = new Map();
		for (let i = 0; i <= data.length - 5; i += 5) {
			const chunkID = data[i];
			const chunkCRC = data.slice(i + 1, i + 5);
			this.crcDict.set(chunkID, chunkCRC);
		}
	}

	async saveVariableNamesIfNeeded() {
		// If the variables list has changed, save the new variable names.
		// Return true if variables have changed, false otherwise.
		const newVarNames = this.project.allVariableNames();
		if (this.arraysEqual(this.oldVarNames, newVarNames)) return false;

		const varCount = newVarNames.length;
		const progressInterval = Math.max(1, Math.floor(varCount / 20));

		await this.clearVariableNames();
		for (let i = 1; i <= varCount; i++) {
			const varName = newVarNames[i - 1];
			const varID = this.project.indexForVar(varName);
			if (MB_connection.isConnected()) {
				const nameBytes = Array.from(new TextEncoder().encode(varName));
				if ((i % 32) === 0) {
					// send a sync message every 32 variables
					await MB_connection.sendMsgSync('varNameMsg', varID, nameBytes);
				} else {
					MB_connection.sendMsg('varNameMsg', varID, nameBytes);
				}
			}
			if (this.codeStoreFull) {
				MB_editor.inform('Program is too large to store on board.');
				return true;
			}
			if ((i % progressInterval) === 0) {
				MB_editor.showDownloadProgress(2, i / varCount);
			}
		}
		this.oldVarNames = newVarNames.slice();
		return true;
	}

	runChunk(chunkID) {
		if (MB_connection.vmTooOld()) return;
		MB_connection.sendMsg('startChunkMsg', chunkID);
	}

	stopRunningChunk(chunkID) {
		MB_connection.sendMsg('stopChunkMsg', chunkID);
	}

	sendBroadcastToBoard(msg) {
		MB_connection.sendMsg('broadcastMsg', 0, Array.from(new TextEncoder().encode(msg)));
	}

	getVar(varID) {
		if (varID == null) varID = 0;
		MB_connection.sendMsg('getVarMsg', varID);
	}

	getVarNamed(varName) {
		MB_connection.sendMsg('getVarMsg', 255, Array.from(new TextEncoder().encode(varName)));
	}

	setVar(varID, val) {
		let body = null;
		if (Number.isInteger(val)) {
			body = [1, val & 255, (val >> 8) & 255, (val >> 16) & 255, (val >> 24) & 255];
		} else if (typeof val === 'string') {
			body = Array.from(new TextEncoder().encode(String.fromCharCode(2) + val));
		} else if (typeof val === 'boolean') {
			body = [3, val ? 1 : 0];
		}
		if (body != null) MB_connection.sendMsg('setVarMsg', varID, body);
	}

	async clearVariableNames() {
		if (MB_connection.isConnected()) await MB_connection.sendMsgSync('clearVarsMsg', 1);
		this.oldVarNames = null;
	}

	// --- CRC ---

	buildCRC32Table() {
		this.crc32Table = [];
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) {
				c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
			}
			this.crc32Table[n] = c;
		}
	}

	crc32(data) {
		if ((typeof data) === 'string') {
			// convert string to byte array
			data = new TextEncoder().encode(data);
		}
		let crc = 0 ^ -1;
		for (let i = 0; i < data.length; i++) {
			crc = (crc >>> 8) ^ this.crc32Table[(crc ^ data[i]) & 0xFF];
		}
		return (crc ^ -1) >>> 0; // Return as unsigned 32-bit int
	}
}
