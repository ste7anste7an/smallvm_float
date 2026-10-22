// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-compiler.js - MicroBlocks compiler.

/* globals BlockMorph, CommandBlockMorph, CommandSlotMorph, MB_Function, MB_Specs, ReporterBlockMorph */

// Built once at load and shared by every compiler instance. Both tables are
// read-only after construction; if a future change ever needs to extend them
// at runtime it must copy first, or every compiler in the page changes with it.

const MB_OPCODE_TABLE = (function () {
		const defs = `
			halt 0
			stopAll 1
			pushImmediate 2
			pushLargeInteger 3
			pushHugeInteger 4
			pushLiteral 5
			pushGlobal 6
			storeGlobal 7
			incrementGlobal 8
			initLocals 9
			pushLocal 10
			storeLocal 11
			incrementLocal 12
			pushArg 13
			storeArg 14
			incrementArg 15
			pushArgCount 16
			getArg 17
			argOrDefault 18
			pop 19
			ignoreArgs 20
			noop 21
			jmp 22
			longJmp 23
			jmpTrue 24
			jmpFalse 25
			decrementAndJmp 26
			forLoop 27
			jmpOr 28
			jmpAnd 29
			waitUntil 30
			exitLoop 31
			waitMicros 32
			waitMillis 33
			callFunction 34
			returnResult 35
			commandPrimitive 36
			reporterPrimitive 37
			callCustomCommand 38
			callCustomReporter 39
			sendBroadcast 40
			recvBroadcast 41
			getLastBroadcast 42
			millisOp 43
			microsOp 44
			secsOp 45
			millisSince 46
			microsSince 47
			timer 48
			resetTimer 49
			+ 50
			- 51
			* 52
			/ 53
			% 54
			& 55
			| 56
			^ 57
			~ 58
			<< 59
			>> 60
			< 61
			<= 62
			== 63
			!= 64
			>= 65
			> 66
			not 67
			RESERVED 68
			sum 69
			longMult 70
			absoluteValue 71
			minimum 72
			maximum 73
			random 74
			hexToInt 75
			isType 76
			sayIt 77
			graphIt 78
			boardType 79
			newList 80
			at 81
			atPut 82
			size 83
			analogPins 84
			digitalPins 85
			analogReadOp 86
			analogWriteOp 87
			digitalReadOp 88
			digitalWriteOp 89
			digitalSet 90
			digitalClear 91
			buttonA 92
			buttonB 93
			setUserLED 94
			i2cSet 95
			i2cGet 96
			spiSend 97
			spiRecv 98
			RESERVED 99
			RESERVED 100
			RESERVED 101
			RESERVED 102
			RESERVED 103
			RESERVED 104
			RESERVED 105
			RESERVED 106
			RESERVED 107
			RESERVED 108
			RESERVED 109
			RESERVED 110
			RESERVED 111
			RESERVED 112
			RESERVED 113
			RESERVED 114
			RESERVED 115
			RESERVED 116
			RESERVED 117
			RESERVED 118
			RESERVED 119
			RESERVED 120
			RESERVED 121
			RESERVED 122
			RESERVED 123
			RESERVED 124
			RESERVED 125
			comment 126
			codeEnd 127
			metadata 240`;
	const table = new Map();
	for (const line of defs.split('\n')) {
		const words = line.trim().split(/\s+/);
		if (words.length >= 2 && words[0] !== '') {
			if ('RESERVED' !== words[0]) {
				table.set(words[0], parseInt(words[1]));
			}
		}
	}
	return table;
})();

const MB_PRIMSET_TABLE = (function () {
		// The order is the encoding: the index is compiled into every named
		// primitive call, so a name in the wrong place is worse than a name
		// missing. Must match PrimitiveSetIndex in vm/interp.h and
		// SmallCompiler.initPrimsets in ide/MicroBlocksCompiler.gp.
		const names = [
			'vars', 'data', 'misc', 'io', 'sensors', 'serial',
			'display', 'file', 'net', 'ble', 'radio', 'tft',
			'hid', 'camera', '1wire', 'encoder', 'sd', 'lgvl',
			'h75', 'elfreaks', 'elfreaks_dev_sensor', 'sound'
		];
	const table = new Map();
	for (const [i, name] of names.entries()) {
		table.set(name, i);
	}
	return table;
})();

class MB_Compiler {
	constructor(project, codeManager = null) {
		// project: MB_Project for variable/function lookup
		// codeManager: used to look up chunkID for functions
		this.project = project;
		this.codeManager = codeManager ?? new MB_CodeManager(project);
		// per-compilation state (reset in instructionsFor)
		this.argNames = new Map();	// varName -> argIndex
		this.localVars = new Map(); // varName -> localIndex
		// encoding constants
		this.falseObj = 0;
		this.trueObj = 4;
		this.zeroObj = 1; // (0 << 1) | 1
		this.stringClassID = 4;

		this.initOpcodes();
		this.initPrimsets();
	}

	initOpcodes() {
		// The table is built once at load (MB_OPCODE_TABLE above) and shared. It
		// is read-only in every use -- .get and .has only -- so one Map serves
		// every compiler. Rebuilding it per construction cost 28us, which is 95%
		// of constructing a compiler, and the decompiler constructs one per chunk
		// just to read this table.
		this.opcodes = MB_OPCODE_TABLE;
	}

	initPrimsets() {
		// Shared and read-only, as the opcode table above.
		this.primsets = MB_PRIMSET_TABLE;
	}

	// input extraction helpers

	exprArg(inputs, i) {
		// Return the i-th input as a value for instructionsForExpression:
		// either a BlockMorph (embedded reporter) or a primitive JS value.
		const input = inputs[i];
		if (input == null) return null;
		if (input instanceof BlockMorph) return input;
		return input.evaluate();
	}

