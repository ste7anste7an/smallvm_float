/*
	mb-slots.js

	a programming construction kit
	based on morphic.js
	inspired by Scratch

	derived from blocks.js written by Jens Mönig for Snap!
	modified by John Maloney and Bernat Romagosa
	jens@moenig.org

	Copyright (C) 2025 by Jens Mönig

    This file is a modified version of a file from Snap! (https://snap.berkeley.edu).
    This specific file was licensed by Jens Mönig for use in MicroBlocks
    under the MIT license on August 26, 2026.

	Permission is hereby granted, free of charge, to any person obtaining a copy of this
	software and associated documentation files (the “Software”), to deal in the Software
	without restriction, including without limitation the rights to use, copy, modify, merge,
	publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
	to whom the Software is furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all copies or
	substantial portions of the Software.

	THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
	INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
	PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
	FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
	DEALINGS IN THE SOFTWARE.
*/

/*global Array, BoxMorph,
Color, FrameMorph, Function, HandleMorph, Math, MenuMorph,
Morph, MorphicPreferences, Object, ScrollFrameMorph, ShadowMorph, ZERO, Sound,
String, StringMorph, TextMorph, contains, detect, PianoMenuMorph, nop,
document, getDocumentPositionOf, isNaN, isString, newCanvas, parseFloat, isNil,
radians, useBlurredShadows, SpeechBubbleMorph, modules, StageMorph,
fontHeight, TableFrameMorph, SpriteMorph, Context, ListWatcherMorph, Rectangle,
DialogBoxMorph, BlockInputFragmentMorph, PrototypeHatBlockMorph, WHITE, display,
Costume, IDE_Morph, BlockDialogMorph, BlockEditorMorph, localized, CLEAR, Point,
isSnapObject, PushButtonMorph, SpriteIconMorph, Process, AlignmentMorph, List,
ToggleButtonMorph, DialMorph, SnapExtensions, CostumeIconMorph, SoundIconMorph,
SVG_Costume, embedMetadataPNG, ThreadManager, snapEquals, InputList, BLACK,
CustomHatBlockMorph, MB_Compiler, MB_editor, MB_Function, MB_Specs, world, Path2D, ZOOM */
/*global SyntaxElementMorph, BlockMorph, ReporterBlockMorph, ArgMorph, HatBlockMorph, blockTextHeight, blockTextBaseline, blockTextWidth, blockTextFont, renderBlockString, blockHalf */

// InputSlotMorph //////////////////////////////////////////////////////

/*
	I am an editable text input slot. I can be either rectangular or
	rounded, and can have an optional drop-down menu. If I'm set to
	read-only I must have a drop-down menu and will assume a light
	tint of my block's color.

	my most important public attributes and accessors are:

	setContents(str/float)	- display the argument (string or float)
	contents().text			- get the displayed string
	choices					- a key/value list for my optional drop-down
	isReadOnly				- governs whether I am editable or not
	isNumeric				- governs my shape (round or rect)

	my block specs are:

	%str	- string input, rectangular
	%num	- numerical input, semi-circular
	%auto	- string or number input, changes shape depending on value

	evaluate() returns my displayed string, cast to float if I'm numerical

	there are also a number of specialized drop-down menu presets, refer
	to BlockMorph for details.
*/

// InputSlotMorph inherits from ArgMorph:

InputSlotMorph.prototype = new ArgMorph();
InputSlotMorph.prototype.constructor = InputSlotMorph;
InputSlotMorph.uber = ArgMorph.prototype;

// InputSlotMorph instance creation:

function InputSlotMorph(text, isNumeric, choiceDict, isReadOnly) {
	this.init(text, isNumeric, choiceDict, isReadOnly);
}

InputSlotMorph.prototype.init = function (
	text,
	isNumeric,
	choiceDict,
	isReadOnly
) {
	var contents = new InputSlotStringMorph(''),
		arrow = new SlotArrowMorph();

	contents.fontSize = 13 * this.scale;
	contents.fontName = 'Arial';

	this.selectedBlock = null;
	this.symbol = null;

	this.choices = choiceDict || null; // object, function or selector
	this.oldContentsExtent = contents.extent();
	this.isNumeric = isNumeric || false;
	this.isAlphanumeric = false; // temporary override for allowing text
	this.isReadOnly = isReadOnly || false;

	InputSlotMorph.uber.init.call(this, null, true);
	this.color = WHITE;
	this.add(contents);
	this.add(arrow);
	contents.isEditable = true;
	contents.isDraggable = false;
	contents.enableSelecting();
	this.setContents(text);
};

// InputSlotMorph accessing:

InputSlotMorph.prototype.getSpec = function () {
	return (this.isNumeric) ? '%num' : '%auto'; // default
};

InputSlotMorph.prototype.contents = function () {
	return detect(
		this.children,
		child => child instanceof StringMorph
	);
};

InputSlotMorph.prototype.arrow = function () {
	return detect(
		this.children,
		child => child instanceof ArrowMorph
	);
};

InputSlotMorph.prototype.setContents = function (data) {
	// data can be a String, Float, or "wish" Block
	var cnts = this.contents(),
		dta = data,
		block;

	if (this.selectedBlock) {
		this.selectedBlock = null;
	}
	if (this.symbol) {
		this.symbol.destroy();
		this.symbol = null;
	}

	if (dta instanceof BlockMorph) {
		this.selectedBlock = dta;
		dta = ''; // make sure the contents text emptied
	} else {
		cnts.isItalic = false;
		/*
		// assume dta is a localizable choice if it's a key in my choices
		if (!isNil(this.choices) && this.choices[dta] instanceof Array) {
			return this.setContents(this.choices[dta]);
		}
		*/
	}
	cnts.text = dta;
	if (isNil(dta)) {
		cnts.text = '';
	} else if (dta.toString) {
		cnts.text = dta.toString();
	}
	// A menu choice such as 'nt;c' is shown translated; the slot's value stays the choice.
	if (this.choices && ((typeof dta) == 'string') && !this.isVarOrBroadcastSlot()) {
		cnts.text = localized(dta);
	}

	// Keep the value, not only its text. GP's InputSlot.gp setContents does the
	// same (contents = data); keeping only the text is what turned the literal
	// '0x06' into 0 and false into "false" at compile time. mbValueText records
	// the text this value was shown as, so evaluate() can tell a value the slot
	// was given from one the user has since typed over.
	this.mbValue = dta;
	this.mbValueText = cnts.text;
	this.mbUnsupplied = false;

	cnts.fixLayout();

	// adjust to zebra coloring:
	if (this.isReadOnly) {
		block = this.parentThatIsA(BlockMorph); // could be inside a multi-arg
		if (block) {
			block.fixLabelColor();
		}
	}
};

// InputSlotMorph drop-down menu:

InputSlotMorph.prototype.dropDownMenu = function () {
	// Answer false when mbMenu knows no menu for my choices. The chrome draws
	// the menu. Each item does what choosing it in the Morphic menu would do.
	const menu = this.mbMenu(this.choices), world = this.world();
	if (!menu) return false;
	if (menu.items.length === 0) return true; // a known menu that is empty opens nothing
	const items = menu.items.map((item) => {
		if (item[0] === 0) return '-'; // a line
		const [label, choice] = item;
		return [label, () => menu.target(('function' === typeof choice) ? choice() : choice)];
	});
	// After the click that asked for it, which would otherwise close it.
	setTimeout(() => chromeMenuFor(world, items));
	return true;
};

