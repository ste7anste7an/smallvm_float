// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-support.js - helper functions used across the MicroBlocks editor.

/* global BlockDefinitionMorph, CommandBlockMorph, GetText, GP, HatBlockMorph, MB_editor, MB_Parser, MB_Specs, Menus, nextCallId, Point, ReporterBlockMorph, SyntaxElementMorph, newCanvas, ZOOM */

function isReportableError(error, sourceURL) {
	// False for what is not a fault in the IDE: no error object (a ResizeObserver loop notice or
	// a cross-origin "Script error."), a browser extension's script, a cancelled request, a board
	// that went away, or a server that could not be reached.
	if (error == null) return false;
	const extension = /(chrome|moz|safari(-web)?)-extension:/;
	if (extension.test(sourceURL || '') || extension.test(String(error.stack || ''))) return false;
	if (('AbortError' === error.name) || ('NetworkError' === error.name)) return false;
	return !(('TypeError' === error.name) && /fetch|Load failed/.test(String(error.message)));
}

function errorFrame(error) {
	// The line that threw, from the error's stack, or '' if it has none.
	const lines = String((error && error.stack) || '').split('\n');
	const frame = lines.find((line) => /^\s+at |^\S*@\S+:\d+:\d+$/.test(line));
	return frame ? frame.trim() : '';
}

function errorSite(error) {
	// The kind of error and where it was thrown, or its text when it has no stack.
	const frame = errorFrame(error);
	return frame ? (error.name + ' ' + frame) : String(error);
}

function htmlText(s) {
	// s shown as text in a dialog body, which the chrome sets as HTML and then localizes.
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/%/g, '&#37;');
}

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

let waitWorker = null; // times waitMSecs while the tab is hidden; false if none can be made

async function waitMSecs(msecs) {
	// A hidden tab runs timers at most once a second, which stretches every short
	// wait while talking to the board, such as the 3 msec pause between serial
	// writes, to a second. Timers in a worker are slowed far less, so time it there.
	if (document.hidden && (waitWorker === null)) {
		try {
			const src = 'onmessage = (e) => setTimeout(() => e.ports[0].postMessage(0), e.data);';
			waitWorker = new Worker(URL.createObjectURL(new Blob([src])));
		} catch (e) {
			waitWorker = false; // no worker in this browser; use setTimeout below
		}
	}
	if (document.hidden && waitWorker) {
		// Race the worker against a plain setTimeout. A worker refused by the page's
		// CSP, or whose script fails, is made without an error and never answers.
		const channel = new MessageChannel();
		let timer;
		await new Promise(resolve => {
			channel.port1.onmessage = resolve;
			timer = setTimeout(resolve, msecs);
			waitWorker.postMessage(msecs, [channel.port2]);
		});
		clearTimeout(timer);
		channel.port1.close();
		return;
	}
	const sleep = function (msecs) {
		return (new Promise( resolve => setTimeout(resolve, msecs) ));
	}
	await sleep(msecs);
}

function localized(s) {
	return GetText.localize(s);
}

function isMobile() {
	return false;
}

function cropTransparent(canvas) {
	// The smallest part of a non-retina canvas that holds all of its non-transparent pixels.
	const w = canvas.width, h = canvas.height;
	const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
	let left = w, top = h, right = -1, bottom = -1;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (data[(((y * w) + x) * 4) + 3] === 0) continue;
			left = Math.min(left, x); right = Math.max(right, x);
			top = Math.min(top, y); bottom = Math.max(bottom, y);
		}
	}
	if (right < 0) return canvas; // nothing drawn
	const result = newCanvas(new Point((right - left) + 1, (bottom - top) + 1), true);
	result.getContext('2d').drawImage(canvas, -left, -top);
	return result;
}

function blockScale() {
	// The pixels-per-unit that block morphs lay themselves out with. GP's
	// blockScale is (global 'blockScale') * (global 'scale') and serves the
	// same purpose: it converts between pane pixels and script-file units.
	return SyntaxElementMorph.prototype.scale;
}

function uniqueNameNotIn(names, baseName) {
	// baseName, or baseName followed by the first of 2, 3, 4... not in names.
	let result = baseName;
	for (let i = 2; names.includes(result); i++) result = baseName + i;
	return result;
}

function forEachExpression(node, fn) {
	// Call fn on every block node in a model node tree: arguments, bodies and
	// the blocks that follow.
	for (let n = node; (n != null) && (typeof n.selector === 'string'); n = n.next) {
		fn(n);
		for (const arg of n.args || []) {
			if ((arg != null) && (typeof arg === 'object')) forEachExpression(arg, fn);
		}
	}
}