	cmdListArg(inputs, i) {
		// Return the first CommandBlockMorph from a command-slot input.
		const input = inputs[i];
		if (input == null) return null;
		if (input instanceof CommandSlotMorph) return input.nestedBlock();
		if (input instanceof CommandBlockMorph) return input;
		return null;
	}

	varNameArg(inputs, i) {
		// Return the variable name string from a template/input slot.
		const input = inputs[i];
		if (input == null) return null;
		return input.evaluate();
	}

	// instruction generation: entry point

	instructionsFor(aBlockOrFunction) {
		// Return an instruction list for the given block or function.

		this.argNames = new Map();
		let cmdOrReporter = aBlockOrFunction;

		if (aBlockOrFunction instanceof MB_Function) {
			const func = aBlockOrFunction;
			func.argNames.forEach((name, i) => this.argNames.set(name, i));
			cmdOrReporter = func.cmdList;
			if (!cmdOrReporter) {
				// function hat with no body
				cmdOrReporter = { selector: 'noop', inputs: () => [], argInputs: () => [], nextBlock: () => null };
			}
		}

		// Assign chunk IDs first. A function defined since the code manager was built
		// otherwise has no ID, and its calls fall through to the primitive path instead
		// of compiling as calls.
		this.codeManager.assignFunctionIDs();
		this.collectVars(cmdOrReporter);

		const result = [['initLocals', this.localVars.size]];
		const op = cmdOrReporter ? cmdOrReporter.selector : null;

		if (cmdOrReporter instanceof ReporterBlockMorph) {
			result.push(...this.instructionsForExpression(cmdOrReporter));
			result.push(['returnResult', 0]);
		} else if (op === 'whenCondition') {
			result.push(...this.instructionsForWhenCondition(cmdOrReporter));
		} else if (op === 'whenButtonPressed' || op === 'whenStarted') {
			result.push(...this.instructionsForCmdList(cmdOrReporter.nextBlock()));
		} else if (op === 'whenBroadcastReceived') {
			const inputs = cmdOrReporter.inputs();
			result.push(...this.instructionsForExpression(this.exprArg(inputs, 0)));
			result.push(['recvBroadcast', 1]);
			result.push(...this.instructionsForCmdList(cmdOrReporter.nextBlock()));
		} else if (aBlockOrFunction instanceof MB_Function) {
			const func = aBlockOrFunction;
			if (func.argNames.length === 0) {
				// functions with no args can be invoked by broadcasting their name
				result.push(['pushLiteral', func.functionName]);
				result.push(['placeholder', 0]);
				result.push(['recvBroadcast', 1]);
				// Skip only the lone 'noop' placeholder of an empty body; testing
				// the first block alone drops the whole body of a function that
				// merely starts with a real no-op (as GP's fixed condition).
				if (!(op === 'noop' && cmdOrReporter.nextBlock() === null)) {
					result.push(...this.instructionsForCmdList(cmdOrReporter));
				}
			} else {
				result.push(...this.instructionsForCmdList(cmdOrReporter));
			}
			// final return false (needed even if last instruction is a return,
			// since that return may be in an if-branch that gets skipped)
			result.push(['pushImmediate', this.falseObj]);
			result.push(['returnResult', 0]);
		} else {
			result.push(...this.instructionsForCmdList(cmdOrReporter));
		}

		result.push(['codeEnd', 0]);
		if ((result.length % 2) === 1) {
			// Ensure even instruction count so literals are 32-bit aligned
			result.push(['codeEnd', 0]);
		}
		this.appendLiterals(result);
		this.appendDecompilerMetadata(aBlockOrFunction, result);
		return result;
	}

	// instruction generation: when-condition hat block

	instructionsForWhenCondition(cmdBlock) {
		const inputs = cmdBlock.inputs();
		const condition = this.instructionsForExpression(this.exprArg(inputs, 0));
		const body = this.instructionsForCmdList(cmdBlock.nextBlock());
		const result = [];

		// wait until condition becomes true
		result.push(...this.instructionsForExpression(10));
		result.push(['waitMillis', 1]);
		result.push(...condition);
		result.push(...this.instructionsForJump('jmpFalse', -(condition.length + 3)));

		result.push(...body);

		// loop back to condition test
		result.push(...this.instructionsForJump('jmp', -(result.length + 1)));
		return result;
	}

	// instruction generation: command lists and control structures

	instructionsForCmdList(firstCmd) {
		const result = [];
		let cmd = firstCmd;
		while (cmd != null) {
			result.push(...this.instructionsForCmd(cmd));
			cmd = cmd.nextBlock();
		}
		return result;
	}

	instructionsForCmd(cmd) {
		// Innermost producer wins: emitCmd has already run, so anything an
		// inner command or expression emitted is stamped and stays stamped.
		return this.noteProducer(this.emitCmd(cmd), cmd);
	}

