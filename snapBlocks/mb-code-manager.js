// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

/* globals MB_editor, MB_connection, MB_Compiler, waitMSecs */

class MB_CodeManager {
	constructor(aProject) {
		this.project = aProject;
		this.chunkIDs = new Map(); // key (Block or String) -> [id, crc, chunkType, lastSrc, functionMayHaveChanged]
		this.functionChunkIDs = new Map(); // function name -> chunkID
		this.recompileAll = false;
		this.codeStoreFull = false;
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

	evalOnBoard(aBlock, showBytes) {
		if (this.codeStoreFull) {
			MB_editor.showError(aBlock, 'Program is too large to store on board.');
			return;
		}
		if (!(aBlock.parent instanceof ScriptsMorph)) {
			// running a block from the palette
			this.saveAllChunks(true, aBlock);
		}
		this.runChunk(this.lookupChunkID(aBlock));
	}

	isRunning(aBlock) {
		return aBlock.getHighlight.getHighlight != null;
	}

	stopRunningBlock(aBlock) {
		if (this.isRunning(aBlock)) {
			this.stopRunningChunk(this.lookupChunkID(aBlock));
		}
	}

	syncAndStartAll() {
//		this.syncScripts();
		MB_connection.sendMsg('startAllMsg', 1); // chunk type 1 means 16-bit instructions
	}

	stopAndSyncScripts() {
		MB_connection.sendMsg('stopAllMsg');
		this.syncScripts();
	}

	// --- compiling ---

	recompileNeeded() { this.recompileAll = true; }

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
		const bytes = [];
		for (const item of code) {
			if (Array.isArray(item)) {
				this.compiler.addBytesForInstructionTo(item, bytes);
			} else if (Number.isInteger(item)) {
				this.compiler.addBytesForIntegerLiteralTo(item, bytes);
			} else if (typeof item === 'string') {
				this.compiler.addBytesForStringLiteral(item, bytes);
			} else {
				throw new Error('Instruction must be an Array or String: ' + item);
			}
		}
		return bytes;
	}

	chunkBytesFor(aBlockOrFunction) {
		let bytes = this.compiledBytesFor(aBlockOrFunction);
		if (bytes.length > 1000) {
			// Replace compiled code with a stub that just reports a "Script too large" error.
			bytes = this.compiledBytesFor(
				new CommandBlockMorph('command', [255, 0, 0], '[misc:scriptTooLarge]'));
		}
		return bytes;
	}

	// --- chunk management ---

	syncScripts() {
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

		this.saveAllChunks(false);
	}

	lookupChunkID(key) {
		// If the given block or function name has been assigned a chunkID, return it.
		// Otherwise, return null.
		const entry = this.chunkIDs.get(key);
		if (entry == null) return null;
		return entry[0];
	}

