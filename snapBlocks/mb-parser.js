// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-parser.js - Parser for the MicroBlocks language textual representation.

/* global MB_editor, MB_Parser, MB_Specs, CommandBlockMorph, CommandSlotMorph, ReporterBlockMorph, HatBlockMorph */

class MB_Parser {
	constructor(srcString, fileName = '<string>') {
		this.buf = Array.from(srcString);
		this.bufSize = this.buf.length;
		this.bufPos = 0;
		this.fileName = fileName;
		this.lineNumber = 1;
		this.complete = false;
		this.inString = false;
		this.EOF = {}; // Unique value indicating that there is no more data to parse
	}

	// Public class methods

	static parse(srcString, fileName = '<string>') {
		// Parse the given string containing zero or more commands.
		// Return an array of command parse trees.

		let result = [];
		let p = new MB_Parser(srcString, fileName);
		while (!p.atEnd()) {
			let parseTree = p.nextParseTree(false);
			if (!parseTree) break;
			result.push(parseTree);
		}
		return result;
	}

	static blockFor(parseTree, singleIsReporter = false) {
		// Convert the given parse tree into a block. A single command can have
		// come from '( ... )' or from a bare command line and the reader does not
		// record which, so the caller says. Defaults to command: functest() in
		// mb-function.js passes a bare `to`.
		if (Array.isArray(parseTree[0])) { // array of commands
			return new MB_Parser('').makeBlockList(parseTree);
		} else {
			return new MB_Parser('').makeBlock(parseTree, singleIsReporter);
		}
	}

	// Private methods

	// ***** Command Parsing *****

	nextParseTree() {
		// Return the parse tree for the next command in the string being parsed
		// or null when all items have been read.

		this.complete = true;
		this.inString = false;

		this.skipWhiteSpace();
		if (this.bufPos >= this.bufSize) return null;

		let result = this.readCmd();

		if (this.inString) {
			this.parseError('Missing closing string quote');
			return null;
		}
		if (!this.complete) {
			this.parseError('Missing closing bracket or parenthesis');
			return null;
		}
		this.skipWhiteSpace();
		return result;
	}

	readCmdList() {
		// Read a list of starting with '{'.

		this.skip(1); // skip '{'
		this.skipWhiteSpace();

		let result = [];
		let c;
		while (true) {
			c = this.peek();
			if ((this.EOF == c) || ('}' == c)) break;
			let cmdOrValue = this.readCmd(false);
			if (Array.isArray(cmdOrValue)) {
				result.push(cmdOrValue);
			} else {
				this.parseError('Non-command in command list');
				return [];
			}
			this.skipWhiteSpace();
		}

		if ('}' == c) {
			this.skip(1);
		} else {
			this.complete = false;
		}
		return result;
	}

	readCmd(isReporter) {
		// Read a command or reporter. Terminate at close paren, close bracket, end of line, or end of file.

		let buf = [];
		this.skipWhiteSpace();
		if (this.atEnd()) return null;

		if (isReporter && ('(' == this.peek())) {
			this.skip(1);
		}

		let c;
		while (true) { // collect selector and arguments
			if (isReporter) {
				this.skipWhiteSpace();
			} else {
				this.skipSpacesAndTabs(); // reporters can span lines
			}
			c = this.peek();
			if ((this.EOF == c) || (this.isNewLine(c))) break;
			if ((')' == c) || ('}' == c)) break;
			buf.push(this.readToken());
		}

		if (isReporter) {
			if (')' == c) {
				this.skip(1);
			} else {
				this.parseError("Missing ')'");
				this.complete = false;
				if ('}' == c) {
					this.skipRestOfLine();
				}
				return null;
			}
		} else {
			if (')' == c) {
				this.parseError("Unexpected ')' encountered");
				this.skip(1);
			}
		}

		if (buf.length == 0) {
			this.parseError('Empty command or reporter');
			return null;
		}

		if ((buf.length == 3) && this.isInfixOp(buf[1]) && !this.isCallOp(buf[0])) {
			// Convert infix to prefix order (unless the command is 'call' or 'callWith')
			let tmp = buf[0];
			buf[0] = buf[1];
			buf[1] = tmp;
		}

		if (buf.length == 1) {
			if ((typeof buf[0]) != 'string') {
				return buf[0]; // number or special value
			}
		}

		let selector = buf[0];
		if ((typeof selector) != 'string') {
			this.parseError('Selector must be a string; missing parentheses around a subexpression?');
			return null;
		} else if (selector[0] == "'") {
			selector = selector.slice(1, -1); // remove quotes
			buf[0] = selector;
		}
		return buf;
	}