	emitCmd(cmd) {
		const result = [];
		const op = cmd.selector;
		const inputs = cmd.argInputs();

		if (op === '=' || op === 'local') {
			result.push(...this.instructionsForExpression(this.exprArg(inputs, 1)));
			result.push(this.setVar(this.varNameArg(inputs, 0)));
		} else if (op === '+=') {
			result.push(...this.instructionsForExpression(this.exprArg(inputs, 1)));
			result.push(this.incrementVar(this.varNameArg(inputs, 0)));
		} else if (op === 'return') {
			if (inputs.length === 0) {
				result.push(['pushImmediate', this.zeroObj]);
			} else {
				result.push(...this.instructionsForExpression(this.exprArg(inputs, 0)));
			}
			result.push(['returnResult', 0]);
		} else if (op === 'stopTask') {
			result.push(['halt', 0]);
		} else if (op === 'forever') {
			return this.instructionsForForever(inputs);
		} else if (op === 'if') {
			return this.instructionsForIf(inputs);
		} else if (op === 'repeat') {
			return this.instructionsForRepeat(inputs);
		} else if (op === 'repeatUntil') {
			return this.instructionsForRepeatUntil(inputs);
		} else if (op === 'waitUntil') {
			return this.instructionsForWaitUntil(inputs);
		} else if (op === 'for') {
			return this.instructionsForForLoop(inputs);
		} else if (op === 'exitLoop') {
			result.push(['exitLoop', null]); // null offset fixed by fixLoopExits
			result.push(['placeholder', 0]); // always two words
		} else if (op === 'digitalWriteOp') {
			const pinVal = this.exprArg(inputs, 0);
			const boolVal = this.exprArg(inputs, inputs.length - 1);
			if (typeof pinVal === 'number' && typeof boolVal === 'boolean' &&
				pinVal >= 0 && pinVal <= 127) { // out-of-range pins take the general primitive, as GP
				const pinNum = pinVal & 255;
				result.push([boolVal ? 'digitalSet' : 'digitalClear', pinNum]);
				return result;
			}
			return this.primitive(op, inputs, true);
		} else if (op === 'sendBroadcastSimple') {
			return this.primitive('sendBroadcast', inputs, true);
		} else if (op === 'comment') {
			// skip; no code generated
		} else if (op === 'ignoreArgs') {
			for (let i = 0; i < inputs.length; i++) {
				result.push(...this.instructionsForExpression(this.exprArg(inputs, i)));
			}
			result.push(['ignoreArgs', inputs.length]);
			return result;
		} else if (op === 'callCustomCommand' || op === 'callCustomReporter') {
			for (let i = 0; i < inputs.length; i++) {
				result.push(...this.instructionsForExpression(this.exprArg(inputs, i)));
			}
			result.push([op, inputs.length]);
			result.push(['pop', 1]); // discard return value, a reporter's too when used as a command
			return result;
		} else if (this.isFunctionCall(op)) {
			return this.instructionsForFunctionCall(op, inputs, true);
		} else if (this.opcodes.has(op) && MB_Specs.builtInReporters().has(op)) {
			result.push(...this.primitive(op, inputs, true));
			result.push(['pop', 1]); // a reporter used as a command; discard its value
			return result;
		} else {
			return this.primitive(op, inputs, true);
		}
		return result;
	}

	instructionsForIf(inputs) {
		const result = [];
		const jumpsToFix = [];
		let i = 0;
		while (i < inputs.length) {
			const finalCase = (i + 2) >= inputs.length;
			const test = this.exprArg(inputs, i);
			const body = this.instructionsForCmdList(this.cmdListArg(inputs, i + 1));
			if (test !== true || !finalCase || i === 0) {
				result.push(...this.instructionsForExpression(test));
				let offset = body.length;
				if (!finalCase) offset += 2;
				result.push(...this.instructionsForJump('jmpFalse', offset));
			}
			result.push(...body);
			if (!finalCase) {
				const jumpToEnd = ['longJmp', result.length]; // offset fixed below
				result.push(jumpToEnd);
				result.push(['placeholder', 0]); // longJmp is always two words
				jumpsToFix.push(jumpToEnd);
			}
			i += 2;
		}
		const instrCount = result.length;
		for (const jmp of jumpsToFix) {
			jmp[1] = instrCount - (jmp[1] + 2); // fix jump offset
		}
		return result;
	}

	instructionsForForever(inputs) {
		const result = this.instructionsForCmdList(this.cmdListArg(inputs, 0));
		result.push(...this.instructionsForJump('jmp', -(result.length + 1)));
		this.fixLoopExits(result);
		return result;
	}

	instructionsForRepeat(inputs) {
		const result = this.instructionsForExpression(this.exprArg(inputs, 0));
		const body = this.instructionsForCmdList(this.cmdListArg(inputs, 1));
		result.push(...this.instructionsForJump('jmp', body.length));
		result.push(...body);
		result.push(...this.instructionsForJump('decrementAndJmp', -(body.length + 1)));
		this.fixLoopExits(result);
		return result;
	}

	instructionsForRepeatUntil(inputs) {
		const result = [];
		const conditionTest = this.instructionsForExpression(this.exprArg(inputs, 0));
		const body = this.instructionsForCmdList(this.cmdListArg(inputs, 1));
		result.push(...this.instructionsForJump('jmp', body.length));
		result.push(...body);
		result.push(...conditionTest);
		result.push(...this.instructionsForJump('jmpFalse', -(body.length + conditionTest.length + 1)));
		this.fixLoopExits(result);
		return result;
	}

	instructionsForWaitUntil(inputs) {
		const result = [];
		const conditionTest = this.instructionsForExpression(this.exprArg(inputs, 0));
		result.push(...conditionTest);
		result.push(['waitUntil', -(conditionTest.length + 1)]);
		return result;
	}

	instructionsForForLoop(inputs) {
		const result = this.instructionsForExpression(this.exprArg(inputs, 1)); // range count
		const loopVarName = this.varNameArg(inputs, 0);
		const loopVarIndex = this.localVars.get(loopVarName);
		const body = this.instructionsForCmdList(this.cmdListArg(inputs, 2));
		result.push(
			['pushImmediate', this.falseObj],	// will be N (total loop count)
			['pushImmediate', this.falseObj]	// will be a decrementing loop counter
		);
		result.push(...this.instructionsForJump('jmp', body.length));
		result.push(...body);
		result.push(
			['forLoop', loopVarIndex],
			['longJmp', -(body.length + 3)],
			['placeholder', 0], // two-word longJmp; forLoop skips two words at loop end
			['pop', 3]
		);
		this.fixLoopExits(result);
		return result;
	}

