// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-decompiler.js - Decompiles bytecodes back to block trees
// XXX Preliminary port; not yet tested or debugged!
// XXX Currently outputs parse trees (block tree nodes) not blocks.

/* globals MB_Compiler, MB_Function, MB_Module, MB_Project, MB_Specs */

/*
  Block tree nodes produced by the decompiler:
    Command: { selector, args: [...], next: <cmd|null>, isReporter: false }
    Reporter: { selector, args: [...], isReporter: true, next: null }
    Function: { isFunction: true, functionName, argNames: [...], cmdList: <cmd|null> }

  Opcode tuples (0-based):  [addr, op, arg, primCall]
  Control-structure tuples: [type, endAddr, rangeStart, rangeEnd, ...]
*/

class MB_Decompiler {
	constructor() {
		this.chunks = [];          // [[chunkID, chunkType, chunkData], ...]
		this.vars   = new Map();   // varID (number) → name (string)
		this.funcs  = new Map();   // chunkID → function name

		// per-decompile state (reset in extractOpcodes / decompile)
		this.opcodes           = [];   // opcode tuples, 0-based
		this.controlStructures = [];   // parallel to opcodes; null or ctrl record
		this.code              = [];   // command accumulator
		this.stack             = [];   // expression stack
		this.reporters         = null; // built lazily by buildReporterSet()
		this.msgName           = null;
		this.localNames        = [];
		this.argNames          = [];
		this.functionName      = null;
		this.functionLibrary   = null;
		this.functionSpecInfo  = [];
	}

	// --- Public API ---

	addChunk(chunkID, chunkType, chunkData) {
		this.chunks.push([chunkID, chunkType, chunkData]);
	}

	addVar(varID, varName) {
		this.vars.set(varID, varName);
	}

	decompileProject() {
		const project = new MB_Project();
		for (const varName of this.vars.values()) {
			project.addVariable(varName);
		}

		// pass 1: assign function names
		for (const [chunkID, chunkType, chunkData] of this.chunks) {
			if (chunkType === 3) {
				this.funcs.set(chunkID, this.nameForFunction(chunkID, chunkData));
			}
		}

		// pass 2: decompile each chunk
		const scripts = [];
		for (const [chunkID, chunkType, chunkData] of this.chunks) {
			const gpCode = this.decompile(chunkID, chunkType, chunkData);
			if (!gpCode) continue;
			if (gpCode.isFunction) {
				this.addFunctionToProject(gpCode, project);
			} else if (gpCode.selector === 'comment') {
				// ignore stand-alone comments
			} else {
				const x = Math.floor(Math.random() * 350) + 50;
				const y = Math.floor(Math.random() * 250) + 50;
				scripts.push([x, y, gpCode]);
			}
		}
		project.main.scripts = scripts;
		return project;
	}

	// --- Opcode tuple accessors ---
	// Tuple format: [addr, op, arg, primCall]  (all 0-based)

	cmdOp(cmd)  { return cmd[1]; }
	cmdArg(cmd) { return cmd[2]; }

	cmdIs(cmd, op, arg) {
		return cmd != null && cmd[1] === op && cmd[2] === arg;
	}

	jumpTarget(jmpCmd) {
		// Return the 0-based opcode index that this jump lands on.
		let extra = 0;
		const addr = jmpCmd[0];
		if (addr + 1 < this.opcodes.length && this.opcodes[addr + 1][1] === 'placeholder') {
			extra = 1;
		}
		return addr + extra + jmpCmd[2] + 1;
	}

	opcodeAfter(i) {
		i++;
		while (i < this.opcodes.length && this.opcodes[i][1] === 'placeholder') i++;
		return i;
	}

	opcodeBefore(i) {
		i--;
		while (i >= 0 && this.opcodes[i][1] === 'placeholder') i--;
		return i;
	}

	// --- Opcode extraction ---