	isInfixOp(op) {
		let infixOps = [
			'=', '+=',
			'+', '-', '*', '/', '%',
			'<', '<=', '==', '!=', '>=', '>', '===',
			'&', '|', '^', '<<', '>>', '>>>',
		];
		return infixOps.includes(op);
	}

	isCallOp(op) {
		return (('call' == op) || ('callWith' == op));
	}

	// ***** Converting Parse Trees to Blocks *****

	makeBlock(buf, isReporter = false) {
		// Make a command or reporter block from the given array of selector and arguments.

		if (buf.length == 0) return null; // empty command list (e.g. in an if-else)

		let selector = buf[0];
		let args = buf.slice(1);
		if ('v' == selector) {
			return this.makeVariableReporter(args[0]);
		}
		let b, blockType = MB_Specs.blockTypeForSelector(selector);
		if (isReporter || ('r' == blockType)) {
			b = new ReporterBlockMorph();
		} else if ('h' == blockType) {
			b = new HatBlockMorph();
		} else {
			b = new CommandBlockMorph();
		}
		b.selector = selector;
		// Grow the spec when the call supplies more arguments than it declares
		// slots, or the extras are dropped. GP has no such ceiling: its compiler
		// reads (count args) off argList (MicroBlocksCompiler.gp primitive,
		// line 1042), which the spec does not bound.
		let spec = MB_Specs.snapSpecForSelector(selector);
		spec = spec ? MB_Specs.extendSpecForArgs(spec, args)
			: MB_Specs.specFor(selector, args); // unknown selector; specFor extends its own
		b.setSpec(spec);
		let cat = MB_Specs.categoryForSelector(selector);
		if (cat.includes('Display')) cat = 'Output'; // xxx remove when libraries work
		b.setCategory(cat);
		b.isDraggable = true;
		let inputs = b.inputs();

		while ((inputs.length < args.length) && b.canExpand()) {
			b.expand();
			inputs = b.inputs();
		}

		for (let i = 0; i < args.length; i++) {
			let arg = args[i];
			if ((typeof arg) == 'string') {
				arg = this.argOrVarRef(selector, arg, (i == 0));
			} else if (Array.isArray(arg)) {
				if (Array.isArray(arg[0])) {
					arg = this.makeBlockList(arg);
				} else {
					arg = this.makeBlock(arg, true);
				}
			}
			this.setBlockArg(b, arg, i);
			if (arg instanceof ReporterBlockMorph) arg.fixBlockColor();
		}
		// A slot the source did not fill is not an argument. GP keeps the parse
		// node beside the block (Block.gp initializeForNode :1747) and compiles
		// and prints its argList, so `sayIt` stays `sayIt 0` and `return` stays bare.
		for (let i = args.length; i < inputs.length; i++) inputs[i].markUnsupplied();
		return b;
	}

	setBlockArg(b, arg, i) {
		let inputs = b.inputs();
		if (i >= inputs.length) return; // ignore extra arguments; shouldn't happen
		if (inputs[i] instanceof CommandSlotMorph) {
			if (arg instanceof CommandBlockMorph) {
				inputs[i].nestedBlock(arg);
			}
		} else if (arg instanceof ReporterBlockMorph) {
			b.replaceInput(inputs[i], arg);
		} else {
			inputs[i].setContents(arg);
		}
	}

	makeBlockList(bufList) {
		let result, previous;
		for (const buf of bufList) {
			let b = this.makeBlock(buf);
			if (!result) {
				result = b;
				previous = b;
			} else {
				previous.nextBlock(b);
				previous = b;
			}
		}
		return result;
	}

	argOrVarRef(op, arg, isFirstArg) {
		// If arg is an unquoted string and the arg at the given index is not used
		// as a proper name by the given operator, create a variable reference.
		// Otherwise, just return arg, without the quotes if it was quoted.

		if (arg[0] == "'") {
			// quoted string constant; just remove the quotes
			return arg.slice(1, -1);
		}
		if (('if' == op) && ('else' == arg)) {
			// The final condition slot of an 'if' is written as the bare word
			// 'else' when it is true (PrettyPrinter.gp printBlock). A genuine
			// string "else" is always quoted (PrettyPrinter.gp quoteOp), so an
			// unquoted one can only be the boolean.
			return true;
		}
		// arg is an unquoted string, so it may be a variable reference
		if (this.isVariableReference(op, isFirstArg)) {
			// return a variable reporter block for arg
			return this.makeVariableReporter(arg);
		}
		return arg;
	}