	fixLoopExits(loopBody) {
		// Resolve any uninitialized exitLoop instructions to jump past this loop.
		// Ignore exitLoop instructions that already have an offset (nested loops).
		// Note: entries() is zero-based where the GP original iterates from one,
		// so the offset is (length - i) - 2, not - 1.
		for (const [i, instr] of loopBody.entries()) {
			if (instr[0] === 'exitLoop' && instr[1] == null) {
				instr[1] = (loopBody.length - i) - 2;
			}
		}
	}

	// instruction generation: expressions

	instructionsForExpression(expr) {
		return this.noteProducer(this.emitExpression(expr), expr);
	}

	emitExpression(expr) {
		// immediate values
		if (true === expr) return [['pushImmediate', this.trueObj]];
		if (false === expr) return [['pushImmediate', this.falseObj]];
		if (expr == null) return [['pushImmediate', this.zeroObj]];

		if (typeof expr === 'number') {
			if (Number.isInteger(expr)) {
				if (expr >= -64 && expr <= 63) { // 7-bit: fits in 8-bit encoded int object
					return [['pushImmediate', ((expr & 127) << 1) | 1]];
				} else if (expr >= -4194304 && expr <= 4194303) { // fits in 3 bytes
					return [['pushLargeInteger', expr], ['placeholder', 0]];
				} else {
					return [['pushHugeInteger', expr], ['placeholder', 0], ['placeholder', 0]];
				}
			} else {
				throw new Error('Floats are not supported');
			}
		}

		if (typeof expr === 'string') {
			return [['pushLiteral', expr], ['placeholder', 0]];
		}

		// Color object (with r, g, b properties)
		if (typeof expr === 'object' && 'r' in expr && 'g' in expr && 'b' in expr) {
			return this.instructionsForExpression((expr.r << 16) | (expr.g << 8) | expr.b);
		}

		// Block expression (BlockMorph)
		if (!(expr instanceof BlockMorph)) {
			console.warn('Unknown expression type:', expr);
			return [['pushImmediate', this.zeroObj]];
		}

		const op = expr.selector;
		const inputs = expr.argInputs();

		if (op === 'v') {
			// variable reporter: name is in blockSpec
			return [this.getVar(expr.blockSpec)];
		} else if (op === 'booleanConstant') {
			const val = this.exprArg(inputs, 0);
			return [['pushImmediate', val ? this.trueObj : this.falseObj]];
		} else if (op === 'colorSwatch') {
			const r = this.exprArg(inputs, 0);
			const g = this.exprArg(inputs, 1);
			const b = this.exprArg(inputs, 2);
			return this.instructionsForExpression((r << 16) | (g << 8) | b);
		} else if (op === 'and') {
			return this.instructionsForAnd(inputs);
		} else if (op === 'or') {
			return this.instructionsForOr(inputs);
		} else if (op === 'ifExpression') {
			return this.instructionsForIfExpression(inputs);
		} else if (this.isFunctionCall(op)) {
			return this.instructionsForFunctionCall(op, inputs, false);
		} else {
			return this.primitive(op, inputs, false);
		}
	}

	instructionsForAnd(inputs) {
		const tests = [];
		for (let i = 0; i < inputs.length; i++) {
			tests.push(this.instructionsForExpression(this.exprArg(inputs, i)));
		}
		const totalInstrCount = tests.reduce((sum, t) => sum + t.length + 1, 0) - 1;

		const result = [];
		for (const [i, test] of tests.entries()) {
			result.push(...test);
			if (i < tests.length - 1) {
				result.push(...this.instructionsForJump('jmpAnd', totalInstrCount - (result.length + 1)));
			}
		}
		return result;
	}

	instructionsForOr(inputs) {
		const tests = [];
		for (let i = 0; i < inputs.length; i++) {
			tests.push(this.instructionsForExpression(this.exprArg(inputs, i)));
		}
		const totalInstrCount = tests.reduce((sum, t) => sum + t.length + 1, 0) - 1;

		const result = [];
		for (const [i, test] of tests.entries()) {
			result.push(...test);
			if (i < tests.length - 1) {
				result.push(...this.instructionsForJump('jmpOr', totalInstrCount - (result.length + 1)));
			}
		}
		return result;
	}

	instructionsForIfExpression(inputs) {
		const trueCase = this.instructionsForExpression(this.exprArg(inputs, 1));
		const falseCase = this.instructionsForExpression(this.exprArg(inputs, 2));
		falseCase.push(...this.instructionsForJump('jmp', trueCase.length));

		const result = this.instructionsForExpression(this.exprArg(inputs, 0)); // test
		result.push(...this.instructionsForJump('jmpTrue', falseCase.length));
		result.push(...falseCase);
		result.push(...trueCase);
		return result;
	}

	noteProducer(instructions, producer) {
		// Record which block emitted each instruction. A producer has to be a
		// block: an instruction emitted for a bare literal argument belongs to
		// the block that holds the slot, because a literal is not something a
		// view could point at. Whatever no block claims is the chunk's own.
		if (producer instanceof BlockMorph) {
			for (const instr of instructions) {
				if (Array.isArray(instr) && instr.producer === undefined) instr.producer = producer;
			}
		}
		return instructions;
	}