InputSlotMorph.prototype.mbMenu = function (slotMenuName) {
	let menu = new MenuMorph((choice) => {
		// an item whose action answers nothing has done its own work
		if (undefined === choice) return;
		this.setContents(choice);
		this.scriptChanged();
	});
	menu.fontSize = this.fontSize;

	// an integer range such as 'range:1-8'; a block spec carries it as 'range1-8'
	const range = /^range:?(\d+)-(\d+)$/.exec(slotMenuName || '');
	if (range) {
		for (let i = Number(range[1]); i <= Number(range[2]); i++) {
			menu.addItem('' + i, i);
		}
		return menu;
	}

	if ('buttonMenu' == slotMenuName) {
		menu.addItem('A', 'A');
		menu.addItem('B', 'B');
		menu.addItem('A+B', 'A+B');
		return menu;
	}
	if ('pullMenu' == slotMenuName) {
		menu.addItem('none', 'none');
		menu.addItem('up', 'up');
		menu.addItem('down', 'down');
		return menu;
	}
	if ('typesMenu' == slotMenuName) {
		menu.addItem('boolean', 'boolean');
		menu.addItem('number', 'number');
		menu.addItem('string', 'string');
		menu.addItem('list', 'list');
		menu.addItem('byte array', 'byte array');
		return menu;
	}

	if ('itemOfMenu' == slotMenuName) {
		menu.addItem('1', 1);
		menu.addItem('last', 'last');
		menu.addItem('random', 'random');
		return menu;
	}
	if ('replaceItemMenu' == slotMenuName) {
		menu.addItem('1', 1);
		menu.addItem('last', 'last');
		menu.addItem('all', 'all');
		return menu;
	}
	// A library declares its own menus with a `choices` line and the project
	// has already parsed them.
	if (typeof MB_editor !== 'undefined') {
		const choices = MB_editor.project.choicesFor(slotMenuName);
		if (choices) {
			choices.forEach((each) => { menu.addItem(each, each); });
			return menu;
		}
	}

	if (typeof MB_editor !== 'undefined') {
		if ('allVarsMenu' == slotMenuName) return this.varsMenu(menu);
		if ('broadcastMenu' == slotMenuName) return this.broadcastMenu(menu);
		if ('functionNameMenu' == slotMenuName) {
			MB_editor.project.main.functions.forEach((f) => { menu.addItem(f.functionName, f.functionName, null, null, false, false, null, null, true); });
			return menu;
		}
	}

	return null;
}

BlockMorph.prototype.localVariableNames = function () {
	// The sorted names, other than globals, that my script uses, with the arguments of
	// the function it defines.
	const project = MB_editor.project;
	const locals = new Set();
	const top = this.topBlock();
	top.forAllBlocks((b) => {
		if (!['v', '=', '+=', 'local', 'for'].includes(b.selector)) return;
		let name = b.blockSpec;
		if ('v' != b.selector) {
			const slot = b.inputs()[0];
			name = (slot && !(slot instanceof BlockMorph)) ? slot.evaluate() : null;
		}
		if ((typeof name === 'string') && (name != 'this')) locals.add(name);
	});
	const func = top.isFunctionDefinition() ? project.functionNamed(top.definedFunctionName()) : null;
	if (func) func.argNames.forEach((arg) => locals.add(arg));
	locals.delete('');
	project.allVariableNames().forEach((name) => locals.delete(name));
	return Array.from(locals).sort();
};

InputSlotMorph.prototype.varsMenu = function (menu) {
	// The globals, then the other names my script uses with the arguments of the
	// function it defines, then an item that adds a global and puts it in me.
	const visible = MB_editor.visibleVars();
	for (const name of visible) menu.addItem(name, name, null, null, false, false, null, null, true);
	if (visible.length > 0) menu.addLine();

	const block = this.parentThatIsA(BlockMorph);
	const locals = block ? block.localVariableNames() : [];
	if (locals.length > 0) {
		for (const name of locals) {
			menu.addItem(name, name, null, null, false, false, null, null, true);
		}
		menu.addLine();
	}

	menu.addItem('Add a variable', () => {
		MB_editor.promptForVariable().then((name) => {
			if (name) { this.setContents(name); this.scriptChanged(); }
		});
	});
	return menu;
};

InputSlotMorph.prototype.broadcastMenu = function (menu) {
	// go!, then the project's other messages; in a receiving hat, also the empty
	// message, which every broadcast matches.
	const go = localized('go!');

	MB_editor.updateProject();
	const messages = MB_editor.project.allBroadcasts().filter((s) => (s != go) && (s != ''));
	menu.addItem(go, go, null, null, false, false, null, null, true);
	if (messages.length > 0) menu.addLine();
	for (const s of messages) {
		menu.addItem(s, s, null, null, false, false, null, null, true);
	}
	const block = this.parentThatIsA(BlockMorph);
	if (block && ('whenBroadcastReceived' == block.selector)) {
		menu.addLine();
		menu.addItem('all', () => '');
	}
	return menu;
};

// InputSlotMorph layout:

InputSlotMorph.prototype.fixLayout = function () {
	var width, height, arrowWidth,
		contents = this.contents(),
		arrow = this.arrow(),
		tp = this.topBlock();

	contents.isNumeric = this.isNumeric && !this.isAlphanumeric;
	contents.isEditable = (!this.isReadOnly);
	contents.color = BLACK;
	if (this.isReadOnly) {
		contents.disableSelecting();
	} else {
		contents.enableSelecting();
	}

	if (this.choices) {
		arrow.setExtent(new Point(10 * this.scale, 9 * this.scale));
		arrow.show();
	} else {
		arrow.hide();
	}
	arrowWidth = arrow.isVisible ? arrow.width() : 0;

	// determine slot dimensions
	if (this.selectedBlock) { // a "wish" in the OF-block's left slot
		height = this.selectedBlock.height() + this.edge * 2;
		width = this.selectedBlock.width()
			+ arrowWidth
			+ this.edge * 2
			+ this.typeInPadding * 2;
	} else if (this.symbol) {
		this.symbol.fixLayout();
		this.symbol.setPosition(this.position().add(this.edge * 2));
		height = this.symbol.height() + this.edge * 4;
		width = this.symbol.width()
			+ arrowWidth
			+ this.edge * 4
			+ this.typeInPadding * 2;
	} else { // a comment slot too: only its corners differ
		height = contents.height() + (3 * this.scale);
		width = Math.max(contents.width(), 10 * this.scale) + (14 * this.scale)
			+ (arrow.isVisible ? 12 * this.scale : 0);
	}

	this.bounds.setExtent(new Point(width, height));

	// GP halves the spare width in device pixels, so the text is centred to one of them.
	contents.setPosition(new Point(
		blockHalf(Math.max(contents.width(), 10 * this.scale) - contents.width(),
			contents.pixelsPerUnit || 2 * ZOOM) + (7 * this.scale),
		2 * this.scale
	).add(this.position()));

	if (arrow.isVisible) {
		arrow.setPosition(new Point(
			this.right() - (14 * this.scale),
			this.top() + (6 * this.scale)
		));
	}

	if (this.fixesParentLayout && this.parent && this.parent.fixLayout) {
		tp.fullChanged();
		this.parent.fixLayout();
		tp.fullChanged();
	}
};

// InputSlotMorph events:

InputSlotMorph.prototype.rootForGrab = function () {
	// A drag that starts on an input slot picks nothing up, so a click that misses
	// the text or lands on a menu cannot move the block.
	return null;
};

InputSlotMorph.prototype.pans = function () {
	// a finger or the middle button pans the pane under the slot
	return MorphicPreferences.isTouchDevice || this.world().hand.middleButton;
};

InputSlotMorph.prototype.mouseDownLeft = function (pos) {
	var block = this.parentThatIsA(BlockMorph);

	// A left mouse press on a palette block's slot does nothing, so it cannot scroll the palette.
	if (this.pans()) return this.escalateEvent('mouseDownLeft', pos);
	if (block && block.isTemplate) return;
	if (this.isReadOnly || this.symbol ||
			this.arrow().bounds.containsPoint(pos)) {
		this.escalateEvent('mouseDownLeft', pos);
	}
};

InputSlotMorph.prototype.mouseClickLeft = function (pos) {
	var hand = this.world().hand;

	// the pan carries the slot back under the hand, but its end is not a click
	if (this.pans() && hand.grabPosition &&
			hand.grabPosition.distanceTo(hand.position()) > MorphicPreferences.grabThreshold) return;
	if (this.isReadOnly || this.symbol) {
		// a read-only slot with no menu takes the click as its block does
		if (!this.dropDownMenu()) this.escalateEvent('mouseClickLeft', pos);
	} else if (this.arrow().bounds.containsPoint(pos)) {
		this.dropDownMenu();
	} else {
		this.contents().edit();
	}
};

InputSlotMorph.prototype.userMenu = function () {
	// A right-click on a slot opens nothing, and the hand looks no further up for a menu.
	return chromeDrawnMenu;
};