	extractOpcodes(chunkData) {
		// Build an array mapping opcode-number → op-name.
		const compiler = new MB_Compiler(null);
		const opcodeToName = new Array(256).fill(null);
		for (const [name, num] of compiler.opcodes) {
			opcodeToName[num] = name;
		}

		this.opcodes  = [];
		this.msgName  = null;
		const byteCount = chunkData.length;
		let i = 0;
		let op = null;

		while (i + 1 < byteCount && op !== 'codeEnd') {
			const addr = Math.floor(i / 2);
			op = opcodeToName[chunkData[i]] || ('op' + chunkData[i]);
			let arg = chunkData[i + 1];
			let extraWords = 0;
			let primCall = null;
			i += 2;

			if (op === 'pushImmediate') {
				if ((arg & 1) === 1) {
					arg = (arg << 23) >> 24; // 7-bit signed integer
				} else if (arg === 0) {
					arg = false;
				} else if (arg === 4) {
					arg = true;
				}
			} else if (op === 'pushLargeInteger') {
				arg |= (chunkData[i] << 8);
				arg |= (chunkData[i + 1] << 16);
				arg = (arg << 7) >> 8; // integer object → signed integer
				extraWords = 1;
			} else if (op === 'pushHugeInteger') {
				arg = chunkData[i] >> 1;
				arg |= (chunkData[i + 1] << 7);
				arg |= (chunkData[i + 2] << 15);
				arg |= (chunkData[i + 3] << 23);
				extraWords = 2;
			} else if (op === 'pushLiteral') {
				const offset = chunkData[i] | (chunkData[i + 1] << 8);
				arg = this.readLiteral(chunkData, i + (2 * offset));
				extraWords = 1;
			} else if (['jmp','jmpTrue','jmpFalse','jmpOr','jmpAnd','decrementAndJmp','waitUntil'].includes(op)) {
				if (arg === 0) {
					arg = chunkData[i] | (chunkData[i + 1] << 8);
					if (arg > 32767) arg -= 65536;
					extraWords = 1;
				} else {
					if (arg > 127) arg -= 256; // 8-bit signed
				}
			} else if (op === 'exitLoop') {
				arg = chunkData[i] | (chunkData[i + 1] << 8);
				if (arg > 32767) arg -= 65536;
				extraWords = 1;
			} else if (op === 'commandPrimitive' || op === 'reporterPrimitive') {
				const fullArg = arg | (chunkData[i] << 8) | (chunkData[i + 1] << 16);
				const primSetIdx   = (fullArg >> 18) & 63;
				const primNameOff  = (fullArg >> 8) & 1023;
				const primSetName  = this.primSetNameForIndex(compiler, primSetIdx);
				const primName     = this.readLiteral(chunkData, i + (2 * primNameOff));
				arg = fullArg & 255; // argument count
				primCall = '[' + primSetName + ':' + primName + ']';
				extraWords = 1;
			} else if (op === 'callFunction') {
				arg = chunkData[i] | (chunkData[i + 1] << 8);
				extraWords = 1;
			}

			this.opcodes.push([addr, op, arg, primCall]);
			for (let w = 0; w < extraWords; w++) {
				this.opcodes.push([addr + 1, 'placeholder', 0, null]);
				i += 2;
			}
		}

		const hasMetadata = this.readMetadata(chunkData);
		if (!hasMetadata) this.findArgs();
	}

	primSetNameForIndex(compiler, index) {
		for (const [name, idx] of compiler.primsets) {
			if (idx === index) return name;
		}
		return 'unknown';
	}

	readLiteral(chunkData, startByte) {
		if (startByte + 3 >= chunkData.length) return '';
		const byte0   = chunkData[startByte];
		if ((byte0 & 15) !== 4) return ''; // not a string object
		let wordCount = (byte0 >> 4)
			| (chunkData[startByte + 1] << 4)
			| (chunkData[startByte + 2] << 12)
			| (chunkData[startByte + 3] << 20);
		if ((startByte + 4 + 4 * wordCount) > chunkData.length) return '';
		const end = startByte + 4 + 4 * wordCount;
		const bytes = [];
		for (let i = startByte + 4; i < end; i++) {
			if (chunkData[i] !== 0) bytes.push(chunkData[i]);
		}
		return new TextDecoder().decode(new Uint8Array(bytes));
	}

	bytesForLiteralAt(chunkData, startByte) {
		if (startByte + 3 >= chunkData.length) return chunkData.length - startByte;
		const byte0 = chunkData[startByte];
		if ((byte0 & 15) !== 4) return chunkData.length - startByte;
		let wordCount = (byte0 >> 4)
			| (chunkData[startByte + 1] << 4)
			| (chunkData[startByte + 2] << 12)
			| (chunkData[startByte + 3] << 20);
		if ((startByte + 4 + 4 * wordCount) > chunkData.length) return chunkData.length - startByte;
		return 4 * (wordCount + 1);
	}