	isVariableReference(op, isFirstArg) {
		// Return true if the given operation treats either the first or all arguments
		// as variable references. Examples include the left-hand sides of assignment
		// operations or 'local', the index variable of a 'for' loop, and the
		// function name and formal parameters in a 'to' function definition.

		if ('to' == op) return false;
		const quoteFirstArg = ['v', '=', '+=', 'local', 'for'];
		return (isFirstArg && (quoteFirstArg.includes(op))) ? false : true;
	}

	makeVariableReporter(varName) {
		if (varName[0] == "'") {
			// quoted variable name; remove the quotes
			varName = varName.slice(1, -1);
		}
		let b = new ReporterBlockMorph();
		b.setCategory('Variables');
		b.selector = 'v';
		b.setSpec(varName);
		b.isDraggable = true;
		return b;
	}

	// ***** Tokenizing *****

	readToken() {
		// Read and return the next number, quoted string, command, or command list.

		this.skipWhiteSpace();
		if (this.atEnd()) {
			this.complete = false;
			return this.EOF;
		}
		let c = this.peek();
		if (this.isDigit(c)) return this.readNumber();
		else if ((('-' == c) || ('.' == c)) && this.isDigit(this.peek2())) return this.readNumber();
		else if ('\'' == c) return this.readString();
		else if ('(' == c) return this.readCmd(true);
		else if ('{' == c) return this.readCmdList();
		else return this.readSymbol();
	}

	readNumber() {
		// Read and return the next integer or floating point number.

		let numBuf = '';
		let isFloat = false;
		while (true) {
			let c = this.peek();
			if (this.isDigit(c) || ('-' == c)) {
				numBuf += this.next();
			} else if ('.' == c) {
				isFloat = true;
				numBuf += this.next();
			} else if (('e' == c) || ('E' == c)) {
				isFloat = true;
				numBuf += this.next();
				c = this.peek();
				if (('+' == c) || ('-' == c)) {
					numBuf += this.next();
				}
			} else {
				break;
			}
		}
		if (isFloat) console.log(
			'MicroBlocks does not support floating point numbers; rounding.' +
			(' (' + this.fileName + ':' + this.lineNumber) + ')');
		return Math.round(Number(numBuf));
	}

	isDigit(c) {
		return ('0' <= c) && (c <= '9');
	}

	readString() {
		// Read a string that starting and ending with a single quote characters.

		let strBuf = '';
		strBuf += this.next(); // initial quote character
		this.inString = true;
		while (true) {
			let c = this.next();
			if (this.EOF == c) {
				this.parseError('No closing quote');
				this.complete = false;
				break;
			}
			if ('\'' == c) {
				if ('\'' == this.peek()) {
					this.skip(1); // quoted quote character
				} else {
					strBuf += '\'';
					break; // skip ending quote character
				}
			}
			strBuf += c;
			if (this.isNewLine(c)) {
				this.lineNumber++;
				// For lines ending in both cr and lf, consume both chars to avoid incrementing the line number twice.
				if ((c == '\n') && (this.peek() == '\r')) strBuf += this.next();
				if ((c == '\r') && (this.peek() == '\n')) strBuf += this.next();
			}
		}
		this.inString = false;
		return strBuf;
	}

	readSymbol() {
		// Read an unquoted string or one of the special values: true, false, or nil.

		let symbol = '';
		while (true) {
			let c = this.peek();
			if ((c <= ' ') || (')' == c) || ('}' == c) || (this.EOF == c)) {
				break;
			}
			symbol += this.next();
		}
		if ('true' == symbol) return true;
		if ('false' == symbol) return false;
		if ('nil' == symbol) return null;
		return symbol;
	}

	// ***** Stream Operations *****

	atEnd() {
		// Return true when all items have been read.

		return this.bufPos >= this.bufSize;
	}

	peek() {
		// Return the next character without advancing bufPos.

		return (this.bufPos < this.bufSize) ? (this.buf)[this.bufPos] : this.EOF;
	}

	peek2() {
		// Return the character after the next one without advancing bufPos.

		return ((this.bufPos + 1) < this.bufSize) ? (this.buf)[this.bufPos + 1] : this.EOF;
	}

	next() {
		// Return the next character and advance bufPos or EOF if at end.

		return (this.bufPos < this.bufSize) ? (this.buf)[this.bufPos++] : this.EOF;
	}