function fixedCallArgs(call, rule) {
	// Fix one call node's arguments in place by rule; answer whether any changed.
	// The call's shape, command or reporter, is left as it is.
	const before = JSON.stringify(call.args);
	const args = call.args;
	while (args.length < rule.minArgs) args.push(rule.slots[args.length][1]);
	if (!rule.isVariadic) args.length = rule.minArgs;
	const checked = Math.min(rule.minArgs, args.length, rule.slots.length);
	for (let i = 0; i < checked; i++) {
		const arg = args[i];
		if ((arg != null) && arg.isReporter && !arg.isDefaultColour) continue;
		const [type, value] = rule.slots[i];
		// A colour slot can hold its colour as a packed number, as the bytes
		// carry it, and a number from any other slot is not a colour.
		const isColour = (('number' === typeof arg) && rule.colourSlots[i]) ||
			((arg != null) && ((true === arg.isColor) || (true === arg.isDefaultColour)));
		// Only the green a colour input filled in is retyped; any other colour
		// stays, as a swatch once its slot no longer takes a colour.
		if (isColour && !arg.isDefaultColour) {
			if ('color' !== type) args[i] = colourSwatchNode(arg);
			continue;
		}
		const fits = ('auto' === type) ? ['number', 'string'].includes(typeof arg)
			: ('bool' === type) ? ('boolean' === typeof arg)
			: ('color' === type) ? isColour
			: true;
		if (!fits) args[i] = value;
	}
	return JSON.stringify(args) !== before;
}

function colourSwatchNode(colour) {
	// A colorSwatch reporter node for a packed or spelled colour. Only a spelled
	// one can carry an alpha.
	const c = ('number' === typeof colour) ?
		{ r: (colour >> 16) & 255, g: (colour >> 8) & 255, b: colour & 255 } : colour;
	return { selector: 'colorSwatch', args: [c.r, c.g, c.b, c.alpha ?? 255], isReporter: true, next: null };
}

function varMustBeQuoted(varName) {
	// Return true if varName must be enclosed in quotes when serialized.
	// A name must be quoted if it is empty, contains a space, or starts with a digit or '-'.
	if (varName === '') return true;
	if (varName.includes(' ')) return true;
	const ch = varName[0];
	return /\d/.test(ch) || ch === '-';
}

// n screen pixels in world units. Morphic draws the world ZOOM times its size, so a
// dialog sized with this keeps one size on screen at every block size, as GP's do.
function screenPixels(n) {
	return n / ZOOM;
}

function zoomedImage(aMorph) {
	// A morph's full image drawn at the world's zoom. The world draws a cached image
	// under its zoom, so a picture at world units would be scaled up and blurred at
	// any block size above 100%; this one is drawn back at 1 / ZOOM of its size.

	const bounds = aMorph.fullBounds();
	const image = newCanvas(bounds.extent().multiplyBy(ZOOM));
	const ctx = image.getContext('2d');
	ctx.scale(ZOOM, ZOOM);
	ctx.translate(-bounds.origin.x, -bounds.origin.y);
	aMorph.drawnAtZoom = true;
	aMorph.fullDrawOn(ctx, bounds);
	delete aMorph.drawnAtZoom;
	return image;
}

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

function specSections(spec) {
	// The spec string split at ':' into sections, less a final '...', which
	// says the last section repeats.
	const sections = String(spec.specString || spec.opName || '').split(':').map((s) => s.trim());
	const repeatLast = (sections.length > 0) && ('...' === sections[sections.length - 1]);
	if (repeatLast) sections.pop();
	return { sections, repeatLast };
}

function specDefinitionString(spec) {
	// Serialize a spec object to a 'spec' declaration line (without newline).
	// Format: spec 'blockType' 'opName' 'specString' 'slotTypes' default1 default2...
	let parts = ['spec'];
	parts.push(printString(spec.blockType || ' '));
	parts.push(printString(spec.opName));
	parts.push(printString(spec.specString || spec.opName));
	let slotInfo = specSlotInfo(spec);
	if (slotInfo.length > 0) {
		parts.push(printString(slotInfo.map((slot) => slot[0]).join(' ')));
		let defaults = slotInfo.map((slot) => specDefaultString(slot[0], slot[1]));
		while (defaults.length > 0 && defaults[defaults.length - 1] === 'nil') {
			defaults.pop(); // GP trims trailing nils, as they add nothing
		}
		parts.push(...defaults);
	}
	return parts.join(' ');
}