	readMetadata(chunkData) {
		if (this.opcodes.length === 0) return false;

		this.functionName     = null;
		this.functionLibrary  = null;
		this.functionSpecInfo = [];
		this.localNames       = [];
		this.argNames         = [];

		const codeEndOp  = 127;
		const metadataOp = 240;

		// Byte position immediately after the last instruction word.
		const lastAddr = this.opcodes[this.opcodes.length - 1][0];
		let i = 2 * lastAddr + 2;
		const end = chunkData.length;

		if (i < end && chunkData[i] === codeEndOp) i += 2; // skip extra codeEnd

		// Skip string literals to find the metadata opcode byte.
		while (i < end && chunkData[i] !== metadataOp) {
			i += this.bytesForLiteralAt(chunkData, i);
		}
		if (i >= end || chunkData[i] !== metadataOp) return false;

		// Read four null-terminated UTF-8 strings that follow the metadata byte.
		i++; // skip metadata opcode byte
		const strings = [];
		while (i < end) {
			const nullIdx = chunkData.indexOf(0, i);
			if (nullIdx < 0 || nullIdx >= end) break;
			strings.push(new TextDecoder().decode(chunkData.slice(i, nullIdx)));
			i = nullIdx + 1;
		}
		if (strings.length < 4) return false;

		this.functionLibrary  = strings[0];
		this.functionSpecInfo = strings[1].split('\t');
		const localAndArgNames = strings[2].split('\t').filter(s => s.length > 0);
		this.functionName = strings[3];

		const localCount = this.opcodes[0][2]; // initLocals arg = number of locals
		this.localNames  = localAndArgNames.slice(0, localCount);
		this.argNames    = localAndArgNames.slice(localCount);

		return true;
	}

	findArgs() {
		// No metadata — generate argument names from the max arg index used.
		let maxArgIndex = -1;
		for (const cmd of this.opcodes) {
			if (['pushArg','storeArg','incrementArg'].includes(cmd[1])) {
				if (cmd[2] > maxArgIndex) maxArgIndex = cmd[2];
			}
		}
		this.argNames = [];
		for (let i = 0; i <= maxArgIndex; i++) {
			this.argNames.push('A' + (i + 1));
		}
	}

	// --- Control structure detection ---

	recordControlStructure(i, newRec) {
		const existing = this.controlStructures[i];
		if (existing == null) {
			this.controlStructures[i] = newRec;
			return;
		}
		const newEnd = Math.max(existing[1], newRec[1]);
		if (existing[0] === 'multiple') {
			existing.push(newRec);
			existing[1] = newEnd;
		} else {
			this.controlStructures[i] = ['multiple', newEnd, existing, newRec];
		}
	}