	skip(skipCount) {
		// Skip the given number of characters.

		this.bufPos += skipCount;
		if (this.bufPos < 0) this.bufPos = 0;
		if (this.bufPos > this.bufSize) this.bufPos = this.bufSize;
	}

	isNewLine(c) {
		// Return true if c is a newline or carriage return character.

		return (('\n' == c) || ('\r' == c));
	}

	skipNewLine() {
		// Consume a line ending and increment lineNumber. Assume stream is
		// positioned at a newline ('\n') or carriage return ('\r') character.
		// Handle lines ending with both '\r' and '\n' in either order.

		let c = this.next();
		if (('\n' == c) && ('\r' == this.peek())) {
			this.skip(1);
		} else if (('\r' == c) && ('\n' == this.peek())) {
			this.skip(1);
		}
		this.lineNumber++;
	}

	// ***** Skipping Whitespace and Comments *****

	skipWhiteSpace() {
		// Skip whitespace, including comments and newlines.
		// Stop at the first printable character or EOF.
		// Comments begin with a double slash (//) and extend to the end of the line.

		let c;
		while ((c = this.next()) != this.EOF) {
			if (('/' == c) && ('/' == this.peek())) {
				this.skipRestOfLine();
				this.skipNewLine();
			} else if (this.isNewLine(c)) {
				this.skip(-1);
				this.skipNewLine();
			} else if (c > ' ') {
				this.skip(-1);
				return;
			}
		}
	}

	skipSpacesAndTabs() {
		// Skip spaces, tabs, and comments within one line. Do not consume the line ending.
		// Comments begin with a double slash (//) and extend to the end of the line.

		let c;
		while ((c = this.next()) != this.EOF) {
			if (('/' == c) && ('/' == this.peek())) {
				this.skipRestOfLine();
				return;
			}
			if ((' ' != c) && ('\t' != c)) {
				this.skip(-1);
				return;
			}
		}
	}

	skipRestOfLine() {
		// Skip the remainder of the line, but do not consume the line ending.

		let c;
		while ((c = this.peek()) != this.EOF) {
			if (this.isNewLine(c)) return;
			this.skip(1);
		}
	}

	// ***** Error Reporting *****

	parseError(problem) {
		console.log('MicroBlocks syntax error:', (this.fileName + ':' + this.lineNumber), problem);
	}

} // end of class MB_Parser

// Parser Tests

function parser_test1() {
	let p = new MB_Parser("33 1 2 3 foo 'bar' nil true false\n -1 -3.14 -314e-1 -314E-2");
	while (!p.atEnd()) {
		p.skipWhiteSpace();
		let v = p.readToken();
		if (v != p.EOF) console.log(v);
	}
}

function parser_test2() {
	let p = new MB_Parser("'xxx");
	p.skipWhiteSpace();
	let v = p.readToken(); // gives error - no closing string quote
}

function parser_test3() {
	let p = new MB_Parser("  'foo'  ");
	console.log(p.readCmd());
}

function parser_test4() {
	let p = new MB_Parser(" { stop; go }  ");
	let cmds = p.readCmdList(false);
	console.log(cmds);
}

function parser_test(s) {
	let cmds = MB_Parser.parse(s);
	cmds.forEach( (cmd) => {
		MB_editor.addBlockToScripts(MB_Parser.blockFor(cmd));
	});
}

function parser_test5() {
	parser_test("  stop; go\nanother 123 \n  'the end'");
}

function parser_test6() {
	parser_test("  print ((1 + 2) * 3) { stop }  ");
}

function parser_test7() {
	parser_test("script 915 125 {\nwhenButtonPressed 'A'\nwaitMillis 500\n}\n\nscript 100 200 {\nwhenButtonPressed 'B'\nwaitMillis 300\n}");
}

function parser_test8() {
	parser_test("digitalReadOp 'hello' 1 true false 'foo'");
}

function parser_test9() {
	parser_test("\n\nscript 206 288 {\nspiSend 0\n\n}\n\n");
}

function parser_test10() {
	parser_test("x = (v 'foo')");
}

function parser_testFile() {
	function parseFile(fileName, contents) {
		let startT = Date.now();
		let cmdList = MB_Parser.parse(contents);
		let parseTime = Date.now() - startT;
		for (const cmd of cmdList) {
			console.log(cmd[0], cmd.slice(1));
		}
		console.log(fileName, 'parse time:', parseTime, 'msecs');
	}
	MB_editor.importLocalFile(parseFile);
}