function scriptForFunction(func, body = null, project = MB_editor.project) {
	// The block that shows a function definition in the scripting pane: a hat
	// that holds the function and shows its block's prototype.
	if (func == null) return null;
	let hat = new HatBlockMorph();
	hat.selector = 'to';
	hat.functionDefinition = func;
	hat.setSpec('define');
	hat.setCategory('Definition');
	hat.isDraggable = true;
	hat.add(blockPrototypeForFunction(func, project));
	hat.fixLayout();
	let cmdList = body || func.cmdList;
	if (cmdList) hat.nextBlock(cmdList);
	return hat;
}

function blockPrototypeForFunction(func, project) {
	// A block of the function's shape and colour holding its editable
	// prototype. A drag takes a copy of it, as from the palette.
	const op = func.functionName;
	const args = func.argNames || [];
	MB_Specs.initialize();
	const builtIn = MB_Specs.selectorToSpec.get(op);
	const spec = project.blockSpecs.get(op)
		|| (builtIn && { blockType: builtIn[0], opName: op, specString: builtIn[2],
			slotTypes: builtIn[3] || '', defaults: builtIn.slice(4) })
		|| { blockType: ' ', opName: op, specString: [op, ...args.map(() => '_')].join(' '),
			slotTypes: args.map(() => 'auto').join(' ') };
	const proto = ('r' === spec.blockType) ? new ReporterBlockMorph() : new CommandBlockMorph();
	proto.isPrototype = true;
	proto.isDraggable = false;
	proto.isTemplate = true;
	const lib = [...project.libraries.values()].find((m) => m.functions.includes(func));
	// A library's function takes its category colour. A function of the project
	// has no category, which colours its prototype with the default block
	// colour, not My Blocks blue (the palette's calls keep that).
	proto.setCategory(lib ? lib.moduleCategory : null);
	const def = new BlockDefinitionMorph(op, spec, args, proto);
	if (builtIn) def.isBuiltIn = true; // its spec is not the user's to change
	proto.add(def);
	if (builtIn) def.hideDetails();
	proto.fixLayout();
	return proto;
}

function blockForBody(bodyArg, singleIsReporter = false) {
	// Build the block for a script or function body as the parser left it: an
	// array of commands, a single command or reporter, or empty. Null when there
	// is nothing to build, which is what loadFunctions() and loadScripts() check.
	if (!Array.isArray(bodyArg) || bodyArg.length === 0) return null;
	return MB_Parser.blockFor(bodyArg, singleIsReporter);
}

function recompileNeeded() {
	// Called when compiled code can change without its source changing: a call
	// compiles to its function's chunk id, and a variable to its global index.
	if (typeof MB_editor !== 'undefined' && MB_editor.codeManager) MB_editor.codeManager.recompileNeeded();
}

// Announce something to whatever chrome is listening. Sent on the document
// rather than through IDE.fireEvent, which is the same dispatch, so that the
// port does not require the chrome to be loaded.
function fireIDEEvent(name, value) {
	// The spinner is the chrome's, and no morph here stands for it, so what the
	// port last said about it is the only record that one is up.
	if ('spinner.show' === name) MB_editor.spinnerShowing = true;
	if ('spinner.hide' === name) MB_editor.spinnerShowing = false;
	// Both guards: the port is also loaded with no DOM, and into contexts that
	// supply a partial one where document exists and CustomEvent does not.
	if (typeof document === 'undefined' || typeof CustomEvent === 'undefined') { return; }
	document.dispatchEvent(new CustomEvent(name, { detail: { value: value } }));
}

// The hand's position as the chrome expects GP's: menus.js adds where #canvas
// is on the page, while the hand is in world units on the world's own canvas,
// which morphic draws ZOOM times larger.
function chromePoint(aWorld) {
	const page = aWorld.worldCanvas.getBoundingClientRect();
	const canvas = document.querySelector('#canvas').getBoundingClientRect();
	const hand = aWorld.hand.position();
	return {
		x: (hand.x * ZOOM) + page.left - canvas.left,
		y: (hand.y * ZOOM) + page.top - canvas.top
	};
}

// What contextMenu answers when the chrome draws the menu, so the hand opens no Morphic one.
const chromeDrawnMenu = { popUpAtHand() {} };

// Questions put to the chrome and not yet answered, by id. Its menus and dialogs answer
// by writing JSON into GP.apiResponses[id], which GP polls for in its UI loop.
const chromeQuestions = new Map();
let chromeQuestionsPolled = false;

function askChrome(eventName, options, callback, closed = null) {
	// Fire a menu or dialog event and call back with the chrome's answer, or call
	// closed if the menu or window goes away without one.
	const id = nextCallId();
	fireIDEEvent(eventName, Object.assign({ id: id }, options));
	const shown = ('menu' === eventName) ? Menus.current() : [...document.querySelectorAll('win-')].pop();
	chromeQuestions.set(id, { shown: shown, callback: callback, closed: closed });
	if (!chromeQuestionsPolled) {
		chromeQuestionsPolled = true;
		requestAnimationFrame(checkChromeAnswers);
	}
}