	findLoops() {
		for (let i = 0; i < this.opcodes.length; i++) {
			const cmd = this.opcodes[i];
			if (!['jmp','jmpFalse','decrementAndJmp','waitUntil'].includes(cmd[1])) continue;
			if (cmd[2] >= 0) continue;

			const loopType = this.loopTypeAt(i);
			let loopEnd = i;
			let loopRec = null;
			let loopStart;

			if (loopType === 'ignore') {
				continue;
			} else if (loopType === 'whenCondition') {
				loopStart = 1; // 0-based (GP source uses 1-based index 2)
				const conditionStart = 3; // 0-based (GP: 4)
				const conditionEnd   = this.opcodeBefore(i);
				const bodyStart      = this.opcodeAfter(i);
				loopEnd              = this.opcodeBefore(this.opcodes.length - 1);
				const bodyEnd        = this.opcodeBefore(loopEnd);
				loopRec = ['whenCondition', loopEnd, conditionStart, conditionEnd, bodyStart, bodyEnd];
			} else if (loopType === 'repeatUntil') {
				const bodyStart      = this.jumpTarget(cmd);
				loopStart            = this.opcodeBefore(bodyStart);
				const conditionStart = this.jumpTarget(this.opcodes[loopStart]);
				const conditionEnd   = this.opcodeBefore(i);
				const bodyEnd        = this.opcodeBefore(conditionStart);
				loopRec = ['repeatUntil', loopEnd, conditionStart, conditionEnd, bodyStart, bodyEnd];
			} else if (loopType === 'waitUntil') {
				loopStart            = this.jumpTarget(cmd);
				const conditionStart = loopStart;
				const conditionEnd   = this.opcodeBefore(i);
				loopRec = ['waitUntil', loopEnd, conditionStart, conditionEnd];
			} else if (loopType === 'for') {
				const bodyStart = this.jumpTarget(cmd);
				loopStart = bodyStart - 3;
				if (this.opcodes[bodyStart - 1][1] === 'placeholder') loopStart--;
				const bodyEnd = this.opcodeBefore(this.opcodeBefore(i));
				loopEnd = this.opcodeAfter(i);
				const forIndexVar = this.opcodes[i - 1][2]; // forLoop instruction arg
				loopRec = ['for', loopEnd, bodyStart, bodyEnd, forIndexVar];
			} else if (loopType === 'repeat') {
				const bodyStart = this.jumpTarget(cmd);
				loopStart       = this.opcodeBefore(bodyStart);
				const bodyEnd   = this.opcodeBefore(i);
				loopRec = ['repeat', loopEnd, bodyStart, bodyEnd];
			} else { // forever
				const bodyStart = this.jumpTarget(cmd);
				loopStart       = bodyStart;
				const bodyEnd   = this.opcodeBefore(i);
				loopRec = ['forever', loopEnd, bodyStart, bodyEnd];
				// Ignore the final jmp of a whenCondition hat — it is not a forever loop.
				if (bodyStart === 1 &&
					i === this.opcodeBefore(this.opcodes.length - 1) &&
					this.isInWhenCondition()) {
					loopRec = null;
				}
			}

			if (loopRec != null) {
				this.recordControlStructure(loopStart, loopRec);
			}
		}
	}

	loopTypeAt(i) {
		const op = this.opcodes[i][1];
		if (op === 'decrementAndJmp') return 'repeat';
		if (op === 'waitUntil')       return 'waitUntil';
		if (op === 'jmp') {
			const prev = this.opcodes[i - 1];
			return (prev && prev[1] === 'forLoop') ? 'for' : 'forever';
		}
		if (op === 'jmpFalse') {
			const loopStart = this.jumpTarget(this.opcodes[i]);
			const lastIdx   = this.opcodeBefore(this.opcodes.length - 1);
			const lastOp    = this.opcodes[lastIdx];
			if (loopStart === 1 &&            // 0-based equivalent of GP's 1-based index 2
				lastOp && lastOp[1] === 'jmp' &&
				this.jumpTarget(lastOp) === 1) {
				return 'whenCondition';
			}
			return 'repeatUntil';
		}
		return 'unknown loop type';
	}

	isInWhenCondition() {
		const rec = this.controlStructures[1]; // 0-based (GP: index 2)
		if (rec == null) return false;
		if (rec[0] === 'whenCondition') return true;
		if (rec[0] === 'multiple' && rec[2] && rec[2][0] === 'whenCondition') return true;
		return false;
	}

	findIfs() {
		for (let i = 0; i < this.opcodes.length; i++) {
			const cmd = this.opcodes[i];
			if (cmd[1] !== 'jmpFalse' || cmd[2] < 0 || this.isAnd(cmd)) continue;

			const trueStart      = this.opcodeAfter(i);
			const trueEnd        = this.opcodeBefore(this.jumpTarget(cmd));
			const lastOfTrue     = this.opcodes[trueEnd];
			let conditionalRec;

			if (lastOfTrue && lastOfTrue[1] === 'jmp') {
				const falseStart = this.opcodeAfter(trueEnd);
				const falseEnd   = this.opcodeBefore(this.jumpTarget(lastOfTrue));
				conditionalRec = ['if-else', falseEnd, trueStart, this.opcodeBefore(trueEnd), falseStart, falseEnd];
			} else {
				conditionalRec = ['if', trueEnd, trueStart, trueEnd];
			}
			this.recordControlStructure(i, conditionalRec);
		}
	}

	isAnd(cmd) {
		if (cmd[1] !== 'jmpFalse') return false;
		const t = this.jumpTarget(cmd);
		if (t >= this.opcodes.length) return false;
		return this.cmdIs(this.opcodes[t - 1], 'jmp', 1) &&
		       this.cmdIs(this.opcodes[t],     'pushImmediate', false);
	}