	removeObsoleteChunks() {
		// Remove obsolete chunks. Chunks become obsolete when they are deleted or inserted into
		// a script so they are no longer a stand-alone chunk. Functions become obsolete when
		// they are deleted or the library containing them is deleted.
		for (const k of this.chunkIDs.keys()) {
			let isObsolete = false;
			if (k instanceof BlockMorph) {
				const owner = k.parent;
				isObsolete = (owner == null ||
					!(owner instanceof HandMorph ||
					owner instanceof ScriptsMorph ||
					owner instanceof ScrollFrameMorph));
			} else if (typeof k === 'string') {
				isObsolete = (this.project.functionNamed(k) == null);
			}
			if (isObsolete) this.deleteChunkFor(k);
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
		let entry = this.chunkIDs.get(aBlock);
		if (entry == null) {
			const id = this.unusedChunkID();
			entry = [id, null, this.chunkTypeFor(aBlock), '', false];
			this.chunkIDs.set(aBlock, entry); // block -> [id, crc, chunkType, lastSrc, functionMayHaveChanged]
		}
		return entry[0];
	}

	chunkEntryForBlock(aBlock) {
		return this.chunkIDs.get(aBlock) || null;
	}

	blockForChunkID(chunkID) {
		let result = null;
		for (const [key, entry] of this.chunkIDs.entries()) {
			if (entry[0] === chunkID) {
				result = key;
				break;
			}
		}
		if (typeof result === 'string') { // look up function
			result = this.project.functionNamed(result);
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
				const entry = [id, null, this.chunkTypeFor(func), '', true];
				this.chunkIDs.set(fName, entry); // fName -> [id, crc, chunkType, lastSrc, functionMayHaveChanged]
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

	deleteChunkFor(key) {
		if (key instanceof BlockMorph && key.isFunctionDefinition()) {
			key = key.definedFunctionName();
		}
		const entry = this.chunkIDs.get(key);
		if (entry != null && !MB_connection.isConnected()) {
			const chunkID = entry[0];
			MB_connection.sendMsgSync('deleteChunkMsg', chunkID);
			this.chunkIDs.delete(key);
		}
	}

	saveAllChunks(checkCRCs, paletteBlock) {
		// Save the code for all scripts and user-defined functions.
console.log('saveAllChunks A'); // xxx
		if (checkCRCs == null) checkCRCs = true;
		if (!MB_connection.connectedToBoard()) return;
console.log('saveAllChunks B'); // xxx
this.recompileAll = true;

		const t = Date.now();
		const totalScripts = this.project.allFunctions().length + this.project.allScripts().length;
		const progressInterval = Math.max(1, Math.floor(totalScripts / 20));
		let processedScripts = 0;
		let skipHiddenFunctions = true;
		this.saveVariableNamesIfNeeded();
		this.codeStoreFull = false;
		if (this.recompileAll) {
			// Clear the source code field of all chunk entries to force script recompilation
			// and possible re-download since variable offsets have changed.
			MB_connection.suspendCodeFileUpdates();
			for (const entry of this.chunkIDs.values()) {
				entry[3] = '';
				entry[4] = true;
			}
			skipHiddenFunctions = false;
		}
		this.assignFunctionIDs();
		this.removeObsoleteChunks();

		const unusedFuncs = this.project.unusedFunctions(paletteBlock);
		let functionsSaved = 0;
		for (const aFunction of this.project.allFunctions()) {
			if (!unusedFuncs.includes(aFunction.functionName)) {
				if (this.saveChunk(aFunction, skipHiddenFunctions)) {
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
			this.saveChunk(paletteBlock, skipHiddenFunctions);
			scriptsSaved += 1;
		}
		for (const aBlock of this.project.allScripts()) {
			if (!aBlock.isFunctionDefinition()) { // skip function def hat; functions get saved above
				if (this.saveChunk(aBlock, skipHiddenFunctions)) {
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
		if (checkCRCs) this.verifyCRCs();
		MB_connection.resumeCodeFileUpdates();
		MB_editor.showDownloadProgress(3, 1);
	}

	forceSaveChunk(aBlockOrFunction) {
		// Save the chunk for the given block or function even if it was previously saved.
		if (this.chunkIDs.has(aBlockOrFunction)) {
			const entry = this.chunkIDs.get(aBlockOrFunction);
			entry[1] = null; // clear the old CRC
			entry[3] = '';	 // clear the old source
		}
		this.saveChunk(aBlockOrFunction, false);
	}

	saveChunk(aBlockOrFunction, skipHiddenFunctions) {
		// Save the given script or function as an executable code "chunk".
		// Also save the source code (in GP format) and the script position.
		if (this.codeStoreFull) return;
		if (skipHiddenFunctions == null) skipHiddenFunctions = true; // optimize by default

		if (typeof aBlockOrFunction === 'string') {
			aBlockOrFunction = this.project.functionNamed(aBlockOrFunction);
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
			entry = this.chunkIDs.get(aBlockOrFunction);
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
		let crcOptimization = false; // xxx disabled for testing
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
console.log('saving chunk A', chunkID, 'len', chunkBytes.length, 'type', chunkType, chunkCRC); // xxx

		if (this.storeChunkOnBoard(chunkID, data, chunkCRC)) {
			entry[1] = chunkCRC; // remember the CRC of the code we just saved
		} else {
			console.log('Failed to save chunk:', chunkID);
			entry[1] = null; // save failed; clear CRC
		}

		// restart the chunk if it was running
		if (restartChunk) {
			this.stopRunningChunk(chunkID);
			this.waitForResponse();
			this.runChunk(chunkID);
			this.waitForResponse();
		}
		return true;
	}

	async storeChunkOnBoard(chunkID, data, chunkCRC) {
		// Send the given chunk to the board and wait for the board to return the CRC.
		// That ensures that the chunk has been saved to Flash memory.
		// This can take several seconds if the board does a Flash compaction.

		this.lastCRC = null;
		MB_connection.sendMsg('chunkCode16Msg', chunkID, data);

		// wait for CRC to be reported
		const timeout = 3000; // must be less than ping timeout
		const startT = Date.now();
		while (!this.arraysEqual(this.lastCRC, chunkCRC) && (Date.now() - startT) < timeout) {
			MB_connection.processMessages();
			if (this.codeStoreFull) return false;
			await waitMSecs(1);
		}
console.log('sent chunk', chunkID, this.arraysEqual(this.lastCRC, chunkCRC), Date.now() - startT);

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

	verifyCRCs() {
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
			this.collectCRCsIndividually();
		} else {
			this.collectCRCsBulk();
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
			if (typeof key === 'string') {
				if (this.project.functionNamed(key) == null) {
					this.chunkIDs.delete(key); // remove reference to deleted function (rarely needed)
				}
				if (unusedFuncs.includes(key)) {
					this.chunkIDs.delete(key); // unused function; does not need to be saved to board
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
				this.forceSaveChunk(sourceItem);
				MB_editor.showDownloadProgress(3, processedCount / totalCount);
			}
			processedCount += 1;
		}

		// check for missing chunks
		for (const chunkID of ideChunks.keys()) {
			if (!this.crcDict.has(chunkID)) {
				console.log('Resaving missing chunk:', chunkID);
				const sourceItem = ideChunks.get(chunkID);
				this.forceSaveChunk(sourceItem);
				MB_editor.showDownloadProgress(3, processedCount / totalCount);
			}
			processedCount += 1;
		}
		MB_editor.showDownloadProgress(3, 1);
	}

	boardHasSameProject() {
		// Return true if the board appears to have the same project as the IDE.
		if (!MB_connection.connectedToBoard()) return false;
		if (this.chunkIDs.size === 0) return false; // empty project

		// update chunkIDs dictionary for script/function additions or removals while disconnected
		this.assignFunctionIDs();
		for (const aBlock of this.project.allScripts()) {
			if (!aBlockisFunctionDefinition()) { // skip function def hat; functions get IDs above
				this.ensureChunkIdFor(aBlock);
			}
		}

		// collect CRCs from the board
		this.crcDict = new Map();
		this.collectCRCsBulk();

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

		// count matching chunks
		let matchCount = 0;
		for (const chunkID of this.crcDict.keys()) {
			const entry = ideChunks.get(chunkID);
			if (entry != null && this.arraysEqual(this.crcDict.get(chunkID), crcForChunkID.get(chunkID))) {
				matchCount += 1;
			}
		}

		// count chunks that have changed or are entirely missing from the board
		let changedOrMissingCount = 0;
		for (const chunkID of ideChunks.keys()) {
			if (!this.crcDict.has(chunkID) ||
				!this.arraysEqual(this.crcDict.get(chunkID), crcForChunkID.get(chunkID))) {
				changedOrMissingCount += 1;
			}
		}

		return (matchCount > 3 && matchCount > changedOrMissingCount);
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
console.log('code manager crcReceived', chunkID, chunkCRC);
		this.lastCRC = chunkCRC;
		if (this.crcDict != null) {
			this.crcDict.set(chunkID, chunkCRC);
		}
	}

	async collectCRCsBulk() {
		// Collect the CRC's from all chunks on the board via a bulk CRC request.
		this.crcDict = null;

		// request CRCs for all chunks on board
		MB_connection.sendMsgSync('getAllCRCsMsg', 1);

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

	saveVariableNamesIfNeeded() {
		// If the variables list has changed, save the new variable names.
		// Return true if variables have changed, false otherwise.
		const newVarNames = this.project.allVariableNames();
		if (this.arraysEqual(this.oldVarNames, newVarNames)) return false;

		const varCount = newVarNames.length;
		const progressInterval = Math.max(1, Math.floor(varCount / 20));

		this.clearVariableNames();
		for (let i = 1; i <= varCount; i++) {
			const varName = newVarNames[i - 1];
			const varID = this.project.indexForVar(varName);
			if (!MB_connection.isConnected()) {
				const nameBytes = Array.from(new TextEncoder().encode(varName));
				if ((i % 32) === 0) {
					// send a sync message every 32 variables
					MB_connection.sendMsgSync('varNameMsg', varID, nameBytes);
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

	clearVariableNames() {
		if (!MB_connection.isConnected()) MB_connection.sendMsgSync('clearVarsMsg', 1);
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