InputSlotMorph.prototype.reactToEdit = function () {
	var block = this.parentThatIsA(BlockMorph);
	// a number slot left with no number in it holds 0, and shows it
	if (this.isNumeric && !this.isAlphanumeric && isNaN(parseInt(this.contents().text, 10))) {
		this.setContents(0);
	}
	this.contents().clearSelection();
	this.scriptChanged();
};

InputSlotMorph.prototype.freshTextEdit = function (aStringOrTextMorph) {
	this.onNextStep = () => aStringOrTextMorph.selectAll();
};

InputSlotMorph.prototype.becomeStringSlot = function (cursor) {
	// Shift+Enter in an auto slot: go on editing in a string slot in my place, with a new
	// line at the caret. Emptied, it gives the place back to me (TextSlotMorph reactToInput).
	const area = cursor.textarea,
		slot = this.parent.labelPart('%str');
	slot.choices = this.choices;
	slot.autoSlot = this;
	slot.setContents(area.value.slice(0, area.selectionStart) + '\n' + area.value.slice(area.selectionEnd));
	this.editInMyPlace(slot, area.selectionStart + 1, cursor.originalContents);
};

InputSlotMorph.prototype.editInMyPlace = function (slot, caret, originalContents) {
	// Put slot in my place in my block and go on editing there, where Escape still reverts.
	const world = this.world();
	world.stopEditing();
	this.parent.replaceInput(this, slot);
	slot.contents().edit();
	slot.onNextStep = null; // a fresh edit would select all
	world.cursor.originalContents = originalContents;
	world.cursor.textarea.setSelectionRange(caret, caret);
	world.cursor.processKeyUp({});
};

CursorMorph.prototype.processKeyDownInText = CursorMorph.prototype.processKeyDown;
CursorMorph.prototype.processKeyDown = function (event) {
	const slot = this.target.parent;
	if (('Enter' === event.key) && event.shiftKey && !event.isComposing && (slot instanceof InputSlotMorph) &&
			slot.isAlphanumeric && !(slot instanceof TextSlotMorph)) {
		event.preventDefault();
		slot.becomeStringSlot(this);
		return;
	}
	this.processKeyDownInText(event);
};

// InputSlotMorph replacing

InputSlotMorph.prototype.isLocked = function () {
	// A hat block's inputs and a variable name menu take no dropped reporter.
	return (this.parentThatIsA(BlockMorph) instanceof HatBlockMorph) ||
		(this.choices === 'allVarsMenu');
};

// InputSlotMorph evaluating:

InputSlotMorph.prototype.evaluate = function () {
	// answer my contents, which can be a "wish", i.e. a block that refers to
	// another sprite's local method, or a text string. If I am numerical
	// convert that string to a number. If the conversion fails answer the
	// string (e.g. for special choices like 'random', 'all' or 'last')
	// otherwise the numerical value.

	if (this.selectedBlock) {
		return this.selectedBlock;
	}
	if (this.symbol) {
		if (this.symbol.name === 'flag') {
			return ['__shout__go__'];
		}
		return '';
	}
	let val = this.acceptedText();
	// The value this slot was given, for as long as the text still shows it.
	// Editing the slot replaces the text, and from then on the text is the
	// truth -- which is where the coercion below belongs, and where GP puts it
	// too (InputSlot.gp textChanged, on the edit path).
	if (this.mbValueText === val) {
		return this.mbValue;
	}
	if (this.isNumeric || (this.isAlphanumeric && /^-?\d+$/.test(val))) {
		let num = parseInt(val, 10);
		if (!isNaN(num)) return num;
	}
	return val;
};

InputSlotMorph.prototype.isUnsupplied = function () {
	// Typing over the slot supplies the argument, the same way it replaces
	// mbValue in evaluate().
	return (this.mbUnsupplied === true) && (this.acceptedText() === this.mbValueText);
};

InputSlotMorph.prototype.acceptedText = function () {
	// While the slot is being typed, the text it had before, as GP changes a slot only on accept.
	const cursor = this.world() && this.world().cursor;
	return (cursor && cursor.target === this.contents()) ? cursor.originalContents : this.contents().text;
};

InputSlotMorph.prototype.isEmptySlot = function () {
	return this.contents().text === '' && !this.selectedBlock && !this.symbol;
};

InputSlotMorph.prototype.isVarOrBroadcastSlot = function () {
	// A variable or message name is shown as the user wrote it, never translated.
	const block = this.parentThatIsA(BlockMorph);
	return !!block && ['=', '+=', 'whenBroadcastReceived', 'sendBroadcast'].includes(block.selector);
};

// InputSlotMorph drawing:

InputSlotMorph.prototype.render = function (ctx) {
	var borderColor, r, w, h;

	// initialize my surface property
	if (this.cachedNormalColor) { // if flashing
		borderColor = this.color;
	} else if (this.parent) {
		borderColor = this.parent.color;
	} else {
		borderColor = new Color(120, 120, 120);
	}
	ctx.fillStyle = this.color.toString();
	if (this.isReadOnly && !this.cachedNormalColor) { // unless flashing
		// a light tint of the block's category colour, not of its current colour
		const block = this.parentThatIsA(BlockMorph);
		const base = (block && block.category) ? block.colorFor(block.category) : borderColor;
		ctx.fillStyle = base.lighter(75).toString();
	}

	// cache my border colors
	this.cachedClr = borderColor.toString();
	this.cachedClrBright = borderColor.lighter(this.contrast)
		.toString();
	this.cachedClrDark = borderColor.darker(this.contrast).toString();

	w = this.width();
	h = this.height();
	r = Math.min(15 * this.scale, h / 2, w / 2);
	ctx.beginPath();
	if (this.isComment) { // a comment slot has square corners
		ctx.rect(0, 0, w, h);
	} else { // round ends on one line, a rounded rectangle when taller
		ctx.arc(w - r, r, r, radians(-90), 0, false);
		ctx.arc(w - r, h - r, r, 0, radians(90), false);
		ctx.arc(r, h - r, r, radians(90), radians(180), false);
		ctx.arc(r, r, r, radians(180), radians(270), false);
	}
	ctx.closePath();
	ctx.fill();

	// draw my "wish" block, if any
	if (this.selectedBlock) {
		ctx.drawImage(
			this.doWithAlpha(1, () => this.selectedBlock.fullImage()),
			this.edge + this.typeInPadding,
			this.edge
		);
	}
};

// InputSlotStringMorph ///////////////////////////////////////////////

/*
	I am a piece of single-line text inside an input slot block. I serve as a
	container for sharing typographic attributes among my instances
*/

// InputSlotStringMorph inherits from StringMorph:

InputSlotStringMorph.prototype = new StringMorph();
InputSlotStringMorph.prototype.constructor = InputSlotStringMorph;
InputSlotStringMorph.uber = StringMorph.prototype;

function InputSlotStringMorph(
	text,
	fontSize,
	fontStyle,
	bold,
	italic,
	isNumeric,
	shadowOffset,
	shadowColor,
	color,
	fontName
) {
	this.init(
		text,
		fontSize,
		fontStyle,
		bold,
		italic,
		isNumeric,
		shadowOffset,
		shadowColor,
		color,
		fontName
	);
}

InputSlotStringMorph.prototype.fixLayout = function (justMe) {
	InputSlotStringMorph.uber.fixLayout.call(this, true);
	this.bounds.setWidth(blockTextWidth(this.width(), this.pixelsPerUnit));
	this.bounds.setHeight(blockTextHeight(this.fontSize, this.pixelsPerUnit));
	if (!justMe && this.parent && this.parent.fixLayout) this.parent.fixLayout();
};

InputSlotStringMorph.prototype.render = renderBlockString;
InputSlotStringMorph.prototype.font = blockTextFont;

// A blank's dot stays where StringMorph puts it, centred on the line, now that
// the text is drawn on its baseline.
InputSlotStringMorph.prototype.renderWithBlanks = function (ctx, startX, y) {
	var space = ctx.measureText(' ').width,
		top = y - blockTextBaseline(this.fontSize, this.pixelsPerUnit)
			+ fontHeight(this.fontSize) - this.height() / 2,
		x = startX || 0;

	this.text.split(' ').forEach((word, i) => {
		if (i > 0) {
			ctx.fillStyle = this.blanksColor.toString();
			ctx.beginPath();
			ctx.arc(x + space / 2, top, space / 2, radians(0), radians(360));
			ctx.fill();
			x += space;
		}
		if (word !== '') {
			ctx.fillStyle = this.getRenderColor().toString();
			ctx.fillText(word, x, y);
			x += ctx.measureText(word).width;
		}
	});
};