	fixLocals() {
		// Change the first storeLocal for each variable to declareLocal.
		const declared = new Set();
		for (const cmd of this.opcodes) {
			if (cmd[1] === 'storeLocal') {
				if (!declared.has(cmd[2])) {
					cmd[1] = 'declareLocal';
					declared.add(cmd[2]);
				}
			}
		}
	}

	// --- Top-level decompile ---

	nameForFunction(chunkID, chunkData) {
		this.functionName = null;
		this.extractOpcodes(chunkData);
		if (this.functionName != null) return this.functionName;
		// Parameterless function: look for pushLiteral + recvBroadcast prefix.
		if (this.opcodes.length >= 3 &&
			this.opcodes[2][1] === 'recvBroadcast' &&
			this.opcodes[1][1] === 'pushLiteral') {
			return this.opcodes[1][2];
		}
		return 'func' + chunkID;
	}

	decompile(chunkID, chunkType, chunkData) {
		this.extractOpcodes(chunkData);
		this.controlStructures = new Array(this.opcodes.length).fill(null);
		this.findLoops();
		this.findIfs();
		this.fixLocals();

		// Remove final codeEnd before generating code.
		const last = this.opcodes[this.opcodes.length - 1];
		if (this.cmdIs(last, 'codeEnd', 0)) this.opcodes.pop();

		let gpCode = this.codeForSequence(0, this.opcodes.length - 1);
		gpCode = this.removePrefix(gpCode);
		gpCode = this.addHatBlock(chunkID, chunkType, gpCode);
		if (gpCode == null) return this.newCmd('comment', 'Stand-alone comment');
		this.fixBooleanAndColorArgs(gpCode);
		return gpCode;
	}

	removePrefix(gpCode) {
		// Remove the recvBroadcast prefix from parameterless functions.
		if (gpCode == null) return null;
		if (gpCode.selector === 'recvBroadcast') {
			this.msgName = gpCode.args[0] ?? null;
			gpCode = gpCode.next;
		}
		return gpCode;
	}

	addHatBlock(chunkID, chunkType, gpCode) {
		if (chunkType === 3) { // function definition
			if (!this.funcs.has(chunkID)) {
				if (this.functionName == null) this.functionName = 'func' + chunkID;
				this.funcs.set(chunkID, this.functionName);
			}
			const fName = this.funcs.get(chunkID) || 'unknown function';
			return { isFunction: true, functionName: fName, argNames: this.argNames.slice(), cmdList: gpCode };
		} else if (chunkType === 4) {
			const hat = this.newCmd('whenStarted'); hat.next = gpCode; return hat;
		} else if (chunkType === 5) {
			return gpCode; // whenCondition hat already built
		} else if (chunkType === 6) {
			const hat = this.newCmd('whenBroadcastReceived', this.msgName); hat.next = gpCode; return hat;
		} else if (chunkType === 7) {
			const hat = this.newCmd('whenButtonPressed', 'A'); hat.next = gpCode; return hat;
		} else if (chunkType === 8) {
			const hat = this.newCmd('whenButtonPressed', 'B'); hat.next = gpCode; return hat;
		} else if (chunkType === 9) {
			const hat = this.newCmd('whenButtonPressed', 'A+B'); hat.next = gpCode; return hat;
		}
		return gpCode;
	}

	fixBooleanAndColorArgs(gpCode) {
		for (const block of this.allBlocks(gpCode)) {
			const specArray = MB_Specs.specArrayForSelector(block.selector);
			if (!specArray) continue;
			const typeString = specArray[3] || '';
			const types = typeString.split(/\s+/).filter(t => t.length > 0);
			const args = block.args;
			for (let i = 0; i < Math.min(types.length, args.length); i++) {
				const slotType = types[i].split('.')[0]; // strip menu suffix
				const val = args[i];
				if (slotType === 'color' && typeof val === 'number') {
					args[i] = { r: (val >> 16) & 255, g: (val >> 8) & 255, b: val & 255, isColor: true };
				} else if (slotType !== 'bool' && typeof val === 'boolean') {
					args[i] = this.newRep('booleanConstant', val);
				}
			}
		}
	}