	nodePathsFor(aBlockOrFunction, chunkName) {
		// A name for every block of one chunk: the chunk's own name, then the path
		// down to the block, s<n> for the n-th command of a chain and a<n> for the
		// n-th argument.
		const paths = new Map();
		const walk = (block, path) => {
			paths.set(block, chunkName + '/' + path);
			const inputs = (typeof block.argInputs === 'function') ? block.argInputs() : [];
			inputs.forEach((input, i) => {
				if (input instanceof CommandSlotMorph) walkChain(input.nestedBlock(), path + '.a' + i + '.');
				else if (input instanceof CommandBlockMorph) walkChain(input, path + '.a' + i + '.');
				else if (input instanceof BlockMorph) walk(input, path + '.a' + i);
			});
		};
		const walkChain = (firstCmd, prefix) => {
			let cmd = firstCmd, n = 0;
			while (cmd != null) {
				walk(cmd, prefix + 's' + n);
				cmd = (typeof cmd.nextBlock === 'function') ? cmd.nextBlock() : null;
				n += 1;
			}
		};
		const root = (aBlockOrFunction instanceof MB_Function)
			? aBlockOrFunction.cmdList : aBlockOrFunction;
		if (root instanceof ReporterBlockMorph) walk(root, 's0');
		else walkChain(root, '');
		return paths;
	}

	bytesForInstructions(code, aBlockOrFunction, chunkName) {
		// Emit the bytes and, beside them, the word range each instruction
		// occupies and what produced it. Only here is an instruction's width
		// known, and the VM reports a fault as a 16-bit word offset
		// (vm/interp.c:617 runTask), so the map is built here and in words.
		const paths = this.nodePathsFor(aBlockOrFunction, chunkName);
		const bytes = [];
		this.sourceMap = [];
		for (const item of code) {
			const start = bytes.length >> 1;
			if (Array.isArray(item)) {
				this.addBytesForInstructionTo(item, bytes);
				// A null producer means the CHUNK emitted it: a prologue, an
				// epilogue, or content a hat synthesises that no block can say.
				const id = item.producer ? (paths.get(item.producer) ?? null) : null;
				this.sourceMap.push([start, (bytes.length >> 1) - start, id]);
			} else if (typeof item === 'string') {
				this.addBytesForStringLiteral(item, bytes);
			}
		}
		return bytes;
	}

	instructionsForJump(jumpOp, offset) {
		if (offset !== 0 && offset >= -128 && offset <= 127) {
			return [[jumpOp, offset]]; // short jump: fits in 8 bits
		}
		// extended jump: signed offset in the next word
		if (offset < 0) offset -= 1; // adjust for extra placeholder word
		return [[jumpOp, offset], ['placeholder', 0]];
	}

	// instruction generation: primitive ops

	primitive(op, inputs, isCommand) {
		const result = [];
		if (this.opcodes.has(op)) {
			for (let i = 0; i < inputs.length; i++) {
				result.push(...this.instructionsForExpression(this.exprArg(inputs, i)));
			}
			result.push([op, inputs.length]);
		} else if (op.startsWith('[') && op.endsWith(']')) {
			// named primitive of the form '[primSetName:primName]'
			const colonIdx = op.indexOf(':');
			if (colonIdx >= 0) {
				const primSetName = op.slice(1, colonIdx);
				const primName = op.slice(colonIdx + 1, op.length - 1);
				for (let i = 0; i < inputs.length; i++) {
					result.push(...this.instructionsForExpression(this.exprArg(inputs, i)));
				}
				if (isCommand) {
					result.push(['commandPrimitive', primName, primSetName, inputs.length]);
					result.push(['placeholder', 0]);
				} else {
					result.push(['reporterPrimitive', primName, primSetName, inputs.length]);
					result.push(['placeholder', 0]);
				}
			}
		} else {
			console.log('Skipping unknown op:', op);
			if (!isCommand) {
				result.push(['pushImmediate', this.zeroObj]); // push dummy result for missing reporter
			}
		}
		return result;
	}

	// variables

	collectVars(firstCmd) {
		const sharedVars = new Set(this.project ? this.project.allVariableNames() : []);
		this.localVars = new Map();

		const todo = firstCmd ? [firstCmd] : [];
		while (todo.length > 0) {
			const cmd = todo.pop(); // depth-first, as GP (collectVars gp:1066): args before nextBlock
			const sel = cmd.selector;
			const inputs = cmd.inputs();

			if (sel === 'local' || sel === 'for') {
				const varName = inputs[0].evaluate();
				if (this.argNames.has(varName)) {
					console.log('Warning: Local variable overrides parameter:', varName);
				}
				if (!this.localVars.has(varName)) {
					this.localVars.set(varName, this.localVars.size);
				}
			} else if (sel === 'v' || sel === '=' || sel === '+=') {
				const varName = (sel === 'v') ? cmd.blockSpec : inputs[0].evaluate();
				if (!sharedVars.has(varName) && !this.argNames.has(varName) && !this.localVars.has(varName)) {
					this.localVars.set(varName, this.localVars.size);
				}
			}

			// GP pushes nextBlock first, then the args reversed, so a stack pop
			// visits args in order before the next block (gp:1087-1093).
			if (cmd.nextBlock()) todo.push(cmd.nextBlock());
			for (let i = inputs.length - 1; i >= 0; i--) {
				const input = inputs[i];
				if (input instanceof BlockMorph) {
					todo.push(input);
				} else if (input instanceof CommandSlotMorph) {
					const nested = input.nestedBlock();
					if (nested) todo.push(nested);
				}
			}
		}
	}

	getVar(varName) {
		if (this.localVars.has(varName)) return ['pushLocal', this.localVars.get(varName)];
		if (this.argNames.has(varName)) return ['pushArg', this.argNames.get(varName)];
		const globalID = this.indexOfGlobalVar(varName);
		if (globalID != null) return ['pushGlobal', globalID];
		return ['pushImmediate', this.zeroObj]; // unknown variable; push zero
	}