InputSlotStringMorph.prototype.getRenderColor = function () {
	return this.parent.alpha > 0.25 ? this.color : WHITE;
};

InputSlotStringMorph.prototype.getShadowRenderColor = function () {
	return this.parent.alpha > 0.25 ? this.shadowColor : CLEAR;
};

// InputSlotTextMorph ///////////////////////////////////////////////

/*
	I am a piece of multi-line text inside an input slot block. I serve as a
	container for sharing typographic attributes among my instances
*/

// InputSlotTextMorph inherits from TextMorph:

InputSlotTextMorph.prototype = new TextMorph();
InputSlotTextMorph.prototype.constructor = InputSlotTextMorph;
InputSlotTextMorph.uber = StringMorph.prototype;

function InputSlotTextMorph(
	text,
	fontSize,
	fontStyle,
	bold,
	italic,
	alignment,
	width,
	fontName,
	shadowOffset,
	shadowColor
) {
	this.init(text,
		fontSize,
		fontStyle,
		bold,
		italic,
		alignment,
		width,
		fontName,
		shadowOffset,
		shadowColor);
}

InputSlotTextMorph.prototype.font = blockTextFont;

InputSlotTextMorph.prototype.fixLayout = function () {
	// Measure each line without the space parse() leaves at its end.
	this.parse();
	this.measureCtx.font = this.font();
	const width = Math.max(1, ...this.lines.map(line =>
		blockTextWidth(this.measureCtx.measureText(line.replace(/ $/, '')).width, this.pixelsPerUnit)));
	this.bounds = this.bounds.origin.extent(new Point(this.maxWidth || width,
		this.lines.length * blockTextHeight(this.fontSize, this.pixelsPerUnit)));
	if (this.parent && this.parent.layoutChanged) this.parent.layoutChanged();
};

// Each line is drawn on GP's baseline, one blockTextHeight below the last, the
// pitch fixLayout measures. Morphic's 1.2 font sizes would drift from it a little
// more on every line.
InputSlotTextMorph.prototype.render = function (ctx) {
	var lineHeight = blockTextHeight(this.fontSize, this.pixelsPerUnit),
		base = blockTextBaseline(this.fontSize, this.pixelsPerUnit),
		start, stop, i, p, c, x;

	ctx.font = this.font();
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = this.getRenderColor().toString();
	this.lines.forEach((line, row) => {
		x = 0;
		if (this.alignment === 'right') {
			x = this.width() - ctx.measureText(line).width;
		} else if (this.alignment === 'center') {
			x = (this.width() - ctx.measureText(line).width) / 2;
		}
		ctx.fillText(line, x, row * lineHeight + base);
	});

	// the selection
	start = Math.min(this.startMark, this.endMark);
	stop = Math.max(this.startMark, this.endMark);
	for (i = start; i < stop; i += 1) {
		p = this.slotPosition(i).subtract(this.position());
		c = this.text.charAt(i);
		ctx.fillStyle = this.markedBackgoundColor.toString();
		ctx.fillRect(p.x, p.y, ctx.measureText(c).width + 1, lineHeight);
		ctx.fillStyle = this.markedTextColor.toString();
		ctx.fillText(c, p.x, p.y + base);
	}
};

// The cursor and a click find a line on the same pitch.
InputSlotTextMorph.prototype.slotPosition = function (slot) {
	var pos = TextMorph.prototype.slotPosition.call(this, slot);
	return new Point(pos.x, this.top()
		+ this.columnRow(slot).y * blockTextHeight(this.fontSize, this.pixelsPerUnit));
};

InputSlotTextMorph.prototype.slotAt = function (aPoint) {
	var ratio = fontHeight(this.fontSize) / blockTextHeight(this.fontSize, this.pixelsPerUnit);
	return TextMorph.prototype.slotAt.call(this,
		new Point(aPoint.x, this.top() + (aPoint.y - this.top()) * ratio));
};

InputSlotTextMorph.prototype.getRenderColor =
	InputSlotStringMorph.prototype.getRenderColor;

InputSlotTextMorph.prototype.getShadowRenderColor =
	InputSlotStringMorph.prototype.getShadowRenderColor;

// TemplateSlotMorph ///////////////////////////////////////////////////

/*
	I am a variable reporter block template sitting on a pedestal.
	My block spec is

	%var - inline variable reporter template

	evaluate returns the embedded reporter template's label string
*/

// TemplateSlotMorph inherits from ArgMorph:

TemplateSlotMorph.prototype = new ArgMorph();
TemplateSlotMorph.prototype.constructor = TemplateSlotMorph;
TemplateSlotMorph.uber = ArgMorph.prototype;

// TemplateSlotMorph instance creation:

function TemplateSlotMorph(name) {
	this.init(name);
}

TemplateSlotMorph.prototype.init = function (name) {
	var template = new ReporterBlockMorph();
	template.isDraggable = false;
	template.isTemplate = true;
	template.category = 'Variables';
	template.setSpec('_');
	template.selector = 'v';
	TemplateSlotMorph.uber.init.call(this);
	this.add(template);
	this.setContents((name && name.trim && name.trim()) ? name : 'v'); // 'v' stands in for a blank label
	this.fixLayout();
	this.isDraggable = false;
	this.isStatic = true; // I cannot be exchanged
};

// TemplateSlotMorph accessing:

TemplateSlotMorph.prototype.getSpec = function () {
	return '%var';
};

TemplateSlotMorph.prototype.template = function () {
	return this.children[0];
};

TemplateSlotMorph.prototype.contents = function () {
	return this.template().blockSpec;
};

TemplateSlotMorph.prototype.setContents = function (aString) {
	var tmp = this.template();
	tmp.setSpec(aString instanceof Array ? localized(aString[0]) : aString);
	tmp.fixBlockColor(); // fix zebra coloring
	tmp.fixLabelColor();
};

// TemplateSlotMorph evaluating:

TemplateSlotMorph.prototype.evaluate = function () {
	return this.contents();
};

// TemplateSlotMorph layout:

TemplateSlotMorph.prototype.fixLayout = function () {
	var template = this.template();
	this.bounds.setExtent(template.extent());
	template.setPosition(this.position());
	if (this.fixesParentLayout && this.parent) {
		if (this.parent.fixLayout) {
			this.parent.fixLayout();
		}
	}
};

// TemplateSlotMorph drop behavior:

TemplateSlotMorph.prototype.isLocked = function () {
	return true;
};

// TemplateSlotMorph drawing:
TemplateSlotMorph.prototype.isDrawnAtZoom =
	BlockMorph.prototype.isDrawnAtZoom;

TemplateSlotMorph.prototype.render = function (ctx) {
	if (this.parent instanceof Morph) {
		this.color = this.parent.color.copy();
	}
	BlockMorph.prototype.render.call(this, ctx);
};

TemplateSlotMorph.prototype.outlinePath =
	ReporterBlockMorph.prototype.outlinePathOval;

TemplateSlotMorph.prototype.outlineColor =
	BlockMorph.prototype.outlineColor;

TemplateSlotMorph.prototype.cSlots = function () {
	return [];
};

TemplateSlotMorph.prototype.outlineOutset =
	BlockMorph.prototype.outlineOutset;

// BooleanSlotMorph ////////////////////////////////////////////////////

/*
	I am a boolean argument slot: a rounded toggle, green with its knob on
	the right when true, pink with its knob on the left when false. My block
	spec is

	%bool	- Boolean

	Clicking me flips my value between true and false.

	evaluate() returns my value.

	my most important public attributes and accessors are:

	value						- user editable contents (Boolean or null)
	setContents(Boolean/null)	- display the argument (Boolean or null)
*/

// BooleanSlotMorph inherits from ArgMorph:

BooleanSlotMorph.prototype = new ArgMorph();
BooleanSlotMorph.prototype.constructor = BooleanSlotMorph;
BooleanSlotMorph.uber = ArgMorph.prototype;