	allBlocks(root) {
		const result = [];
		const todo = root ? [root] : [];
		while (todo.length > 0) {
			const b = todo.shift();
			if (!b || typeof b !== 'object' || b.isColor) continue;
			if (b.selector) result.push(b);
			for (const arg of (b.args || [])) {
				if (arg && typeof arg === 'object' && !arg.isColor) todo.push(arg);
			}
			if (b.next) todo.push(b.next);
		}
		return result;
	}

	// --- Main decode loop ---

	codeForSequence(start, end) {
		if (!this.reporters) this.buildReporterSet();

		// Save and reset per-sequence state (supports recursion).
		const oldCode  = this.code;
		const oldStack = this.stack;
		this.code  = [];
		this.stack = [];

		let i = start;
		while (i <= end) {
			const opc  = this.opcodes[i];
			let op     = opc[1];
			let next   = i + 1;
			const ctrl = this.controlStructures[i];
			if (ctrl != null) {
				op   = ctrl[0];
				next = ctrl[1] + 1;
			}

			if (op === 'placeholder') {
				i = next;
			} else if (op === 'jmpTrue') {
				i = this.decodeConditionalExpression(i);
			} else if (op === 'jmpAnd' || op === 'jmpOr') {
				i = this.decodeNewANDorORreporter(op, i);
			} else if (op === 'callFunction') {
				const opArg    = opc[2];
				const argCount = opArg & 255;
				const callee   = (opArg >> 8) & 255;
				const fName    = this.funcs.get(callee) || 'unknown function';
				const nextIdx  = this.opcodeAfter(i);
				const isReporter = !this.cmdIs(this.opcodes[nextIdx], 'pop', 1);
				if (isReporter) {
					this.stack.push(this.buildCmdOrReporter(fName, argCount, true));
					i += 2;
				} else {
					this.code.push(this.buildCmdOrReporter(fName, argCount, false));
					i += 3;
				}
			} else if (op === 'multiple') {
				// Process the outermost (last) nested control structure.
				const innerCmd = ctrl.pop();
				if (ctrl.length < 3) this.controlStructures[i] = null;
				const innerOp   = innerCmd[0];
				next = innerCmd[1] + 1;
				if (innerOp === 'forever') {
					this.code.push(this.newCmd('forever', this.codeForSequence(innerCmd[2], innerCmd[3])));
				} else if (innerOp === 'repeat') {
					this.code.push(this.newCmd('repeat', this.stack.pop(), this.codeForSequence(innerCmd[2], innerCmd[3])));
				} else if (innerOp === 'repeatUntil') {
					const cond = this.codeForSequence(innerCmd[2], innerCmd[3]);
					const body = this.codeForSequence(innerCmd[4], innerCmd[5]);
					this.code.push(this.newCmd('repeatUntil', cond, body));
				} else if (innerOp === 'waitUntil') {
					this.code.push(this.newCmd('waitUntil', this.codeForSequence(innerCmd[2], innerCmd[3])));
				}
				i = next;
			} else if (op === 'callCustomCommand' || op === 'callCustomReporter') {
				const nextIdx    = this.opcodeAfter(i);
				const isReporter = !this.cmdIs(this.opcodes[nextIdx], 'pop', 1);
				this.decodeCmd(i);
				i = isReporter ? i + 1 : i + 2;
			} else {
				this.decodeCmd(i);
				i = next;
			}
		}

		let result = null;
		if (this.code.length === 0 && this.stack.length === 1) {
			result = this.stack[0]; // single expression result
		} else {
			if (this.stack.length > 0) console.warn('MB_Decompiler: non-empty stack after sequence');
			if (this.code.length > 0) {
				// Chain all commands together via their next links.
				for (let j = 0; j < this.code.length - 1; j++) {
					this.code[j].next = this.code[j + 1];
				}
				result = this.code[0];
			}
		}

		this.code  = oldCode;
		this.stack = oldStack;
		return result;
	}

	decodeNewANDorORreporter(op, i) {
		const gpOp  = (op === 'jmpAnd') ? 'and' : 'or';
		const start = this.opcodeAfter(i);
		const end   = i + this.opcodes[i][2];
		const arg1  = this.stack.pop();
		const arg2  = this.codeForSequence(start, end);
		this.stack.push(this.newRep(gpOp, arg1, arg2));
		return end + 1;
	}