	setVar(varName) {
		if (this.localVars.has(varName)) return ['storeLocal', this.localVars.get(varName)];
		if (this.argNames.has(varName)) return ['storeArg', this.argNames.get(varName)];
		const globalID = this.indexOfGlobalVar(varName);
		if (globalID != null) return ['storeGlobal', globalID];
		return ['pop', 1]; // unknown variable; discard value
	}

	incrementVar(varName) {
		if (this.localVars.has(varName)) return ['incrementLocal', this.localVars.get(varName)];
		if (this.argNames.has(varName)) return ['incrementArg', this.argNames.get(varName)];
		const globalID = this.indexOfGlobalVar(varName);
		if (globalID != null) return ['incrementGlobal', globalID];
		return ['noop', 0];
	}

	indexOfGlobalVar(varName) {
		if (!this.project) return null;
		const vars = this.project.allVariableNames();
		if (!vars.includes(varName)) return null;
		// The index the board was given, not a position in the sorted list; the
		// two part company once a global is added mid-session.
		const idx = this.project.indexForVar(varName);
		// A global's index is emitted as one byte, so it must fit in 7 bits.
		// GP gives every global past the 128th the index 127 -- its comment
		// says the code will run strangely but will not crash
		// (MicroBlocksProject.gp indexForVar). Without the cap the byte
		// emitter throws and the project cannot be compiled at all.
		return Math.min(idx, 127);
	}

	// function calls

	isFunctionCall(op) {
		return this.codeManager.functionChunkIDs.has(op);
	}

	instructionsForFunctionCall(op, inputs, isCmd) {
		const result = [];
		const chunkID = this.codeManager.functionChunkIDs.get(op);
		for (let i = 0; i < inputs.length; i++) {
			result.push(...this.instructionsForExpression(this.exprArg(inputs, i)));
		}
		result.push(['callFunction', ((chunkID & 255) << 8) | (inputs.length & 255)]);
		result.push(['placeholder', 0]); // callFunction is always two words
		if (isCmd) result.push(['pop', 1]); // discard return value
		return result;
	}

	// literal values

	appendLiterals(instructions) {
		// Resolve pushLiteral/commandPrimitive/reporterPrimitive offsets and append string literals.
		const literals = [];
		const literalOffsets = new Map();
		if ((instructions.length % 2) === 1) {
			// ensure that there are an even number of instructions so that the first literal
			// starts on a 32-bit word address when stored in Flash memory
			instructions.push(['halt', 0]);
		}
		let nextOffset = instructions.length;
		for (const [ip, instr] of instructions.entries()) {
			if (!Array.isArray(instr)) continue;
			const op = instr[0];
			if (op === 'pushLiteral' || op === 'commandPrimitive' || op === 'reporterPrimitive') {
				const literal = instr[1];
				let litOffset = literalOffsets.get(literal);
				if (litOffset == null) {
					litOffset = nextOffset;
					literals.push(literal);
					literalOffsets.set(literal, litOffset);
					nextOffset += 2 * this.wordsForLiteral(literal);
				}
				if (op === 'commandPrimitive' || op === 'reporterPrimitive') {
					const primSetIndex = (this.primsets.get(instr[2]) || 0) & 63;	// 6 bits
					const primNameOffset = (litOffset - (ip + 1)) & 1023;			// 10 bits
					const argCount = (instr[3] || 0) & 255;
					instr[1] = ((primSetIndex << 18) | (primNameOffset << 8)) | argCount;
					instr.push(literal); // retain literal string for "show instructions" (as GP: primSet stays at [2])
				} else {
					instr[1] = litOffset - (ip + 1); // ip points to next instruction word
					instr[2] = literal; // retain literal string for "show instructions"
				}
			}
		}
		instructions.push(...literals);
	}

	wordsForLiteral(literal) {
		if (typeof literal === 'string') {
			const byteCount = new TextEncoder().encode(literal).length;
			return 1 + Math.floor((byteCount + 4) / 4); // 1 header word + content words
		}
		throw new Error('Illegal literal type: ' + typeof literal);
	}

	// metadata for the decompiler

	appendDecompilerMetadata(aBlockOrFunction, instructionList) {
		let functionLibrary = '';
		let functionSpec = '';
		let varNames = '';
		let functionName = '';

		// collect local variable names in index order
		const localVarAndArgNames = Array.from(this.localVars.entries())
			.sort(([, a], [, b]) => a - b)
			.map(([name]) => name)
			.filter(name => typeof name === 'string');

		if (aBlockOrFunction instanceof MB_Function) {
			const func = aBlockOrFunction;
			if (this.project) {
				functionLibrary = this.project.libForFunction(func) || '';
			}
			if (!functionLibrary || this.notEmbeddedLibrary(functionLibrary)) {
				functionSpec = this.metaInfoForFunction(func);
			}
			localVarAndArgNames.push(...func.argNames);
			functionName = func.functionName;
		}

		if (localVarAndArgNames.length > 0) {
			// Replace tabs with spaces, then join with tab delimiter
			const sanitized = localVarAndArgNames.map(s => s.replace(/\t/g, ' '));
			varNames = sanitized.join('\t');
		}

		instructionList.push(['metadata', functionLibrary, functionSpec, varNames, functionName]);
	}

	metaInfoForFunction(func) {
		// Return the block spec string for the given function.
		// Used by the decompiler to reconstruct the function signature.
		return this.project ? this.project.metaInfoForFunction(func) : '';
	}

	notEmbeddedLibrary(libName) {
		// Return true if the given library is not one of the embedded libraries.
		// The question this answers is whether the decompiler will be able to
		// get the library back when it reads a chunk off a board, so it is
		// asked the same way addEmbeddedLibrary answers it: is there a file of
		// that name under Libraries/.
		if (libName.startsWith('_')) libName = libName.slice(1);
		return !MB_Compiler.embeddedLibraryNames().has(libName);
	}