// BooleanSlotMorph instance creation:

function BooleanSlotMorph(initialValue) {
	this.init(initialValue);
}

BooleanSlotMorph.prototype.init = function (initialValue) {
	this.value = (typeof initialValue === 'boolean') ? initialValue : null;
	BooleanSlotMorph.uber.init.call(this);
	this.alpha = 1;
	this.setContents(true);
	this.fixLayout();
};

BooleanSlotMorph.prototype.getSpec = function () {
	return '%bool';
};

// BooleanSlotMorph accessing:

BooleanSlotMorph.prototype.evaluate = function () {
	return (this.mbValue === undefined) ? this.value : this.mbValue;
};

BooleanSlotMorph.prototype.isEmptySlot = function () {
	return this.value === null;
};

BooleanSlotMorph.prototype.isLocked = function () {
	// An if's closing else and a boolean constant's own slot take no dropped reporter.
	// fixElseSection marks the else static.
	var block = this.parentThatIsA(BlockMorph);
	return this.isStatic || (!!block && (block.selector === 'booleanConstant'));
};

BooleanSlotMorph.prototype.setContents = function (boolOrNull) {
	this.value = (typeof boolOrNull === 'boolean') ? boolOrNull
		: (isNil(boolOrNull) ||
			['', ' ', 'null'].includes(boolOrNull) ||
			+boolOrNull < 0 ? null
				: ['true', 'on', 'yes', 'ok', 'y', '+'].includes(boolOrNull) ||
					+boolOrNull > 0);
	// A value that is not a boolean stays what it was. The coercion above is for
	// the words a user can type or pick from a menu; anything else is a value in
	// its own right, and GP compiles it as one because its compiler reads the
	// parse tree and never passes it through a slot -- its constant-pin shortcut
	// tests `isClass (last args) 'Boolean'` (MicroBlocksCompiler.gp
	// instructionsForCmd), which a string is not. The bytes carry such values,
	// so coercing them here changes a program read back from a board.
	this.mbValue = ((typeof boolOrNull === 'boolean') || isNil(boolOrNull))
		? undefined : boolOrNull;
	this.mbUnsupplied = false;
	this.rerender();
};

BooleanSlotMorph.prototype.toggleValue = function () {
	var block = this.parentThatIsA(BlockMorph);
	this.value = !this.value;
	this.mbValue = undefined; // a click replaces a kept non-boolean value
	this.scriptChanged();
	if (block && (block.isCustomBlock)) {
		block.fireSlotEditedEvent(this);
	}
	this.rerender();
};

// BooleanSlotMorph events:

BooleanSlotMorph.prototype.mouseClickLeft = function () {
	this.toggleValue();
};

// BooleanSlotMorph layout:

BooleanSlotMorph.prototype.fixLayout = function () {
	this.bounds.setWidth(29 * this.scale);
	this.bounds.setHeight(18 * this.scale);
};

// BooleanSlotMorph drawing:

BooleanSlotMorph.prototype.render = function (ctx) {
	// A rounded toggle with a dark gray outline one screen pixel wide, and a knob
	// 2 block units in from the end that the value names. A slot with no
	// boolean (null) is drawn as false, the value a click turns it from.
	var s = this.scale,
		w = this.width(),
		h = this.height(),
		border = 1 / ZOOM, // the world is drawn ZOOM times its size
		knob = h - (4 * s),
		x = (this.value === true) ? (w - knob - (2 * s)) : (2 * s),
		outline = 'rgb(60, 60, 60)';

	this.pill(ctx, 0, 0, w, h, border,
		(this.value === true) ? 'rgb(0, 200, 0)' : 'rgb(200, 100, 100)', outline);
	this.pill(ctx, x, 2 * s, knob, knob, border, outline, outline);
};

BooleanSlotMorph.prototype.pill = function (ctx, x, y, w, h, border, fill, stroke) {
	// The outline is stroked on the shape's edge, inset by half its width so
	// the whole of it stays inside the given rect.
	var inset = border / 2,
		r = (Math.min(w, h) - border) / 2;

	x += inset;
	y += inset;
	w -= border;
	h -= border;
	if ((w <= 0) || (h <= 0)) return;
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
	ctx.lineTo(x + r, y + h);
	ctx.arc(x + r, y + r, r, Math.PI / 2, 3 * Math.PI / 2);
	ctx.closePath();
	ctx.fillStyle = fill;
	ctx.fill();
	ctx.lineWidth = border;
	ctx.strokeStyle = stroke;
	ctx.stroke();
};

// ArrowMorph //////////////////////////////////////////////////////////

/*
	I am a triangular arrow shape, for use in drop-down menus etc.
	My orientation is governed by my 'direction' property, which can be
	'down', 'up', 'left' or 'right'.
*/

// ArrowMorph inherits from Morph:

ArrowMorph.prototype = new Morph();
ArrowMorph.prototype.constructor = ArrowMorph;
ArrowMorph.uber = Morph.prototype;

// ArrowMorph instance creation:

function ArrowMorph(direction, size, padding, color, isBlockLabel) {
	this.init(direction, size, padding, color, isBlockLabel);
}

ArrowMorph.prototype.init = function (direction, size, padding, color, isLbl) {
	this.direction = direction || 'down';
	this.size = size || ((size === 0) ? 0 : 50);
	this.padding = padding || 0;
	this.isBlockLabel = isLbl || false;

	ArrowMorph.uber.init.call(this);
	this.color = color || BLACK;
	this.bounds.setWidth(this.size);
	this.bounds.setHeight(this.size);
	this.rerender();
};

ArrowMorph.prototype.setSize = function (size) {
	var min = Math.max(size, 1);
	this.size = size;
	this.changed();
	this.bounds.setWidth(min);
	this.bounds.setHeight(min);
	this.rerender();
};

// ArrowMorph displaying:

ArrowMorph.prototype.render = function (ctx) {
	// initialize my surface property
	var pad = this.padding,
		h = this.height(),
		h2 = h / 2,
		w = this.width(),
		w2 = w / 2;

	ctx.fillStyle = this.getRenderColor().toString();
	ctx.beginPath();
	if (this.direction === 'down') {
		ctx.moveTo(pad, h2);
		ctx.lineTo(w - pad, h2);
		ctx.lineTo(w2, h - pad);
	} else if (this.direction === 'up') {
		ctx.moveTo(pad, h2);
		ctx.lineTo(w - pad, h2);
		ctx.lineTo(w2, pad);
	} else if (this.direction === 'left') {
		ctx.moveTo(pad, h2);
		ctx.lineTo(w2, pad);
		ctx.lineTo(w2, h - pad);
	} else { // 'right'
		ctx.moveTo(w2, pad);
		ctx.lineTo(w - pad, h2);
		ctx.lineTo(w2, h - pad);
	}
	ctx.closePath();
	ctx.fill();
};

ArrowMorph.prototype.getRenderColor = function () {
	if (this.isBlockLabel) {
		return SyntaxElementMorph.prototype.alpha > 0.5 ? this.color : WHITE;
	}
	return this.color;
};

// SlotArrowMorph //////////////////////////////////////////////////////

/*
	I am the down arrow of an input slot's menu. My triangle fills my
	whole box, base along the top, and I am slightly transparent.
*/

// SlotArrowMorph inherits from ArrowMorph:

SlotArrowMorph.prototype = new ArrowMorph();
SlotArrowMorph.prototype.constructor = SlotArrowMorph;
SlotArrowMorph.uber = ArrowMorph.prototype;

// SlotArrowMorph instance creation:

function SlotArrowMorph() {
	this.init('down', 0, 0, new Color(0, 0, 0, 180 / 255), true);
}

// SlotArrowMorph displaying:

SlotArrowMorph.prototype.render = function (ctx) {
	ctx.fillStyle = this.getRenderColor().toString();
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(this.width(), 0);
	ctx.lineTo(this.width() / 2, this.height());
	ctx.closePath();
	ctx.fill();
};

// TextSlotMorph //////////////////////////////////////////////////////

/*
	I am a multi-line input slot, primarily used in Snap's code-mapping
	blocks.
*/

// TextSlotMorph inherits from InputSlotMorph:

TextSlotMorph.prototype = new InputSlotMorph();
TextSlotMorph.prototype.constructor = TextSlotMorph;
TextSlotMorph.uber = InputSlotMorph.prototype;

// TextSlotMorph instance creation:

function TextSlotMorph(text, isNumeric, choiceDict, isReadOnly) {
	this.init(text, isNumeric, choiceDict, isReadOnly);
}

TextSlotMorph.prototype.init = function (
	text,
	isNumeric,
	choiceDict,
	isReadOnly
) {
	var contents = new InputSlotTextMorph(''),
		arrow = new SlotArrowMorph();

	contents.fontSize = 13 * this.scale;
	contents.fontName = 'Arial';
	contents.fixLayout();

	this.choices = choiceDict || null; // object, function or selector
	this.oldContentsExtent = contents.extent();
	this.isNumeric = isNumeric || false;
	this.isReadOnly = isReadOnly || false;

	InputSlotMorph.uber.init.call(this, null, null, null, null, true); // sil.
	this.color = WHITE;
	this.add(contents);
	this.add(arrow);
	contents.isEditable = true;
	contents.isDraggable = false;
	contents.enableSelecting();
	this.setContents(''); // MicroBlocks wants a default value

};

// TextSlotMorph accessing:

TextSlotMorph.prototype.getSpec = function () {
	return '%str';
};

TextSlotMorph.prototype.contents = function () {
	return detect(
		this.children,
		child => child instanceof TextMorph
	);
};

// TextSlotMorph events:

TextSlotMorph.prototype.layoutChanged = function () {
	this.fixLayout();
};

TextSlotMorph.prototype.reactToInput = function () {
	if (this.autoSlot && (this.contents().text === '')) {
		const auto = this.autoSlot;
		this.autoSlot = null;
		auto.setContents('');
		this.editInMyPlace(auto, 0, this.world().cursor.originalContents);
	}
};

// ColorSlotMorph //////////////////////////////////////////////////////

/*
	I am an editable input slot for a color. Clicking me opens a
	ColorSlotPickerMorph that sets my color.

	my block spec is %color

	evaluate() returns my color
*/

// ColorSlotMorph inherits from ArgMorph:

ColorSlotMorph.prototype = new ArgMorph();
ColorSlotMorph.prototype.constructor = ColorSlotMorph;
ColorSlotMorph.uber = ArgMorph.prototype;

// ColorSlotMorph instance creation:

function ColorSlotMorph(clr) {
	this.init(clr);
}

ColorSlotMorph.prototype.init = function (clr) {
	ColorSlotMorph.uber.init.call(this);
	if (!clr) clr = new Color(35, 190, 30); // MicroBlocks default ColorSlot color
	this.alpha = 1;
	this.setColor(clr);
	this.fixLayout();
};

ColorSlotMorph.prototype.getSpec = function () {
	return '%color';
};

ColorSlotMorph.prototype.setContents = function (clr) {
	// Keep any value that is not a colour, as InputSlotMorph keeps mbValue.
	// The swatch shows a default for it, but GP compiles and prints the value
	// the source gave (Block.gp initializeForNode keeps the parse node).
	this.mbValue = (clr instanceof Color) ? undefined : clr;
	this.mbUnsupplied = false;
	this.setColor(clr);
};

ColorSlotMorph.prototype.setColor = function (clr) {
	// A number is a colour packed as 0xRRGGBB, which is how the bytes carry one
	// and how the source writes one outside a colorSwatch. Without this it
	// falls through to the default below, so a colour read back from a board
	// arrives as (145, 26, 68) whatever it was.
	if (typeof clr === 'number') {
		clr = new Color((clr >> 16) & 255, (clr >> 8) & 255, clr & 255);
	}
	ColorSlotMorph.uber.setColor.call(
		this,
		isString(clr) && clr.length > 10 ? Color.fromString(clr)
			: (clr instanceof Color ? clr : new Color(145, 26, 68))
	);
};

// ColorSlotMorph events:

ColorSlotMorph.prototype.mouseClickLeft = function () {
	// Open the picker below me, moving it here if it is open for another slot.
	var world = this.world(),
		picker = detect(world.children, (m) => m instanceof ColorSlotPickerMorph) || new ColorSlotPickerMorph();
	picker.setAction((clr) => {
		this.setContents(clr);
		this.scriptChanged();
	}, this.color);
	world.add(picker);
	picker.setPosition(this.bottomLeft().add(new Point(0, 2)));
	picker.keepWithin(world);
};

// ColorSlotMorph evaluating:

ColorSlotMorph.prototype.evaluate = function () {
	return (this.mbValue === undefined) ? this.color : this.mbValue;
};

// ColorSlotMorph drawing:

ColorSlotMorph.prototype.fixLayout = function () {
	// determine my extent
	var side = 20 * this.scale;
	this.bounds.setWidth(side);
	this.bounds.setHeight(side);
};

ColorSlotMorph.prototype.drawOn = function (ctx, rect) {
	// As Morph's drawOn, but the clip runs half a unit past my edge so the
	// ring render strokes there is not cut off. My block is drawn first, so
	// the margin lands on it.
	var clipped = rect.intersect(this.bounds.expandBy(this.scale / 2)),
		pos = this.position();

	if (!clipped.extent().gt(ZERO)) {return; }
	ctx.save();
	ctx.globalAlpha = this.alpha;
	ctx.beginPath();
	ctx.rect(clipped.left(), clipped.top(), clipped.width(), clipped.height());
	ctx.clip();
	ctx.translate(pos.x, pos.y);
	this.render(ctx);
	ctx.restore();
};

ColorSlotMorph.prototype.render = function (ctx) {
	// A dark gray ring one unit wide, centred on a circle as wide as me, as
	// GP strokes it, so it reaches half a unit past my edge (see drawOn).
	let radius = this.width() / 2;

	ctx.beginPath();
	ctx.arc(radius, radius, radius, 0, 2 * Math.PI);
	ctx.fillStyle = this.color.toString();
	ctx.fill();
	ctx.lineWidth = this.scale;
	ctx.strokeStyle = 'rgb(56, 56, 56)';
	ctx.stroke();
};

// ColorSlotPickerMorph //////////////////////////////////////////////////////

/*
	I am the colour picker a ColorSlotMorph opens; there is at most one of me.
	A press on my gray ramp or palette picks the screen pixel under the hand,
	and I keep picking while the button is held. A press elsewhere on me drags
	me, and I stay open until my close button is clicked.
*/

// ColorSlotPickerMorph inherits from Morph:

ColorSlotPickerMorph.prototype = new Morph();
ColorSlotPickerMorph.prototype.constructor = ColorSlotPickerMorph;
ColorSlotPickerMorph.uber = Morph.prototype;

ColorSlotPickerMorph.prototype.closeIcon = 'M2.14645 2.85355C1.95118 2.65829 1.95118 2.34171 2.14645 ' +
	'2.14645C2.34171 1.95118 2.65829 1.95118 2.85355 2.14645L8 7.29289L13.1464 2.14645C13.3417 1.95118 13.6583 ' +
	'1.95118 13.8536 2.14645C14.0488 2.34171 14.0488 2.65829 13.8536 2.85355L8.70711 8L13.8536 13.1464C14.0488 ' +
	'13.3417 14.0488 13.6583 13.8536 13.8536C13.6583 14.0488 13.3417 14.0488 13.1464 13.8536L8 8.70711L2.85355 ' +
	'13.8536C2.65829 14.0488 2.34171 14.0488 2.14645 13.8536C1.95119 13.6583 1.95119 13.3417 2.14645 13.1464L7.29289 ' +
	'8L2.14645 2.85355Z';

// ColorSlotPickerMorph instance creation:

function ColorSlotPickerMorph() {
	this.init();
}