	decodeConditionalExpression(i) {
		// Note: the false case comes first in compiled code.
		const start      = this.opcodeAfter(i);
		const endOfFalse = i + this.opcodes[i][2];
		const end        = endOfFalse + this.opcodes[endOfFalse][2];
		const arg1 = this.stack.pop();
		const arg2 = this.codeForSequence(endOfFalse + 1, end);  // true case
		const arg3 = this.codeForSequence(start, endOfFalse - 1); // false case
		this.stack.push(this.newRep('ifExpression', arg1, arg2, arg3));
		return end + 1;
	}

	decodeCmd(i) {
		const opc  = this.opcodes[i];
		let cmdArgVal = opc[2];
		let op        = opc[1];
		let ctrl      = null;

		if (this.controlStructures[i] != null) {
			ctrl = this.controlStructures[i];
			op   = ctrl[0];
			this.controlStructures[i] = null; // prevent infinite recursion
		}

		// Immediate values
		if (op === 'halt') {
			this.code.push(this.newCmd('stopTask'));

		} else if (['pushImmediate','pushLiteral','pushLargeInteger','pushHugeInteger'].includes(op)) {
			this.stack.push(cmdArgVal);

		// Variables — global
		} else if (op === 'pushGlobal') {
			this.stack.push(this.newRep('v', this.globalVarName(cmdArgVal)));
		} else if (op === 'storeGlobal') {
			this.code.push(this.newCmd('=', this.globalVarName(cmdArgVal), this.stack.pop()));
		} else if (op === 'incrementGlobal') {
			this.code.push(this.newCmd('+=', this.globalVarName(cmdArgVal), this.stack.pop()));

		// Variables — arguments
		} else if (op === 'pushArgCount') {
			this.stack.push(this.newRep('pushArgCount'));
		} else if (op === 'pushArg') {
			this.stack.push(this.newRep('v', this.argName(cmdArgVal)));
		} else if (op === 'storeArg') {
			this.code.push(this.newCmd('=', this.argName(cmdArgVal), this.stack.pop()));
		} else if (op === 'incrementArg') {
			this.code.push(this.newCmd('+=', this.argName(cmdArgVal), this.stack.pop()));

		// Variables — local
		} else if (op === 'pushLocal') {
			this.stack.push(this.newRep('v', this.localVarName(cmdArgVal)));
		} else if (op === 'storeLocal') {
			this.code.push(this.newCmd('=', this.localVarName(cmdArgVal), this.stack.pop()));
		} else if (op === 'incrementLocal') {
			this.code.push(this.newCmd('+=', this.localVarName(cmdArgVal), this.stack.pop()));
		} else if (op === 'declareLocal') {
			this.code.push(this.newCmd('local', this.localVarName(cmdArgVal), this.stack.pop()));

		} else if (op === 'initLocals') {
			// skip — handled by extractOpcodes / readMetadata

		} else if (op === 'pop') {
			this.code.push(this.buildCmdOrReporter('pop', cmdArgVal, false));

		} else if (op === 'returnResult') {
			this.code.push(this.buildCmdOrReporter('return', 1, false));

		} else if (op === 'digitalSet') {
			this.code.push(this.newCmd('digitalWriteOp', cmdArgVal, true));
		} else if (op === 'digitalClear') {
			this.code.push(this.newCmd('digitalWriteOp', cmdArgVal, false));

		// Control structures (from controlStructures array)
		} else if (op === 'if') {
			this.code.push(this.newCmd('if',
				this.stack.pop(),
				this.codeForSequence(ctrl[2], ctrl[3])));

		} else if (op === 'if-else') {
			const ifPart   = this.codeForSequence(ctrl[2], ctrl[3]);
			const elsePart = this.codeForSequence(ctrl[4], ctrl[5]);
			if (elsePart && elsePart.selector === 'if' && !elsePart.next) {
				// Combine nested if's into a single if block.
				this.code.push(this.newCmd('if', this.stack.pop(), ifPart, ...elsePart.args));
			} else {
				this.code.push(this.newCmd('if', this.stack.pop(), ifPart, true, elsePart));
			}

		} else if (op === 'exitLoop') {
			this.code.push(this.newCmd('exitLoop'));

		} else if (op === 'for') {
			const body         = this.codeForSequence(ctrl[2], ctrl[3]);
			const indexVarName = this.localVarName(ctrl[4]);
			this.code.push(this.newCmd('for', indexVarName, this.stack.pop(), body));

		} else if (op === 'forever') {
			this.code.push(this.newCmd('forever', this.codeForSequence(ctrl[2], ctrl[3])));

		} else if (op === 'repeat') {
			this.code.push(this.newCmd('repeat', this.stack.pop(), this.codeForSequence(ctrl[2], ctrl[3])));

		} else if (op === 'repeatUntil') {
			const cond = this.codeForSequence(ctrl[2], ctrl[3]);
			const body = this.codeForSequence(ctrl[4], ctrl[5]);
			this.code.push(this.newCmd('repeatUntil', cond, body));

		} else if (op === 'waitUntil') {
			this.code.push(this.newCmd('waitUntil', this.codeForSequence(ctrl[2], ctrl[3])));

		} else if (op === 'whenCondition') {
			const cond = this.codeForSequence(ctrl[2], ctrl[3]);
			const body = this.codeForSequence(ctrl[4], ctrl[5]);
			const hat  = this.newCmd('whenCondition', cond);
			if (body) hat.next = body;
			this.code.push(hat);

		// Primitive ops — named primitives [primSetName:primName]
		} else if (op === 'commandPrimitive') {
			this.code.push(this.buildCmdOrReporter(opc[3], cmdArgVal, false));
		} else if (op === 'reporterPrimitive') {
			this.stack.push(this.buildCmdOrReporter(opc[3], cmdArgVal, true));

		// Everything else: reporters go on the stack, commands go in code.
		} else if (this.reporters.has(op)) {
			this.stack.push(this.buildCmdOrReporter(op, cmdArgVal, true));
		} else {
			this.code.push(this.buildCmdOrReporter(op, cmdArgVal, false));
		}

		if (ctrl != null) this.controlStructures[i] = ctrl; // restore
	}

