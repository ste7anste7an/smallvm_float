// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-function.js - MicroBlocks function representation.

/* global MB_Function, MB_Parser */

class MB_Function {
	constructor(functionName, argNames, cmdList) {
		this.functionName = functionName;
		this.argNames = argNames;
		this.cmdList = cmdList;
		this.localVars = this.collectLocalVars();
	}

	collectLocalVars() {
		// Return a set of all local variables used in this function.

		let result = new Set();
		for (const cmd of this.allVariableCmds()) {
			let sel = cmd.selector;
			if ((sel == 'local') || (sel == 'for')) {
				result.add(cmd.inputs()[0].evaluate());
			}
		}
		for (const arg of this.argNames) result.delete(arg);
		return Array.from(result);
	}

	forAllBlocks(f) {
		// Call the given function on all command and reporter blocks in this function.

		if (this.cmdList) this.cmdList.forAllBlocks(f);
	}

	allVariableCmds() {
		// Return an array of all commands and reporters that reference variables.

		let result = [];
		this.forAllBlocks(cmd => {
			if (['v', '=', '+=', 'local', 'for'].includes(cmd.selector)) {
				result.push(cmd);
			}
		});
		return result;
	}

	globalVars() {
		// Return a list of all global variables used by this function.

		let result = new Set(this.allVars());
		for (const arg of this.argNames) result.delete(arg);
		for (const cmd of this.allVariableCmds()) {
			let sel = cmd.selector;
			if ((sel == 'local') || (sel == 'for')) {
				let localName = cmd.inputs()[0].evaluate();
				result.delete(localName);
			}
		}
		return Array.from(result);
	}

	allVars() {
		// Return a list of all parameter and variable names used in this function.

		let result = new Set();
		for (const cmd of this.allVariableCmds()) {
			if (cmd.selector == 'v') {
				result.add(cmd.blockSpec);
			} else {
				result.add(cmd.inputs()[0].evaluate());
			}
		}
		return Array.from(result);
	}

	refsOfVariable(varName) {
		// Return a list of all commands and reporters that reference the given variable.

		return this.allVariableCmds().filter(cmd => {
			return (cmd.selector == 'v') ?
				(cmd.blockSpec == varName) :
				(cmd.inputs()[0].evaluate() == varName);
		});
	}

	allCalls() {
		// Return an array with the names of all functions called by this one.

		let result = new Set();
		this.forAllBlocks(cmd => {
			result.add(cmd.selector);
		});

		// remove selectors for control structure and variable blocks
		let keywords = [
			'if', 'forever', 'repeat', 'for', 'repeatUntil', 'waitUntil', 'exitLoop',
			'v', 'local', '=', '+=', 'return'];
		for (const w of keywords) result.delete(w);

		return Array.from(result);
	}

	returnsValue() {
		// Return true if this function contains a return statement with an argument.

		let result = false;
		this.forAllBlocks(cmd => {
			if ((cmd.selector == 'return') && (cmd.inputs().length == 1)) {
 				result = true;
			}
		});
		return result;
	}

	equalsFunction(f) {
		function arraysEqual(a1, a2) {
			if (!Array.isArray(a1) || !Array.isArray(a2)) return false;
			if (a1.length != a2.length) return false;
			for (let i = 0; i < a1.length; i++) {
				if (a1[i] != a2[i]) return false;
			}
			return true;
		}
		return (
			(f.functionName == this.functionName) &&
 			arraysEqual(f.argNames, this.argNames) &&
			arraysEqual(f.localVars, this.localVars) &&
			(f.cmdList == null ? '' : f.cmdList.codeString()) ==
			(this.cmdList == null ? '' : this.cmdList.codeString()));
	}

	expression() {
		// Answer me as a model node, the shape MB_Decompiler emits for a
		// function definition (mb-decompiler.js addHatBlock, chunk type 3).
		return {
			isFunction: true,
			functionName: this.functionName,
			argNames: this.argNames.slice(),
			cmdList: this.cmdList ? this.cmdList.expression() : null,
		};
	}

	codeString() {
		let result = 'to ' + quoteIfNeeded(this.functionName) + ' ';
		for (const arg of this.argNames) {
			result += quoteIfNeeded(arg) + ' ';
		}
		result += '{\n';
		if (this.cmdList) { result += this.cmdList.codeString(1); }
		result += '}\n';
		return result;
	}

}

function functest() {
	let cmds = MB_Parser.parse('to test a { local b 10 \n return (+ (foo a) c) }');
	let b = MB_Parser.blockFor(cmds[0]);
	let nameAndArgs = b.inputValues();
	let funcName = nameAndArgs[0];
	let argNames = nameAndArgs.slice(1);
	let f = new MB_Function(funcName, argNames, b.nextBlock());
	console.log(f);
	console.log('calls:', f.allCalls());
	console.log('all vars:', f.allVars());
	console.log('locals:', f.localVars);
	console.log('globals:', f.globalVars());
	console.log('refs of a', f.refsOfVariable('a'));
	let f2 = new MB_Function(funcName, argNames, b.nextBlock());
	console.log('functions equal', f2.equalsFunction(f));
}