ColorSlotPickerMorph.prototype.init = function () {
	var labelColor = new Color(176, 179, 197); // blueGray 200
	ColorSlotPickerMorph.uber.init.call(this);
	this.action = null;
	this.lastColor = null;
	this.brightness = 50; // the slider's value: 0 is full brightness, 100 black
	this.color = new Color(45, 49, 67); // blueGray 850
	this.bounds.setExtent(new Point(289, 170));

	// one palette pixel per world canvas pixel, so the palettes are as sharp as the IDE
	const px = ZOOM * Math.ceil(window.devicePixelRatio || 1);
	this.fullPalette = newCanvas(new Point(200 * px, 128 * px), true);
	this.drawColorPalette(this.fullPalette);
	this.grayRamp = this.addPalette(this.drawGrayRamp(newCanvas(new Point(200 * px, 10 * px), true)), 10, 18, 200, 10);
	this.colorPalette = this.addPalette(newCanvas(new Point(200 * px, 128 * px), true), 10, 32, 200, 128);
	this.slider = this.addSlider(214, 32);
	this.swatch = this.addPart(new Morph(), 228, 32, 52, 52);
	this.swatch.color = WHITE;
	this.addCloseButton();

	this.boxes = ['R', 'G', 'B'].map((component, i) => {
		var y = 93 + (26 * i),
			label = new StringMorph(component, 13, 'monospace', true, false, false, null, null, labelColor, 'Courier'),
			frame = this.addPart(new Morph(), 228 + label.width() + 6, y, 36, 15),
			box = new StringMorph('000', 13, 'monospace', true, false, true, null, null, new Color(38, 41, 56), 'Courier');
		this.addPart(label, 228, y + 2);
		frame.color = WHITE;
		box.isEditable = true;
		frame.add(box);
		box.setPosition(frame.position().add(new Point(3, Math.floor((frame.height() - box.height()) / 2))));
		return box;
	});
};

ColorSlotPickerMorph.prototype.addPart = function (part, x, y, w, h) {
	if (w) part.setExtent(new Point(w, h));
	part.setPosition(this.position().add(new Point(x, y)));
	this.add(part);
	return part;
};

ColorSlotPickerMorph.prototype.addPalette = function (canvas, x, y, w, h) {
	// A part w by h that shows canvas and picks screen colours while pressed.
	var part = this.addPart(new Morph(), x, y, w, h);
	part.canvas = canvas;
	part.render = (ctx) => ctx.drawImage(canvas, 0, 0, w, h);
	part.mouseDownLeft = () => {
		this.world().worldCanvas.style.cursor = 'crosshair';
		this.track((pos) => this.pickAt(pos), () => {
			this.world().worldCanvas.style.cursor = '';
		});
	};
	return part;
};

ColorSlotPickerMorph.prototype.addSlider = function (x, y) {
	var slider = this.addPart(new Morph(), x, y, 10, 128);
	slider.render = (ctx) => {
		ctx.fillStyle = 'rgb(207, 209, 220)'; // blueGray 100
		ctx.fillRect(0, 0, slider.width(), slider.height());
		ctx.fillStyle = 'rgb(176, 179, 197)'; // blueGray 200
		ctx.beginPath();
		ctx.roundRect(0, Math.trunc((this.brightness / 100) * (slider.height() - 20)), slider.width(), 20, 4);
		ctx.fill();
	};
	slider.mouseDownLeft = () => this.track((pos) => this.setBrightness(
		100 * Math.min(Math.max((pos.y - slider.top()) / slider.height(), 0), 1)));
	return slider;
};

ColorSlotPickerMorph.prototype.addCloseButton = function () {
	var button = this.addPart(new Morph(), this.width() - 45, 5, 40, 25);
	button.render = (ctx) => {
		ctx.fillStyle = button.isHighlighted ? 'rgb(254, 215, 34)' : 'rgb(207, 209, 220)'; // yellow, blueGray 100
		ctx.translate(button.width() - 16, 0);
		ctx.fill(new Path2D(this.closeIcon));
	};
	button.mouseEnter = () => { button.isHighlighted = true; button.changed(); };
	button.mouseLeave = () => { button.isHighlighted = false; button.changed(); };
	button.mouseDownLeft = nop; // so a press here is a click, not a drag
	button.mouseClickLeft = () => this.destroy();
};

// ColorSlotPickerMorph drawing:

ColorSlotPickerMorph.prototype.render = function (ctx) {
	ctx.fillStyle = this.color.toString();
	ctx.beginPath();
	ctx.roundRect(0, 0, this.width(), this.height(), 4);
	ctx.fill();
};

ColorSlotPickerMorph.prototype.drawGrayRamp = function (canvas) {
	// Black to white, with a few columns of each at the ends.
	var ctx = canvas.getContext('2d'), w = canvas.width, x, level;
	for (x = 1; x <= w; x++) {
		level = Math.min(Math.max(Math.trunc((255 * (x - 10)) / (w - 20)), 0), 255);
		ctx.fillStyle = new Color(level, level, level).toString();
		ctx.fillRect(x - 1, 0, 1, canvas.height);
	}
	return canvas;
};

ColorSlotPickerMorph.prototype.drawColorPalette = function (canvas) {
	// Hue across and saturation down, at full brightness.
	var w = canvas.width, h = canvas.height,
		ctx = canvas.getContext('2d'),
		image = ctx.createImageData(w, h),
		x, y, c;
	for (y = 1; y <= h; y++) {
		for (x = 1; x <= w; x++) {
			c = this.colorHSV((360 * x) / w, y / h, 1);
			image.data.set([c.r, c.g, c.b, 255], ((w * (y - 1)) + x - 1) * 4);
		}
	}
	ctx.putImageData(image, 0, 0);
};

// ColorSlotPickerMorph colours:

ColorSlotPickerMorph.prototype.colorHSV = function (h, s, v) {
	// h in degrees, s and v from 0 to 1. Each channel is truncated, not rounded.
	var i, f, p, q, t;
	h = h % 360;
	if (h < 0) h += 360;
	s = Math.min(Math.max(s, 0), 1);
	v = Math.min(Math.max(v, 0), 1);
	i = Math.trunc(h / 60);
	f = (h / 60) - i;
	p = v * (1 - s);
	q = v * (1 - (s * f));
	t = v * (1 - (s * (1 - f)));
	return new Color(...[[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i]
		.map((each) => Math.trunc(255 * each)));
};

ColorSlotPickerMorph.prototype.hsv = function (c) {
	// [hue in degrees, saturation, brightness]; a gray has hue 0.
	var min = Math.min(c.r, c.g, c.b), max = Math.max(c.r, c.g, c.b), f, i;
	if (max === min) return [0, 0, max / 255];
	if (c.r === min) {
		f = c.g - c.b;
		i = 3;
	} else if (c.g === min) {
		f = c.b - c.r;
		i = 5;
	} else {
		f = c.r - c.g;
		i = 1;
	}
	return [(60 * (i - (f / (max - min)))) % 360, (max - min) / max, max / 255];
};

ColorSlotPickerMorph.prototype.pixelAt = function (pos) {
	// The colour on the screen at a world position.
	var world = this.world(), canvas = world.worldCanvas,
		ratio = canvas.width / world.width(),
		data = canvas.getContext('2d').getImageData(Math.round(pos.x * ratio), Math.round(pos.y * ratio), 1, 1).data;
	return new Color(data[0], data[1], data[2]);
};

// ColorSlotPickerMorph picking:

ColorSlotPickerMorph.prototype.setAction = function (action, initialColor) {
	this.action = action;
	this.lastColor = initialColor;
	this.selectColor(initialColor, true);
};

ColorSlotPickerMorph.prototype.pickAt = function (pos) {
	this.lastColor = this.pixelAt(pos);
	this.selectColor(this.lastColor, true);
};

ColorSlotPickerMorph.prototype.selectColor = function (c, updateSlider) {
	// Show c and give it to the action. Moving the slider to c's brightness
	// redraws the palette, and the action sees c again after that.
	this.swatch.setColor(c);
	this.boxes.forEach((box, i) => this.setBoxText(box, String([c.r, c.g, c.b][i]).padStart(3, '0')));
	if (updateSlider) this.setBrightness(100 * Math.sqrt(1 - this.hsv(c)[2]));
	if (this.action) this.action(c);
};

ColorSlotPickerMorph.prototype.setBrightness = function (n) {
	// Darken the palette towards black, in finer steps at the bright end, and
	// reselect the last picked hue and saturation at the new brightness.
	var ctx = this.colorPalette.canvas.getContext('2d'), alpha, hsv;
	this.brightness = n;
	n = Math.min(Math.max(n / 100, 0), 1);
	n = 1 - (n * n);
	alpha = Math.min(Math.max(Math.trunc(255 * n), 0), 255);
	ctx.globalAlpha = 1;
	ctx.fillStyle = 'black';
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	ctx.globalAlpha = alpha / 255;
	ctx.drawImage(this.fullPalette, 0, 0);
	ctx.globalAlpha = 1;
	this.colorPalette.changed();
	this.slider.changed();
	if (this.lastColor) {
		hsv = this.hsv(this.lastColor);
		this.selectColor(this.colorHSV(hsv[0], hsv[1], alpha / 255), false);
	}
};

ColorSlotPickerMorph.prototype.track = function (onMove, onUp) {
	// Call onMove with the hand's position now and on every move until the
	// button comes up, even outside me.
	var world = this.world(), hand = world.hand,
		origin = getDocumentPositionOf(world.worldCanvas);
	hand.morphToGrab = null;
	hand.processMouseMove = (event) => {
		hand.setPosition(new Point(event.pageX - origin.x, event.pageY - origin.y).divideBy(ZOOM));
		onMove(hand.position());
	};
	hand.processMouseUp = () => {
		delete hand.processMouseMove;
		delete hand.processMouseUp;
		hand.mouseButton = null;
		hand.clickTarget = null;
		if (onUp) onUp();
	};
	onMove(hand.position());
};

ColorSlotPickerMorph.prototype.mouseDownLeft = function (pos) {
	var offset = pos.subtract(this.position());
	this.track((handPos) => this.setPosition(handPos.subtract(offset)));
};

// ColorSlotPickerMorph R G B boxes:

ColorSlotPickerMorph.prototype.setBoxText = function (box, text) {
	box.text = text;
	box.fixLayout();
	box.rerender();
};

ColorSlotPickerMorph.prototype.reactToInput = function () {
	// A box holds three characters at most while it is typed in.
	var cursor = this.world().cursor, box = cursor && cursor.target;
	if (box && this.boxes.includes(box) && (box.text.length > 3)) {
		this.setBoxText(box, box.text.slice(0, 3));
		cursor.textarea.value = box.text;
		cursor.gotoSlot(3);
		cursor.syncTextareaSelectionWith(box);
	}
};

ColorSlotPickerMorph.prototype.reactToEdit = function (box) {
	// Pad the box to three digits and apply all three, unless the edit was undone.
	var cursor = this.world().cursor, rgb;
	if (!this.boxes.includes(box) || (cursor && (box.text === cursor.originalContents))) return;
	this.setBoxText(box, box.text.padStart(3, '0'));
	rgb = this.boxes.map((each) => Math.min(Math.max(Math.trunc(Number(each.text)) || 0, 0), 255));
	if ((rgb[0] !== this.lastColor.r) || (rgb[1] !== this.lastColor.g) || (rgb[2] !== this.lastColor.b)) {
		this.selectColor(new Color(rgb[0], rgb[1], rgb[2]));
	}
};

// MicroBitDisplaySlotMorph //////////////////////////////////////////////////////

/*
	I am an editable input slot for the micro:bit 5x5 display.
	my block spec is %mbdisplay
*/

// MicroBitDisplaySlotMorph inherits from ArgMorph:

MicroBitDisplaySlotMorph.prototype = new ArgMorph();
MicroBitDisplaySlotMorph.prototype.constructor = MicroBitDisplaySlotMorph;
MicroBitDisplaySlotMorph.uber = ArgMorph.prototype;

// MicroBitDisplaySlotMorph instance creation:

function MicroBitDisplaySlotMorph(bits) {
	this.init(bits);
}

MicroBitDisplaySlotMorph.prototype.init = function (bits) {
	MicroBitDisplaySlotMorph.uber.init.call(this);
	this.display = Array(25).fill(false);
	this.paintMode = true;
	this.strideX = 15;
	this.strideY = 14;
	this.ledWidth = 9;
	this.ledHeight = 12;
	this.setColor(new Color(71, 82, 191));
	if (bits) this.setContents(bits);
	this.fixLayout();
};

MicroBitDisplaySlotMorph.prototype.getSpec = function () {
	return '%mbdisplay';
};

MicroBitDisplaySlotMorph.prototype.evaluate = function() {
	return (this.mbValue === undefined) ? this.contents() : this.mbValue;
}

MicroBitDisplaySlotMorph.prototype.contents = function (bits) {
	let result = 0;
	for (let row = 0; row < 5; row++) {
		for (let col = 0; col < 5; col++) {
			let isOn = this.display[(5 * (4 - row)) + (4 - col)];
			result <<= 1;
			result |= isOn ? 1 : 0;
		}
	}
	return result;
}

MicroBitDisplaySlotMorph.prototype.setContents = function (bits) {
	let shift = 0;
	for (let row = 0; row < 5; row++) {
		for (let col = 0; col < 5; col++) {
			let isOn = ((bits & (1 << shift)) != 0);
			this.display[(5 * row) + col] = isOn;
			shift += 1;
		}
	}
	// A value the 25 LEDs cannot reproduce (a negative, or bits above 25) is
	// kept, as the colour slot keeps one: GP compiles and prints the value the
	// source gave, and its slot masks only the picture.
	this.mbValue = (this.contents() === bits) ? undefined : bits;
	this.mbUnsupplied = false;
	this.rerender();
};

// MicroBitDisplaySlotMorph copying

MicroBitDisplaySlotMorph.prototype.copyRecordingReferences = function (map) {
	// Override this to make copy of my display array so it isn't shared.
    var c = this.copy();
	c.display = this.display.slice();
    return c;
}

 // MicroBitDisplaySlotMorph replacing

MicroBitDisplaySlotMorph.prototype.isLocked = function () {
 	// I cannot be replaced by a dropped reporter.
	return true;
 };

// MicroBitDisplaySlotMorph drawing:

MicroBitDisplaySlotMorph.prototype.fixLayout = function () {
	this.bounds.setWidth(69 * this.scale);
	this.bounds.setHeight(72 * this.scale);
};

MicroBitDisplaySlotMorph.prototype.render = function (ctx) {
	var borderColor;

	ctx.fillStyle = this.color.toString();
	ctx.fillRect(
		this.edge,
		this.edge,
		this.width(),
		this.height()
	);
	let offColor = new Color(37, 43, 101);
	let onColor = new Color(229, 0, 0);
	for (let row = 0; row < 5; row++) {
		for (let col = 0; col < 5; col++) {
			let x = col * this.strideX * this.scale;
			let y = row * this.strideY * this.scale;
			let isOn = this.display[(5 * row) + col];
			ctx.fillStyle = (isOn ? onColor : offColor).toString();
			ctx.fillRect(x, y, this.ledWidth * this.scale, this.ledHeight * this.scale);
		}
	}
};

// MicroBitDisplaySlotMorph editing:

MicroBitDisplaySlotMorph.prototype.mouseClickLeft = function (pos) {
	// ignore left click event
}

MicroBitDisplaySlotMorph.prototype.mouseDownLeft = function (pos) {
	let i = this.pixelIndex(pos);
	this.paintMode = (i >= 0) ? !this.display[i] : true;
	this.mouseMove(pos);
	this.lockMouseFocus();
};

MicroBitDisplaySlotMorph.prototype.mouseMove = function (pos) {
	let i = this.pixelIndex(pos);
	if (i >= 0) {
		this.display[i] = this.paintMode;
		this.mbValue = undefined; // painted, so the LEDs are the value now
		this.rerender();
		this.scriptChanged();
	}
};

MicroBitDisplaySlotMorph.prototype.pixelIndex = function (pos) {
	// Return the display pixel index for the given pointer position or -1
	// the pointer is not over any pixel.

	let relativePoint = pos.subtract(this.topLeft()).divideBy(this.scale);
	let x = relativePoint.x;
	let y = relativePoint.y;
	if ((x < 0) || (y < 0)) return -1; // above or left of the grid
	if ((x % this.strideX) >= this.ledWidth) return -1; // between pixels
	if ((y % this.strideY) >= this.ledHeight) return -1; // between pixels

	let col = Math.trunc(x / this.strideX);
	let row = Math.trunc(y / this.strideY);
	if ((col > 4) || (row > 4)) return -1;
	return (row * 5) + col;
};