	buildCmdOrReporter(op, argCount, isReporter) {
		const args = new Array(argCount);
		for (let j = argCount - 1; j >= 0; j--) {
			args[j] = this.stack.pop() ?? null;
		}
		return { selector: op, args, isReporter, next: null };
	}

	buildReporterSet() {
		this.reporters = new Set(['pushArgCount', 'getArg']);
		for (const spec of MB_Specs.mbBlockSpecs()) {
			if (Array.isArray(spec) && spec[0] === 'r') {
				const op = spec[1];
				if (!op.startsWith('[')) this.reporters.add(op);
			}
		}
	}

	// --- Name helpers ---

	globalVarName(vIndex) {
		return this.vars.has(vIndex) ? this.vars.get(vIndex) : 'V' + vIndex;
	}

	localVarName(vIndex) {
		if (vIndex >= 0 && vIndex < this.localNames.length) return this.localNames[vIndex];
		return 'L' + vIndex;
	}

	argName(vIndex) {
		if (vIndex >= 0 && vIndex < this.argNames.length) return this.argNames[vIndex];
		return 'A' + vIndex;
	}

	// --- Block tree constructors ---

	newCmd(op, ...args) {
		return { selector: op, args, isReporter: false, next: null };
	}

	newRep(op, ...args) {
		return { selector: op, args, isReporter: true, next: null };
	}

	// --- Project assembly ---

	addFunctionToProject(aFunc, project) {
		let targetModule = project.main;
		const libName    = this.functionLibrary || '';

		if (libName) {
			let lib = project.libraryNamed(libName);
			if (!lib) {
				lib = new MB_Module(libName);
				project.libraries.push(lib);
			}
			targetModule = lib;
		}

		const fName = aFunc.functionName;
		if (!project.blockSpecs.has(fName)) {
			// Generate a minimal block spec.
			const argSlots = aFunc.argNames.map(() => '_').join(' ');
			const label    = fName + (argSlots ? ' ' + argSlots : '');
			project.blockSpecs.set(fName, { opName: fName, label, argTypes: [] });
		}

		// The cmdList in aFunc is a decompiler block tree, not a morphic block.
		// Wrap it in an MB_Function so the rest of the IDE can use it.
		const mbFunc = new MB_Function(fName, aFunc.argNames, aFunc.cmdList);
		targetModule.functions.push(mbFunc);
		if (!targetModule.blockList.includes(fName)) {
			targetModule.blockList.push(fName);
		}
	}
}
