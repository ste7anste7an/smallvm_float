// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-project.js - MicroBlocks project and library operations.
/*
	MB_Project

	A MicroBlocks project consists of a main MB_Module object containing the
	top-level scripts and function definitions and zero or more MB_Modules for
	the libraries it uses.
*/

/* global MB_editor, MB_Function, MB_Parser, BlockMorph, CommandBlockMorph, ReporterBlockMorph */

// --- Module-level helpers ---

function stringArg(x) {
	// Extract a plain JS value from a parse tree token.
	// Quoted strings like "'hello'" → "hello"; unquoted identifiers stay as-is.
	if (typeof x === 'number' || typeof x === 'boolean') return x;
	if (typeof x === 'string') {
		if (x[0] === "'") return x.slice(1, -1); // remove surrounding quotes
		return x;
	}
	return String(x);
}

function printString(s) {
	// Return s wrapped in single quotes, with internal quotes doubled.
	return "'" + String(s).replace(/'/g, "''") + "'";
}

function parsedSpecs(cmdList) {
	// Extract spec definitions from a command list and return a Map of opName → spec object.
	let specs = new Map();
	for (const cmd of cmdList) {
		if (!Array.isArray(cmd) || cmd[0] !== 'spec') continue;
		let blockType = stringArg(cmd[1]);
		let opName = stringArg(cmd[2]);
		let specString = (cmd.length > 3) ? stringArg(cmd[3]) : opName;
		let slotTypes = (cmd.length > 4) ? stringArg(cmd[4]) : '';
		let defaults = [];
		for (let i = 5; i < cmd.length; i++) {
			// Keep nil as nil: specDefaultString prints a default by its slot
			// type and needs to tell an empty slot from the word 'null'.
			defaults.push(cmd[i] === null ? null : stringArg(cmd[i]));
		}
		specs.set(opName, { blockType, opName, specString, slotTypes, defaults });
	}
	return specs;
}

function gpString(value) {
	// GP's toString: nil prints as the word nil, everything else as itself.
	return (value === null || value === undefined) ? 'nil' : String(value);
}

function specDefaultString(slotType, value) {
	// Print one spec default by its declared slot type, never by the type of
	// the value, as specDefinitionString does at BlockSpec.gp:330. A type on
	// neither list (any, color, cmd, var) is written as the word nil.
	const type = String(slotType || '').split('.')[0]; // 'menu.foo' is a menu slot
	if (['auto', 'menu', 'str', 'cmt'].includes(type)) {
		return (typeof value === 'string') ? printString(value) : gpString(value);
	}
	if (['bool', 'num', 'microbitDisplay'].includes(type)) return gpString(value);
	return 'nil';
}

function specSlotInfo(spec) {
	// Pair each slot with its type and default, one slot per
	// max(types, defaults, input slots), as setSlotInfo does at BlockSpec.gp:82.
	// Walking the declared types alone would drop any default past the end of
	// them. A slot with no declared type takes 'num' from a numeric default;
	// anything else is an 'any' slot, whose default GP keeps as a hint only.
	const types = String(spec.slotTypes || '').split(/\s+/).filter((t) => t.length > 0);
	const defaults = spec.defaults || [];
	const specString = String(spec.specString || spec.opName || '');
	const slotCount = specString.split(/\s+/).filter((w) => w === '_').length;
	const info = [];
	for (let i = 0; i < Math.max(types.length, defaults.length, slotCount); i++) {
		const value = (i < defaults.length) ? defaults[i] : null;
		if (types[i] !== undefined) info.push([types[i], value]);
		else info.push((typeof value === 'number') ? ['num', value] : ['any', null]);
	}
	return info;
}

function specDefinitionString(spec) {
	// Serialize a spec object to a 'spec' declaration line (without newline).
	// Format: spec 'blockType' 'opName' 'specString' 'slotTypes' default1 default2...
	let parts = ['spec'];
	parts.push("'" + (spec.blockType || ' ') + "'");
	parts.push("'" + spec.opName + "'");
	parts.push("'" + (spec.specString || spec.opName) + "'");
	let slotInfo = specSlotInfo(spec);
	if (slotInfo.length > 0) {
		parts.push("'" + slotInfo.map((slot) => slot[0]).join(' ') + "'");
		let defaults = slotInfo.map((slot) => specDefaultString(slot[0], slot[1]));
		while (defaults.length > 0 && defaults[defaults.length - 1] === 'nil') {
			defaults.pop(); // GP trims trailing nils, as they add nothing
		}
		parts.push(...defaults);
	}
	return parts.join(' ');
}

function allBlocksIn(root) {
	// Return all blocks in the tree rooted at root (a BlockMorph or CommandBlockMorph).
	if (!root) return [];
	let result = [];
	let todo = [root];
	while (todo.length > 0) {
		let b = todo.pop();
		result.push(b);
		if (b.nextBlock && b.nextBlock()) todo.push(b.nextBlock());
		if (b.inputs) {
			for (const inp of b.inputs()) {
				if (inp instanceof BlockMorph) {
					todo.push(inp);
				} else if (inp instanceof CommandSlotMorph && inp.nestedBlock()) {
					todo.push(inp.nestedBlock()); // the body of an if/repeat/forever/for
				}
			}
		}
	}
	return result;
}

// --- MB_Project class ---

class MB_Project {
	constructor() {
		this.main = new MB_Module('main');
		this.libraries = new Map(); // libName → MB_Module
		this.blockSpecs = new Map(); // opName → spec object
		this.varIndices = new Map(); // varName → index
		this.nextVarIndex = 0;
	}

	// Support

	choicesFor(selector) {
		if (this.main.choices.has(selector)) return this.main.choices.get(selector);
		for (const lib of this.libraries.values()) {
			if (lib.choices.has(selector)) return lib.choices.get(selector);
		}
		return null;
	}

	hasUserCode() {
		if (!this.main) return false;
		return (
			this.main.scripts.length > 0 ||
			this.main.functions.length > 0 ||
			this.main.variableNames.length > 0 ||
			this.libraries.size > 0
		);
	}

	// Block Specs

	recordBlockSpec(opName, spec) {
		this.blockSpecs.set(opName, spec);
	}

	deleteBlockSpecFor(functionName) {
		this.blockSpecs.delete(functionName);
	}

	// Libraries

	libraryNamed(name) { return this.libraries.get(name) || null; }

	addLibrary(module) {
		let libName = module.moduleName;
		let oldLib = this.libraries.get(libName);
		if (oldLib) oldLib.updatingLibrary(module, this);
		this.libraries.delete(libName);
		this.libraries.set(libName, module);

		// new library functions supersede earlier versions
		let newFunctionNames = new Set();
		for (const f of module.functions) newFunctionNames.add(f.functionName);
		this.main.removeSupercededFunctions(newFunctionNames);
		for (const lib of this.libraries.values()) {
			if (lib !== module) lib.removeSupercededFunctions(newFunctionNames);
		}

		// update block specs
		for (const [k, spec] of module.blockSpecs) {
			this.blockSpecs.set(k, spec);
		}
	}

	removeLibraryNamed(libName) {
		let lib = this.libraries.get(libName);
		if (!lib) return;
		this.libraries.delete(libName);
		for (const f of lib.functions) {
			this.blockSpecs.delete(f.functionName);
		}
	}

	categoryForOp(op) {
		if (op === '-') return null; // ignore dash used as a spacer in library block lists
		for (const lib of this.libraries.values()) {
			if (lib.blockList.includes(op)) return lib.moduleCategory;
		}
		return null;
	}

	checkForNewerLibraryVersions(autoConfirm = false) {
		// Check for newer versions of libraries used in this project.
		// If true is passed to the optional autoConfirm parameter, update old
		// libraries without asking. Otherwise ask the user for confirmation.

		// XXX TODO This requires UI interaction so skip for now.
	}

	// Scripts

	allScripts() {
		return this.main.scripts.map(entry => entry[2]);
	}

	// Functions

	allFunctions() {
		let result = [...this.main.functions];
		for (const lib of this.libraries.values()) {
			result.push(...lib.functions);
		}
		return result;
	}

	functionNamed(name) {
		let f = this.main.functionNamed(name);
		if (f) return f;
		for (const lib of this.libraries.values()) {
			f = lib.functionNamed(name);
			if (f) return f;
		}
		return null;
	}

	libForFunction(func) {
		let funcName = func.functionName;
		for (const lib of this.libraries.values()) {
			if (lib.functionNamed(funcName)) return lib.moduleName;
		}
		return '';
	}

	metaInfoForFunction(func) {
		// Return a tab-delimited string: blockType TAB specString TAB slotTypes
		let funcName = func.functionName;
		let spec = this.blockSpecs.get(funcName);
		if (!spec) {
			// no spec for func so generate one (unusual case)
			let specString = funcName + func.argNames.map(() => ' _').join('');
			let slotTypes = func.argNames.map(() => 'auto').join(' ');
			spec = { blockType: ' ', opName: funcName, specString, slotTypes, defaults: [] };
		}
		return [spec.blockType, spec.specString, spec.slotTypes].join('\t');
	}

	// Variables

	allVariableNames() {
		// Return a sorted array of all global variable names (case-insensitive order).
		let result = new Set(this.main.variableNames);
		for (const lib of this.libraries.values()) {
			for (const v of lib.variableNames) result.add(v);
		}
		return Array.from(result).sort((a, b) =>
			a.toUpperCase() < b.toUpperCase() ? -1 : 1);
	}

	addVariable(newVar) {
		this.main.addVariable(newVar);
	}

	deleteVariable(varName) {
		this.main.deleteVariable(varName);
		for (const lib of this.libraries.values()) lib.deleteVariable(varName);
	}

	indexForVar(varName) {
		// Return a unique index for the given global variable.
		// Details: Assign indices sequentially without trying to recycle the indices
		// of variables that have been deleted. When we run out of indices, clear the
		// dictionary and recompile all scripts. (This is not common since most projects
		// will not run out of variable indices.)

		let result = this.varIndices.get(varName);
		if (result !== undefined) return result;
		if (this.nextVarIndex >= 128) {
			// Rare case: No more variable indices
			if (this.allVariableNames().length > 128) {
				// Very rare: Too many global variables. Assign 127 to remaining variables.
				// Code will run strangely but won't crash.
				return 127;
			}
			// There are enough indices for all globals (perhaps because variables have been deleted)
			// Recompile all scripts, to re-assign all global variable indices.
			this.varIndices = new Map();
			this.nextVarIndex = 0;
			// XXX TODO: set the compiler "recompileNeeded" flag
		}
		let varIndex = this.nextVarIndex++;
		this.varIndices.set(varName, varIndex);
		return varIndex;
	}

	// Broadcasts

	allBroadcasts() {
		let result = new Set();
		for (const entry of this.main.scripts) {
			let block = entry[2];
			for (const b of allBlocksIn(block)) {
				if (b.selector === 'sendBroadcast' || b.selector === 'whenBroadcastReceived') {
					let inputs = b.inputs();
					if (inputs.length > 0) result.add(inputs[0].evaluate());
				}
			}
		}
		return Array.from(result).sort();
	}

	// Unused analysis

	unusedFunctions(paletteBlock) {
		// Return a list of functions that are not used by this project (directly or indirectly).
		// If the project contains a custom call block, trace the function call if the argument
		// to the call block is a string constant. Otherise, assume that any function could be
		// called so there are no unused functions.
		// The optional paletteBlock argument supports running blocks in the palette.

		// create dictionary with all functions
		let functionCalled = new Map();
		for (const f of this.allFunctions()) {
			functionCalled.set(f.functionName, false);
		}

		let scriptsToScan = [...this.main.scripts];
		if (paletteBlock) scriptsToScan.push([0, 0, paletteBlock]);

		// collect functions called by scripts
		let todo = [];
		for (const entry of scriptsToScan) {
			// an entry is a three-element list: [x, y, script]
			let block = entry[2];
			for (const b of allBlocksIn(block)) {
				let op = b.selector;
				if (['callCustomCommand', 'callCustomReporter', 'sendBroadcast'].includes(op)) {
					// if argument is a string the callee is known; otherwise any function could be called
					let inputs = b.inputs();
					let callArg = inputs.length > 0 ? inputs[0].evaluate() : null;
					if (typeof callArg === 'string') {
						op = callArg;
					} else {
						return []; // dynamic call — can't trace
					}
				}
				if (functionCalled.get(op) === false) {
					functionCalled.set(op, true);
					todo.push(op);
				}
			}
		}

		// mark all reachable functions
		while (todo.length > 0) {
			let f = this.functionNamed(todo.shift());
			if (!f || !f.cmdList) continue;
			for (const b of allBlocksIn(f.cmdList)) {
				let op = b.selector;
				if (['callCustomCommand', 'callCustomReporter', 'sendBroadcast'].includes(op)) {
					let inputs = b.inputs();
					let callArg = inputs.length > 0 ? inputs[0].evaluate() : null;
					if (typeof callArg === 'string') {
						op = callArg;
					} else {
						return [];
					}
				}
				if (functionCalled.get(op) === false) {
					functionCalled.set(op, true);
					todo.push(op);
				}
			}
		}

		// remove main user functions (so decompiler can recover them)
		for (const f of this.main.functions) {
			functionCalled.delete(f.functionName);
		}

		// generate and return a list of uncalled functions
		let result = [];
		for (const [k, called] of functionCalled) {
			if (!called) result.push(k);
		}
		return result;
	}

	unusedGlobals() {
		// Return global vars that are not referenced in any script or function.

		// make a list of global variables not owned by any library
		let unusedGlobals = new Set(this.main.variableNames);
		for (const lib of this.libraries.values()) {
			for (const v of lib.variableNames) unusedGlobals.delete(v);
		}

		// scan scripts
		for (const entry of this.main.scripts) {
			// an entry is a three-element list: [x, y, script]
			for (const b of allBlocksIn(entry[2])) {
				if (['v', '=', '+='].includes(b.selector)) {
					let inputs = b.inputs();
					if (inputs.length > 0) unusedGlobals.delete(inputs[0].evaluate());
				}
			}
		}

		// scan functions
		for (const f of this.allFunctions()) {
			let localAndArgs = new Set([...f.argNames, ...f.localVars]);
			if (!f.cmdList) continue;
			for (const b of allBlocksIn(f.cmdList)) {
				if (['v', '=', '+='].includes(b.selector)) {
					let inputs = b.inputs();
					if (inputs.length > 0) {
						let varName = inputs[0].evaluate();
						if (!localAndArgs.has(varName)) unusedGlobals.delete(varName);
					}
				}
			}
		}

		return Array.from(unusedGlobals);
	}

	// Loading

	loadFromString(s, updateLibraries = true) {
		this.main = new MB_Module('main');
		this.libraries = new Map();
		this.blockSpecs = new Map();
		this.varIndices = new Map();
		this.nextVarIndex = 0;

		let cmdList = MB_Parser.parse(s);
		if (cmdList.length > 0 && Array.isArray(cmdList[0]) && cmdList[0][0] === 'projectName') {
			cmdList = cmdList.slice(1);
		}
		this.loadSpecs(cmdList);

		let cmdsByModule = this.splitCmdListIntoModules(cmdList);
		let isFirst = true;
		for (const modCmds of cmdsByModule) {
			if (isFirst) {
				this.main.loadFromCmds(modCmds, this);
				isFirst = false;
			} else {
				let lib = new MB_Module();
				lib.loadFromCmds(modCmds, this);
				this.libraries.set(lib.moduleName, lib);
			}
		}

		if (updateLibraries) this.checkForNewerLibraryVersions();
		this.updatePrimitives();
		this.fixFunctionLocals();
		return this;
	}

	addLibraryFromString(s, libName, fileName) {
		// Load a library from a string and return its module name.
		let cmdList = MB_Parser.parse(s);
		this.loadSpecs(cmdList);
		let cmdsByModule = this.splitCmdListIntoModules(cmdList);
		let moduleName = null;
		for (const modCmds of cmdsByModule) {
			let lib = new MB_Module();
			lib.loadFromCmds(modCmds, this);
			if (!lib.moduleName) lib.moduleName = libName;

			// set path based on fileName
			if (fileName) {
				if (fileName.startsWith('//Libraries/')) {
					lib.path = this.withoutExtension(fileName.slice('//Libraries/'.length));
				} else if (fileName.startsWith('http://')) {
					lib.path = fileName;
				} else {
					lib.path = null;
				}
			}

			moduleName = lib.moduleName;
			if (this.libraries.has(moduleName)) {
				this.removeLibraryNamed(moduleName);
				// updating: don't import dependencies
			}
			lib.updatePrimitives(); // rename obsolete primitives, as loadFromString does
			// importDependencies would go here (requires scripter runtime)
			this.addLibrary(lib);
		}
		this.fixFunctionLocals();
		return moduleName;
	}

	withoutExtension(path) {
		let i = path.lastIndexOf('.');
		return i >= 0 ? path.slice(0, i) : path;
	}

	parsedSpecs(cmdList) {
		return parsedSpecs(cmdList);
	}

	loadSpecs(cmdList) {
		for (const [k, spec] of parsedSpecs(cmdList)) {
			this.blockSpecs.set(k, spec);
		}
	}

	splitCmdListIntoModules(cmdList) {
		// Split command list into one sub-list per module (each starts with 'module').
		let result = [];
		let m = [];
		for (const cmd of cmdList) {
			if (Array.isArray(cmd) && cmd[0] === 'module') {
				if (m.length > 0) result.push(m);
				m = [];
			}
			m.push(cmd);
		}
		result.push(m);
		return result;
	}

	// Saving

	codeString() {
		let sortedLibs = Array.from(this.libraries.values())
			.sort((a, b) => a.moduleName < b.moduleName ? -1 : 1);

		let result = [this.main.codeString(this)];
		for (const lib of sortedLibs) {
			result.push('\n');
			result.push(lib.codeString(this));
		}
		return result.join('');
	}

	// Post-load processing

	fixFunctionLocals() {
		// XXX TODO: would remove project variables that appear as function locals in GP.
		// In the JS port, MB_Function.collectLocalVars() handles this separately.
	}

	updatePrimitives() {
		this.main.updatePrimitives();
		for (const lib of this.libraries.values()) lib.updatePrimitives();
	}

	// Save/load test

	saveLoadTest(fileName) {
		let s1 = this.codeString();
		let p2 = new MB_Project().loadFromString(s1, false);
		let s2 = p2.codeString();
		if (s1 != s2) {
			console.log('saveLoadTest failed:', fileName, s1.length, s2.length);
			return false;
		}
		return true;
	}

	// Stats

	stats() {
		return ('' + this.main.scripts.length + ' scripts, ' + this.allFunctions().length + ' functions');
	}

	// Equality

	equal(proj) {
		// XXX Is this used?

		if (!this.main.equal(proj.main)) return false;
		for (const lib of this.libraries.values()) {
			let otherLib = proj.libraryNamed(lib.moduleName);
			if (!otherLib || !lib.equal(otherLib)) {
				console.log('libs not equal:', lib.moduleName);
				return false;
			}
		}
		let sortedKeys = Array.from(this.blockSpecs.keys()).sort();
		let otherKeys = Array.from(proj.blockSpecs.keys()).sort();
		if (sortedKeys.join(',') !== otherKeys.join(',')) {
			console.log('spec keys mismatch');
			return false;
		}
		for (const k of sortedKeys) {
			let s1 = specDefinitionString(this.blockSpecs.get(k));
			let s2 = specDefinitionString(proj.blockSpecs.get(k));
			if (s1 !== s2) {
				console.log('spec mismatch', k);
				return false;
			}
		}
		return true;
	}
}

// --- MB_Module class ---

class MB_Module {
	constructor(name) {
		this.moduleName = name || null;
		this.moduleCategory = 'Library';
		this.dependencies = [];
		this.version = [1, 0];
		this.author = 'unknown';
		this.description = '';
		this.tags = [];
		this.path = null;
		this.choices = new Map(); // key → string[]
		this.variableNames = [];
		this.blockList = []; // list of opNames, '-', or 'advanced'
		this.blockSpecs = new Map(); // opName → spec object
		this.functions = []; // MB_Function[]
		this.scripts = []; // [x, y, BlockMorph|null][]
		this.translationSources = new Map(); // langCode → source
		this.isImplementation = false;
	}

	// Accessors

	isImplementationLib() { return this.isImplementation; }
	beImplementation() { this.isImplementation = true; }
	setModuleName(name) { this.moduleName = name; }
	setDescription(desc) { this.description = desc; }
	setAuthor(auth) { this.author = auth; }
	setCategory(cat) { this.moduleCategory = cat; }
	setVersion(versionArray) { this.version = [versionArray[0], versionArray[1]]; }
	setTags(tagList) { this.tags = Array.from(tagList); }
	setPath(aPath) { this.path = aPath; }
	setDependencies(deps) { this.dependencies = Array.from(deps); }
	setScripts(newScripts) { this.scripts = Array.from(newScripts); }

	toString() { return 'MB_Module(\'' + this.moduleName + '\')'; }

	dependencyName(dep) {
		let name = dep;
		let poundIdx = name.lastIndexOf('#');
		if (poundIdx >= 0) name = name.slice(0, poundIdx);
		let slashIdx = name.lastIndexOf('/');
		if (slashIdx >= 0) name = name.slice(slashIdx + 1);
		let dotIdx = name.lastIndexOf('.');
		if (dotIdx >= 0) name = name.slice(0, dotIdx);
		return name;
	}

	dependencyNames() {
		return this.dependencies.map(d => this.dependencyName(d));
	}

	// Functions

	functionNamed(name) {
		return this.functions.find(f => f.functionName === name) || null;
	}

	addFunction(f) {
		if (this.functions.includes(f)) return;
		this.functions = this.functions.filter(existing => existing.functionName !== f.functionName);
		this.functions.push(f);
	}

	removeFunction(f) {
		this.functions = this.functions.filter(existing => existing !== f);
	}

	removeSupercededFunctions(superceded) {
		// superceded is a Set of function names.
		this.functions = this.functions.filter(f => !superceded.has(f.functionName));
		this.blockList = this.blockList.filter(op => !superceded.has(op));
	}

	appendFunction(functionsArray, f) {
		let idx = functionsArray.findIndex(existing => existing.functionName === f.functionName);
		if (idx >= 0) {
			console.log('Warning: Multiple definitions of', f.functionName);
			functionsArray[idx] = f;
			return functionsArray;
		}
		return [...functionsArray, f];
	}

	// Variables

	addVariable(newVar) {
		if (!this.variableNames.includes(newVar)) {
			this.variableNames.push(newVar);
		}
	}

	deleteVariable(varName) {
		this.variableNames = this.variableNames.filter(v => v !== varName);
	}

	removeAllVariables() {
		this.variableNames = [];
	}

	// Saving

	needsQuotes(s) {
		if (typeof s === 'number') return false;
		s = String(s);
		if (s === '') return true;
		if (s === 'true' || s === 'false') return true;
		if (/^\d/.test(s) || s[0] === '-') return true;
		if (!/^[a-zA-Z_]/.test(s)) return true;
		for (const ch of s) {
			if (!/[a-zA-Z0-9_]/.test(ch)) return true;
		}
		return false;
	}

	arrayToDeclaration(array, title) {
		let parts = [title];
		for (const item of array) {
			if (typeof item === 'number') {
				parts.push(String(item));
			} else {
				let s = String(item);
				if (this.needsQuotes(s)) s = "'" + s + "'";
				parts.push(s);
			}
		}
		// GP adds the newline to the list and then joins with a space, so a
		// space lands in front of it (MicroBlocksProject.gp
		// arrayToDeclaration).
		return parts.join(' ') + ' \n';
	}

	codeString(owningProject, newLibName) {
		let result = [];

		let modName = (newLibName !== undefined) ? newLibName : (this.moduleName || '');
		if (this.needsQuotes(modName)) modName = "'" + modName + "'";
		result.push('module ' + modName);

		if (this.moduleCategory !== 'Library') {
			let modCat = this.moduleCategory;
			if (this.needsQuotes(modCat)) modCat = "'" + modCat + "'";
			result.push(' ' + modCat);
		}
		result.push('\n');

		let by = this.author;
		if (this.needsQuotes(by)) by = "'" + by + "'";
		result.push('author ' + by + '\n');

		result.push(this.arrayToDeclaration(this.version, 'version'));

		if (this.dependencies.length > 0) {
			result.push(this.arrayToDeclaration(this.dependencies, 'depends'));
		}

		if (this.tags.length > 0) {
			result.push(this.arrayToDeclaration(this.tags, 'tags'));
		}

		for (const [key, vals] of this.choices) {
			result.push(this.arrayToDeclaration([key, ...vals], 'choices'));
		}

		result.push('description ' + printString(this.description) + '\n');

		if (this.variableNames.length > 0) {
			result.push(this.arrayToDeclaration(this.variableNames, 'variables'));
		}

		result.push('\n');

		let projectSpecs = owningProject ? owningProject.blockSpecs : new Map();
		let processed = new Set();

		for (const op of this.blockList) {
			if (op === '-') {
				result.push('  space\n');
			} else if (op === 'advanced') {
				result.push('  advanced\n');
			} else {
				let spec = projectSpecs.get(op);
				if (spec) {
					result.push('  ' + specDefinitionString(spec) + '\n');
					processed.add(op);
				}
			}
		}

		if (this.functions.length > 0) {
			let sortedFuncs = this.functions.slice()
				.sort((a, b) => a.functionName < b.functionName ? -1 : 1);

			// add specs for functions not yet in blockList
			for (const func of sortedFuncs) {
				let op = func.functionName;
				if (!processed.has(op)) {
					let spec = projectSpecs.get(op);
					if (spec) {
						result.push('  ' + specDefinitionString(spec) + '\n');
						processed.add(op);
					}
				}
			}
			result.push('\n');

			for (const func of sortedFuncs) {
				result.push(func.codeString() + '\n');
			}
		}

		if (newLibName === undefined) {
			result.push(this.scriptString());
		}

		return result.join('');
	}

	scriptString() {
		if (this.scripts.length === 0) return '';

		let sorted = this.scripts.slice().sort((e1, e2) => {
			if (e1[1] === e2[1]) return e1[0] < e2[0] ? -1 : 1;
			return e1[1] < e2[1] ? -1 : 1;
		});

		let result = [];
		for (const entry of sorted) {
			let x = Math.round(entry[0]);
			let y = Math.round(entry[1]);
			let block = entry[2];
			result.push('script ' + x + ' ' + y + ' ');
			// A reporter script is written '( ... )', a command list '{ ... }',
			// as GP's scriptString does (MicroBlocksProject.gp:938).
			if (block instanceof ReporterBlockMorph) {
				// codeString() already parenthesises a reporter, so do not add
				// a second pair here as GP's scriptString has to.
				result.push(block.codeString() + '\n');
			} else {
				result.push('{\n');
				if (block) result.push(block.codeString(1));
				result.push('}\n');
			}
			result.push('\n');
		}
		return result.join('');
	}

	// Loading

	loadFromCmds(cmdList, owningProject) {
		this.loadModuleNameAndCategory(cmdList);
		this.loadVersion(cmdList);
		this.loadAuthor(cmdList);
		this.loadDependencies(cmdList);
		this.loadTags(cmdList);
		this.loadDescription(cmdList);
		this.loadChoices(cmdList);
		this.loadVariables(cmdList);
		this.loadBlockList(cmdList);
		this.loadSpecs(cmdList, owningProject);
		this.loadFunctions(cmdList);
		this.loadScripts(cmdList);
		return this;
	}

	stringArgs(cmd) {
		return cmd.slice(1).map(stringArg);
	}

	loadModuleNameAndCategory(cmdList) {
		if (cmdList.length === 0) return;
		let cmd = cmdList[0];
		if (!Array.isArray(cmd) || cmd[0] !== 'module') return;
		this.moduleName = stringArg(cmd[1]);
		if (cmd.length > 2) {
			let cat = stringArg(cmd[2]);
			if (typeof cat === 'string' && cat.startsWith('cat;')) cat = cat.slice(4);
			this.moduleCategory = cat;
		}
	}

	loadVersion(cmdList) {
		for (const cmd of cmdList) {
			if (!Array.isArray(cmd) || cmd[0] !== 'version') continue;
			this.version = [cmd[1], cmd[2]];
		}
	}

	loadAuthor(cmdList) {
		for (const cmd of cmdList) {
			if (!Array.isArray(cmd) || cmd[0] !== 'author') continue;
			this.author = stringArg(cmd[1]);
		}
	}

	loadDependencies(cmdList) {
		let deps = [];
		for (const cmd of cmdList) {
			if (!Array.isArray(cmd) || cmd[0] !== 'depends') continue;
			for (let i = 1; i < cmd.length; i++) {
				deps.push(String(stringArg(cmd[i])));
			}
		}
		this.dependencies = deps;
	}

	loadTags(cmdList) {
		let tags = [];
		for (const cmd of cmdList) {
			if (!Array.isArray(cmd) || cmd[0] !== 'tags') continue;
			for (let i = 1; i < cmd.length; i++) {
				tags.push(String(stringArg(cmd[i])).toLowerCase());
			}
		}
		this.tags = tags;
	}

	loadDescription(cmdList) {
		for (const cmd of cmdList) {
			if (!Array.isArray(cmd) || cmd[0] !== 'description') continue;
			this.description = String(stringArg(cmd[1]));
		}
	}

	loadChoices(cmdList) {
		this.choices = new Map();
		for (const cmd of cmdList) {
			if (!Array.isArray(cmd) || cmd[0] !== 'choices') continue;
			if (cmd.length < 3) continue;
			let args = cmd.slice(1);
			for (let i = 0; i < args.length; i++) {
				args[i] = String(stringArg(args[i]));
			}
			this.choices.set(args[0], args.slice(1));
		}
	}

	loadVariables(cmdList) {
		let varNames = [];
		for (const cmd of cmdList) {
			if (!Array.isArray(cmd)) continue;
			if (cmd[0] !== 'variables' && cmd[0] !== 'sharedVariables') continue;
			for (let i = 1; i < cmd.length; i++) {
				varNames.push(String(stringArg(cmd[i])));
			}
		}
		this.variableNames = varNames;
	}

	loadBlockList(cmdList) {
		this.blockList = [];
		for (const cmd of cmdList) {
			if (!Array.isArray(cmd)) continue;
			if (cmd[0] === 'space') {
				this.blockList.push('-');
			} else if (cmd[0] === 'advanced') {
				this.blockList.push('advanced');
			} else if (cmd[0] === 'spec') {
				this.blockList.push(stringArg(cmd[2]));
			}
		}
	}

	loadSpecs(cmdList, owningProject) {
		this.blockSpecs = parsedSpecs(cmdList);
		if (owningProject) {
			for (const [k, spec] of this.blockSpecs) {
				owningProject.blockSpecs.set(k, spec);
			}
		}
	}

	loadFunctions(cmdList) {
		for (const cmd of cmdList) {
			if (!Array.isArray(cmd) || cmd[0] !== 'to') continue;
			let funcName = stringArg(cmd[1]);
			// last arg is command list if it's an array of arrays (or empty array)
			let lastArg = cmd[cmd.length - 1];
			let hasCmdList = Array.isArray(lastArg) &&
				(lastArg.length === 0 || Array.isArray(lastArg[0]));
			let argEnd = hasCmdList ? cmd.length - 1 : cmd.length;
			let argNames = [];
			for (let i = 2; i < argEnd; i++) {
				argNames.push(String(stringArg(cmd[i])));
			}
			let cmdListMorph = null;
			if (hasCmdList && lastArg.length > 0) {
				cmdListMorph = MB_Parser.blockFor(lastArg);
			}
			let f = new MB_Function(funcName, argNames, cmdListMorph);
			this.functions = this.appendFunction(this.functions, f);
		}
	}

	loadScripts(cmdList) {
		this.scripts = [];
		for (const cmd of cmdList) {
			if (!Array.isArray(cmd) || cmd[0] !== 'script') continue;
			let x = cmd[1], y = cmd[2];
			let bodyArg = cmd[3];
			let block = null;
			if (Array.isArray(bodyArg) && bodyArg.length > 0) {
				// A single command here came from '( ... )', which is this file
				// format's way of saying the script is an expression.
				block = MB_Parser.blockFor(bodyArg, true);
			}
			this.scripts.push([x, y, block]);
		}
	}

	// Primitive updates

	updatePrimitives() {
		for (const f of this.functions) {
			if (!f.cmdList) continue;
			for (const b of allBlocksIn(f.cmdList)) {
				let newPrim = this.newPrimFor(b.selector);
				if (newPrim) b.selector = newPrim;
			}
		}
		for (const entry of this.scripts) {
			let block = entry[2];
			if (!block) continue;
			for (const b of allBlocksIn(block)) {
				let newPrim = this.newPrimFor(b.selector);
				if (newPrim) b.selector = newPrim;
			}
		}
	}

	newPrimFor(oldPrim) {
		const primMap = {
			'mbDisplay': '[display:mbDisplay]',
			'mbDisplayOff': '[display:mbDisplayOff]',
			'mbPlot': '[display:mbPlot]',
			'mbUnplot': '[display:mbUnplot]',
			'mbDrawShape': '[display:mbDrawShape]',
			'mbShapeForLetter': '[display:mbShapeForLetter]',
			'neoPixelSetPin': '[display:neoPixelSetPin]',
			'neoPixelSend': '[display:neoPixelSend]',
			'mbTiltX': '[sensors:tiltX]',
			'mbTiltY': '[sensors:tiltY]',
			'mbTiltZ': '[sensors:tiltZ]',
			'mbTemp': '[sensors:temperature]',
			'newArray': 'newList',
			'fillArray': 'fillList',
			'sendBroadcastSimple': 'sendBroadcast',
			'split': '[data:split]',
			'printIt': 'graphIt',
		};
		return primMap[oldPrim] || null;
	}

	updatingLibrary(newerModule, owningProject) {
		// Called when updating this module to a newer version.
		// Retain obsolete specs with 'obsolete' prepended to their labels.
		let newSpecs = newerModule.blockSpecs;
		let projectSpecs = owningProject ? owningProject.blockSpecs : new Map();
		for (const [op, oldSpec] of this.blockSpecs) {
			if (newSpecs.has(op)) {
				projectSpecs.set(op, newSpecs.get(op));
			} else {
				let obsoletedSpec = Object.assign({}, oldSpec, {
					specString: 'obsolete ' + oldSpec.specString,
				});
				projectSpecs.set(op, obsoletedSpec);
				newerModule.blockList.push(op);
			}
		}
	}

	// Equality

	equal(otherMod) {
		if (this.moduleName !== otherMod.moduleName) return false;
		if (this.variableNames.join(',') !== otherMod.variableNames.join(',')) return false;
		if (this.functions.length !== otherMod.functions.length) return false;
		if (this.scripts.length !== otherMod.scripts.length) return false;

		for (let i = 0; i < this.functions.length; i++) {
			if (!this.functionsEqual(this.functions[i], otherMod.functions[i])) {
				console.log('function mismatch:', this.functions[i].functionName);
				return false;
			}
		}

		let scriptSortFn = (e1, e2) =>
			e1[1] !== e2[1] ? e1[1] - e2[1] : e1[0] - e2[0];
		let s1 = this.scripts.slice().sort(scriptSortFn);
		let s2 = otherMod.scripts.slice().sort(scriptSortFn);
		for (let i = 0; i < s1.length; i++) {
			let e1 = s1[i], e2 = s2[i];
			let code1 = e1[2] ? e1[2].codeString(0) : '';
			let code2 = e2[2] ? e2[2].codeString(0) : '';
			if (e1[0] !== e2[0] || e1[1] !== e2[1] || code1 !== code2) {
				console.log('script mismatch', e1, e2);
				return false;
			}
		}
		return true;
	}

	functionsEqual(f1, f2) {
		if (f1.functionName !== f2.functionName) return false;
		if (f1.argNames.join(',') !== f2.argNames.join(',')) return false;
		let c1 = f1.cmdList ? f1.cmdList.codeString(1) : '';
		let c2 = f2.cmdList ? f2.cmdList.codeString(1) : '';
		return c1 === c2;
	}

	// Translation support (stubs)

	setTranslations(translationsDict) { this.translationSources = translationsDict; }
	getTranslationSources(langCode) { return this.translationSources.get(langCode); }
	hasTranslationFor(langCode) { return this.translationSources.has(langCode); }
}

// MB_ScriptExchange - export and import scripts between projects.
// Ported from MicroBlocksExchange.gp.
//
// *** NOTE: MB_ScriptExchange hoat not yet been cleaned up or tested! ***
// *** There are still some unresolved global references. ***

/* global blockScale, varMustBeQuoted, scriptForFunction, smallRuntime */

class MB_ScriptExchange {
	constructor(mbProject) {
		this.mbProject = mbProject;
		this.functionsUsed = []; // sorted array of function names; populated by analyzeCalls
		this.libsUsed = [];      // sorted array of library names; populated by analyzeCalls
	}

	// --- Export ---

	exportScripts(scripter, blockList) {
		// Return a string representation of the given scripts (a list of BlockMorphs).
		this.mbProject = scripter.project();
		const result = [];

		this.analyzeCalls(blockList);
		result.push(this.libraryDependencies());
		result.push('\n');
		result.push(...this.functionDefinitions());

		const scale = blockScale();
		for (const block of blockList) {
			if (!(block instanceof BlockMorph)) continue;
			let expr = block;
			if (expr.selector === 'to') {
				// Save a function-definition hat as a stub 'to' with nil body;
				// the full definition is saved separately by functionDefinitions().
				const callArgs = ['to', ...expr.argList()];
				callArgs[callArgs.length - 1] = null; // replace body with null
				expr = MB_Parser.commandFromArray(callArgs);
			}
			const x = Math.round(block.left() / scale);
			const y = Math.round(block.top() / scale);
			result.push(this.scriptText(expr, x, y));
		}
		return result.join('');
	}

	libraryDependencies() {
		// Return a 'depends' line listing library dependencies, or '' if none.
		if (this.libsUsed.length === 0) return '';
		return 'depends' + this.libsUsed.map(lib => " '" + lib + "'").join('') + '\n';
	}

	functionDefinitions() {
		// Return a list of strings containing the specs and definitions of all used functions.
		const result = [];
		for (const funcName of this.functionsUsed) {
			const spec = this.mbProject.blockSpecs.get(funcName);
			if (spec != null) result.push(spec.definitionString() + '\n');
			const func = this.mbProject.functionNamed(funcName);
			if (func != null) result.push(func.codeString() + '\n');
		}
		return result;
	}

	scriptText(cmdOrReporter, x, y, useSemicolons = false) {
		if (x == null) x = 10;
		if (y == null) y = 10;
		const nl = useSemicolons ? '' : '\n';
		const parts = ['script ' + x + ' ' + y + ' '];
		if (cmdOrReporter instanceof ReporterBlockMorph) {
			if (cmdOrReporter.selector === 'v') {
				let varName = cmdOrReporter.argList()[0];
				if (varMustBeQuoted(varName)) varName = JSON.stringify(varName);
				parts.push('(v ' + varName + ')');
			} else {
				parts.push('(' + cmdOrReporter.codeString() + ')');
			}
			parts.push(nl);
		} else {
			parts.push('{' + nl);
			parts.push(cmdOrReporter.codeString());
			parts.push('}' + nl);
		}
		parts.push(nl);
		return parts.join('');
	}

	// --- Call analysis ---

	analyzeCalls(blockList) {
		// Collect all user-defined functions and libraries used by the given blocks.
		const functionsUsedSet = new Set();
		const libsUsedSet = new Set();

		for (const block of blockList) {
			if (block instanceof BlockMorph) {
				this.analyzeCallsInScript(block, functionsUsedSet, libsUsedSet);
			}
		}

		this.functionsUsed = [...functionsUsedSet].sort();
		this.libsUsed = [...libsUsedSet].sort();
	}

	analyzeCallsInScript(cmdOrReporter, functionsUsedSet, libsUsedSet) {
		// Recursively collect all function calls and library references.
		const main = this.mbProject.main;
		const todo = [cmdOrReporter];
		while (todo.length > 0) {
			for (const b of todo.shift().allBlocks()) {
				const op = b.selector;
				if (this.isFunctionCall(op)) {
					if (this.libraryDefines(main, op)) {
						if (!functionsUsedSet.has(op)) {
							functionsUsedSet.add(op);
							const func = main.functionNamed(op);
							if (func != null && func.cmdList() != null) {
								todo.push(func.cmdList());
							}
						}
					} else {
						for (const lib of this.mbProject.libraries) {
							if (this.libraryDefines(lib, op)) {
								libsUsedSet.add(lib.moduleName);
							}
						}
					}
				} else if (op === 'to') {
					functionsUsedSet.add(b.argList()[0]);
				}
			}
		}
	}

	isFunctionCall(funcName) {
		return (
			this.mbProject.functionNamed(funcName) != null ||
			(funcName.startsWith('[') && funcName.endsWith(']'))
		);
	}

	libraryDefines(lib, funcName) {
		if (lib.functionNamed(funcName) != null) return true;
		if (lib.blockSpecs && lib.blockSpecs.has(funcName)) return true;
		return false;
	}

	// --- Import ---

	importScripts(scripter, scriptString, dstX, dstY) {
		this.mbProject = scripter.project();
		const scriptCmds = MB_Parser.parse(scriptString);
		if (scriptCmds == null) return;

		// Add block specs
		this.mbProject.loadSpecs(scriptCmds);

		// Add libraries and function definitions
		for (const entry of scriptCmds) {
			const op = entry.selector;
			const args = entry.argList();
			if (op === 'depends') {
				for (const libName of args) {
					scripter.installLibraryNamed(libName);
				}
			} else if (op === 'to') {
				const funcName = args[0];
				const parameterNames = args.slice(1, args.length - 1);
				const body = args[args.length - 1];
				this.addGlobalsFor(body, parameterNames);
				this.mbProject.main.defineFunction(funcName, parameterNames, body);
			}
		}

		// Find the origin of scripts to be pasted (top-left corner of the script group)
		let scriptsX = 10000;
		let scriptsY = 10000;
		for (const entry of scriptCmds) {
			const args = entry.argList();
			if (entry.selector === 'script' && args.length === 3) {
				scriptsX = Math.min(scriptsX, args[0]);
				scriptsY = Math.min(scriptsY, args[1]);
			}
		}

		// Add scripts to the scripts pane
		const scriptsPane = scripter.scriptEditor();
		for (const entry of scriptCmds) {
			let args = entry.argList();
			if (args.length === 4 && args[0] == null) {
				// Fix old Wiki scripts saved as "script nil x y { ...code... }"
				args = args.slice(1);
				args[0] = scriptsX;
				args[1] = scriptsY;
				console.log('fixed args:', args);
			}
			if (entry.selector === 'script' && args.length === 3 && args[2] != null) {
				const script = args[2];
				this.addGlobalsFor(script);
				let block;
				if (script.selector === 'to') {
					const func = this.mbProject.functionNamed(script.argList()[0]);
					block = scriptForFunction(func);
				} else {
					block = MB_Parser.blockFor(script);
				}
				block.fixBlockColor();
				const scale = blockScale();
				const blockX = Math.round(dstX + scale * (args[0] - scriptsX));
				const blockY = Math.round(dstY + scale * (args[1] - scriptsY));
				block.setPosition(blockX, blockY);
				scriptsPane.add(block);
			}
		}
		smallRuntime().saveAllChunksAfterLoad();
	}

	addGlobalsFor(script, parameterNames) {
		// Add any new global variables referenced in script that aren't already declared.
		if (script == null) return;
		const globalVars = this.mbProject.allVariableNames();
		const varRefs = [];
		const localVars = parameterNames ? [...parameterNames] : [];
		for (const b of script.allBlocks()) {
			const args = b.argList();
			if (args.length > 0) {
				const varName = args[0];
				const op = b.selector;
				if (['v', '=', '+='].includes(op)) varRefs.push(varName);
				if (['local', 'for'].includes(op)) localVars.push(varName);
			}
		}
		for (const v of varRefs) {
			if (!globalVars.includes(v) && !localVars.includes(v)) {
				this.mbProject.main.addVariable(v);
			}
		}
	}
}

// Testing...

function testLoad() {
	function loadFile(fileName, contents) {
		let project = new MB_Project();
		let startT = Date.now();
		project.loadFromString(contents);
		let msecs = Date.now() - startT;
		console.log(fileName, project.stats(), msecs, 'msecs');
		MB_editor.removeAllScripts();
		project.main.scripts.forEach( (entry) => {
			let x = entry[0], y = entry[1], script = entry[2];
			MB_editor.addBlockToScriptsAt(script, x, y);
		});
	}
	MB_editor.importLocalFile(loadFile);
}

function testShow() {
	let codeString =
		"whenButtonPressed 'A'\n" +
		"[display:mbDisplay] 15237450\n" +
		"waitMillis 1000\n" +
		"[display:mbDisplayOff]\n";
	let parseTree = MB_Parser.parse(codeString);
	let b = MB_Parser.blockFor(parseTree);
	MB_editor.addBlockToScripts(b);
}

function testLoad2() {
	function loadFile(fileName, contents) {
		let project = new MB_Project();
		project.loadFromString(contents);
		let s1 = project.codeString();
		let p2 = new MB_Project().loadFromString(s1, false);
		let s2 = p2.codeString();
		console.log(s1);
		console.log(s2);
console.log("Lengths:", s1.length, s2.length, s1 == s2);
	}
	MB_editor.importLocalFile(loadFile);
}

async function testLoadExamples() {
	for (const fileName of MB_Files.allFilesIn('Examples')) {
		let data = await MB_Files.readFile(fileName);

		let startT = Date.now();
		let project = new MB_Project();
		project.loadFromString(data);
		let msecs = Date.now() - startT;
//		console.log(fileName, project.stats(), msecs, 'msecs');
		project.saveLoadTest(fileName);
	}
}

async function testCompileExamples() {
	for (const fileName of MB_Files.allFilesIn('Examples')) {
		let startT = Date.now();
		let data = await MB_Files.readFile(fileName);
		let project = new MB_Project().loadFromString(data);
		let mainModule = project.main;
		let compiler = new MB_Compiler(project);
		let scriptBytes = 0, functionBytes = 0;
		for (const scriptRec of mainModule.scripts) {
			scriptBytes += compiler.compiledBytesFor(scriptRec[2]).length;
		}
		for (const f of project.allFunctions()) {
			functionBytes += compiler.compiledBytesFor(f.functionName).length;
		}
		console.log(fileName + ': ' + scriptBytes + ', ' + functionBytes + '; total: ' + (scriptBytes + functionBytes));
	}
}