function checkChromeAnswers() {
	// A menu or window closed without an answer never gets one, so it is forgotten.
	try {
		for (const [id, question] of chromeQuestions) {
			const json = GP.apiResponses[id];
			if (json !== undefined) {
				delete GP.apiResponses[id];
				chromeQuestions.delete(id);
				question.callback(JSON.parse(json));
			} else if (!(question.shown && question.shown.isConnected)) {
				chromeQuestions.delete(id);
				if (question.closed) question.closed();
			}
		}
	} finally { // an answer whose action throws must not stop the answers after it
		chromeQuestionsPolled = (chromeQuestions.size > 0);
		if (chromeQuestionsPolled) requestAnimationFrame(checkChromeAnswers);
	}
}

function chromeMenuFor(aWorld, items, menuClass = null) {
	// Show items, each '-' or [label, action, tip, image, class, checked], in the chrome's menu.
	// An item with an image, a PNG data URL, shows the picture in place of its label.
	const p = chromePoint(aWorld);
	const descriptors = items.map((item) => {
		if ('-' === item) return { label: '-' };
		const d = { label: item[0], tip: item[2] };
		if (item[3]) Object.assign(d, { image: item[3], class: item[4] });
		if (item.length > 5) d.checked = !!item[5];
		return d;
	});
	askChrome('menu', { x: p.x, y: p.y, class: menuClass, items: descriptors }, (label) => {
		const chosen = items.find((item) => item[0] === label);
		if (chosen) chosen[1]();
	});
	return chromeDrawnMenu;
}

// Clipboard support (XXX TODO maybe move to own file?)

var MB = {};
MB.clipboard = document.createElement('textarea');
MB.clipboard.style.position = 'fixed';
MB.clipboard.style.left = '0px';
MB.clipboard.style.top = '0px';
MB.clipboard.style.width = '1px';
MB.clipboard.style.height = '1em';
MB.clipboard.style.border = '0';
MB.clipboard.style.padding = '0';
MB.clipboard.style.margin = '0';
MB.clipboard.style.outline = 'none';
MB.clipboard.style.opacity = '0';
document.body.appendChild(MB.clipboard);

function setGPClipboard(s) {
	// Called by GP's setClipboard primitive

	setClipboardBuffer(s);

	if ((typeof navigator.clipboard !== 'undefined') && (navigator.clipboard.writeText)) {
		navigator.clipboard.writeText(s).catch(() => {});
	} else {
		MB.clipboard.focus();
		MB.clipboard.select();
		try {
			document.execCommand('copy');
		} catch (err) {
			console.error('setGPClipboard failed', err);
		}
	}
}

function setClipboardBuffer(s) {
	// The IDE's own copy of the clipboard text, which clipboardText() reads.
	GP.clipboardBytes = toUTF8Array(s);
	MB.clipboard.value = s;
}

async function readGPClipboard(s) {
	if ((typeof navigator.clipboard !== 'undefined') && (navigator.clipboard.readText)) {
		var s = await navigator.clipboard.readText().catch(() => {});
		if (s) MB.clipboard.value = s;
	} else {
		MB.clipboard.focus();
		MB.clipboard.select();
		try {
			document.execCommand('paste');
		} catch (err) {
			console.error('readGPClipboard failed', err);
		}
	}
	GP.clipboardBytes = toUTF8Array(MB.clipboard.value);
	return GP.clipboardBytes.length;
}

function toUTF8Array(str) {
	// Convert a Javascript string into an array of UTF8 bytes.
	var utf8 = [];
	for (var i = 0; i < str.length; i++) {
		var charcode = str.charCodeAt(i);
		if (charcode < 0x80) utf8.push(charcode);
		else if (charcode < 0x800) {
			utf8.push(
				0xc0 | (charcode >> 6),
				0x80 | (charcode & 0x3f));
		}
		else if (charcode < 0x10000) {
			utf8.push(
				0xe0 | (charcode >> 12),
				0x80 | ((charcode >> 6) & 0x3f),
				0x80 | (charcode & 0x3f));
		} else if (charcode <= 0x10FFFF) {
			utf8.push(
				0xf0 | (charcode >> 18),
				0x80 | ((charcode >> 12) & 0x3f),
				0x80 | ((charcode >> 6) & 0x3f),
				0x80 | (charcode & 0x3f));
		}
	}
	return utf8;
}

function clipboardText() {
	return new TextDecoder().decode(new Uint8Array(GP.clipboardBytes).buffer);
}