	static embeddedLibraryNames() {
		if (MB_Compiler._embeddedLibs) return MB_Compiler._embeddedLibs;
		const names = new Set();
		if (typeof MB_Files !== 'undefined') {
			for (const path of MB_Files.allFilesIn('Libraries')) {
				if (!path.endsWith('.ubl')) continue;
				names.add(path.slice(path.lastIndexOf('/') + 1, -4));
			}
		}
		// Cached only once it has something in it. An empty list means
		// files.txt has not loaded yet, and caching that would write a spec
		// into every chunk of the session for a reason that has nothing to do
		// with the code being compiled.
		if (names.size > 0) MB_Compiler._embeddedLibs = names;
		return names;
	}

	// binary code generation

	opcodeForInstr(op) {
		return this.opcodes.get(op);
	}

	addBytesForInstructionTo(instr, bytes) {
		// Append the bytes for the given instruction to bytes (little endian, 16-bit words).
		const op = instr[0];
		const arg = instr[1];

		if (op === 'placeholder') return; // no code generated

		const opcodeByte = this.opcodes.get(op);
		if (opcodeByte == null) throw new Error('Unknown opcode: ' + op);
		bytes.push(opcodeByte);

		if (op === 'pushImmediate') {
			// immediate int/boolean fits in 8-bit arg byte
			bytes.push(arg & 255);
		} else if (op === 'pushLargeInteger') {
			// 24-bit integer object, little endian
			bytes.push(((arg & 127) << 1) | 1); // low 7 bits + integer tag
			bytes.push((arg >> 7) & 255);
			bytes.push((arg >> 15) & 255);
		} else if (op === 'pushHugeInteger') {
			bytes.push(0); // unused arg byte
			// 32-bit integer object, little endian
			bytes.push(((arg & 127) << 1) | 1);
			bytes.push((arg >> 7) & 255);
			bytes.push((arg >> 15) & 255);
			bytes.push((arg >> 23) & 255);
		} else if (['jmp','jmpTrue','jmpFalse','jmpOr','jmpAnd','decrementAndJmp'].includes(op)) {
			if (arg !== 0 && arg >= -128 && arg <= 127) {
				bytes.push(arg & 255); // 8-bit offset
			} else {
				bytes.push(0); // zero arg: offset follows in next 16-bit word
				bytes.push(arg & 255);
				bytes.push((arg >> 8) & 255);
			}
		} else if (['longJmp', 'exitLoop', 'pushLiteral'].includes(op)) {
			// always two words; replace longJmp with jmp opcode
			if (op === 'longJmp') bytes[bytes.length - 1] = this.opcodes.get('jmp');
			const safeArg = (arg == null) ? 0 : arg; // exitLoop outside loop → no-op
			bytes.push(0); // zero arg byte
			bytes.push(safeArg & 255);
			bytes.push((safeArg >> 8) & 255);
		} else if (op === 'callFunction') {
			// arg: chunk ID (high byte) and arg count (low byte)
			bytes.push(0);
			bytes.push(arg & 255);
			bytes.push((arg >> 8) & 255);
		} else if (op === 'commandPrimitive' || op === 'reporterPrimitive') {
			bytes.push(arg & 255);
			bytes.push((arg >> 8) & 255);
			bytes.push((arg >> 16) & 255);
		} else if (op === 'metadata') {
			// null-terminated UTF-8 strings: library, spec, varNames, functionName
			const enc = new TextEncoder();
			for (const field of instr.slice(1, 5)) {
				const s = field || '';
				bytes.push(...enc.encode(s));
				bytes.push(0); // null terminator
			}
		} else if (arg >= -128 && arg <= 127) {
			bytes.push(arg & 255); // 8-bit arg for all other instructions
		} else {
			throw new Error('Argument does not fit in 8 bits: ' + op + ' ' + arg);
		}
	}

	compiledBytesFor(aBlockOrFunction) {
		// Compile the given block or function and return an array of code bytes.
		if (typeof aBlockOrFunction === 'string') {
			aBlockOrFunction = this.project ? this.project.functionNamed(aBlockOrFunction) : null;
			if (!aBlockOrFunction) return [];
		}
		const code = this.instructionsFor(aBlockOrFunction);
		return this.bytesForInstructions(code, aBlockOrFunction,
			(aBlockOrFunction instanceof MB_Function)
				? aBlockOrFunction.functionName : (aBlockOrFunction.mbScriptId ?? ''));
	}

	showInstructions(aBlockOrFunction) {
		// Return a formatted string showing the instructions for the given function,
		// or for the given block's stack.
		const code = this.instructionsFor((aBlockOrFunction instanceof MB_Function)
			? aBlockOrFunction : aBlockOrFunction.topBlock());
		const result = [];
		let firstString = true;

		for (const item of code) {
			if (!Array.isArray(item)) {
				// string literal appended after code
				if (firstString) {
					result.push('--------');
					firstString = false;
				}
				result.push(String(item));
			} else if (item[0] === 'metadata') {
				result.push('--------');
			} else if (item[0] === 'pushLiteral') {
				const instr = `[${this.opcodeForInstr(item[0])}] ${item[0]} ${item[1]} ("${item[2]}")`;
				this.addWithLineNum(result, instr);
			} else if (item[0] === 'pushImmediate') {
				let arg = item[1];
				if ((arg & 1) === 1) {
					arg = arg >> 1;
					if (arg >= 4194304) arg -= 8388608;
					if (arg < 128 && arg > 63) arg -= 128;
				} else if (arg === 0) {
					arg = false;
				} else if (arg === 4) {
					arg = true;
				}
				this.addWithLineNum(result, `[${this.opcodeForInstr(item[0])}] ${item[0]} ${arg}`);
			} else if (item[0] === 'pushLargeInteger' || item[0] === 'pushHugeInteger') {
				this.addWithLineNum(result, `[${this.opcodeForInstr(item[0])}] ${item[0]} ${item[1]}`);
			} else if (item[0] === 'callFunction') {
				const calledChunkID = (item[1] >> 8) & 255;
				const argCount = item[1] & 255;
				this.addWithLineNum(result, `[${this.opcodeForInstr(item[0])}] ${item[0]} ${calledChunkID} ${argCount}`);
			} else if (!/^[a-zA-Z]/.test(item[0])) {
				// operator: don't show arg count
				this.addWithLineNum(result, String(item[0]));
			} else if (item[0] === 'placeholder') {
				this.addWithLineNum(result, '<data>');
			} else {
				let displayItem = item;
				if (item[0] === 'commandPrimitive' || item[0] === 'reporterPrimitive') {
					// re-order to display argCount last
					displayItem = [...item];
					const argCount = displayItem[3];
					displayItem[3] = displayItem[4];
					displayItem[4] = argCount;
				}
				let instr = `[${this.opcodeForInstr(displayItem[0])}] `;
				for (const s of displayItem) {
					if (s !== undefined) instr += s + ' ';
				}
				this.addWithLineNum(result, instr, item);
			}
		}
		return result.join('\n');
	}

	addWithLineNum(aList, instruction, items) {
		const currentLine = aList.length + 1;
		let targetLine = '';
		if (items && ['pushLiteral', 'jmp', 'longJmp', 'jmpTrue', 'jmpFalse', 'jmpAnd', 'jmpOr', 'decrementAndJmp'].includes(items[0])) {
			let offset = items[items.length - 1];
			if (items[0] !== 'pushLiteral') {
				if (offset === 0 || offset < -128 || offset > 127 || items[0] === 'longJmp') {
					offset += 1;
				}
			}
			targetLine = ` (line ${currentLine + 1 + offset})`;
		}
		aList.push(`${currentLine} ${instruction}${targetLine}`);
	}

	showCompiledBytes(aBlockOrFunction) {
		// Return the compiled bytes of the given function, or of the given block's stack,
		// as text with two decimal bytes a line.
		const bytes = this.compiledBytesFor((aBlockOrFunction instanceof MB_Function)
			? aBlockOrFunction : aBlockOrFunction.topBlock());
		const result = [`[${bytes.length} bytes]\n`];
		if (bytes.length > 1000) {
			result.push('*** Script too large; over 1000 bytes! ***\n\n');
		}
		bytes.forEach((b, i) => {
			result.push(String(b));
			result.push((i % 2 === 1) ? '\n' : ' ');
		});
		if (result[result.length - 1] === '\n') result.pop();
		return result.join('');
	}

	showCallTree(aBlockOrFunction) {
		// Return the tree of user functions called by the given function or by the
		// function a palette block calls, or null if it names no user function.
		const funcName = (aBlockOrFunction instanceof MB_Function)
			? aBlockOrFunction.functionName : aBlockOrFunction.selector;
		const allFunctions = new Map(this.project.allFunctions().map(f => [f.functionName, f]));
		if (!allFunctions.has(funcName)) return null;
		const result = [];
		this.appendCallsForFunction(
			funcName, result, '', this.project.allVariableNames(), allFunctions, [funcName]);
		return result.join('\n');
	}

	appendCallsForFunction(funcName, result, indent, globalVars, allFunctions, callers) {
		// Add a line for the given function, then its callees indented under it. A callee
		// is listed once per caller. Stack words are 3 plus its arguments and locals.
		const func = allFunctions.get(funcName);
		const argCount = func.argNames.length;
		const localCount = func.allVars().filter(v =>
			!func.argNames.includes(v) && !globalVars.includes(v)).length;
		let info = '';
		if ((argCount > 0) || (localCount > 0)) {
			const counts = [];
			if (argCount > 0) counts.push(`${argCount} arg${(argCount > 1) ? 's' : ''}`);
			if (localCount > 0) counts.push(`${localCount} local${(localCount > 1) ? 's' : ''}`);
			info = ` (${counts.join(', ')})`;
		}
		result.push(`${indent}${funcName}${info} ${3 + argCount + localCount}`);
		indent = '   ' + indent;

		if (!func.cmdList) return;
		const processed = new Set();
		const calls = [];
		func.cmdList.forAllBlocks(b => { calls.push(b.selector); });
		for (const op of calls) {
			if (allFunctions.has(op) && !processed.has(op)) {
				if (callers.includes(op)) {
					result.push(`${indent}   ${funcName} [recursive]`);
				} else {
					this.appendCallsForFunction(
						op, result, indent, globalVars, allFunctions, [...callers, op]);
				}
				processed.add(op);
			}
		}
	}

	addBytesForStringLiteral(s, bytes) {
		// Append the bytes for the given string literal (GP object format).
		const encoded = new TextEncoder().encode(s);
		const byteCount = encoded.length;
		const wordCount = Math.floor((byteCount + 4) / 4);
		let headerWord = (wordCount << 4) | this.stringClassID;
		// header: 4 bytes, little endian
		for (let i = 0; i < 4; i++) {
			bytes.push(headerWord & 255);
			headerWord >>= 8;
		}
		bytes.push(...encoded);
		// pad to next 4-byte boundary
		const pad = 4 - (byteCount % 4);
		for (let i = 0; i < pad; i++) bytes.push(0);
	}
}
