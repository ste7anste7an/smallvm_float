/*
	mb-blocks.js

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

	prerequisites:
	--------------
	needs morphic.js

	hierarchy
	---------
	the following tree lists all constructors hierarchically,
	indentation indicating inheritance. Refer to this list to get a
	contextual overview:

	Morph (from morphic.js)
		ArrowMorph
			SlotArrowMorph
		BlockExpanderMorph
		BlockHighlightMorph
		ColorSlotPickerMorph
		ScriptsMorph
		SyntaxElementMorph
			ArgMorph
				BooleanSlotMorph
				ColorSlotMorph
				CommandSlotMorph
					CSlotMorph
				InputSlotMorph
					TextSlotMorph
				MicroBitDisplaySlotMorph
				TemplateSlotMorph
			BlockMorph
				CommandBlockMorph
					HatBlockMorph
				ReporterBlockMorph

	StringMorph (from morphic.js)
			BlockLabelMorph
			InputSlotStringMorph
			InputSlotTextMorph

	toc
	---
	the following list shows the order in which all constructors are
	defined. Use this list to locate code in this document:

	SyntaxElementMorph
	BlockLabelMorph
	BlockMorph
	CommandBlockMorph
	HatBlockMorph
	ReporterBlockMorph
	ScriptsMorph
	ArgMorph
	CommandSlotMorph
	CSlotMorph
	InputSlotMorph (mb-slots.js)
	InputSlotStringMorph (mb-slots.js)
	InputSlotTextMorph (mb-slots.js)
	BooleanSlotMorph (mb-slots.js)
	ArrowMorph (mb-slots.js)
	SlotArrowMorph (mb-slots.js)
	TextSlotMorph (mb-slots.js)
	ColorSlotMorph (mb-slots.js)
	ColorSlotPickerMorph (mb-slots.js)
	TemplateSlotMorph (mb-slots.js)
	BlockExpanderMorph
	BlockHighlightMorph
	MicroBitDisplaySlotMorph (mb-slots.js)

	structure of syntax elements
	----------------------------
	the structure of syntax elements is identical with their morphic
	tree. There are, however, accessor methods to get (only) the
	parts which are relevant for evaluation wherever appropriate.

	In Scratch/BYOB every sprite and the stage has its own "blocks bin",
	an instance of ScriptsMorph (we're going to name it differently in
	Snap, probably just "scripts").

	At the top most level blocks are assembled into stacks in ScriptsMorph
	instances. A ScriptsMorph contains nothing but blocks, therefore
	every child of a ScriptsMorph is expected to be a block.

	Each block contains:

		selector	- indicating the name of the function it triggers,

	Its arguments are first evaluated and then passed along as the
	selector is called. Arguments can be either instances of ArgMorph
	or ReporterBlockMorph. The getter method for a block's arguments is

		inputs()	- gets an array of arg morphs and/or reporter blocks

	in addition to inputs, command blocks also know their

		nextBlock()	- gets the block attached to the receiver's bottom

	and the block they're attached to - if any: Their parent.

	please also refer to the high-level comment at the beginning of each
	constructor for further details.
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

// Global stuff ////////////////////////////////////////////////////////

modules.blocks = '2025-Dec-19';

var SyntaxElementMorph;
var BlockMorph;
var BlockLabelMorph;
var CommandBlockMorph;
var ReporterBlockMorph;
var ScriptsMorph;
var ArgMorph;
var CommandSlotMorph;
var CSlotMorph;
var InputSlotMorph;
var InputSlotStringMorph;
var InputSlotTextMorph;
var BooleanSlotMorph;
var ArrowMorph;
var SlotArrowMorph;
var ColorSlotMorph;
var ColorSlotPickerMorph;
var HatBlockMorph;
var BlockExpanderMorph;
var BlockHighlightMorph;
var MicroBitDisplaySlotMorph;
var TemplateSlotMorph;
var TextSlotMorph;
var SelectionBandMorph;
var SelectedScriptsMorph;

// SyntaxElementMorph //////////////////////////////////////////////////

// I am the ancestor of all blocks and input slots

// SyntaxElementMorph inherits from Morph:

SyntaxElementMorph.prototype = new Morph();
SyntaxElementMorph.prototype.constructor = SyntaxElementMorph;
SyntaxElementMorph.uber = Morph.prototype;

// SyntaxElementMorph preferences settings:

/*
		the following settings govern the appearance of all syntax elements
		(blocks and slots) where applicable:

		outline:

				corner		- radius of command block rounding
				rounding	- radius of reporter block rounding
				edge		- width of 3D-ish shading box
				hatHeight	- additional top space for hat blocks
				hatWidth	- width of the curve on a hat block
				rfBorder	- pixel width of reification border (grey outline)

		jigsaw shape:

				inset		- distance from indentation to left edge
				dent		- width of indentation bottom

		paddings:

				cSlotPadding	- adds to the height of the open "C" in c-slots
				typeInPadding	- adds pixels between text and edge in input slots

		label:

				labelFontName		- <string> specific font family name
				labelFontStyle		- <string> generic font family name, cascaded
				fontSize			- duh
				labelWidth			- column width, used for word wrapping
				labelWordWrap		- <bool> if true labels can break after each word

		snapping:

				feedbackMinHeight	- height in screen pixels of the line for command block snaps
				minSnapDistance		- threshold when commands start snapping

		color gradients:

				contrast		- <percent int> 3D-ish shading gradient contrast
				labelContrast	- <percent int> 3D-ish label shading contrast
				activeHighlight - <Color> for stack highlighting when active
				errorHighlight	- <Color> for error highlighting
				activeBlur		- <pixels int> shadow for blurred activeHighlight
				activeBorder	- <pixels int> unblurred activeHighlight
				rfColor			- <Color> for reified outlines and slot backgrounds
*/

SyntaxElementMorph.prototype.contrast = 17;

// A block or slot lays out its parent after itself. Off only while a whole
// script is laid out from the bottom up, where that would lay out each ancestor
// once per part below it.
SyntaxElementMorph.prototype.fixesParentLayout = true;

// The height of a line of block text: 0.95 and 0.3 of the font size, each rounded
// down to half a CSS pixel at the world's zoom.
function blockTextHeight(fontSize, pixelsPerUnit = 2 * ZOOM) {
	var size = Math.round(fontSize * pixelsPerUnit);
	return (Math.floor(0.95 * size) + Math.floor(0.3 * size)) / pixelsPerUnit;
}

// Where block text's baseline sits below the top of its line: the font size in
// device pixels less a tenth of it, rounded down, as GP's browser IDE draws it.
// Morphic draws at the bottom of a line 1.2 font sizes tall, which puts the
// glyphs 2 to 3 device pixels lower than GP's at block size 100%.
function blockTextBaseline(fontSize, pixelsPerUnit = 2 * ZOOM) {
	var size = Math.round(fontSize * pixelsPerUnit);
	return (size - Math.floor(size / 10)) / pixelsPerUnit;
}

// A measured width of block text rounded to a whole device pixel at the world's
// zoom, as GP's browser IDE rounds a string's width.
function blockTextWidth(width, pixelsPerUnit = 2 * ZOOM) {
	return Math.round(width * pixelsPerUnit) / pixelsPerUnit;
}

// A rectangle grown to whole device pixels under ctx's transform, for a clip.
function clipOnDevicePixels(rect, ctx) {
	var m = ctx.getTransform(),
		x = (v, round) => (round(v * m.a + m.e) - m.e) / m.a,
		y = (v, round) => (round(v * m.d + m.f) - m.f) / m.d,
		down = (v) => Math.floor(v + 1e-6),
		up = (v) => Math.ceil(v - 1e-6);

	if (m.b || m.c) {return rect; }
	return new Point(x(rect.left(), down), y(rect.top(), down))
		.corner(new Point(x(rect.right(), up), y(rect.bottom(), up)));
}

// StringMorph's font with its size rounded to a whole device pixel at the world's
// zoom, as GP's browser IDE sets a font: 32.5 px, a slot's text at block size
// 125%, is drawn at 33. Shared by the label and the slot text morphs.
function blockTextFont() {
	var ppu = this.pixelsPerUnit || 2 * ZOOM;
	return (this.isBold ? 'bold ' : '') + (this.isItalic ? 'italic ' : '')
		+ (Math.round(this.fontSize * ppu) / ppu) + 'px '
		+ (this.fontName ? this.fontName + ', ' : '') + this.fontStyle;
}

// StringMorph's render, drawn on the baseline above. Shared by the label and the
// slot text morphs.
function renderBlockString(ctx) {
	var shadowOffset = this.shadowOffset || ZERO,
		shadowColor = this.getShadowRenderColor(),
		txt = this.isPassword ? this.password('*', this.text.length) : this.text,
		base = blockTextBaseline(this.fontSize, this.pixelsPerUnit),
		start, stop, i, p, c, x, y;

	ctx.font = this.font();
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	if (shadowColor) {
		ctx.fillStyle = shadowColor.toString();
		ctx.fillText(txt, Math.max(shadowOffset.x, 0), base + Math.max(shadowOffset.y, 0));
	}
	x = Math.abs(Math.min(shadowOffset.x, 0));
	y = Math.abs(Math.min(shadowOffset.y, 0));
	ctx.fillStyle = this.getRenderColor().toString();
	if (this.isShowingBlanks) {
		this.renderWithBlanks(ctx, x, base + y);
	} else {
		ctx.fillText(txt, x, base + y);
	}

	// the selection
	start = Math.min(this.startMark, this.endMark);
	stop = Math.max(this.startMark, this.endMark);
	for (i = start; i < stop; i += 1) {
		p = this.slotPosition(i).subtract(this.position());
		c = txt.charAt(i);
		ctx.fillStyle = this.markedBackgoundColor.toString();
		ctx.fillRect(p.x, p.y, ctx.measureText(c).width + 1 + x, this.height());
		ctx.fillStyle = this.markedTextColor.toString();
		ctx.fillText(c, p.x, base + p.y);
	}
}

// Operators drawn a little larger than other label words.
var blockMathOperators = ['=', '+', '/', '\u00D7', '\u2212', '\u2260', '<', '<=', '==', '>=', '>',
	'&', '|', '^', '~', '<<', '>>'];

// Half of n, rounded down to 1 / pixelsPerUnit. Text is centred on half a CSS
// pixel at the world's zoom; the other callers keep the half-unit grid they had.
function blockHalf(n, pixelsPerUnit = 2) {
	return Math.floor(n * pixelsPerUnit / 2) / pixelsPerUnit;
}

SyntaxElementMorph.prototype.setScale = function (num) {
	// 0.3 is the smallest size the block size preference offers, 25%: 1.5 * 25/125.
	var scale = Math.min(Math.max(num, 0.3), 25);
	this.scale = scale;
	this.corner = 4 * scale;
	this.rounding = 16 * scale;
	this.flatEdge = scale; // outline width
	this.edge = 5 * scale; // determines width of vertical part of C-shaped block
	this.inset = 5 * scale; // inset from left edge is: this.corner + (2 * this.inset)
	this.hatHeight = (80 * scale / Math.sqrt(2)) - (40 * scale);
	this.hatWidth = 80 * scale;
	this.rfBorder = 3 * scale;
	this.dent = 8 * scale;
	this.cSlotPadding = 0 * scale;
	this.typeInPadding = scale;
	// The family alone: labels are already bold. A family named 'Arial Bold' does
	// not exist on macOS, so the browser drew labels in its sans-serif instead.
	this.labelFontName = 'Arial';
	this.labelFontStyle = 'sans-serif';
	this.fontSize = 14 * scale;
	this.labelWidth = 450 * scale;
	this.labelWordWrap = true;
	this.feedbackMinHeight = 5;
	this.minSnapDistance = 20;
	this.labelContrast = 25;
	this.activeHighlight = new Color(254, 215, 34, 1);
	this.errorHighlight = new Color(173, 15, 0);
	this.activeBlur = 20;
	this.activeBorder = 4;
	this.rfColor = new Color(120, 120, 120);
};

SyntaxElementMorph.prototype.setScale(1.0);
SyntaxElementMorph.prototype.isCachingInputs = false;
SyntaxElementMorph.prototype.alpha = 1;

// SyntaxElementMorph label part specs:

SyntaxElementMorph.prototype.partInfo = function (partSpec) {
	// Return the info object for the given part spec string.
	// The partSpec may be:
	//	- a simple spec (e.g. '%num')
	//	- a menu (e.g. 'menu.menu.buttonMenu')
	//	- a string encoding a set of optional input slots and their labels

	if (partSpec.startsWith('%menu')) {
		let specParts = partSpec.split('.');
		let result = {
			type: 'input',
			menu: specParts[2]
		}
		if ('menu' == specParts[1]) result.tags = 'read-only static';
		if ('auto' == specParts[1]) result.tags = 'alphanum'; // number or text, as '%auto'
		if ('num' == specParts[1]) result.tags = 'numeric';
		return result;
	} else {
		return this.labelParts[partSpec];
	}
}

SyntaxElementMorph.prototype.labelParts = {
	/*
	Input slots
		type: input, boolean, c, text entry, color, mbDisplay, break
		tags: numeric numstring alphanum read-only static
		menu: menu selector
	*/

	// following are MicroBlocks types prefixed with %
	'%num': {
		type: 'input',
		tags: 'numeric'
	},
	'%str': {
		type: 'text entry',
	},
	'%cmt': {
		type: 'comment',
	},
	'%auto': {
		type: 'input',
		tags: 'alphanum'
	},
	'%any': { // an input with no type: it shows its default as a hint, which cannot be edited
		type: 'input',
		tags: 'read-only hint'
	},
	'%bool': {
		type: 'boolean'
	},
	'%color': {
		type: 'color'
	},
	'%var': {
		type: 'template',
		label: '\xa0' // non-breaking space, appears blank
	},
	'%cmd': {
		type: 'c',
		tags: 'static'
	},
	'%microbitDisplay': {
		type: 'mbDisplay'
	},
	'#BR#': {
		type: 'break'
	}
};

// SyntaxElementMorph instance creation:

function SyntaxElementMorph() {
	this.init();
}

SyntaxElementMorph.prototype.init = function () {
	this.cachedClr = null;
	this.cachedClrBright = null;
	this.cachedClrDark = null;
	this.cachedNormalColor = null; // for single-stepping
	this.isStatic = false; // if true, I cannot be exchanged

	SyntaxElementMorph.uber.init.call(this);

	this.defaults = [];
	this.cachedInputs = null;
	delete this.alpha;
};

// SyntaxElementMorph accessing:

SyntaxElementMorph.prototype.parts = function () {
	// answer my non-control submorphs
	var nb = null;
	if (this.nextBlock) { // if I am a CommandBlock or a HatBlock
		nb = this.nextBlock();
	}
	return this.children.filter(child =>
		(child !== nb) &&
		!(child instanceof ShadowMorph) &&
		!(child instanceof BlockHighlightMorph)
	);
};

SyntaxElementMorph.prototype.inputs = function () {
	// answer my arguments and nested reporters
	if (isNil(this.cachedInputs) || !this.isCachingInputs) {
		this.cachedInputs = this.parts().filter(part =>
			part instanceof SyntaxElementMorph
		);
	}
	// this.debugCachedInputs();
	return this.cachedInputs;
};

SyntaxElementMorph.prototype.inputValues = function () {
	return this.inputs().map(slot => slot.evaluate());
}

SyntaxElementMorph.prototype.argList = function () {
	// xxx backward compatability with GP; replace with either inputs() or inputValues()
	return this.inputs().map(slot => slot.evaluate());
}

SyntaxElementMorph.prototype.allInputs = function () {
	// answer arguments and nested reporters of all children
	return this.allChildren().slice(0).reverse().filter(child =>
		((child instanceof ArgMorph) ||
		(child instanceof ReporterBlockMorph &&
			child !== this)) &&
		!child.isPrototype && !child.parentThatIsA(BlockDefinitionMorph)
	);
};

SyntaxElementMorph.prototype.replaceInput = function (oldArg, newArg) {
	var scripts = this.parentThatIsA(ScriptsMorph),
		replacement = newArg,
		idx = this.children.indexOf(oldArg),
		i = 0;

	if (oldArg.cachedSlotSpec) {oldArg.cachedSlotSpec = null; }
	if (newArg.cachedSlotSpec) {newArg.cachedSlotSpec = null; }

	this.changed();
	if (newArg.parent) {
		newArg.parent.removeChild(newArg);
	}
	replacement.parent = this;
	this.children[idx] = replacement;
	this.fixLayout();
	this.cachedInputs = null;
};

SyntaxElementMorph.prototype.revertToDefaultInput = function (arg, noValues) {
	var deflt = this.revertToEmptyInput(arg),
		inp = this.inputs().indexOf(deflt),
		def;
	if (noValues || inp < 0) {
		return deflt;
	}
	if (this instanceof BlockMorph) {
		this.fillSlotDefault(deflt, inp);
		if (this.isCustomBlock) {
			def = this.isGlobal ? this.definition
				: this.scriptTarget().getMethod(this.blockSpec);
			if (!noValues &&
				(deflt instanceof InputSlotMorph ||
					deflt instanceof BooleanSlotMorph)
			) {
				deflt.setContents(
					def.defaultValueOfInputIdx(inp)
				);
			}
		}
	}
	if (!isNil(this.defaults[inp])) {
		deflt.setContents(this.defaults[inp]);
	}
	return deflt;
};

SyntaxElementMorph.prototype.revertToEmptyInput = function (arg) {
	var idx = this.parts().indexOf(arg),
		inp = this.inputs().indexOf(arg),
		deflt = new InputSlotMorph(),
		rcvr, def;

	if (idx !== -1) {
		if (this instanceof BlockMorph) {
			deflt = this.labelPart(this.slotSpecForInput(inp) || '%auto');
			if (this.isCustomBlock) {
				if (this.isGlobal) {
					def = this.definition;
				} else {
					rcvr = this.scriptTarget(true);
					if (rcvr) {
						def = rcvr.getMethod(this.blockSpec);
					}
				}
				if (def) {
					if (deflt instanceof ArgMorph &&
						!(deflt instanceof TemplateSlotMorph)) {
						deflt.isStatic = def.isIrreplaceableInputIdx(inp);
						deflt.canBeEmpty = !deflt.isStatic;
					}
					if (deflt instanceof InputSlotMorph) {
						deflt.setChoices.apply(
							deflt,
							def.inputOptionsOfIdx(inp)
						);
					}
				}
			}
		}
	}
	if (deflt.icon || deflt instanceof BooleanSlotMorph) {
		deflt.fixLayout();
	}
	this.replaceInput(arg, deflt);
	this.cachedInputs = null;
	return deflt;
};

SyntaxElementMorph.prototype.isLocked = function () {
	// answer true if I cannot be exchanged by a dropped reporter
	return false;
};

// SyntaxElementMorph enumerating:

SyntaxElementMorph.prototype.topBlock = function () {
	if (this.parent && this.parent.topBlock) {
		return this.parent.topBlock();
	}
	return this;
};

// SyntaxElementMorph reachable variables

SyntaxElementMorph.prototype.allVarsMenu = function () {
	var block = this.parentThatIsA(BlockMorph),
		rcvr,
		tempVars = [],
		dict;

	if (!block) {
		return {};
	}
	rcvr = block.scriptTarget();
	block.allParents().forEach(morph => {
		var proto;
		if (morph instanceof BlockEditorMorph) {
			proto = morph.body.contents.children.find(child =>
				child instanceof PrototypeHatBlockMorph);
			if (proto) {
				morph = proto;
			}
		}
		if (morph instanceof PrototypeHatBlockMorph) {
			tempVars.push.apply(
				tempVars,
				morph.variableNames()
			);
			tempVars.push.apply(
				tempVars,
				morph.inputs()[0].inputFragmentNames()
			);
		} else if (morph instanceof BlockMorph) {
			morph.inputs().forEach(child => {
				if (child instanceof TemplateSlotMorph) {
					tempVars.push(child.contents());
				}
			});
		}
	});
	if (rcvr) {
		dict = rcvr.variables.allNamesDict();
		tempVars.forEach(name =>
			dict[name] = name
		);
		if (block.selector === 'doSetVar') {
			// add settable object attributes
			dict['~'] = null;
			dict.my = [{// wrap the submenu into a 1-item array to translate it
				'anchor' : ['my anchor'],
				'parent' : ['my parent'],
				'name' : ['my name'],
				'temporary?' : ['my temporary?'],
				'dangling?' : ['my dangling?'],
				'draggable?' : ['my draggable?'],
				'rotation style' : ['my rotation style'],
				'rotation x' : ['my rotation x'],
				'rotation y' : ['my rotation y']
			}];
			if (this.world().currentKey === 16) { // shift
				dict.my[0]['~'] = null; // don't forget we're inside an array...
				dict.my[0]['microphone modifier'] = ['microphone modifier'];
			}
		}
		return dict;
	}
	return {};
};

// SyntaxElementMorph drag & drop:

SyntaxElementMorph.prototype.reactToGrabOf = function (grabbedMorph) {
	var topBlock = this.topBlock(),
		affected;
	if (grabbedMorph instanceof CommandBlockMorph) {
		affected = this.parentThatIsA(CommandSlotMorph);
		if (affected) {
			affected.fixLayout();
		}
	}
	if (topBlock) {
		if (topBlock.getHighlight()) {
			topBlock.addHighlight(topBlock.removeHighlight());
		}
	}
};

// SyntaxElementMorph 3D - border color rendering:

SyntaxElementMorph.prototype.bright = function () {
	return this.color.lighter(this.contrast).toString();
};

SyntaxElementMorph.prototype.dark = function () {
	return this.color.darker(this.contrast).toString();
};

// SyntaxElementMorph editing:

SyntaxElementMorph.prototype.scriptChanged = function () {
	// Tell the editor a script in its scripting pane changed, as GP's blocks raise scriptChanged.
	if (this.parentThatIsA(ScriptsMorph)) MB_editor.scriptChanged();
};

// SyntaxElementMorph color changing:

SyntaxElementMorph.prototype.setColor = function (aColor) {
	var block;
	if (aColor) {
		if (!this.color.eq(aColor)) {
			block = this.parentThatIsA(BlockMorph);
			this.color = aColor;
			this.children.forEach(morph => {
				if (block && morph instanceof StringMorph) {
					morph.shadowColor = block.color.darker(
						block.labelContrast
					);
					morph.rerender();
				} else if (morph instanceof CommandSlotMorph) {
					morph.setColor(aColor);
				}
			});
			if (block) {block.fixLabelColor(); }
			this.rerender();
		}
	}
};

SyntaxElementMorph.prototype.setLabelColor = function (
	textColor,
	shadowColor,
	shadowOffset
) {
	// a comment's pale block takes dark gray where other blocks take white
	if (('comment' === this.selector) && WHITE.eq(textColor)) textColor = new Color(80, 80, 80);
	this.children.forEach(morph => {
		if (morph instanceof StringMorph) {
			morph.shadowOffset = shadowOffset || morph.shadowOffset;
			morph.shadowColor = shadowColor || morph.shadowColor;
			morph.setColor(textColor);
		}
	});
};

SyntaxElementMorph.prototype.flash = function (aColor) {
	if (!this.cachedNormalColor) {
		this.cachedNormalColor = this.color;
		this.setColor(aColor || this.activeHighlight);
	}
};

SyntaxElementMorph.prototype.unflash = function () {
	if (this.cachedNormalColor) {
		var clr = this.cachedNormalColor;
		this.cachedNormalColor = null;
		this.setColor(clr);
	}
};

SyntaxElementMorph.prototype.doWithAlpha = function (alpha, callback) {
	var current = SyntaxElementMorph.prototype.alpha,
		result;
	SyntaxElementMorph.prototype.alpha = alpha;
	result = callback();
	SyntaxElementMorph.prototype.alpha = current;
	return result;
};

// SyntaxElementMorph zebra coloring

SyntaxElementMorph.prototype.fixBlockColor = function (
	nearestBlock,
	isForced
) {
	this.children.forEach(morph => {
		if (morph instanceof SyntaxElementMorph) {
			morph.fixBlockColor(nearestBlock, isForced);
		}
	});
};

// SyntaxElementMorph label parts:

SyntaxElementMorph.prototype.labelPart = function (spec) {
	var info = this.partInfo(spec),
		part, tokens, cnts, i;
	if (((info && Object.hasOwn(info, 'type')) || (spec[0] === '%' && spec.length > 1)) &&
		(this.selector !== 'v')
	) {
		// look up the spec
		if (!info || !Object.hasOwn(info, 'type')) {
			throw new Error('label part spec not found: "' + spec + '"');
		}

		// create the morph
		switch (info.type) {
			case 'input':
				part = new InputSlotMorph(null, null, info.menu);
				break;
			case 'text entry':
				part = new TextSlotMorph();
				break;
			case 'comment':
				part = new TextSlotMorph();
				part.isComment = true;
				break;
			case 'slot':
				part = new ArgMorph(info.kind);
				break;
			case 'boolean':
				part = new BooleanSlotMorph();
				break;
			case 'c':
				part = new CSlotMorph();
				break;
			case 'command slot':
				part = new CommandSlotMorph();
				break;
			case 'template':
				part = new TemplateSlotMorph(info.label);
				break;
			case 'color':
				part = new ColorSlotMorph();
				break;
			case 'mbDisplay':
				part = new MicroBitDisplaySlotMorph();
				break;
			case 'break':
				part = new Morph();
				part.setExtent(ZERO);
				part.isBlockLabelBreak = true;
				part.getSpec = () => '#BR#';
				break;
			case 'variable':
				part = new TemplateSlotMorph(info.label);
				part = new ReporterBlockMorph();
				part.category = 'Variables';
				part.color = SpriteMorph.prototype.blockColor.variables;
				part.setSpec(localized('Input name'));
				break;
			default:
				throw new Error('unknown label part type: "' + info.type + '"');
		}

		// apply the tags
		// ---------------
		// input: numeric, numstring, alphanum, read-only, static, hint
		// text entry: monospace
		// boolean: static
		// symbol: static
		// c: static
		// command slot: (none)
		// template: (none)
		// color: static
		// break: (none)
		// variable: (none)

		if (info.tags) {
			info.tags.split(' ').forEach(tag => {
				if (tag) {
					switch (tag) {
						case 'numeric':
							part.isNumeric = true;
							break;
						case 'alphanum':
							part.isNumeric = true;
							part.isAlphanumeric = true;
							break;
						case 'numstring':
							part.isNumeric = true;
							break;
						case 'read-only':
							part.isReadOnly = true;
							break;
						case 'static':
							part.isStatic = true;
							break;
						case 'hint':
							part.isHint = true;
							break;
						case 'monospace':
							part.contents().fontName = 'monospace';
							part.contents().fontStyle = 'monospace';
							break;
						default:
							throw new Error(
								'unknown label part tag: "' + tag + '"'
							);
					}
				}
			});
			part.fixLayout();
		}
	} else if (spec.startsWith('#SVG#')) {
		part = new BlockIconMorph(spec, this.fontSize, WHITE);
	} else {
		part = new BlockLabelMorph(
			spec.replaceAll(MB_Specs.labelColon, ':'), // text
			this.fontSize + (blockMathOperators.includes(spec) ? 2 * this.scale : 0), // fontSize
			this.labelFontStyle, // fontStyle
			true, // bold
			false, // italic
			false, // isNumeric
			ZERO, // shadowOffset
			this.color.darker(this.labelContrast), // shadowColor
			WHITE, // color
			this.labelFontName // fontName
		);
	}
	return part;
};

// SyntaxElementMorph layout:

SyntaxElementMorph.prototype.fixLayout = function () {
	var nb,
		parts = this.parts(),
		pos = this.position(),
		x = 0,
		y,
		lineHeight = 0,
		blockWidth = 0,
		blockHeight,
		l = [],
		lines = [],
		// a spec with a #BR# breaks lines only there and at C-slots
		explicitBreaks = (this.blockSpec || '').includes('#BR#'),
		// without a #BR#, these blocks start their inputs on a new line, and no line
		// holds more than six inputs (five for ten NeoPixel colours)
		breakBeforeInput = ['[display:mbDisplay]', 'setNeoPixelColors10'].includes(this.selector),
		maxInputsPerLine = ('setNeoPixelColors10' == this.selector) ? 5 : 6,
		lineInputs = 0,
		scale = this.scale,
		space = this.isPrototype ? 1 : 6 * scale,
		vSpace = 3 * scale,
		left = this.left() + (3 * scale),
		indent = (this instanceof HatBlockMorph) ? 7 * scale
			: (this instanceof ReporterBlockMorph) ? 6 * scale : 8 * scale,
		lineHeights = [],
		// the hat's rise, in whole device pixels at the current zoom
		hatHeight = blockHalf(2 * this.hatHeight, this.pixelsPerUnit || 2 * ZOOM),
		lastPart = null,
		drawer = null;

	if (this.nextBlock) {
		nb = this.nextBlock();
	}

	// determine lines
	parts.forEach(part => {
		if (part instanceof CSlotMorph) {
			if (l.length > 0) {
				lines.push(l);
				lines.push([part]);
				l = [];
				x = 0;
			} else {
				lines.push([part]);
			}
		} else {
			if (part.isVisible) {
				x += part.fullBounds().width() + space;
			}
			let isInput = part instanceof SyntaxElementMorph,
				lineIsFull = isInput && ('if' != this.selector) && (lineInputs >= maxInputsPerLine);
			if (part.isBlockLabelBreak || (!explicitBreaks &&
				((x > this.labelWidth) || (isInput && breakBeforeInput) || lineIsFull))
			) {
				if (l.length > 0) {
					lines.push(l);
					l = [];
					x = part.fullBounds().width() + space;
					lineInputs = 0;
				}
			}
			if (isInput) {
				breakBeforeInput = false;
				lineInputs += 1;
			}
			l.push(part);
			if (part.isBlockLabelBreak) {
				x = 0;
			}
		}
	});
	if (l.length > 0) {
		lines.push(l);
	}

	// distribute parts on lines, each line centred on its tallest part
	y = this.top() + (3 * scale);
	if (this instanceof HatBlockMorph) {
		y += hatHeight;
	}
	lines.forEach((line, i) => {
		x = left + indent;
		lineHeight = (i === 0) ? 21 * scale : 0;
		line.forEach(part => {
			if (part instanceof CSlotMorph) {
				part.setColor(this.color);
				part.setPosition(new Point(this.left() + (9 * scale), y));
				lineHeight = part.height();
				blockWidth = Math.max(blockWidth, 56 * scale);
			} else {
				part.setPosition(new Point(x, y));
				if (!part.isBlockLabelBreak && part.isVisible) {
					x += part.fullBounds().width() + space;
					blockWidth = Math.max(blockWidth, part.fullBounds().right() - left);
					lineHeight = Math.max(lineHeight, part.height(), part.isElseLine ? 18 * scale : 0);
				}
				if (part instanceof BlockExpanderMorph) drawer = part;
			}
			if (part.isVisible && !part.isBlockLabelBreak && part !== drawer) lastPart = part;
		});
		line.forEach(part => {
			var span = lineHeight + scale;
			// the "else" label sits at the top of the 18 unit slot it replaces, and the slot is what is centred
			var partHeight = part.isElseLine ? 18 * scale : part.height();
			if (partHeight <= span) {
				part.moveBy(new Point(0, blockHalf(span - partHeight, this.pixelsPerUnit || 2 * ZOOM)));
			}
		});
		lineHeights.push(lineHeight);
		y += lineHeight + vSpace;
	});

	// determine my height
	blockHeight = lineHeights.reduce((a, b) => a + b, 0) + (lines.length * vSpace);
	if (lastPart instanceof CSlotMorph) {
		if (drawer) {
			blockHeight -= 6 * scale;
			drawer.moveBy(new Point(-2 * scale, -5 * scale));
		} else {
			blockHeight += 7 * scale;
		}
	}
	if (this instanceof HatBlockMorph) {
		blockHeight += (7 * scale) + hatHeight;
	} else if (this instanceof CommandBlockMorph) {
		blockHeight += 7 * scale;
	} else {
		blockHeight += 4 * scale;
	}

	// determine my width
	if (this instanceof ReporterBlockMorph) {
		blockWidth = Math.max(20 * scale, blockWidth - (4 * scale) + indent + (11 * scale));
	} else {
		blockWidth = Math.max((this instanceof HatBlockMorph) ? 100 * scale : 50 * scale,
			blockWidth + (2 * scale) + indent + (3 * scale));
	}

	// set my extent (silently, because we'll redraw later anyway):
	this.bounds.setWidth(blockWidth);
	this.bounds.setHeight(blockHeight);

	if (this.fixLayoutRTL && isRTL()) {
		this.fixLayoutRTL();
	}

	// adjust CSlots and collect holes
	this.holes = [];
	parts.forEach(part => {
		if (part instanceof CSlotMorph ||
			(part.slotSpec && part.slotSpec.includes('%cmd'))
		) {
			// end the slot at my right edge (it starts 9 units in, so my width less
			// that offset), or it catches clicks beside my arms where nothing is drawn
			part.bounds.setWidth(blockWidth - (part.left() - this.left()));
		}
		part.fixHolesLayout();
		this.holes.push.apply(
			this.holes,
			part.holes.map( hole =>
				hole.translateBy(part.position().subtract(pos))
			)
		);
	});

	// position next block:
	if (nb) {
		nb.setPosition(
			new Point(
				this.left(),
				this.bottom() - (this.corner)
			)
		);
	}

	// find out if one of my parents needs to be fixed
	if (this instanceof BlockMorph && this.parent && this.parent.fixLayout) {
		if (this.fixesParentLayout) {
			this.parent.fixLayout();
			this.parent.changed();
		}
		// The top block redraws the script's highlight once the script is laid out.
		if (this.parent instanceof SyntaxElementMorph) {
			return;
		}
	}

	this.fixHighlight();
};

SyntaxElementMorph.prototype.fixHighlight = function () {
	var top = this.topBlock();
	if (top.getHighlight && top.getHighlight()) {
		top.addHighlight(top.removeHighlight());
	}
};

// SyntaxElementMorph drawing:

SyntaxElementMorph.prototype.clipBounds = function () {
	// The area my render may paint; some parts reach past their bounds.
	return this.bounds;
};

SyntaxElementMorph.prototype.drawOn = function (ctx, rect) {
	// As Morph's drawOn, but the clip is grown to whole device pixels: the render
	// already blends an edge that falls part way across one, and a clip there
	// would blend it a second time.
	var clipped = rect.intersect(this.clipBounds()),
		pos = this.position();

	if (this.isCachingImage) {return Morph.prototype.drawOn.call(this, ctx, rect); }
	if (!clipped.extent().gt(ZERO)) {return; }
	clipped = clipOnDevicePixels(clipped, ctx);
	ctx.save();
	ctx.globalAlpha = this.alpha;
	ctx.beginPath();
	ctx.rect(clipped.left(), clipped.top(), clipped.width(), clipped.height());
	ctx.clip();
	ctx.translate(pos.x, pos.y);
	this.render(ctx);
	ctx.restore();
};

// SyntaxElementMorph evaluating:

SyntaxElementMorph.prototype.evaluate = function () {
	// responsibility of my children, default is to answer null
	return null;
};

// BlockLabelMorph ///////////////////////////////////////////////

/*
		I am a piece of single-line text written on a block. I serve as a
		container for sharing typographic attributes among my instances
*/

// BlockLabelMorph inherits from StringMorph:

BlockLabelMorph.prototype = new StringMorph();
BlockLabelMorph.prototype.constructor = BlockLabelMorph;
BlockLabelMorph.uber = StringMorph.prototype;

function BlockLabelMorph(
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

BlockLabelMorph.prototype.fixLayout = function (justMe) {
	BlockLabelMorph.uber.fixLayout.call(this, true);
	this.bounds.setWidth(blockTextWidth(this.width(), this.pixelsPerUnit));
	this.bounds.setHeight(blockTextHeight(this.fontSize, this.pixelsPerUnit));
	if (!justMe && this.parent && this.parent.fixLayout) this.parent.fixLayout();
};

BlockLabelMorph.prototype.render = renderBlockString;
BlockLabelMorph.prototype.font = blockTextFont;

BlockLabelMorph.prototype.getRenderColor = function () {
	var block = this.parentThatIsA(BlockMorph);
	return !block || block.alpha > 0.5 ? this.color
		: block.color.solid().lighter(Math.max(block.alpha * 200, 0.1));

};

BlockLabelMorph.prototype.getShadowRenderColor = function () {
	var block = this.parentThatIsA(BlockMorph);
	return (block && block.alpha > 0.5) ?
		this.shadowColor
		: CLEAR;
};

// BlockIconMorph //////////////////////////////////////////////////////

/*
	I am an icon in a block's label, written '#SVG#name' in a spec, or
	'#SVG#name#rrggbb' for a fixed colour. I draw img/name.svg in my colour.
*/

BlockIconMorph.prototype = new BlockLabelMorph();
BlockIconMorph.prototype.constructor = BlockIconMorph;
BlockIconMorph.uber = BlockLabelMorph.prototype;

BlockIconMorph.images = new Map(); // icon name -> Image, loaded once per page
BlockIconMorph.waiting = new Map(); // icon name -> the icons to lay out when it loads

function BlockIconMorph(spec, fontSize, color) {
	this.init(spec, fontSize, null, true, false, false, ZERO, null, color);
	const [name, hex] = spec.slice(5).split('#');
	this.iconColor = hex ? new Color(
		parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)
	) : null;
	this.image = this.iconImage(name);
	this.fixLayout(true);
}

BlockIconMorph.prototype.iconImage = function (name) {
	if (typeof Image === 'undefined') return null; // no page to load it from
	let img = BlockIconMorph.images.get(name);
	if (!img) {
		// Read as text: an image needs the svg namespace, which some icon files leave out.
		img = new Image();
		img.onload = () => {
			BlockIconMorph.waiting.get(name).forEach((icon) => { icon.fixLayout(); icon.rerender(); });
			BlockIconMorph.waiting.delete(name);
		};
		BlockIconMorph.images.set(name, img);
		BlockIconMorph.waiting.set(name, []);
		fetch('img/' + name + '.svg').then((response) => response.text()).then((svg) => {
			if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
			img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
		}).catch(() => {}); // a missing icon leaves a blank space
	}
	if (BlockIconMorph.waiting.has(name)) BlockIconMorph.waiting.get(name).push(this);
	return img;
};

BlockIconMorph.prototype.fixLayout = function (justMe) {
	// The icon's own size at my scale; a label's fontSize is 14 at scale 1.
	const img = this.image, scale = this.fontSize / 14;
	const w = (img && img.naturalWidth) || 14, h = (img && img.naturalHeight) || 14;
	this.bounds.corner = this.bounds.origin.add(new Point(Math.round(w * scale), Math.round(h * scale)));
	if (!justMe && this.parent && this.parent.fixLayout) this.parent.fixLayout();
};

BlockIconMorph.prototype.render = function (ctx) {
	// The icon's shape filled with my colour, as text is. It is tinted on a
	// canvas of its own because ctx also holds the block drawn under it.
	if (!this.image || !this.image.naturalWidth) return;
	const ratio = window.devicePixelRatio || 1, w = this.width(), h = this.height();
	const tinted = document.createElement('canvas');
	tinted.width = Math.ceil(w * ratio);
	tinted.height = Math.ceil(h * ratio);
	const tctx = tinted.getContext('2d');
	tctx.drawImage(this.image, 0, 0, tinted.width, tinted.height);
	tctx.globalCompositeOperation = 'source-in';
	tctx.fillStyle = (this.iconColor || this.getRenderColor()).toString();
	tctx.fillRect(0, 0, tinted.width, tinted.height);
	ctx.drawImage(tinted, 0, 0, w, h);
};

// BlockMorph //////////////////////////////////////////////////////////

/*
		I am an abstraction of all blocks (commands, reporters, hats).

		Aside from the visual settings inherited from Morph and
		SyntaxElementMorph my most important attributes and public
		accessors are:

		selector		- (string) name of method to be triggered
		scriptTarget()	- answer the object (sprite) to which I apply
		inputs()		- answer an array with my arg slots and nested reporters
		defaults		- an optional Array containing default input values
		topBlock()		- answer the top block of the stack I'm attached to
		blockSpec		- a formalized description of my label parts
		setSpec()		- force me to change my label structure
		evaluate()		- answer the result of my evaluation

		Zebra coloring provides a mechanism to alternate brightness of nested,
		same colored blocks (of the same category). The deviation of alternating
		brightness is set in the preferences setting:

		zebraContrast - <number> percentage of brightness deviation

		attribute. If the attribute is set to zero, zebra coloring is turned
		off. If it is a positive number, nested blocks will be colored in
		a brighter shade of the same hue and the label color (for texts)
		alternates between white and black. If the attribute is set to a negative
		number, nested blocks are colored in a darker shade of the same hue
		with no alternating label colors.

		blockSpec is a formatted string consisting of plain words and
		reserved words starting with the percent character (%), which
		represent the following pre-defined input slots and/or label
		features:

		arity: single

		%str	- white rectangular type-in slot (multi-line string)
		%cmt	- like %str, with square corners (comment)
		%num	- white roundish type-in slot (number)
		%auto	- white roundish type-in slot (number or string)
		%cmd	- C-shaped, auto-reifying, accepts reporter drops
		%var	- inline variable reporter template
		#BR#	- user-forced line break
		%color	- interactive color slot
		%mbdisplay	- editor for 5x5 LED display

		examples:
			'if %bool %cmd else %cmd'
			'set pen color to %color'
*/

// BlockMorph inherits from SyntaxElementMorph:

BlockMorph.prototype = new SyntaxElementMorph();
BlockMorph.prototype.constructor = BlockMorph;
BlockMorph.uber = SyntaxElementMorph.prototype;

BlockMorph.prototype.colorFor = function (category) {
	// A comment has its own colour, whatever its palette category.
	if ('comment' === this.selector) return new Color(242, 238, 191);
	let result = {
		Output : new Color(72, 82, 191),
		Input : new Color(159, 66, 165),
		Pins : new Color(84, 135, 153),
		Comm : new Color(30, 153, 122),
		Control : new Color(209, 140, 37),
		Operators : new Color(71, 157, 29),
		Variables : new Color(211, 115, 42),
		Data : new Color(196, 78, 107),
		Advanced : new Color(178, 116, 53),
		'My Blocks' : new Color(26, 140, 221),
		Library : new Color(30, 153, 122),
		Obsolete : new Color(196, 15, 0),
		Definition : new Color(140, 0, 140),
	}[category];
	if (result === undefined) {
		result = new Color(37, 145, 221);
	}
	return result;
};

// BlockMorph chunk type

BlockMorph.prototype.chunkType = function () {
	if (this instanceof HatBlockMorph) {
		switch (this.selector) {
		case 'whenStarted': return 4;
		case 'whenCondition': return 5;
		case 'whenBroadcastReceived': return 6;
		case 'whenButtonPressed':
			let button = this.inputs()[0].evaluate();
			if ('A' == button) return 7;
			if ('B' == button) return 8;
			return 9; // A+B
		}
	}
	// other chunkTypes: 0 = unused, 3 = function
	return (this instanceof ReporterBlockMorph) ? 1 : 2;
}

// BlockMorph preferences settings:

BlockMorph.prototype.isCachingInputs = true;
BlockMorph.prototype.zebraContrast = 17; // alternating color brightness

// BlockMorph sound feedback:

BlockMorph.prototype.snapSound = null;

// BlockMorph instance creation:

function BlockMorph() {
	this.init();
}

BlockMorph.prototype.init = function () {
	this.selector = null; // name of method to be triggered
	this.blockSpec = ''; // formal description of label and arguments

	// not to be persisted:
	this.expander = null;
	this.category = null; // for zebra coloring (non persistent)
	this.afterglow = 0; // frame count-down for displaying the "active" halo

	BlockMorph.uber.init.call(this);
	this.color = new Color(102, 102, 102);
	this.cachedInputs = null;
};

BlockMorph.prototype.toString = function () {
	return 'a ' +
		(this.constructor.name ||
			this.constructor.toString().split(' ')[1].split('(')[0]) +
		' ("' +
		this.blockSpec.slice(0, 30) + '...")';
};

// BlockMorph utilities

BlockMorph.prototype.isFunctionDefinition = function () { return false; };

BlockMorph.prototype.allBlocks = function () {
	let result = [];
	this.forAllBlocks( b => { result.push(b); });
	return result;
}

BlockMorph.prototype.forAllBlocks = function (func) {
	// Call the given function on all command and reporter blocks in this script,
	// in GP's allBlocks order: each block, then its inputs left to right, then
	// the next block. The inputs are pushed last to first so they pop in order.

	let todo = [this];
	while (todo.length > 0) {
		let b = todo.pop();
		func(b);
		if (b instanceof CommandBlockMorph) {
			if (b.nextBlock()) todo.push(b.nextBlock());
		}
		for (const arg of b.inputs().slice().reverse()) {
			if (arg instanceof BlockMorph) {
				todo.push(arg);
			} else if (arg instanceof CommandSlotMorph && arg.nestedBlock()) {
				todo.push(arg.nestedBlock()); // the body of an if/repeat/forever/for
			}
		}
	}
}

BlockMorph.prototype.calls = function (functionName) {
	// Return true if this block or script includes a call to the given function or primitive.

	this.forAllBlocks( b => {
		if (b.selector == functionName) return true;
	});
	return false;
}

BlockMorph.prototype.usesVar = function (varName) {
	// Return true if this block or script uses the given variable (reads or modifies).

	this.forAllBlocks( b => {
		let sel = b.selector;
		if (('v' == sel) || ('=' == sel) || ('+=' == sel)) {
			if (varName == b.inputs()[0]) return true;
		}
	});
	return false;
}

BlockMorph.prototype.modifiesVar = function (varName) {
	// Return true if this block or script modifies the given variable.

	this.forAllBlocks( b => {
		let sel = b.selector;
		if (('=' == sel) || ('+=' == sel)) {
			if (varName == b.inputs()[0]) return true;
		}
	});
	return false;
}

// BlockMorph spec:

BlockMorph.prototype.parseSpec = function (spec) {
	var result = [],
		words,
		word = '';

	words = isString(spec) ? spec.split(' ') : [];
	if (words.length === 0) {
		words = [spec];
	}
	if (this.labelWordWrap) {
		return words;
	}

	function addWord(w) {
		if ((w[0] === '%') && (w.length > 1)) {
			if (word !== '') {
				result.push(word);
				word = '';
			}
			result.push(w);
		} else {
			if (word !== '') {
				word += ' ' + w;
			} else {
				word = w;
			}
		}
	}

	words.forEach(each => addWord(each));
	if (word !== '') {
		result.push(word);
	}
	return result;
};

BlockMorph.prototype.setSpec = function (spec, definition) {
	var part,
		inputIdx = -1;

	if (!spec) {return; }

	// a variable reporter's label is the variable's name, kept exactly as written
	if (this.selector !== 'v') spec = this.localizedBlockSpec(spec);
	this.parts().forEach(part =>
		part.destroy()
	);
	if (this.isPrototype) {
		this.add(this.placeHolder());
	}

	for (let word of this.parseSpec(spec)) {
 		if (':' == word) break; // stop at start of optional arguments

		if (word[0] === '%') {
			inputIdx += 1;
		}
		part = this.labelPart(word);
		if (isNil(part)) {
			// console.log('could not create label part', word);
			return;
		}
		this.add(part);
		if (!(part instanceof CommandSlotMorph ||
			part instanceof StringMorph)) {
			part.fixLayout();
			part.rerender();
		}
		if (part.constructor === CommandSlotMorph) {
			part.fixLayout();
		}
		if (this.isPrototype) {
			this.add(this.placeHolder());
		}
		if (this.isCustomBlock) {
			if (part instanceof InputSlotMorph) {
				part.setChoices.apply(
					part,
					(definition || this.definition).inputOptionsOfIdx(inputIdx)
				);
			}
			if (part instanceof ArgMorph &&
				!(part instanceof TemplateSlotMorph)) {
				part.isStatic = (definition
					|| this.definition).isIrreplaceableInputIdx(inputIdx);
				part.canBeEmpty = !part.isStatic;
			}
		}
	}
	this.blockSpec = spec;
	this.cachedInputs = null;
	if (this.blockSpec.includes(':')) this.addExpander();
	this.fixLayout();
	this.rerender();
};

BlockMorph.prototype.userSetSpec = function (spec) {
	var tb = this.topBlock();
	tb.fullChanged();
	this.setSpec(spec);
	tb.fullChanged();
};

BlockMorph.prototype.buildSpec = function () {
	// create my blockSpec from my parts - for demo purposes only
	this.blockSpec = '';
	this.parts().forEach(part => {
		if (part instanceof StringMorph) {
			this.blockSpec += part.text;
		} else if (part instanceof ArgMorph) {
			this.blockSpec += part.getSpec();
		} else if (part.isBlockLabelBreak) {
			this.blockSpec += part.getSpec();
		} else {
			this.blockSpec += '[undefined]';
		}
		this.blockSpec += ' ';
	});
	this.blockSpec = this.blockSpec.trim();
};

BlockMorph.prototype.localizedSpecSection = function (section) {
	// Answer the translated block spec section. A section is a set of labels
	// and input slots separated from other sections by colons. Each secton is
	// translated separately. The input and output are Snap! style specs with
	// input slot descriptors starting with %. Those Snap! slot descriptors are
	// replaced by GP-style underscores before translation, then converted
	// back to Snap! style descriptors in the translated result.

	let slotDescriptors = [];
	let abstractSpec = this.parseSpec(section).map(str => {
		if (str.length > 1 && ('%' == str[0])) {
			slotDescriptors.push(str); // record the slot descriptors
			return '_';
		}
		return str;
	}).join(' ');

	// a translation with a different number of slots would lose input values
	let translated = localized(abstractSpec);
	if (translated.split('_').length != abstractSpec.split('_').length) return section;

	// remove any Snap! style slot descripters from the translation
	let translation = this.parseSpec(translated).map(str =>
		(str.length > 1 && ('%' == str[0])) ? '_' : str
	).join(' ');

	// replace abstract slot placeholders in the translation with their
	// slot descriptors from the original block spec
	let slotCount = -1;
	return translation.split(' ').map(word => {
		if (word === '_') {
			slotCount += 1;
			return slotDescriptors[slotCount] || '';
		}
		return word;
	}).join(' ');
};

BlockMorph.prototype.localizedBlockSpec = function (spec) {
	// Answer a translated block spec. Both input and output strings are
	// Snap! style specs with input slot descriptors starting with %.
	// The spec is split into sections and each section is translated
	// separately since each spec section has a separate section in the
	// the translation dictionary.

	// a colon in a translation is part of its label
	return spec.split(':').map(section => {
		return this.localizedSpecSection(section.trim()).replaceAll(':', MB_Specs.labelColon);
	}).join(' : ');
};

// BlockMorph menu:

BlockMorph.prototype.userMenu = function () {
	// Obsolete - Old BlockMorph shift-right-click menu used for testing.
	var menu = new MenuMorph(this),
		shiftClicked = this.world().currentKey === 16;

	if (!shiftClicked && (typeof Menus !== 'undefined')) {
		if (MB_editor.scripts.hasSelection()) {
			// a prototype answers for its definition, as its hat does
			return MB_editor.scripts.selectionMenu(this.isFunctionDefinition() || !!this.isPrototype);
		}
		return this.chromeMenu(); // shift-right-click keeps this Morphic menu
	}

	menu.addItem(
		'copy to clipboard',
		() => this.copyToClipboard(),
		'copy this script to the clipboard'
	);
	menu.addItem(
		'print code',
		() => { console.log(this.codeString(0, [])); },
		'log the code string for this script to the console'
	);
	menu.addItem(
		'compile test',
		() => {
			// Compiled against the editor's project and code manager, as chunkBytesFor
			// is, so globals and calls to user functions resolve. Both logs take the top
			// block, so a click anywhere in a stack shows the whole stack.
			const compiler = new MB_Compiler(MB_editor.project, MB_editor.codeManager);
			const top = this.topBlock();
			console.log(compiler.showInstructions(top));
			console.log(compiler.compiledBytesFor(top));
		},
		'test the microblocks compiler'
	);
	menu.addItem(
		'log',
		() => { let tmp = this; console.log(this); },
		'log this script to the console'
	);
	menu.addItem(
		'duplicate',
		() => { this.fullCopy().pickUp(world); },
		'make a copy\nand pick it up'
	);
	menu.addItem(
		'delete',
		() => { this.scriptChanged(); this.destroy(); },
		'delete this morph'
	);
	menu.addLine();
	menu.addItem('save picture of all scripts', () => { MB_editor.saveScriptsImage() });

	menu.addLine();
	menu.addItem(
		'run/stop',
		() => { MB_editor.toggleRunning(this.topBlock()); },
		'run or stop this script'
	);

	return menu;
};

BlockMorph.prototype.isCallable = function () {
	// A "call" block can name a function of the project or a [lib:name] primitive.
	var name = this.selector || '';
	return !!MB_editor.project.functionNamed(name) || (name.startsWith('[') && name.endsWith(']'));
};

BlockMorph.prototype.showDevView = function (view) {
	// Open a window showing this block's instructions, compiled bytes or call tree.
	// Inside a definition, that is the function's.
	var top = this.topBlock(),
		compiler = new MB_Compiler(MB_editor.project, MB_editor.codeManager),
		text = compiler[view](top.isFunctionDefinition() ? top.functionDefinition : this),
		win = {
			showInstructions: {title: 'Instructions', width: 400},
			showCompiledBytes: {title: 'Instruction Bytes', width: 220},
			showCallTree: {title: 'Call Tree', width: 400},
		}[view];

	if (text === null) return;
	var ws = FloatingWindow.workspace(win.title, text);
	// FloatingWindow.workspace opens at its 240 minimum; resize to this view's width
	// and recentre, keeping the height it opened with.
	ws.minWidth = Math.min(ws.minWidth, win.width);
	ws.style.minWidth = ws.minWidth + 'px';
	ws.x = Math.max(0, ws.x + (ws.width - win.width) / 2);
	ws.style.left = ws.x + 'px';
	ws.setSize(win.width, ws.height, true);
};

BlockMorph.prototype.isObsolete = function () {
	// A library update keeps the spec of a block it dropped, labelled 'obsolete'.
	var spec = MB_editor.project.blockSpecs.get(this.selector);
	return !!spec && spec.specString.startsWith('obsolete');
};

BlockMorph.prototype.chromeMenu = function () {
	// The items of GP's block menu (Block.gp contextMenu) that the port can act on.
	var world = this.world(),
		isCommand = this instanceof CommandBlockMorph,
		items = [],
		copy = () => {
			var dup = this.fullCopy();
			dup.isTemplate = false; // as the hand does for a copy of a palette block
			return dup;
		};

	const isInput = this.parent instanceof BlockSectionDefinitionMorph; // an input of a prototype
	if (this.isFunctionDefinition()) return this.definitionMenu();
	if (!isInput && (this.isPrototype || this.parentThatIsA(BlockDefinitionMorph))) return this.topBlock().definitionMenu();
	if (isInput) {
		items.push(['rename...', () => this.userRenameInput()]);
		items.push('-');
	} else if (this.parent instanceof TemplateSlotMorph) {
		items.push(['rename...', () => this.userRenameVariable()]);
		items.push('-');
	}

	items.push(['duplicate', () => {
		var dup = copy();
		if (isCommand && dup.nextBlock()) dup.nextBlock().destroy();
		dup.pickUp(world);
	}, 'duplicate this block']);
	if (isCommand && this.nextBlock()) {
		items.push(['duplicate all', () => copy().pickUp(world),
			'duplicate this block and all blocks below it']);
	}
	if (!this.isTemplate && isCommand) {
		items.push('-');
		items.push(['extract block', () => this.userExtractJustThis(), 'pull out this block']);
	}
	items.push('-');
	if (this.parent instanceof BlockMorph) {
		items.push(...this.parent.slotItemsFor(this));
	}

	items.push('-');
	if (this.canExpand()) {
		items.push(['expand', () => { this.expand(); this.scriptChanged(); }]);
	}
	if (this.canContract()) {
		items.push(['collapse', () => { this.contract(); this.scriptChanged(); }]);
	}
	if (this.canExpand() || this.canContract()) {
		items.push('-');
	}
	if (this.hasHelp()) {
		items.push(['help',
			() => this.openHelp(),
			'show help for this block in a browser']);
	}
	items.push('-');
	items.push(['copy to clipboard',
		() => this.copyToClipboard(),
		'copy these blocks to the clipboard'])
	items.push(['copy to clipboard as URL',
		() => this.copyToClipboardAsURL(),
		'copy these blocks to the clipboard as a URL'])
	items.push('-');
	items.push(['save picture of script',
		() => this.exportAsImage(),
		'save a picture of these blocks as a PNG file'])
	if (!this.topBlock().isFunctionDefinition()) {
		if ((this.topBlock() instanceof ReporterBlockMorph) || MB_editor.devMode()) {
			items.push(['save picture of script with result',
				() => this.exportAsImageWithResult(),
				'save a picture of these blocks and their result as a PNG file'])
		}
	}
	if (MB_editor.devMode()) {
		items.push('-');
		if (this.isCallable()) {
			items.push(['copy callable name', () => MB_editor.copyToClipboard(this.selector),
				'copy this block\'s name for use in a "call" block']);
			items.push('-');
		}
		items.push(['show instructions', () => this.showDevView('showInstructions')]);
		items.push(['show compiled bytes', () => this.showDevView('showCompiledBytes')]);
		if (this.isTemplate && MB_editor.project.functionNamed(this.selector)) {
			items.push(['show call tree', () => this.showDevView('showCallTree')]);
		}
	}
	items.push('-');
	if (['v', '=', '+='].includes(this.selector)) {
		items.push(['find variable accessors',
			() => MB_editor.findUsers(this, 'accessors'),
			'find scripts or block definitions where this variable is being read']);
		items.push(['find variable modifiers',
			() => MB_editor.findUsers(this, 'modifiers'),
			'find scripts or block definitions where this variable is being set or changed']);
	} else {
		items.push(['find uses of this block',
			() => MB_editor.findUsers(this, 'users'),
			'find scripts or block definitions using this block']);
	}
	if (MB_editor.project.functionNamed(this.selector)) {
		items.push(['show block definition...',
			() => MB_editor.showAndScrollToDefinition(this.selector),
			'show the definition of this block']);
		if (this.isTemplate) {
			items.push('-');
			items.push(['delete block definition...',
				() => MB_editor.deleteFunctionWithConfirm(this.selector),
				'delete the definition of this block']);
		}
	} else if (this.isObsolete()) {
		items.push('-');
		items.push(['delete obsolete block...',
			() => MB_editor.deleteObsoleteWithConfirm(this.selector),
			'delete this obsolete block from the project']);
	}
	if (!this.isTemplate) {
		const alternatives = this.alternateOperators();
		if ('v' === this.selector) {
			const names = MB_editor.project.allVariableNames();
			const locals = this.localVariableNames();
			const addName = (name) => {
				const pic = MB_editor.pictureOf(MB_Parser.blockForDecompiled(
					{ selector: 'v', args: [name], isReporter: true, next: null }));
				items.push([name, () => MB_editor.changeVar(this, name), null, pic, '--block']);
			};
			if (names.length + locals.length > 1) { // a hidden name still counts here
				const shown = names.filter((name) => !name.startsWith('_') || MB_editor.showHiddenBlocks());
				shown.forEach(addName);
				if (shown.length > 0 && locals.length > 0) items.push('-');
				locals.forEach(addName);
			}
		} else if (alternatives) {
			items.push('-');
			for (const op of alternatives) {
				const spec = MB_Specs.specArrayForSelector(op);
				if (!spec || (op === this.selector)) continue;
				const pic = MB_editor.pictureOf(MB_Specs.blockForSpec(spec, MB_Specs.categoryForSelector(op)));
				items.push(['alternative-' + op, () => MB_editor.changeOperator(this, op),
					'replace with this block', pic, '--block']);
			}
		}
		items.push('-');
		items.push(['delete block', () => this.userDestroy(), 'delete this block']);
	}
	return chromeMenuFor(world, items);
};

BlockMorph.prototype.operatorGroups = [
	['analogReadOp', 'digitalReadOp'],
	['analogWriteOp', 'digitalWriteOp'],
	['analogPins', 'digitalPins'],
	['and', 'or'],
	['+', '-', '*', '/', '%'],
	['buttonA', 'buttonB'],
	['<', '<=', '==', '!=', '>=', '>'],
	['maximum', 'minimum'],
	['millisOp', 'microsOp'],
	['=', '+='],
	['&', '|', '^', '<<', '>>'],
];

BlockMorph.prototype.alternateOperators = function () {
	// The group of operators this block can be changed into, its own included, or null.
	return this.operatorGroups.find((group) => group.includes(this.selector)) || null;
};

BlockMorph.prototype.copyToClipboard = function () {
	// The whole script this block is in, with the definitions it calls.
	MB_editor.copyToClipboard(MB_editor.scriptStringFor(this));
}


BlockMorph.prototype.hasHelp = function () {
	return this.hasHelpLink();
}

BlockMorph.prototype.copyToClipboardAsURL = function () {
	MB_editor.copyToClipboard(MB_editor.scriptURL(this, location.href));
}

BlockMorph.prototype.exportAsImage = function () {
	MB_editor.exportScriptImage(this.topBlock());
}

BlockMorph.prototype.exportAsImageWithResult = function () {
	MB_editor.exportScriptImageWithResult(this);
}

BlockMorph.prototype.hasHelpLink = function () {
	// A block the user wrote has no wiki page.
	return MB_editor.helpURLFor(this.selector) !== null;
}

BlockMorph.prototype.openHelp = function () {
	const url = MB_editor.helpURLFor(this.selector);
	if (url) window.open(url, '_blank');
}


BlockMorph.prototype.type = function () {
	// private
	return this instanceof CommandBlockMorph ? 'command' : 'reporter';
};

BlockMorph.prototype.nextBlock = function (block) {
	// Overridden by CommandBlockMorph to get or set the next block
	return null;
}

// BlockMorph expand/collapse

BlockMorph.prototype.canExpand = function () {
	return (!this.isTemplate && (this.inputs().length < this.maxInputCount()));
}

BlockMorph.prototype.canContract = function () {
	return (!this.isTemplate && (this.inputs().length > this.minInputCount()));
}

BlockMorph.prototype.expand = function () {
	// Expand the given block if possible.

	if (!this.canExpand()) return;

	if (this.expander) this.expander.destroy(); // remove the expander before appending parts
	const first = this.inputs().length;
	for (const p of this.specForExpand().split(/\s+/)) {
		this.addChild(this.labelPart(p));
	}
	this.cachedInputs = null;
	this.inputs().slice(first).forEach((slot, i) => this.fillSlotDefault(slot, first + i));
	this.addExpander();
	this.fixElseSection();
	this.fixLayout();
}

BlockMorph.prototype.contract = function () {
	// Remove my last expansion section. Blocks in its slots are kept on the scripts pane:
	// a command stack just to my right, a reporter just to the right of my script.

	if (!this.canContract()) return;

	if (this.expander) this.expander.destroy(); // remove the expander before removing parts
	const nb = this.nextBlock ? this.nextBlock() : null; // a child, often the last one
	const parts = this.children.filter(m => m !== nb);
	const scripts = this.parentThatIsA(ScriptsMorph);
	const kept = [];
	for (const p of parts.slice(-this.specForContract().split(/\s+/).length)) {
		this.removeChild(p);
		const keep = (p instanceof CSlotMorph) ? p.nestedBlock() : p;
		if (scripts && keep instanceof BlockMorph && !keep.isTemplate) kept.push(keep);
	}
	this.cachedInputs = null;
	this.addExpander();
	this.fixElseSection();
	this.fixLayout();

	const blockRight = this.children.filter(m => m !== nb)
		.reduce((right, m) => Math.max(right, m.fullBounds().right()), this.right());
	const scriptRight = this.topBlock().fullBounds().right();
	for (const keep of kept) {
		const x = (keep instanceof CommandBlockMorph) ? blockRight : scriptRight;
		scripts.addClearOfScripts(keep, new Point(x + scripts.cleanUpSpacing, keep.top()));
	}
}

// BlockMorph inserting and deleting slots

BlockMorph.prototype.repeatedSlotSpec = function () {
	// The slot spec of the section my spec repeats, if that section has one slot, else null.
	const sections = this.blockSpec.split(':').map(s => s.trim());
	if ((sections.length < 3) || (sections.at(-1) !== '...')) return null;
	const slots = sections.at(-2).split(/\s+/).filter(w => MB_Specs.isSlotSpec(w));
	return (slots.length === 1) ? slots[0] : null;
}

BlockMorph.prototype.variableInputs = function () {
	// My last inputs that share the repeated slot spec, so any one can take another's place.
	const spec = this.repeatedSlotSpec();
	if (!spec) return [];
	const inputs = this.inputs();
	let first = inputs.length;
	while ((first > 0) && (this.slotSpecForInput(first - 1) === spec)) first--;
	return inputs.slice(first);
}

BlockMorph.prototype.slotItemsFor = function (input) {
	// The items that insert a slot before the given input or delete it.
	if (!this.variableInputs().includes(input)) return [];
	const items = [];
	if (this.canExpand()) {
		items.push(['insert a slot', () => { this.insertSlotBefore(input); this.scriptChanged(); }]);
	}
	if (this.canContract()) {
		items.push(['delete slot', () => { this.deleteSlot(input); this.scriptChanged(); }]);
	}
	return items;
}

BlockMorph.prototype.insertSlotBefore = function (input) {
	// Expand, then move the new slot into the given input's place, cleared as an edit
	// clears it rather than showing the default expanding gave it.
	const before = this.variableInputs(), i = before.indexOf(input);
	if ((i < 0) || !this.canExpand()) return;
	this.expand();
	const slot = this.inputs().at(-1);
	if (slot instanceof InputSlotMorph) slot.setContents((slot.isNumeric && !slot.isAlphanumeric) ? 0 : '');
	this.reorderInputs(this.variableInputs(), [...before.slice(0, i), slot, ...before.slice(i)]);
}

BlockMorph.prototype.deleteSlot = function (input) {
	// Move the given input to the last place and collapse, which keeps a block in it on the pane.
	const inputs = this.variableInputs();
	if (!inputs.includes(input) || !this.canContract()) return;
	this.reorderInputs(inputs, [...inputs.filter(m => m !== input), input]);
	this.contract();
}

BlockMorph.prototype.reorderInputs = function (inputs, newOrder) {
	// Put the inputs of newOrder, in turn, in the places the given inputs hold.
	const places = inputs.map(m => this.children.indexOf(m));
	newOrder.forEach((m, i) => { this.children[places[i]] = m; });
	this.cachedInputs = null;
	this.fixLayout();
}

BlockMorph.prototype.fixElseSection = function () {
	// An 'if' whose last condition is the constant true shows that section as just 'else'.

	if (this.selector !== 'if') return;
	const specSections = this.blockSpec.split(':').map(s => this.parseSpec(s.trim()));
	if (specSections.length < 2) return;
	const words = specSections[1].filter(w => w[0] !== '%').map(w => w.replaceAll(MB_Specs.labelColon, ':'));
	const nb = this.nextBlock ? this.nextBlock() : null;
	const parts = this.children.filter(m => (m !== nb) && (m !== this.expander));
	const size = specSections[1].length;
	let changed = false;
	for (let i = specSections[0].length; i < parts.length; i += size) {
		const section = parts.slice(i, i + size);
		const cond = section.find(m => m instanceof SyntaxElementMorph && !(m instanceof CSlotMorph));
		const isElse = (i + size === parts.length) && (cond instanceof BooleanSlotMorph) &&
			(cond.value === true) && (cond.mbValue === undefined); // a real true, not a kept literal
		const labels = section.filter(m => m instanceof StringMorph);
		labels.forEach((label, j) => {
			if (label.isVisible !== (!isElse || (j === 0))) changed = true;
			label.isVisible = !isElse || (j === 0);
			label.isElseLine = isElse && (j === 0);
			const text = (isElse && (j === 0)) ? localized('else') : words[j];
			if (text && (label.text !== text)) {
				label.text = text;
				label.fixLayout();
				label.rerender();
				changed = true;
			}
		});
		if (cond instanceof BooleanSlotMorph) {
			cond.isVisible = !isElse;
			cond.isStatic = isElse; // not replaced by a dropped reporter
		}
	}
	if (changed) this.fixLayout();
}

BlockMorph.prototype.fixLayoutRTL = function () {
	// Mirror my parts so that my label reads from right to left. C-slots and the
	// expander arrows stay in place, and the arrows' width is left out of the mirror.
	var width = this.width(),
		left = this.left();

	if (this.selector === 'if') width += 15 * this.scale;
	if (this.expander) width -= this.expander.fullBounds().width() + (3 * this.scale);
	this.parts().forEach(part => {
		if (part.isVisible && (part !== this.expander) && !(part instanceof CommandSlotMorph)) {
			// the "else" label is mirrored as the Boolean slot it stands in for
			var bounds = part.fullBounds(),
				partWidth = part.isElseLine ? 29 * this.scale : bounds.width();
			part.setLeft(left + width - (bounds.left() - left) - partWidth);
		}
	});
};

BlockMorph.prototype.maxInputCount = function () {
	// Return the number of inputs for this blocks maximum expansion (may be Infinity).

	if (this.blockSpec.endsWith('...')) return Infinity;

	let count = 0;
	for (let p of this.blockSpec.split(/\s+/)) {
		if (MB_Specs.isSlotSpec(p)) count += 1;
	}
	return count;
}

BlockMorph.prototype.minInputCount = function () {
	// Return the number of input slots for this block when not expanded.

	let specSections = this.blockSpec.split(':');
	return this.inputCountForSpecSection(specSections[0]);
}

BlockMorph.prototype.inputCountForSpecSection = function (specSection) {
	if ('...' == specSection) return Infinity;

	let count = 0;
	for (let p of specSection.split(/\s+/)) {
		if (MB_Specs.isSlotSpec(p)) count += 1;
	}
	return count;
}

BlockMorph.prototype.specForExpand = function () {
	// Return a string containing the block spec section for the next level of expansion.

	let currentInputCount = this.inputs().length;
	let specSections = this.blockSpec.split(':').map(s => s.trim());

	let count = this.inputCountForSpecSection(specSections[0]);
	for (let i = 1; i < specSections.length; i++) {
		count += this.inputCountForSpecSection(specSections[i]);
		if (count > currentInputCount) {
			let result = specSections[i];
			return (result == '...') ? specSections[i - 1] : result;
		}
	}
	return '';
}

BlockMorph.prototype.specForContract = function () {
	// Return a string containing the block spec section that the last expansion added.

	let currentInputCount = this.inputs().length;
	let specSections = this.blockSpec.split(':').map(s => s.trim());

	let count = this.inputCountForSpecSection(specSections[0]);
	for (let i = 1; i < specSections.length; i++) {
		count += this.inputCountForSpecSection(specSections[i]);
		if (count >= currentInputCount) {
			let result = specSections[i];
			return (result == '...') ? specSections[i - 1] : result;
		}
	}
	return specSections.at(-1);
}

BlockMorph.prototype.slotSpecForInput = function (inputIndex) {
	// Return the slot spec of the given input, counting the slots of every expansion.
	// The spec's words do not line up with the parts once the block has expanded.

	const { sections, repeatLast } = specSections({ specString: this.blockSpec });
	let slots = [];
	for (let i = 0; slots.length <= inputIndex; i++) {
		if ((i >= sections.length) && !repeatLast) return null;
		let section = sections[Math.min(i, sections.length - 1)];
		let sectionSlots = section.split(/\s+/).filter(p => MB_Specs.isSlotSpec(p));
		if ((i >= sections.length) && (0 == sectionSlots.length)) return null;
		slots.push(...sectionSlots);
	}
	return slots[inputIndex];
}

BlockMorph.prototype.specArray = function () {
	// Return the spec array I was built from, the project's before the table's, or null.

	MB_Specs.initialize();
	const candidates = [MB_Specs.projectSpecArrayForSelector(this.selector),
		MB_Specs.selectorToSpec.get(this.selector)].filter(s => s);
	return candidates.find(s => MB_Specs.snapSpecForSpecArray(s) === this.blockSpec) || candidates[0] || null;
}

BlockMorph.prototype.slotDefaultForInput = function (inputIndex) {
	// Return the default my spec gives the given input, or null if it gives none.
	// An input past the declared slots takes the default of the repeated section.

	const specArray = this.specArray();
	if (!specArray) return null;
	const spec = { specString: specArray[2], slotTypes: specArray[3],
		defaults: MB_Specs.translatedDefaults(specArray[2], specArray[3], specArray.slice(4)) };
	const info = specSlotInfo(spec);
	let i = inputIndex;
	if (i >= info.length) {
		const { sections, repeatLast } = specSections(spec);
		if (!repeatLast) return null;
		const repeated = sections[sections.length - 1].split(/\s+/).filter(w => w === '_').length;
		const firstRepeated = info.length - repeated;
		if ((0 == repeated) || (firstRepeated < 0)) return null;
		i = firstRepeated + ((i - firstRepeated) % repeated);
	}
	return info[i][1];
}

BlockMorph.prototype.fillSlotDefault = function (slot, inputIndex) {
	// Show my spec's default for the given input in a slot made after I was built.
	// With no default, an input slot is empty and any other keeps what it was made
	// with: true for a boolean, green for a colour, no LEDs lit.

	const value = this.slotDefaultForInput(inputIndex);
	if (slot instanceof BooleanSlotMorph) {
		if (value !== null) slot.setContents((value === true) || (value === 'true'));
	} else if (slot instanceof InputSlotMorph) {
		slot.setContents((value === null) ? '' : value);
		if (slot.isHint) slot.mbValue = null; // shown, but not a value
	} else if ((slot instanceof ColorSlotMorph) || (slot instanceof MicroBitDisplaySlotMorph)) {
		if (value !== null) slot.setContents(value);
	}
}

BlockMorph.prototype.addExpander = function () {
	this.expander = new BlockExpanderMorph(this);
	this.addChild(this.expander);
}

// BlockMorph script pic

BlockMorph.prototype.fullImage = function () {
	// answer a canvas image meant for (semi-) transparent blocks
	// that lets the background shine through
	var src, solid, pic, ctx;

	if (this.alpha === 1) {
		return BlockMorph.uber.fullImage.call(this);
	}
	this.forAllChildren(m => {
		if (m instanceof BlockMorph) {
			m.mouseLeaveBounds();
		}
	});
	src = BlockMorph.uber.fullImage.call(this);
	solid = this.doWithAlpha(1, () => BlockMorph.uber.fullImage.call(this));
	pic = newCanvas(this.fullBounds().extent());
	ctx = pic.getContext('2d');
	ctx.fillStyle = ScriptsMorph.prototype.getRenderColor().toString();
	ctx.fillRect(0, 0, pic.width, pic.height);
	ctx.globalCompositeOperation = 'destination-in';
	ctx.drawImage(solid, 0, 0);
	ctx.globalCompositeOperation = 'source-over';
	ctx.drawImage(src, 0, 0);
	return pic;
};

BlockMorph.prototype.clearAlpha = function () {
	this.forAllChildren(m => {
		if (m instanceof BlockMorph) {
			delete m.alpha;
		}
	});
};

// MicroBlocks code printing

BlockMorph.prototype.isInfix = function (op) {
	const infixOps = [
		'=', '+=', '+', '-', '*', '/', '%',
		'<', '<=', '==', '!=', '>=', '>',
		'&', '|', '^', '<<', '>>', '>>>'];
	return infixOps.includes(op);
}

BlockMorph.prototype.isElseSlot = function (args, i) {
	// The final condition of an 'if', when literally true: GP writes this slot
	// as the bare word 'else' (PrettyPrinter.gp printBlock), including for a
	// single-branch 'if' (see Libraries/AI/AILens.ubl:83).
	if (this.selector !== 'if') return false;
	if (i !== args.length - 2) return false;    // conditions are at even indices
	return (args[i] instanceof BooleanSlotMorph) && (args[i].value === true);
};

BlockMorph.prototype.bracesEmptyBody = function (op) {
	// GP's printCmd (PrettyPrinter.gp:286) sends these five to
	// printCmdListInControl (:259), which writes an empty body as '{}'. `if` is
	// decided before this is reached, in addCodeStringForArg, because its long
	// and short forms differ. Every other command prints a nil body as the bare
	// word, which is what forever, repeat and repeatUntil want.
	const braced = ['to', 'function', 'method', 'for', 'while'];
	return braced.includes(op);
}

BlockMorph.prototype.addCodeStringForArg = function (arg, indent, result) {
	if (arg instanceof CSlotMorph) {
		let nested = arg.nestedBlock();
		if (nested == null) {
			// An empty `if` body is braced across a newline, as GP does at
			// PrettyPrinter.gp printCmdList. The rest divide into the ones GP
			// braces flat and the ones it writes as the bare word.
			result.push(this.selector == 'if' ?
				'{\n' + '  '.repeat(indent) + '}' :
				(this.bracesEmptyBody(this.selector) ? '{}' : 'nil'));
		} else {
			result.push('{\n');
			nested.codeString(indent + 1, result);
			// The closing brace is indented to the block's own level, not the
			// body's, as GP's PrettyPrinter tab does (PrettyPrinter.gp).
			result.push('  '.repeat(indent));
			result.push('}');
		}
	} else if (arg instanceof BooleanSlotMorph) {
		// evaluate(), not value: a value the slot cannot represent is kept
		// beside it, and it is the one GP's printer sees in the argList.
		let value = arg.evaluate();
		if ((typeof value) == 'string') {
			result.push('\'' + fixEmbeddedQuotes(value) + '\'');
		} else if ((typeof value) == 'number') {
			result.push(value);
		} else {
			result.push((value == true).toString());
		}
	} else if (arg instanceof ReporterBlockMorph) {
		result.push(arg.codeString());
	} else if (arg instanceof TemplateSlotMorph) {
		// GP's PrettyPrinter quotes a local's name always (printString) and a for,
		// = or += name only when it must (printCmd, PrettyPrinter.gp:325 and :362;
		// varName :436; varMustBeQuoted, String.gp:613), so do the same.
		let name = arg.contents();
		result.push(('local' == this.selector) ? ('\'' + fixEmbeddedQuotes(name) + '\'') : quoteIfNeeded(name));
	} else if (arg instanceof MicroBitDisplaySlotMorph) {
		this.addCodeStringForValue(arg.evaluate(), result);
	} else if (arg instanceof ColorSlotMorph) {
		let c = arg.evaluate();
		if (c instanceof Color) {
			let rgba = [c.r, c.g, c.b, c.a * 255].map(Math.round);
			result.push('(colorSwatch ' + rgba.join(' ') + ')');
		} else {
			this.addCodeStringForValue(c, result);
		}
	} else if (arg instanceof InputSlotMorph) { // includes subclass TextSlotMorph
		let isStringOnly = (arg instanceof TextSlotMorph);
		let text = arg.contents().text;
		// GP prints a literal by the class of the VALUE, quoting only a String
		// (PrettyPrinter.gp printValue:160). The slot has kept that value since
		// input slots became value preserving; reading the type back out of the
		// text cannot tell 'false' from false, or '0' from 0.
		let value = arg.evaluate();
		if (arg.isNumeric && !arg.isAlphanumeric && (text.length == 0)) {
			result.push('0'); // treat an empty numeric slot as zero
		} else if (isNil(value)) {
			result.push('nil');
		} else if (((typeof value) == 'number') || ((typeof value) == 'boolean')) {
			result.push(value.toString());
		} else if ((typeof value) == 'string') {
			result.push('\'' + fixEmbeddedQuotes(value) + '\'');
		} else if (!isStringOnly && /^-?\d+$/.test(text)) { // value is an integer, slot is not 'str'
			result.push(text);
		} else { // string
			result.push('\'' + fixEmbeddedQuotes(text) + '\'');
		}
	} else {
		console.log('unknown arg type:', arg);
	}
}

BlockMorph.prototype.addCodeStringForValue = function (value, result) {
	// A kept value the slot could not show: a string must go back quoted, or
	// the next load reads it as a variable name.
	if ((typeof value) == 'string') {
		result.push('\'' + fixEmbeddedQuotes(value) + '\'');
	} else {
		result.push(value);
	}
}

BlockMorph.prototype.argInputs = function () {
	// My inputs up to the last one that is an argument: GP's argList. Trailing
	// slots the source never filled show their defaults but compile and print
	// as nothing, as they do in GP.
	let inputs = this.inputs();
	let n = inputs.length;
	while ((n > 0) && (inputs[n - 1] instanceof ArgMorph) && inputs[n - 1].isUnsupplied()) n -= 1;
	return (n == inputs.length) ? inputs : inputs.slice(0, n);
};

BlockMorph.prototype.isShortIf = function (args) {
	// A single condition and body, and a body of at most one command: GP's
	// test for the one-line form, at PrettyPrinter.gp printCmd and isShort.
	if (this.selector != 'if') return false;
	if (args.length != 2 || !(args[1] instanceof CSlotMorph)) return false;
	let body = args[1].nestedBlock();
	return (body == null) || (body.nextBlock() == null);
};

BlockMorph.prototype.shortIfBodyString = function (cslot, indent) {
	let body = cslot.nestedBlock();
	if (body == null) return ' {}';
	// GP closes the brace against whatever the body left behind, and a body
	// ending in a nested block leaves a newline there unless it is an `if`.
	let text = body.codeString(indent, [], false);
	text = text.slice('  '.repeat(indent).length); // GP does not indent the body
	if (!text.endsWith('}\n') || (body.selector == 'if')) text = text.slice(0, -1);
	return ' {' + text + '}';
};

BlockMorph.prototype.codeString = function (indent = 0, result = [], early = true) {
	if (this.selector == 'v') {
		// variable reporter
		let varName = quoteIfNeeded(this.blockSpec);
		if (varName != this.blockSpec) {
			// var name is quoted: must use (v <varName>) variable reference
			varName = ('(v ' + varName + ')');
		}
		return varName;
	}

	if (this.type() == 'reporter') {
		result.push('(');
	} else { // command or hat block
		// Two spaces per level, as GP's PrettyPrinter tab does
		// (PrettyPrinter.gp method tab).
		result.push('  '.repeat(indent));
	}

	let args = this.argInputs();

	if (['=', '+=', 'local', 'for', 'to'].includes(this.selector)) {
		let varName = (args[0] instanceof TemplateSlotMorph) ?
			args[0].contents() :
			args[0].contents().text;
		args = args.slice(); // copy args so we can modify it
		args[0] = new TemplateSlotMorph(varName); // addCodeStringForArg quotes it
	}

	if (early && this.isShortIf(args)) {
		// GP prints the condition here, so a literal true stays `true` rather
		// than becoming the `else` the long form below writes.
		result.push(quoteIfNeeded(this.selector));
		result.push(' ');
		this.addCodeStringForArg(args[0], indent, result);
		result.push(this.shortIfBodyString(args[1], indent));
		result.push('\n');
		let next = this.nextBlock();
		if (next != null) next.codeString(indent, result, true);
		return result.join('');
	}

	if (this.isInfix(this.selector) && (args.length == 2)) { // infix operator
		this.addCodeStringForArg(args[0], indent, result);
		result.push(' ' + this.selector + ' ');
		this.addCodeStringForArg(args[1], indent, result);
	} else {
		result.push(quoteIfNeeded(this.selector));
		for (let i = 0; i < args.length; i++) {
			result.push(' '); // no space after the last argument, as GP's printer
			if (this.isElseSlot(args, i)) {
				result.push('else');
			} else {
				this.addCodeStringForArg(args[i], indent, result);
			}
		}
	}

	if (this.type() == 'reporter') {
		result.push(')');
	} else { // command or hat block
		result.push('\n');
		let next = this.nextBlock();
		// Only a short `if` keeps the run going; GP feeds printCmd's return
		// value into `early` for this.
		if (next != null) next.codeString(indent, result, false); // recursive!
	}
	return result.join('');
}

// BlockMorph model projection:

BlockMorph.prototype.expression = function () {
	// Answer me as a model node: what this block is, with no morph in it. The
	// shape is MB_Decompiler's, and MB_Parser.blockForDecompiled reads it back.
	if ('v' == this.selector) {
		return { selector: 'v', args: [this.blockSpec], isReporter: true, next: null };
	}
	// argInputs(), not inputs(): a slot the source never filled is not an
	// argument, and blockWithArgs marks the same trailing slots again on the
	// way back.
	let args = this.argInputs().map(input => this.expressionForArg(input));
	let isReporter = !(this instanceof CommandBlockMorph);
	let next = (!isReporter && this.nextBlock()) ? this.nextBlock().expression() : null;
	const node = { selector: this.selector, args, isReporter, next };
	if (this.isDefaultColour) node.isDefaultColour = true;
	return node;
};

BlockMorph.prototype.expressionForArg = function (arg) {
	if (arg instanceof CommandSlotMorph) {
		let nested = arg.nestedBlock();
		// An empty body has no first block, and null already says an absent
		// argument, so it goes out named, as MB_Specs.emptyCommandList is.
		return nested ? nested.expression() : { isEmptyCommandList: true };
	}
	if (arg instanceof BlockMorph) return arg.expression();
	let value = arg.evaluate();
	// A colour goes out spelled, so a node never holds a live Color. Only a
	// block's colour has an alpha (0-255, as a colorSwatch writes it); the bytes carry none.
	if (value instanceof Color) {
		return { isColor: true, r: value.r, g: value.g, b: value.b, alpha: Math.round(value.a * 255) };
	}
	// A slot showing a block or a symbol answers something no node can carry,
	// and codeString never sees it. Say so rather than put it in the tree.
	if ((value != null) && ('object' == (typeof value))) {
		throw new Error('expression: a slot of the ' + this.selector +
			' block holds a block or a symbol, which is not a value');
	}
	return value;
};

// BlockMorph drawing

BlockMorph.prototype.outlineColor = function () {
	// The block's colour at 80% of its HSV value. It goes through HSV in floating
	// point and truncates, which can land a unit below plain scaling.
	var r = Math.round(this.color.r), g = Math.round(this.color.g), b = Math.round(this.color.b),
		max = Math.max(r, g, b), min = Math.min(r, g, b),
		h = 0, s = 0, v = 0.8 * (max / 255), i, f, p, q, t, rgb;
	if (max !== min) {
		if (r === min) {
			h = (60 * (3 - ((g - b) / (max - min)))) % 360;
		} else if (g === min) {
			h = (60 * (5 - ((b - r) / (max - min)))) % 360;
		} else {
			h = (60 * (1 - ((r - g) / (max - min)))) % 360;
		}
		s = (max - min) / max;
	}
	i = Math.trunc(h / 60);
	f = (h / 60) - i;
	p = v * (1 - s);
	q = v * (1 - (s * f));
	t = v * (1 - (s * (1 - f)));
	rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
	return new Color(
		Math.trunc(255 * rgb[0]), Math.trunc(255 * rgb[1]), Math.trunc(255 * rgb[2]), this.color.a);
};

BlockMorph.prototype.isDrawnAtZoom = function () {
	// The world draws me at its zoom, and so does a picture of me that sets
	// drawnAtZoom on my top block. An exported picture is drawn at scale 1.
	return !!(this.world() || this.root().drawnAtZoom);
};

BlockMorph.prototype.render = function (ctx) {
	// drawn at the world's zoom the outline stays one screen pixel wide at every block size
	var width = this.flatEdge / (this.isDrawnAtZoom() ? ZOOM : 1),
		out = this.outlineOutset();

	this.cachedClr = this.color.toString();
	this.cachedClrBright = this.bright();
	this.cachedClrDark = this.outlineColor().toString();

	// draw the outline
	ctx.fillStyle = this.cachedClrDark;
	ctx.beginPath();
	this.outlinePath(ctx, -out);
	ctx.closePath();
	ctx.fill();

	// the inner shape
	ctx.fillStyle = this.cachedClr;
	ctx.beginPath();
	this.outlinePath(ctx, width - out);
	ctx.closePath();
	ctx.fill();
};

BlockMorph.prototype.outlineOutset = function () {
	// How far my outline reaches past my bounds. A reporter's lies inside them,
	// as GP draws it; command and hat blocks override this.
	return 0;
};

// A command block's outline reaches past my bounds: draw it, and redraw it when I change.

BlockMorph.prototype.clipBounds = function () {
	return this.bounds.expandBy(this.outlineOutset());
};

BlockMorph.prototype.changed = function () {
	var w = this.root();
	if (w instanceof WorldMorph) {
		w.broken.push(this.visibleBounds().expandBy(this.outlineOutset()).spread());
	}
	if (this.parent) {
		this.parent.childChanged(this);
	}
};

BlockMorph.prototype.fullChanged = function () {
	var w = this.root();
	if (w instanceof WorldMorph) {
		w.broken.push(this.fullBounds().expandBy(this.outlineOutset()).spread());
	}
};

BlockMorph.prototype.cSlots = function () {
	var result = [];
	this.parts().forEach(part => {
		if (part instanceof CSlotMorph) result.push(part);
	});
	return result;
};

// BlockMorph highlighting

BlockMorph.prototype.addHighlight = function (oldHighlight) {
	var isHidden = !this.isVisible,
		highlight;

	if (isHidden) {this.show(); }
	if (SyntaxElementMorph.prototype.alpha < 1) {
		this.clearAlpha();
	}
	highlight = this.highlight(
		oldHighlight ? oldHighlight.color : this.activeHighlight,
		this.activeBlur,
		this.activeBorder / ZOOM // the same width on screen at every block size
	);
	this.addBack(highlight);
	this.fullChanged();
	if (isHidden) {this.hide(); }
	return highlight;
};

BlockMorph.prototype.removeHighlight = function () {
	var highlight = this.getHighlight();
	if (highlight !== null) {
		this.fullChanged();
		this.removeChild(highlight);
		this.afterglow = 0;
	}
	return highlight;
};

BlockMorph.prototype.highlightBounds = function () {
	// My full bounds plus the part of my outline that lies outside them.
	return this.fullBounds().expandBy(this.outlineOutset());
};

BlockMorph.prototype.highlight = function (color, blur, border) {
	var highlight = new BlockHighlightMorph(),
		fb = this.highlightBounds(),
		edge = border;
	highlight.bounds.setExtent(fb.extent().add(edge * 2));
	highlight.holes = [highlight.bounds]; // make the highlight untouchable
	highlight.color = color;
	highlight.cachedImage = this.highlightImage(color, border);
	highlight.setPosition(fb.origin.subtract(new Point(edge, edge)));
	return highlight;
};

BlockMorph.prototype.highlightImage = function (color, border) {
	// Drawn at the world's zoom, so the outline's edges stay sharp when the
	// script's edge falls between canvas pixels at a large block size.
	var k = this.world() ? ZOOM : 1,
		bounds = this.highlightBounds(),
		fb = bounds.extent().multiplyBy(k),
		layer, img, shapes, body, hi, ctx, out;
	layer = (draw) => {
		var canvas = newCanvas(fb),
			c = canvas.getContext('2d');
		c.scale(k, k);
		c.translate(-bounds.origin.x, -bounds.origin.y);
		this.doWithAlpha(1, () => draw(c));
		return canvas;
	};
	img = layer(c => this.fullDrawOn(c, bounds));
	// the blocks' own shapes and C slots, without their labels or inputs
	shapes = layer(c => this.allChildren().forEach(m => {
		if (m.isVisible &&
				(m instanceof BlockMorph || m instanceof CommandSlotMorph)) {
			m.drawOn(c, bounds);
		}
	}));
	body = layer(c => this.drawOn(c, bounds));
	border *= k;

	hi = newCanvas(fb.add(border * 2));
	ctx = hi.getContext('2d');

	// The halo: four diagonal copies of my picture, so a straight edge gets
	// two of them; a third copy makes its half-covered pixels read too solid.
	ctx.drawImage(img, 0, 0);
	ctx.drawImage(img, border * 2, 0);
	ctx.drawImage(img, border * 2, border * 2);
	ctx.drawImage(img, 0, border * 2);

	out = newCanvas(fb.add(border * 2));
	ctx = out.getContext('2d');
	ctx.drawImage(hi, 0, 0);
	ctx.globalCompositeOperation = 'source-atop';
	ctx.fillStyle = color.toString();
	ctx.fillRect(0, 0, out.width, out.height);

	// The highlight covers the top block's body, so the shapes go over the
	// halo: three coats with the body, as many as an edge pixel needs to read
	// as solid outline over the highlight; with fewer, the halo shows through.
	ctx.globalCompositeOperation = 'source-over';
	ctx.drawImage(shapes, border, border);
	ctx.drawImage(shapes, border, border);
	ctx.drawImage(body, border, border);
	out.unitsPerPixel = 1 / k;
	return out;
};

BlockMorph.prototype.getHighlight = function () {
	var highlights;
	highlights = this.children.slice(0).reverse().filter(child =>
		child instanceof BlockHighlightMorph
	);
	if (highlights.length !== 0) {
		return highlights[0];
	}
	return null;
};

BlockMorph.prototype.outline = function (color, border) {
	var highlight = new BlockHighlightMorph(),
		fb = this.highlightBounds(),
		edge = border;
	highlight.bounds.setExtent(fb.extent().add(edge * 2));
	highlight.color = color;
	highlight.cachedImage = this.highlightImage(color, border);
	highlight.setPosition(fb.origin.subtract(new Point(edge, edge)));
	return highlight;
};

// BlockMorph zebra coloring

BlockMorph.prototype.fixBlockColor = function (nearestBlock, isForced) {
	var nearest = nearestBlock,
		clr;

	if (!this.zebraContrast && !isForced) {
		return;
	}
	if (!this.zebraContrast && isForced) {
		return this.forceNormalColoring(true);
	}

	if (!nearest) {
		if (this.parent) {
			if (this.isPrototype) {
				nearest = null; // this.parent; // the PrototypeHatBlockMorph
			} else if (this instanceof ReporterBlockMorph) {
				nearest = this.parent.parentThatIsA(BlockMorph);
			}
		}
	}
	if (!nearest) { // a top block or a command: only reporters alternate
		clr = this.colorFor(this.category);
		if (!this.color.eq(clr)) {
			this.alternateBlockColor();
		}
	} else if (nearest.category === this.category) {
		if (nearest.color.eq(this.color)) {
			this.alternateBlockColor();
		}
	} else if (this.category && !this.color.eq(
			this.colorFor(this.category)
		)) {
		this.alternateBlockColor();
	}
	if (isForced) {
		this.fixChildrensBlockColor(true);
	}
};

BlockMorph.prototype.forceNormalColoring = function () {
	var clr = this.colorFor(this.category);
	this.setColor(clr);
	this.setLabelColor(
		WHITE,
		clr.darker(this.labelContrast),
		ZERO
	);
	this.fixChildrensBlockColor(true);
};

BlockMorph.prototype.alternateBlockColor = function () {
	var clr = this.colorFor(this.category);

	if (this.color.eq(clr)) {
		this.setColor(
			this.zebraContrast < 0 ? clr.darker(Math.abs(this.zebraContrast))
				: clr.lighter(this.zebraContrast),
			this.hasLabels() // silently
		);
	} else {
		this.setColor(clr, this.hasLabels()); // silently
	}
	this.fixLabelColor();
	this.fixChildrensBlockColor(true); // has issues if not forced
};

BlockMorph.prototype.fixLabelColor = function () {
	// the label stays white on an alternated block too
	if (this.zebraContrast > 0 && this.category) {
		this.setLabelColor(
			WHITE,
			this.colorFor(this.category).darker(this.labelContrast)
		);
	}
};

BlockMorph.prototype.fixChildrensBlockColor = function (isForced) {
	this.children.forEach(morph => {
		if (morph instanceof CommandBlockMorph) {
			morph.fixBlockColor(null, isForced);
		} else if (morph instanceof SyntaxElementMorph) {
			morph.fixBlockColor(this, isForced);
			if (morph instanceof BooleanSlotMorph) {
				morph.fixLayout();
			}
		}
	});
};

BlockMorph.prototype.setCategory = function (aString) {
	this.category = this.isFunctionDefinition() ? 'Definition' : aString;
	this.fixBlockColor();
};

BlockMorph.prototype.hasLabels = function () {
	return this.children.some(any => any instanceof StringMorph);
};

// BlockMorph copying

BlockMorph.prototype.fullCopy = function () {
	if (this.isPrototype) { // a prototype is copied as a call of its block
		// placed where I am, so the hand holds the call where it held me
		const call = MB_editor.blockForFunction(MB_editor.project.functionNamed(this.topBlock().definedFunctionName()));
		call.setPosition(this.position());
		return call;
	}
	var ans = BlockMorph.uber.fullCopy.call(this);
	ans.removeHighlight();
	ans.isDraggable = true;
	ans.allChildren().forEach((block) => {
		if (block instanceof SyntaxElementMorph) {
			block.cachedInputs = null;
		}
	});
	ans.cachedInputs = null;
	ans.mbScriptId = null; // a copy is a different script; updateProject names it
	return ans;
};

BlockMorph.prototype.reactToTemplateCopy = function () {
	// A copy of a prototype's input is a plain variable.
	this.children.filter((m) => m instanceof InputDeclarationMorph).forEach((m) => m.destroy());
	this.fixLayout();
	this.forceNormalColoring();
};

BlockMorph.prototype.pickUp = function (wrrld) {
	// used when duplicating and grabbing a block via its context menu
	// hold it near its top-left corner, 7 screen pixels in at any block size
	var world = wrrld || this.world();
	this.setPosition(world.hand.position().subtract(7 / ZOOM));
	world.hand.grab(this);
};

// BlockMorph events

BlockMorph.prototype.mouseClickLeft = function () {
	var scripts = MB_editor.scripts;
	if (this.isPrototype) {
		this.children.find((m) => m instanceof BlockDefinitionMorph).clicked();
		return;
	}
	if (scripts.selection && MB_editor.shiftDown && // Shift as it is now, at the release
			(this.parentThatIsA(ScriptsMorph) === scripts)) {
		scripts.toggleSelected(this.topBlock());
		return;
	}
	scripts.cancelSelection();
	if (this.isFunctionDefinition() && this.blockDefinition()) {
		this.blockDefinition().clicked(); // a click on a definition hat is a click on its prototype
		return;
	}
	MB_editor.toggleRunning(this.topBlock());
};

// BlockMorph dragging and dropping

BlockMorph.prototype.rootForGrab = function () {
	return this;
};

/*
	for demo purposes, allows you to drop arg morphs onto
	blocks and forces a layout update. This section has
	no relevance in end user mode.
*/

BlockMorph.prototype.wantsDropOf = function (aMorph) {
	// override the inherited method
	return (aMorph instanceof ArgMorph
		|| aMorph instanceof StringMorph
		|| aMorph instanceof TextMorph
	) && !this.isTemplate;
};

BlockMorph.prototype.reactToDropOf = function (droppedMorph) {
	droppedMorph.isDraggable = false;
	droppedMorph.fixLayout();
	this.fixLayout();
	this.buildSpec();
};

BlockMorph.prototype.situation = function () {
	// answer a dictionary specifying where I am right now, so
	// I can slide back to it if I'm dropped somewhere else
	// NOTE: We can also add more key-value pairs to the situation
	// dictionary to support non-standard modes of user-interaction,
	// such as extracting single commands from within a stack
	// see userExtractJustThis()
	if (!(this.parent instanceof TemplateSlotMorph)) {
		var scripts = this.parentThatIsA(ScriptsMorph);
		if (scripts) {
			return {
				origin: scripts,
				position: this.position().subtract(scripts.position())
			};
		}
	}
	return BlockMorph.uber.situation.call(this);
};

BlockMorph.prototype.prepareToBeGrabbed = function (hand) {
	var wrld = hand ? hand.world : this.world();

	this.allInputs().forEach(input =>
		delete input.bindingID
	);
};

BlockMorph.prototype.justDropped = function () {
	delete this.alpha;
	// a scripts pane puts a wrapping C slot back in snap, once it has chosen the target
	if (this.setWrapHeight && !(this.parent instanceof ScriptsMorph)) this.setWrapHeight(null);
};

// A held block casts GP's shadow: black at 60/255, 7 screen pixels down and right, blurred
// by 1, so it reads as a hard-edged copy of the block's shape. A shadow asked for with an
// offset keeps morphic's.
BlockMorph.prototype.addShadow = function (off, a, color) {
	if (off) return BlockMorph.uber.addShadow.call(this, off, a, color);
	this.shadowBlur = 1 / ZOOM;
	try {
		return BlockMorph.uber.addShadow.call(
			this, new Point(7 / ZOOM, 7 / ZOOM), 60 / 255);
	} finally {
		delete this.shadowBlur;
	}
};

// The chrome lets a dragged block pass over its panels between the 'dragstart' and 'dragend'
// that GP's Block aboutToBeGrabbed and justDropped send. Hooked on the hand, because a block
// also prepares to be grabbed when it is deleted, and would leave the chrome dragging.

HandMorph.prototype.grabWithoutTellingChrome = HandMorph.prototype.grab;
HandMorph.prototype.grab = function (aMorph) {
	var wasEmpty = this.children.length === 0,
		isScripts = (aMorph instanceof BlockMorph) || (aMorph instanceof SelectedScriptsMorph);
	// Picking up a block ends a selection, before the hand takes its picture.
	if (wasEmpty && (aMorph instanceof BlockMorph)) MB_editor.scripts.cancelSelection();
	// A reporter is held just inside its top-left, wherever it was pressed.
	var inset = wasEmpty && (aMorph instanceof ReporterBlockMorph), origin = inset && aMorph.situation();
	if (inset) aMorph.setPosition(this.position().subtract(10 * blockScale()));
	this.grabWithoutTellingChrome(aMorph);
	if (inset && (aMorph.parent === this)) this.grabOrigin = origin; // slide back to where it lay
	if (wasEmpty && isScripts && (aMorph.parent === this)) {
		this.takePicture(aMorph);
		fireIDEEvent('dragstart');
	}
};

// The hand's picture of what it holds, taken at the world's zoom, as a running script's
// outline is: morphic's fullImage has the retina ratio only, so at 200% a held block
// was drawn at half the screen's resolution and scaled up. A command block's outline
// reaches half its width past its bounds, so the picture takes in a screen pixel more
// all round, or its top and left edges would be cut to half their width. The shadow is
// cast here too, from the picture, as GP casts it from the block's texture: morphic's
// shadow is an image at the retina ratio only, which at 200% blurs its edges.
HandMorph.prototype.takePicture = function (aMorph) {
	var k = ZOOM,
		shadow = aMorph.getShadow(),
		bounds = aMorph.fullBounds().expandBy(1 / k),
		img = newCanvas(bounds.extent().multiplyBy(k)),
		ctx = img.getContext('2d'),
		pic;
	ctx.scale(k, k);
	ctx.translate(-bounds.origin.x, -bounds.origin.y);
	if (shadow) shadow.isVisible = false;
	aMorph.fullDrawOn(ctx, bounds);
	if (shadow) {
		shadow.isVisible = true;
		// GP's numbers, as BlockMorph.addShadow's; a canvas shadow is in screen pixels
		pic = newCanvas(bounds.extent().multiplyBy(k));
		ctx = pic.getContext('2d');
		ctx.shadowColor = 'rgba(0,0,0,' + (60 / 255) + ')';
		ctx.shadowOffsetX = ctx.shadowOffsetY = 7;
		ctx.shadowBlur = 1;
		ctx.drawImage(img, 0, 0, img.width, img.height);
		img = pic;
	}
	img.unitsPerPixel = 1 / k;
	this.cachedFullImage = img;
	this.cachedFullBounds = bounds;
};

HandMorph.prototype.fullDrawOnUnzoomed = HandMorph.prototype.fullDrawOn;
HandMorph.prototype.fullDrawOn = function (ctx, rect) {
	// A picture taken at the zoom is scaled back to the bounds it was taken from.
	var pic = this.cachedFullImage,
		k = pic && pic.unitsPerPixel,
		fb = this.cachedFullBounds,
		clipped = fb && rect.intersect(fb);

	if (!k || !fb) return this.fullDrawOnUnzoomed(ctx, rect);
	if (!clipped.extent().gt(ZERO)) return;
	ctx.save();
	ctx.globalAlpha = this.alpha;
	ctx.beginPath();
	ctx.rect(clipped.left(), clipped.top(), clipped.width(), clipped.height());
	ctx.clip();
	ctx.drawImage(pic, fb.left(), fb.top(), pic.width * k, pic.height * k);
	ctx.restore();
};

HandMorph.prototype.dropWithoutTellingChrome = HandMorph.prototype.drop;
HandMorph.prototype.drop = function () {
	var dragged = this.children[0];
	this.dropWithoutTellingChrome();
	if (dragged instanceof BlockMorph) MB_editor.scripts.cancelSelection();
	if ((dragged instanceof BlockMorph) || (dragged instanceof SelectedScriptsMorph)) {
		fireIDEEvent('dragend');
	}
};

// Shift is read from the mouse event: a key pressed while focus is on a chrome
// control never reaches morphic's keyboard.
HandMorph.prototype.processMouseDownWithoutShift = HandMorph.prototype.processMouseDown;
HandMorph.prototype.processMouseDown = function (event) {
	this.shiftKey = !!(event && event.shiftKey);
	this.ctrlPress = !!(event && event.ctrlKey && (event.button === 0));
	MB_editor.removeResultBubbles(); // a click anywhere takes the board's values away
	this.processMouseDownWithoutShift(event);
};

HandMorph.prototype.processMouseMoveWithoutCopying = HandMorph.prototype.processMouseMove;
HandMorph.prototype.processMouseMove = function (event) {
	var threshold = MorphicPreferences.grabThreshold;
	// morphic's own test is a straight-line distance in world units, which grow with
	// the block size; answer it here instead (a touch keeps morphic's test)
	if (this.grabPosition && (event instanceof MouseEvent)) {
		MorphicPreferences.grabThreshold = this.movedPastGrabThreshold(event, threshold) ? -1 : Infinity;
	}
	try {
		this.processMouseMoveCopyingWithCtrl(event);
	} finally {
		MorphicPreferences.grabThreshold = threshold;
	}
};

// A press becomes a drag once the pointer is more than threshold screen pixels
// from where it went down along either axis, whatever the block size.
HandMorph.prototype.movedPastGrabThreshold = function (event, threshold) {
	var canvas = getDocumentPositionOf(this.world.worldCanvas),
		dx = event.pageX - canvas.x - (this.grabPosition.x * ZOOM),
		dy = event.pageY - canvas.y - (this.grabPosition.y * ZOOM);
	return Math.round(Math.max(Math.abs(dx), Math.abs(dy))) > threshold;
};

// morphic makes a press with Ctrl held a right click, whose menu opens on release.
// If the pointer moves past the drag threshold first, a block pressed that way is
// dragged instead: a copy of it and the blocks below, or with Shift of it alone.
// A block morphic would not grab (not draggable, not a template) stays a right click.
HandMorph.prototype.processMouseMoveCopyingWithCtrl = function (event) {
	var block = this.morphToGrab, dup, pos;
	this.processMouseMoveWithoutCopying(event);
	this.updateCursor();
	if (!this.ctrlPress || (this.mouseButton !== 'right') || this.children.length ||
			!(block instanceof BlockMorph) || (!block.isDraggable && !block.isTemplate) ||
			(this.grabPosition.distanceTo(this.bounds.origin) <= MorphicPreferences.grabThreshold)) {
		return;
	}
	this.mouseButton = 'left';
	if (block.isTemplate || block.isFunctionDefinition()) { // a palette block, or a definition: drag it as usual
		this.processMouseMoveWithoutCopying(event);
		return;
	}
	dup = block.fullCopy();
	if ((event.shiftKey || this.shiftKey) && (dup instanceof CommandBlockMorph) && dup.nextBlock()) {
		dup.nextBlock().destroy();
	}
	pos = this.position();
	this.setPosition(this.grabPosition);
	dup.setPosition(this.position().subtract(10 * blockScale())); // held just inside its top-left
	this.grab(dup);
	this.setPosition(pos);
};

HandMorph.prototype.updateCursor = function () {
	// Show what the morph under the pointer does with a press. A drag keeps the
	// cursor it started with.
	if (this.children.length || this.inputTarget) return;
	const cursor = this.cursorFor(this.morphAtPointer());
	const style = this.world.worldCanvas.style;
	if (style.cursor !== cursor) style.cursor = cursor;
};

HandMorph.prototype.cursorFor = function (morph) {
	if (morph === MB_editor.paletteResizer) return 'ew-resize';
	for (let m = morph; m; m = m.parent) {
		if (m instanceof MicroBitDisplaySlotMorph) return 'crosshair'; // drawn on with the pointer
		if (
			(m instanceof TriggerMorph) ||
			(m instanceof SlotArrowMorph) ||
			(m instanceof BooleanSlotMorph) ||
			(m instanceof BlockExpanderMorph)
		) {
			return 'pointer';
		}
		if (((m instanceof StringMorph) || (m instanceof TextMorph)) && m.isEditable) return 'text';
		if (m instanceof SliderMorph) return 'move';
		if ((m instanceof HandleMorph) && ('resize' === m.type)) return 'nwse-resize';
	}
	return '';
};

// Files dropped on the window. morphic picks a reader by MIME type and climbs
// for a handler of that reader's name; a project or a library from a desktop
// arrives with no type at all, and nothing answered the reader it takes.

WorldMorph.prototype.droppedBinary = function (buffer, fileName) {
	// Decoded as UTF-8, which replaces bytes it cannot read rather than failing,
	// so a file that is not text reaches the editor and is judged by its name.
	MB_editor.processDroppedFile(fileName, new TextDecoder().decode(buffer));
};

WorldMorph.prototype.droppedText = function (text, fileName) {
	MB_editor.processDroppedFile(fileName, text);
};

HandMorph.prototype.processDropWithoutPictures = HandMorph.prototype.processDrop;
HandMorph.prototype.processDrop = function (event) {
	// morphic picks a reader by MIME type and reads every file at once, and would
	// hand a picture on as a canvas, which cannot carry its scripts. Read dropped
	// files here instead, by name and one at a time; a drop with none is read as a link or text.
	// Read the files the way morphic does: a drop's target is the element under
	// the pointer and has none of its own, while a chooser's change event does.
	var files = [...((event instanceof FileList) ? event
		: event.target.files || event.dataTransfer.files || [])];
	if (files.length > 0) return MB_editor.openDroppedFiles(files);
	// A link or a text clipping dragged from another page. A link's URL is
	// preferred to its text.
	var transfer = event.dataTransfer,
		text = transfer && (transfer.getData('URL') || transfer.getData('text/plain')),
		origin;
	if (!text) return this.processDropWithoutPictures(event);
	if (event.pageX !== undefined) { // the hand does not follow the pointer during a drag
		origin = getDocumentPositionOf(this.world.worldCanvas);
		this.setPosition(new Point(event.pageX - origin.x, event.pageY - origin.y).divideBy(ZOOM));
	}
	MB_editor.processDroppedText(text);
};

BlockMorph.prototype.destroy = function (justThis) {
	// private - use IDE_Morph.removeBlock() to first stop all my processes
	BlockMorph.uber.destroy.call(this);
};

BlockMorph.prototype.stackHeight = function () {
	var fb = this.fullBounds();
	return fb.bottom() - fb.top();
};

BlockMorph.prototype.snap = function () {
	var top = this.topBlock(),
		receiver,
		stage,
		ide;

	// fix highlights, if any
	if (this.getHighlight() && (this !== top)) {
		this.removeHighlight();
	}
	if (top.getHighlight()) {
		top.addHighlight(top.removeHighlight());
	}
};

// CommandBlockMorph ///////////////////////////////////////////////////

/*
	I am a stackable jigsaw-shaped block.

	I inherit from BlockMorph adding the following most important
	public accessors:

		nextBlock()		- set / get the block attached to my bottom
		bottomBlock()	- answer the bottom block of my stack
		blockSequence()	- answer an array of blocks starting with myself

	and the following "lexical awareness" indicators:

		partOfCustomCommand	- temporary bool set by the evaluator
		exitTag			- temporary string or number set by the evaluator
*/

// CommandBlockMorph inherits from BlockMorph:

CommandBlockMorph.prototype = new BlockMorph();
CommandBlockMorph.prototype.constructor = CommandBlockMorph;
CommandBlockMorph.uber = BlockMorph.prototype;

// CommandBlockMorph instance creation:

function CommandBlockMorph() {
	this.init();
}

CommandBlockMorph.prototype.init = function () {
	CommandBlockMorph.uber.init.call(this);

	this.bounds.setExtent(new Point(60, 24).multiplyBy(this.scale));
	this.fixLayout();
	this.rerender();

	this.partOfCustomCommand = false;
	this.exitTag = null;
};

// CommandBlockMorph enumerating:

CommandBlockMorph.prototype.blockSequence = function () {
	var sequence = [this],
		nb = this.nextBlock();
	while (nb) {
		sequence.push(nb);
		nb = nb.nextBlock();
	}
	return sequence;
};

CommandBlockMorph.prototype.bottomBlock = function () {
	// topBlock() also exists - inherited from SyntaxElementMorph
	if (this.nextBlock()) {
		return this.nextBlock().bottomBlock();
	}
	return this;
};

CommandBlockMorph.prototype.nextBlock = function (block) {
	// set / get the block attached to my bottom
	if (block) {
		var nb = this.nextBlock(),
			affected = this.parentThatIsA(CommandSlotMorph);
		this.add(block);
		if (nb) {
			block.bottomBlock().nextBlock(nb);
		}
		block.setPosition(
			new Point(
				this.left(),
				this.bottom() - (this.corner)
			)
		);
		if (affected) {
			affected.fixLayout();
		}
	} else {
		return detect(
			this.children,
			child => child instanceof CommandBlockMorph && !child.isPrototype
		);
	}
};

// CommandBlockMorph attach targets:

CommandBlockMorph.prototype.topAttachPoint = function () {
	return new Point(
		this.dentCenter(),
		this.top()
	);
};

CommandBlockMorph.prototype.bottomAttachPoint = function () {
	return new Point(
		this.dentCenter(),
		this.bottom()
	);
};

CommandBlockMorph.prototype.dentLeft = function () {
	return this.left()
		+ this.corner
		+ this.inset;
};

CommandBlockMorph.prototype.dentCenter = function () {
	return this.dentLeft()
		+ this.corner
		+ (this.dent * 0.5);
};

CommandBlockMorph.prototype.closestAttachTarget = function (newParent) {
	// Answer the first block or C slot, front to back, with an edge inside a box
	// around my top-left corner. A hat attaches only above the top of a stack.
	var scripts = newParent || this.parent,
		box = new Point(50, 15).multiplyBy(this.scale),
		x = this.left(),
		y = this.top(),
		yb = this.bottomBlock().bottom(),
		isHat = this instanceof HatBlockMorph,
		cslot = detect(this.inputs(), each => each instanceof CSlotMorph),
		near = (dx, dy) => (Math.abs(dx) < box.x) && (Math.abs(dy) < box.y),
		target = (element, loc) => ({element: element, loc: loc, type: 'block',
			point: loc === 'bottom' ? element.bottomAttachPoint() : element.topAttachPoint()}),
		isTop;

	if (cslot && cslot.nestedBlock()) {cslot = null; }
	for (const m of scripts.morphsFrontToBack(this)) {
		if (m instanceof CommandSlotMorph) {
			if (!isHat && near(x - m.left() - (3 * this.scale), y - m.top() - (3 * this.scale))) {
				return {element: m, loc: 'bottom', type: 'slot', point: m.slotAttachPoint()};
			}
		} else if ((m instanceof CommandBlockMorph) && !m.isPrototype && !m.isTemplate) {
			isTop = m.parent === scripts;
			if (isHat) {
				if (isTop && !(m instanceof HatBlockMorph) && near(x - m.left(), m.top() - yb)) {
					return target(m, 'top');
				}
			} else if (near(x - m.left(), y - m.bottom())) {
				return target(m, 'bottom');
			} else if (isTop && !(m instanceof HatBlockMorph)) {
				if (near(x - m.left(), m.top() - yb)) {return target(m, 'top'); }
				if (cslot && near(x - m.left(), cslot.top() - m.top())) {return target(m, 'wrap'); }
			}
		}
	}
	return null;
};

CommandBlockMorph.prototype.snap = function (hand) {
	var target = this.closestAttachTarget(),
		scripts = this.parentThatIsA(ScriptsMorph),
		before,
		next,
		offsetY,
		cslot,
		affected;

	this.setWrapHeight(null);
	if (target === null) {
		this.fixBlockColor();
		return;
	}
	if (target.loc === 'bottom') {
		if (target.type === 'slot') {
			this.removeHighlight();
			target.element.nestedBlock(this);
		} else {
			target.element.nextBlock(this);
		}
		if (this.isStop()) {
			next = this.nextBlock();
			if (next) {
				scripts.add(next);
				next.moveBy(this.extent().floorDivideBy(2));
				affected = this.parentThatIsA(CommandSlotMorph);
				if (affected) {
					affected.fixLayout();
				}
			}
		}
	} else if (target.loc === 'top') {
		target.element.removeHighlight();
		offsetY = this.bottomBlock().bottom() - this.bottom();
		this.setBottom(target.element.top() + this.corner - offsetY);
		this.setLeft(target.element.left());
		this.bottomBlock().nextBlock(target.element);
	} else if (target.loc === 'wrap') {
		cslot = detect( // this should be a method making use of caching
			this.inputs(), // these are already cached, so maybe it's okay
			each => each instanceof CSlotMorph
		);
		// assume the cslot is (still) empty, was checked determining the target
		before = (target.element.parent);

		// adjust position of wrapping block
		this.moveBy(target.point.subtract(cslot.slotAttachPoint()));

		// wrap c-slot around target
		cslot.nestedBlock(target.element);
		if (before instanceof CommandBlockMorph) {
			before.nextBlock(this);
		} else if (before instanceof CommandSlotMorph) {
			before.nestedBlock(this);
		}

		// fix zebra coloring.
		// this could probably be generalized into the fixBlockColor mechanism
		target.element.blockSequence().forEach(cmd =>
			cmd.fixBlockColor()
		);
	}
	this.fixBlockColor();
	if (this.snapSound) {
		this.snapSound.play();
	}
};

CommandBlockMorph.prototype.setWrapHeight = function (h) {
	// Stretch my first C slot to h while it is empty, or back to its own height for null.
	// The hand draws a picture taken when it grabbed me, so a held block takes a new one,
	// at the zoom as the grab's was.
	var cslot = detect(this.inputs(), each => each instanceof CSlotMorph),
		hand = this.parent instanceof HandMorph ? this.parent : null;

	if (!cslot || (cslot.wrapHeight === h)) return;
	cslot.wrapHeight = h;
	cslot.fixLayout();
	if (hand) {
		hand.changed();
		this.removeShadow();
		this.addShadow();
		hand.takePicture(this);
		hand.changed();
	}
};

CommandBlockMorph.prototype.prepareToBeGrabbed = function (handMorph) {
	// check whether the shift-key is held down and if I can be "extracted";
	// Shift from the page, so it counts while a button outside the scripting area has the focus.
	// A copy picked up from a menu has no parent and is never extracted.
	if (handMorph && this.parent && MB_editor.shiftDown && this.nextBlock()) {
		this.extract(); // NOTE: no infinite recursion, because extract()
						// doesn't call this again with a hand
		handMorph.grabOrigin.action = 'extract'; // ???
		return;
	}

	var oldPos = this.position();

	CommandBlockMorph.uber.prepareToBeGrabbed.call(this, handMorph);
};

CommandBlockMorph.prototype.isStop = function () {
	var choice;
	if (this.selector === 'doStopThis') { // this could be cached...
		choice = this.inputs()[0].evaluate();
		return choice instanceof Array && choice[0].length < 12;
	}
	return ([
		'doForever',
		'doReport',
		'removeClone',
		'doSwitchToScene'
	].indexOf(this.selector) > -1);
};

// CommandBlockMorph deleting

CommandBlockMorph.prototype.userDestroy = function () {
	if (this.nextBlock()) {
		this.userDestroyJustThis();
		return;
	}

	var scripts = this.parentThatIsA(ScriptsMorph),
		parent = this.parentThatIsA(SyntaxElementMorph),
		cslot = this.parentThatIsA(CSlotMorph);

	this.prepareToBeGrabbed(); // fix outer ring reporter slot

	this.destroy();
	if (scripts) MB_editor.scriptChanged();
	if (cslot) {
		cslot.fixLayout();
	}
	if (parent) {
		parent.reactToGrabOf(this); // fix highlight
	}
};

CommandBlockMorph.prototype.userDestroyJustThis = function () {
	// delete just this one block, reattach next block to the previous one,
	var scripts = this.parentThatIsA(ScriptsMorph);

	this.extract();
	if (scripts) MB_editor.scriptChanged();
};

CommandBlockMorph.prototype.userExtractJustThis = function () {
	// extract just this one block, reattach next block to the previous one,
	var situation = this.situation();
	situation.action = "extract"; // record how this block was retrieved
	this.extract();
	this.pickUp(situation.origin.world());
	this.parent.grabOrigin = situation;
};

CommandBlockMorph.prototype.extract = function () {
	// private: extract just this one block
	// reattach next block to the previous one,
	var scripts = this.parentThatIsA(ScriptsMorph),
		cs = this.parentThatIsA(CommandSlotMorph),
		pb,
		nb = this.nextBlock(),
		above,
		parent = this.parentThatIsA(SyntaxElementMorph),
		cslot = this.parentThatIsA(CSlotMorph);


	this.topBlock().fullChanged();
	if (this.parent) {
		pb = this.parent.parentThatIsA(CommandBlockMorph);
	}
	if (pb && (pb.nextBlock() === this)) {
		above = pb;
	} else if (cs && (cs.nestedBlock() === this)) {
		above = cs;
		this.prepareToBeGrabbed(); // restore ring reporter slot, if any
	}
	this.destroy(true); // just this block
	if (nb) {
		if (above instanceof CommandSlotMorph) {
			above.nestedBlock(nb);
		} else if (above instanceof CommandBlockMorph) {
			above.nextBlock(nb);
		} else {
			scripts.add(nb);
		}
	} else if (cslot) {
		cslot.fixLayout();
	}
	if (parent) {
		parent.reactToGrabOf(this); // fix highlight
	}
};

// The notch in a block's top edge and the tab under its bottom edge are GP's:
// open from 8 to 24 units along the edge, 10 across the floor and a corner
// deep. A path inset by n moves each slope n / 2 along the edge, which keeps
// the outline n wide across the slopes too.

SyntaxElementMorph.prototype.topNotch = function (ctx, left, inset) {
	var s = this.scale,
		half = inset / 2;

	ctx.lineTo(left + (8 * s) - half, inset);
	ctx.lineTo(left + (11 * s) - half, this.corner + inset);
	ctx.lineTo(left + (21 * s) + half, this.corner + inset);
	ctx.lineTo(left + (24 * s) + half, inset);
};

// Drawn right to left, from the bottom edge at y.
SyntaxElementMorph.prototype.bottomTab = function (ctx, left, y, inset) {
	var s = this.scale,
		half = inset / 2;

	ctx.lineTo(left + (24 * s) - half, y - inset);
	ctx.lineTo(left + (21 * s) - half, y + this.corner - inset);
	ctx.lineTo(left + (11 * s) + half, y + this.corner - inset);
	ctx.lineTo(left + (8 * s) + half, y - inset);
};

// CommandBlockMorph drawing:

CommandBlockMorph.prototype.outlineOutset = function () {
	// Half the outline's width: GP strokes a command or hat block's outline
	// centred on its edge, so half of it lies outside my bounds.
	return this.flatEdge / (this.isDrawnAtZoom() ? 2 * ZOOM : 2);
};

CommandBlockMorph.prototype.outlinePath = function(ctx, inset) {
	var pos = this.position();

	// top left:
	ctx.moveTo(inset, this.corner);
	ctx.quadraticCurveTo(inset, inset, this.corner, inset);

	this.topNotch(ctx, 0, inset);

	// top right:
	ctx.lineTo(this.width() - this.corner, inset);
	ctx.quadraticCurveTo(this.width() - inset, inset, this.width() - inset, this.corner);

	// C-Slots
	this.cSlots().forEach(slot => {
		slot.outlinePath(ctx, inset, slot.position().subtract(pos));
	});

	this.outlineBottom(ctx, inset);
};

// The bottom right corner, the tab (none under a stop block) and the bottom left corner.
CommandBlockMorph.prototype.outlineBottom = function (ctx, inset) {
	var bottom = this.height() - this.corner;

	ctx.lineTo(this.width() - inset, bottom - this.corner);
	ctx.quadraticCurveTo(this.width() - inset, bottom - inset, this.width() - this.corner, bottom - inset);
	if (!this.isStop()) this.bottomTab(ctx, 0, bottom, inset);
	ctx.lineTo(this.corner, bottom - inset);
	ctx.quadraticCurveTo(inset, bottom - inset, inset, bottom - this.corner);
};

// HatBlockMorph ///////////////////////////////////////////////////////

/*
	I am a script's top most block. I can attach command blocks at my
	bottom, but not on top.

*/

// HatBlockMorph inherits from CommandBlockMorph:

HatBlockMorph.prototype = new CommandBlockMorph();
HatBlockMorph.prototype.constructor = HatBlockMorph;
HatBlockMorph.uber = CommandBlockMorph.prototype;

// HatBlockMorph instance creation:

function HatBlockMorph() {
	this.init();
}

HatBlockMorph.prototype.init = function () {
	// additional property for generic hat block variations
	this.isLoaded = null; // for hat blocks with event-semantics
	this.functionDefinition = null; // the function I define, if I am a definition hat

	HatBlockMorph.uber.init.call(this);
	this.bounds.setExtent(new Point(120, 36).multiplyBy(this.scale));
	this.fixLayout();
	this.rerender();
};

// HatBlockMorph enumerating:

HatBlockMorph.prototype.blockSequence = function (forSyntax) {
	// override my inherited method so that I am not part of my sequence
	var result;
	if (forSyntax) {
		return HatBlockMorph.uber.blockSequence.call(this);
	}
	if (this.isCustomBlock || this.selector.startsWith('receiveCondition')) {
		return this;
	}
	result = HatBlockMorph.uber.blockSequence.call(this);
	result.shift();
	return result;
};

// HatBlockMorph accessing:

HatBlockMorph.prototype.isCustomBlockSpecific = function () {
	return this.selector === 'receiveSlotEvent';
};

HatBlockMorph.prototype.isFunctionDefinition = function () {
	// A definition hat is one that carries a function. Its `define` label is
	// localised and is not a selector.
	return this.functionDefinition instanceof MB_Function;
};

HatBlockMorph.prototype.blockDefinition = function () {
	// The prototype I show, if I am a definition hat.
	const proto = this.parts().find((m) => m.isPrototype);
	return proto ? proto.children.find((m) => m instanceof BlockDefinitionMorph) : null;
};

HatBlockMorph.prototype.inputs = function () {
	// A definition's prototype is not an input, so block walks pass over it.
	return HatBlockMorph.uber.inputs.call(this).filter((m) => !m.isPrototype);
};

HatBlockMorph.prototype.argList = function () {
	// A definition hat reads as "to name", as the saved project writes it.
	if (this.functionDefinition) return [this.functionDefinition.functionName];
	return HatBlockMorph.uber.argList.call(this);
};

HatBlockMorph.prototype.nextBlock = function (block) {
	// Attaching a body to a definition hides its prototype's details.
	const answer = HatBlockMorph.uber.nextBlock.call(this, block);
	if (block && this.blockDefinition()) this.blockDefinition().hideDetails();
	return answer;
};

HatBlockMorph.prototype.removeChild = function (aMorph) {
	// So does taking the body off.
	HatBlockMorph.uber.removeChild.call(this, aMorph);
	if ((aMorph instanceof CommandBlockMorph) && !aMorph.isPrototype && this.blockDefinition()) {
		this.blockDefinition().hideDetails();
	}
};

HatBlockMorph.prototype.definedFunctionName = function () {
	if (!this.isFunctionDefinition()) return 'Not a function definition';
	return this.functionDefinition.functionName;
};

HatBlockMorph.prototype.definitionMenu = function () {
	// What a block definition offers. A definition is edited where it sits, so
	// nothing here duplicates it or pulls a block out of it.
	var name = this.definedFunctionName(),
		items = [];

	items.push(['hide block definition', () => { MB_editor.hideDefinition(name); MB_editor.definitionsShownOrHidden(); },
		'take this definition out of the scripting area']);
	items.push('-');
	items.push(['copy to clipboard', () => this.copyToClipboard(),
		'copy these blocks to the clipboard']);
	items.push(['copy to clipboard as URL', () => this.copyToClipboardAsURL(),
		'copy these blocks to the clipboard as a URL']);
	items.push('-');
	items.push(['save picture of script', () => MB_editor.exportScriptImage(this),
		'save a picture of this block definition as a PNG file']);
	if (MB_editor.devMode()) {
		items.push('-');
		items.push(['show instructions', () => this.showDevView('showInstructions')]);
		items.push(['show compiled bytes', () => this.showDevView('showCompiledBytes')]);
		items.push(['show call tree', () => this.showDevView('showCallTree')]);
		items.push('-');
		items.push(['add to library', () => this.addToLibraryMenu()]);
	}
	items.push('-');
	items.push(['delete block definition...',
		() => MB_editor.deleteFunctionWithConfirm(name),
		'delete the definition of this block']);
	return chromeMenuFor(this.world(), items);
};

HatBlockMorph.prototype.addToLibraryMenu = function () {
	var name = this.definedFunctionName(),
		project = MB_editor.project,
		libs = [...project.libraries.values()].sort((a, b) => (a.moduleName < b.moduleName ? -1 : 1)),
		items = libs.map((lib) => [lib.moduleName, () => MB_editor.addToLibrary(name, lib)]);

	items.push('-');
	items.push(['My Blocks', () => MB_editor.addToLibrary(name, project.main)]);
	return chromeMenuFor(this.world(), items);
};

HatBlockMorph.prototype.codeString = function (indent = 0, result = []) {
	// A definition's script entry is the name-only stub `to <name> {}`. Its body
	// is printed with the function instead.
	if (!this.isFunctionDefinition()) {
		return HatBlockMorph.uber.codeString.call(this, indent, result);
	}
	result.push('\t'.repeat(indent) + 'to ' + quoteIfNeeded(this.definedFunctionName()) + ' {}\n');
	return result.join('');
};

HatBlockMorph.prototype.expression = function () {
	// A definition's node is the name-only stub its codeString writes. The body
	// goes out with the function, which answers a node of its own, and putting
	// it here as well would be the same code twice.
	if (!this.isFunctionDefinition()) {
		return HatBlockMorph.uber.expression.call(this);
	}
	return {
		selector: 'to',
		args: [this.definedFunctionName(), { isEmptyCommandList: true }],
		isReporter: false, next: null,
	};
};

HatBlockMorph.prototype.updateDefinedFunction = function () {
	// Give my function the body it now has in the scripting pane.
	if (!this.isFunctionDefinition()) return;
	this.functionDefinition.cmdList = this.nextBlock();
	this.functionDefinition.localVars = this.functionDefinition.collectLocalVars();
};

// HatBlockMorph drawing:

HatBlockMorph.prototype.outlinePath = function(ctx, inset) {
	var indent = this.corner * 2 + this.inset,
		bottom = this.height() - this.corner,
		bottomCorner = this.height() - this.corner * 2,
		radius = Math.max(this.corner - inset, 0),
		s = this.hatWidth,
		h = (s / Math.sqrt(2)) - (s / 2), // the flat top; the layout rounds it to whole device pixels
		pos = this.position();

	// top curve: one arch from the left edge to hatWidth, a fifth of hatWidth high
	ctx.moveTo(inset, h + inset);
	ctx.quadraticCurveTo(s / 2, h + inset - (0.4 * s), s, h + inset);

	// top right:
	ctx.lineTo(this.width() - this.corner, h + inset);
	ctx.quadraticCurveTo(this.width() - inset, h + inset, this.width() - inset, h + this.corner);

	// C-Slots
	this.cSlots().forEach(slot => {
		slot.outlinePath(ctx, inset, slot.position().subtract(pos));
	});

	this.outlineBottom(ctx, inset);
};

HatBlockMorph.prototype.render = function (ctx) {
	// Fill the shape, then stroke the outline centred on its edge. Filling it
	// in two layers, as other blocks do, moves the arch straight up and down,
	// which thins the outline where the arch slopes.
	var width = this.flatEdge / (this.isDrawnAtZoom() ? ZOOM : 1);

	this.cachedClr = this.color.toString();
	this.cachedClrBright = this.bright();
	this.cachedClrDark = this.outlineColor().toString();

	ctx.fillStyle = this.cachedClr;
	ctx.beginPath();
	this.outlinePath(ctx, 0);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = this.cachedClrDark;
	ctx.lineWidth = width;
	ctx.stroke();
};

// ReporterBlockMorph //////////////////////////////////////////////////

/*
	I am a block with a return value, either round-ish or diamond shaped
	I inherit all my important accessors from BlockMorph
*/

// ReporterBlockMorph inherits from BlockMorph:

ReporterBlockMorph.prototype = new BlockMorph();
ReporterBlockMorph.prototype.constructor = ReporterBlockMorph;
ReporterBlockMorph.uber = BlockMorph.prototype;

// ReporterBlockMorph instance creation:

function ReporterBlockMorph() {
	this.init();
}

ReporterBlockMorph.prototype.init = function () {
	ReporterBlockMorph.uber.init.call(this);
	this.bounds.setExtent(new Point(50, 22).multiplyBy(this.scale));
	this.fixLayout();
	this.rerender();

	this.cachedSlotSpec = null; // don't serialize
};

// ReporterBlockMorph drag & drop:

ReporterBlockMorph.prototype.snap = function (hand) {
	// passing the hand is optional (for when blocks are dragged & dropped)
	var scripts = this.parent,
		nb,
		target;

	this.cachedSlotSpec = null;
	if (!(scripts instanceof ScriptsMorph)) {
		return null;
	}

	target = scripts.closestInput(this);
	if (target !== null) {
		if (target instanceof CommandSlotMorph) {
			nb = target.nestedBlock();
			if (nb) {
				nb = nb.fullCopy();
				scripts.add(nb);
				nb.moveBy(nb.extent());
				nb.fixBlockColor();
			}
		}
		target.parent.replaceInput(target, this);
		if (target instanceof ReporterBlockMorph) { // the replaced reporter stays in the scripts
			scripts.add(target);
			target.moveBy(new Point(20, 20));
			target.fixBlockColor();
		}
		if (this.snapSound) {
			this.snapSound.play();
		}
	}
	this.fixBlockColor();
	ReporterBlockMorph.uber.snap.call(this);
};

ReporterBlockMorph.prototype.prepareToBeGrabbed = function (handMorph) {
	var oldPos = this.position();

	if (this.parent instanceof BlockMorph) {
		this.parent.revertToDefaultInput(this);
		this.setPosition(oldPos);
	}
	ReporterBlockMorph.uber.prepareToBeGrabbed.call(this, handMorph);
	this.cachedSlotSpec = null;
};

// ReporterBlockMorph enumerating

ReporterBlockMorph.prototype.blockSequence = function () {
	// reporters don't have a sequence, answer myself
	return this;
};

// ReporterBlockMorph evaluating

ReporterBlockMorph.prototype.isLocked = function () {
	// answer true if I cannot be exchanged by a dropped reporter
	return (this.getSlotSpec() === '%var');
};

ReporterBlockMorph.prototype.getSlotSpec = function () {
	// answer the spec of the slot I'm in, if any
	// cached for performance
	if (!this.cachedSlotSpec) {
		this.cachedSlotSpec = this.determineSlotSpec();
	/*
	} else {
		// debug slot spec caching
		var real = this.determineSlotSpec();
		if (real !== this.cachedSlotSpec) {
			throw new Error(
				'cached slot spec ' +
				this.cachedSlotSpec +
				' does not match: ' +
				real
			);
		}
	*/
	}
	return this.cachedSlotSpec;
};

ReporterBlockMorph.prototype.determineSlotSpec = function () {
	// private - answer the spec of the slot I'm in, if any
	var parts, idx;
	if (this.parent instanceof BlockMorph) {
		parts = this.parent.parts().filter(part =>
			!(part instanceof BlockHighlightMorph)
		);
		idx = parts.indexOf(this);
		if (idx !== -1) {
			if (this.parent.blockSpec) {
				return this.parseSpec(this.parent.blockSpec)[idx];
			}
		}
	}
	if (this.parent instanceof TemplateSlotMorph) {
		return this.parent.getSpec();
	}
	return '';
};

// ReporterBlockMorph events

ReporterBlockMorph.prototype.mouseClickLeft = function (pos) {
	if (this.parent instanceof TemplateSlotMorph) {
		this.userRenameVariable();
	} else if (this.parent instanceof BlockSectionDefinitionMorph) {
		this.userRenameInput(); // an input of a prototype, which has no value to show
	} else {
		ReporterBlockMorph.uber.mouseClickLeft.call(this, pos);
	}
};

ReporterBlockMorph.prototype.userRenameVariable = function () {
	// Rename the variable a block such as 'for' or 'local' declares. Its uses keep
	// the old name, and the board gets the changed script at the next step.
	MB_editor.prompt('Variable Name?', this.blockSpec, 'line').then((newName) => {
		if (!newName) return; // an empty or cancelled answer changes nothing
		this.userSetSpec(newName);
		this.scriptChanged();
	});
};

ReporterBlockMorph.prototype.userRenameInput = function () {
	// Rename an input of a block prototype, and its reads and sets in the body.
	// A name in use is refused rather than changed, so the input gets the name typed.
	// A name is in use when another input has it or the body uses it; a global the body never uses is free.
	const def = this.parentThatIsA(BlockDefinitionMorph),
		oldName = this.blockSpec;
	MB_editor.prompt('Variable Name?', oldName, 'line').then((answer) => {
		const newName = (answer || '').trim();
		if (!newName || (newName === oldName)) return;
		const hat = def.parentThatIsA(HatBlockMorph),
			body = hat && hat.nextBlock();
		const taken = new Set(def.inputNames()),
			declared = new Set();
		if (body) body.forAllBlocks((b) => {
			if ('v' === b.selector) taken.add(b.blockSpec);
			if (!['=', '+=', 'local', 'for'].includes(b.selector)) return;
			const slot = b.inputs()[0];
			if (!slot || (slot instanceof BlockMorph)) return;
			taken.add(slot.evaluate());
			if (['local', 'for'].includes(b.selector)) declared.add(slot.evaluate());
		});
		if (taken.has(newName)) {
			MB_editor.inform(localized('That name is already in use.'));
			return;
		}
		// A local or for of the old name is local to the whole function, so the body never reads the input.
		if (body && !declared.has(oldName)) body.allChildren().forEach((m) => {
			if ((m instanceof ReporterBlockMorph) && ('v' === m.selector) && (m.blockSpec === oldName)) {
				m.setSpec(newName);
			} else if ((m instanceof BlockMorph) && ['=', '+='].includes(m.selector)) {
				const slot = m.inputs()[0];
				if ((slot instanceof InputSlotMorph) && (slot.contents().text === oldName)) slot.setContents(newName);
			}
		});
		this.setSpec(newName);
		def.updateBlockDefinition();
	});
};

// ReporterBlockMorph deleting

ReporterBlockMorph.prototype.userDestroy = function () {
	// make sure to restore default slot of parent block
	var parent;

	parent = this.parentThatIsA(SyntaxElementMorph);
	if (parent) {
		this.parent.reactToGrabOf(this); // fix highlight and variadic case
	}

	var scripts = this.parentThatIsA(ScriptsMorph);

	this.topBlock().fullChanged();
	this.prepareToBeGrabbed(this.world().hand);
	this.destroy();
	if (scripts) MB_editor.scriptChanged();
};

// ReporterBlockMorph drawing:

ReporterBlockMorph.prototype.outlinePath = function (ctx, inset) {
	this.outlinePathOval(ctx, inset);
};

ReporterBlockMorph.prototype.outlinePathOval = function (ctx, inset) {
	// draw the 'flat' shape
	// A block narrower than it is tall (a one-letter variable) rounds to half
	// its width, or the corner arcs cross and leave a point top and bottom.
	var h = this.height(),
		w = this.width(),
		r = Math.min(this.rounding, h / 2, w / 2),
		radius = Math.max(r - inset, 0),
		pos = this.position();

	// top left:
	ctx.arc(
		r,
		r,
		radius,
		radians(-180),
		radians(-90),
		false
	);

	// top right:
	ctx.arc(
		w - r,
		r,
		radius,
		radians(-90),
		radians(-0),
		false
	);

	// C-Slots
	this.cSlots().forEach(slot => {
		slot.outlinePath(ctx, inset, slot.position().subtract(pos));
	});

	// bottom right:
	ctx.arc(
		w - r,
		h - r,
		radius,
		radians(0),
		radians(90),
		false
	);

	// bottom left:
	ctx.arc(
		r,
		h - r,
		radius,
		radians(90),
		radians(180),
		false
	);

	ctx.lineTo(r - radius, r); // close the path so we can clip it for rings
};

// ScriptsMorph ////////////////////////////////////////////////////////

/*
	I give feedback about possible drop targets and am in charge
	of actually snapping blocks together.

	My children are the top blocks of scripts.

	I store a back-pointer to my owner, i.e. the object (sprite)
	to whom my scripts apply.
*/

// ScriptsMorph inherits from FrameMorph:

ScriptsMorph.prototype = new FrameMorph();
ScriptsMorph.prototype.constructor = ScriptsMorph;
ScriptsMorph.uber = FrameMorph.prototype;

// ScriptsMorph preference settings

ScriptsMorph.prototype.cleanUpMargin = 5;
ScriptsMorph.prototype.cleanUpSpacing = 15;
ScriptsMorph.prototype.enableKeyboard = true;
ScriptsMorph.prototype.feedbackColor = new Color(254, 215, 34);

// ScriptsMorph instance creation:

function ScriptsMorph() {
	this.init();
}

ScriptsMorph.prototype.init = function () {
	this.feedbackMorph = new BoxMorph();
	this.rejectsHats = false;

	// keyboard editing support:
	this.focus = null;

	ScriptsMorph.uber.init.call(this);
	this.setColor(new Color(70, 70, 70));

	// initialize "undrop" queue
	this.isAnimating = false;
};

// ScriptsMorph deep copying:

ScriptsMorph.prototype.fullCopy = function () {
	var cpy = new ScriptsMorph(),
		pos = this.position(),
		child;
	if (this.focus) {
		this.focus.stopEditing();
	}
	this.children.forEach(morph => {
		if (!morph.block) {
			child = morph.fullCopy();
			cpy.add(child);
			child.setPosition(morph.position().subtract(pos));
		}
	});
	cpy.adjustBounds();
	return cpy;
};

// ScriptsMorph rendering:

ScriptsMorph.prototype.render = function (aContext) {
	aContext.fillStyle = this.getRenderColor().toString();
	aContext.fillRect(0, 0, this.width(), this.height());
	if (this.cachedTexture) {
		this.renderCachedTexture(aContext);
	} else if (this.texture) {
		this.renderTexture(this.texture, aContext);
	}
};

ScriptsMorph.prototype.getRenderColor = function () {
	return this.color;
};

ScriptsMorph.prototype.renderCachedTexture = function (ctx) {
	// support blocks-to-text slider
	if (SyntaxElementMorph.prototype.alpha > 0.8) {
		ScriptsMorph.uber.renderCachedTexture.call(this, ctx);
	}
};

// ScriptsMorph stepping:

ScriptsMorph.prototype.step = function () {
	var world = this.world(),
		hand = world.hand,
		block;

	if (this.feedbackMorph.parent) {
		this.feedbackMorph.destroy();
		this.feedbackMorph.parent = null;
	}
	if (this.focus && !world.keyboardFocus) {
		this.focus.getFocus(world);
	}
	if (hand.children.length === 0) {
		return null;
	}
	this.autoScroll(hand);
	if (!this.bounds.containsPoint(hand.bounds.origin)) {
		return null;
	}
	block = hand.children[0];
	if (!(block instanceof BlockMorph)) {
		return null;
	}
	if (!contains(hand.morphAtPointer().allParents(), this)) {
		return null;
	}
	if (block instanceof ReporterBlockMorph) {
		this.showReporterDropFeedback(block, hand);
	} else {
		this.showCommandDropFeedback(block);
	}
};

ScriptsMorph.prototype.autoScroll = function (hand) {
	// While a block is held within 80 screen pixels of an edge of the pane, scroll
	// 15 screen pixels that way each frame, whatever the block size.
	var frame = this.scrollFrame,
		pos = hand.bounds.origin,
		jump = 15 / ZOOM, dx = 0, dy = 0,
		near = (d) => Math.round(d * ZOOM) < 80;

	if (!frame || !frame.bounds.containsPoint(pos) || !this.wantsDropOf(hand.children[0])) return;
	if (near(pos.x - frame.left())) dx = jump;
	if (near(frame.right() - pos.x)) dx = -jump;
	if (near(pos.y - frame.top())) dy = jump;
	if (near(frame.bottom() - pos.y)) dy = -jump;
	if (dx) frame.scrollX(dx);
	if (dy) frame.scrollY(dy);
	if (dx || dy) frame.adjustScrollBars();
};

ScriptsMorph.prototype.showReporterDropFeedback = function (block, hand) {
	var target = this.closestInput(block);

	if (target === null) {
		return null;
	}
	// Sized in screen pixels, so the ring does not grow with the block size.
	this.feedbackMorph.edge = 10 / ZOOM;
	this.feedbackMorph.border = 3 / ZOOM;
	this.feedbackMorph.color = this.feedbackColor.copy();
	this.feedbackMorph.borderColor = this.feedbackColor;
	this.feedbackMorph.bounds = target.fullBounds().expandBy(12 / ZOOM);
	this.feedbackMorph.color.a = 150 / 255;
	this.feedbackMorph.rerender();
	this.add(this.feedbackMorph);
};

ScriptsMorph.prototype.showCommandDropFeedback = function (block) {
	var target, element, x, y, w, h;

	target = block.closestAttachTarget(this);
	// held where it would wrap a stack, the block's C slot stretches to show the stack inside it
	block.setWrapHeight(target && target.loc === 'wrap' ?
		target.element.fullBounds().height() + (10 * block.scale) : null);
	if (!target) {
		return null;
	}
	this.add(this.feedbackMorph);
	this.feedbackMorph.border = 0;
	this.feedbackMorph.edge = 0;
	this.feedbackMorph.alpha = 1;
	this.feedbackMorph.color = this.feedbackColor;
	element = target.element;
	h = SyntaxElementMorph.prototype.feedbackMinHeight / ZOOM;
	x = element.left();
	w = element.width();
	if (target.loc === 'top' || target.loc === 'wrap') {
		y = element.top() - h;
	} else if (target.type === 'slot') {
		// a short bar just inside the C, a little lower when the slot is empty
		x += 3;
		y = element.top() + (element.nestedBlock() ? 3 : 6);
		w = 30;
	} else {
		// just below the top of the block that follows, if any
		y = element.nextBlock() ? element.bottom() - 3 : element.bottom();
	}
	this.feedbackMorph.bounds = new Rectangle(x, y, x + w, y + h);
	this.feedbackMorph.changed();
};

ScriptsMorph.prototype.closestInput = function (reporter) {
	// Answer the unlocked slot under a point just inside the reporter's top-left,
	// allowing 5 screen pixels around it at any block size, or else the reporter
	// under that point.
	var point = reporter.position().add(10 * reporter.scale),
		morphs = this.morphsFrontToBack(reporter);

	return detect(morphs, m =>
			(m instanceof InputSlotMorph || m instanceof BooleanSlotMorph || m instanceof ColorSlotMorph) &&
				!m.isLocked() && m.bounds.expandBy(5 / ZOOM).containsPoint(point)
		) || detect(morphs, m =>
			(m instanceof ReporterBlockMorph) && (m.parent instanceof BlockMorph) &&
				!m.isTemplate && !m.isPrototype && !m.isLocked() && m.bounds.containsPoint(point)
		);
};

ScriptsMorph.prototype.morphsFrontToBack = function (except) {
	// Every part of every script, the one drawn on top first.
	var answer = [];
	function add(m) {
		if ((m !== except) && m.isVisible) {
			answer.push(m);
			m.children.forEach(add);
		}
	}
	this.children.forEach(child => {
		if (child instanceof BlockMorph) {add(child); }
	});
	return answer.reverse();
};

// ScriptsMorph user menu

ScriptsMorph.prototype.contextMenu = function () {
	// The chrome draws this menu, as it does for GP. Shift-right-click opens none.
	var world = this.world();
	if ((typeof Menus === 'undefined') || (world.currentKey === 16)) {
		return ScriptsMorph.uber.contextMenu.call(this);
	}
	fireIDEEvent('context', Object.assign({ selector: 'scriptingArea' }, chromePoint(world)));
	return chromeDrawnMenu;
};

// ScriptsMorph user menu features:

ScriptsMorph.prototype.definitionsFirst = function (a, b) {
	// Keep the function definitions on top, then order by position. Comparing
	// two definitions by position too is what makes this a total order, which
	// Array.sort needs and a pane with two definitions in it can reach.
	const ad = a.isFunctionDefinition(), bd = b.isFunctionDefinition();
	if (ad !== bd) return ad ? -1 : 1;
	return a.top() - b.top();
};

ScriptsMorph.prototype.cleanUp = function () {
	// Lay the scripts out in rows, starting a new row where the next script
	// would pass the visible right edge of the pane.
	var target = this.selectForEdit(), // enable copy-on-edit
		origin = target.topLeft(),
		frame = target.parent,
		margin = target.cleanUpMargin / ZOOM, // in screen pixels, whatever the block size
		spacing = 20 * blockScale(),
		maxRight = frame ? frame.width() - frame.scrollBarSize : target.width(),
		x = margin, y = margin, rowHeight = 0;
	target.children.sort(target.definitionsFirst).forEach(child => {
		var size = child.fullBounds().extent();
		if (x + size.x > maxRight) {
			x = margin;
			y += rowHeight + spacing;
			rowHeight = 0;
		}
		child.setPosition(origin.add(new Point(x, y)));
		x += size.x + spacing;
		rowHeight = Math.max(rowHeight, size.y);
	});
	if (target.parent) {
		target.setPosition(target.parent.topLeft());
	}
	target.adjustBounds();
};

ScriptsMorph.prototype.addClearOfScripts = function (aBlock, position) {
	// Add aBlock at position, moved down past any block already in the way.

	const others = this.children.filter(m => m instanceof BlockMorph)
		.flatMap(m => m.allChildren().filter(b => b instanceof BlockMorph));
	this.add(aBlock);
	aBlock.setPosition(position);
	let inTheWay;
	while ((inTheWay = others.find(b => b.bounds.intersects(aBlock.fullBounds())))) {
		aBlock.setTop(inTheWay.bottom() + this.cleanUpSpacing);
	}
};

ScriptsMorph.prototype.scriptsBounds = function () {
	// answer the bounds of all visible scripts, or of the first if none is visible,
	// or null if there are no scripts
	var boundingBox = null;
	if (this.children.length === 0) {return null; }
	this.children.forEach(child => {
		if (child.isVisible) {
			boundingBox = boundingBox ? boundingBox.merge(child.fullBounds()) : child.fullBounds();
		}
	});
	return boundingBox || this.children[0].fullBounds();
};

ScriptsMorph.prototype.scriptsPicture = function (scale = 1) {
	// private - answer a canvas containing the pictures of all scripts, at scale image
	// pixels per unit. Drawn straight onto it: a script's fullImage holds only the
	// screen's pixels and would blur when enlarged.
	var boundingBox = this.scriptsBounds(), pic, ctx, size;
	if (!boundingBox) {return; }
	// Sized once it is not retina: at the retina size first it can pass the browser's
	// limit, which leaves a canvas that draws nothing.
	size = boundingBox.extent().multiplyBy(scale).ceil();
	pic = newCanvas(new Point(1, 1), true);
	pic.width = size.x;
	pic.height = size.y;
	ctx = pic.getContext('2d');
	ctx.scale(scale, scale);
	ctx.translate(-boundingBox.left(), -boundingBox.top());
	this.children.forEach(child => {
		if (child.isVisible) {child.fullDrawOn(ctx, child.fullBounds()); }
	});
	return pic;
};

// ScriptsMorph sizing:

ScriptsMorph.prototype.adjustBounds = function () {
	// Script positions are saved from the pane's top left, so only scrolling moves it.
	// A script placed above or left of it is moved inside, and the pane keeps its top
	// and left edges when the scripts move away from them.
	var origin = this.topLeft(),
		scripts = this.children.filter(m => m instanceof BlockMorph);

	scripts.forEach(m => m.moveBy(new Point(
		Math.max(0, origin.x - m.left()), Math.max(0, origin.y - m.top()))));
	ScriptsMorph.uber.adjustBounds.call(this);
	if (!scripts.length || !this.scrollFrame) return;
	var left = Math.min(this.left(), origin.x), top = Math.min(this.top(), origin.y);
	if ((left !== this.left()) || (top !== this.top())) {
		this.bounds = new Rectangle(left, top, this.right(), this.bottom());
		this.scrollFrame.adjustScrollBars();
	}
};

// ScriptsMorph drag & drop:

ScriptsMorph.prototype.wantsDropOf = function (aMorph) {
	// override the inherited method
	if (aMorph instanceof HatBlockMorph) {
		return (!this.rejectsHats && !aMorph.isCustomBlockSpecific()) ||
			(this.rejectsHats && aMorph.isCustomBlockSpecific());
	}
	return (aMorph instanceof SyntaxElementMorph) || (aMorph instanceof SelectedScriptsMorph);
};

ScriptsMorph.prototype.reactToDropOf = function (droppedMorph, hand) {
	if (droppedMorph instanceof BlockMorph) {
		droppedMorph.snap(hand);
	}
	if (droppedMorph instanceof SelectedScriptsMorph) {
		droppedMorph.unpackInto(this);
	}
	this.adjustBounds();
	MB_editor.scriptChanged();
};

// ScriptsMorph events

ScriptsMorph.prototype.mouseClickLeft = function (pos) {
	if (this.focus) {this.focus.stopEditing(); }
};

ScriptsMorph.prototype.selectForEdit = function () {
	return this;
};

// ScriptsMorph selecting several scripts

/*
	A left drag that starts on the empty pane draws a band, and every script
	with a block under the band is selected. this.selection is null when
	nothing is being selected, else the top blocks of the selected scripts.
*/

ScriptsMorph.prototype.mouseDownLeft = function (pos) {
	// A drag from a selected script carries the whole selection. One from the
	// empty pane draws a band, but pans on a touch screen or with the middle button.
	var hand = this.world().hand,
		target = hand.morphAtPointer(),
		block = target.parentThatIsA(BlockMorph);

	if (this.hasSelection()) {
		if (hand.shiftKey) return; // the click adds or removes a script
		if (block && this.selection.includes(block.topBlock())) {
			return this.dragSelection();
		}
	}
	if (MorphicPreferences.isTouchDevice || hand.middleButton) return this.scrollFrame.mouseDownLeft(pos);
	if (target === this) this.startSelecting(pos);
};

ScriptsMorph.prototype.topBlocks = function () {
	return this.children.filter((m) => m instanceof BlockMorph);
};

ScriptsMorph.prototype.hasSelection = function () {
	return !!this.selection && (this.selection.length > 0);
};

ScriptsMorph.prototype.startSelecting = function (pos) {
	this.cancelSelection();
	this.selection = [];
	this.selectionBand = new SelectionBandMorph(this, pos);
	this.world().add(this.selectionBand);
	fireIDEEvent('dragstart'); // so a release over a chrome panel still reaches the band
};

ScriptsMorph.prototype.cancelSelection = function () {
	if (!this.selection) return;
	this.topBlocks().forEach((top) => top.showSelected(false));
	if (this.selectionBand) this.selectionBand.destroy();
	this.selectionBand = null;
	this.selection = null;
};

ScriptsMorph.prototype.toggleSelected = function (top) {
	var i = this.selection.indexOf(top);
	if (i < 0) {
		this.selection.push(top);
	} else {
		this.selection.splice(i, 1);
	}
	top.showSelected(i < 0);
};

ScriptsMorph.prototype.takeSelection = function () {
	// Answer the selected top blocks and end the selection.
	var tops = this.selection || [];
	this.cancelSelection();
	return tops;
};

ScriptsMorph.prototype.selectionMenu = function (forDefinition) {
	var items = [];
	if (forDefinition) {
		items.push(['drag selection', () => this.dragSelection()]);
		items.push(['hide block definition', () => this.hideSelectedDefinitions()]);
	} else {
		items.push(['run selected', () => this.runSelected('run')]);
		items.push(['stop selected', () => this.runSelected('stop')]);
		items.push(['toggle selected', () => this.runSelected('toggle')]);
		items.push('-');
		items.push(['copy selection', () => this.copySelection()]);
		items.push(['duplicate selection', () => this.duplicateSelection()]);
		items.push(['drag selection', () => this.dragSelection()]);
		items.push('-');
		items.push(['delete selection', () => this.deleteSelection()]);
	}
	return chromeMenuFor(this.world(), items);
};

ScriptsMorph.prototype.selectionKey = function (event) {
	// Answer whether the key acted on the selected scripts.
	if (!this.selection) return false;
	if (('Delete' === event.key) || ('Backspace' === event.key)) {
		this.deleteSelection();
	} else if ('Enter' === event.key) {
		this.runSelected(event.shiftKey ? 'toggle' : 'run');
	} else if ('Escape' === event.key) {
		this.runSelected('stop');
	} else {
		return false;
	}
	return true;
};

ScriptsMorph.prototype.runSelected = function (how) {
	// 'run' starts the scripts that are not running, 'stop' stops the ones
	// that are, and 'toggle' does both.
	this.takeSelection().forEach((top) => {
		var running = MB_editor.codeManager.isRunning(top);
		if (running ? (how !== 'run') : (how !== 'stop')) MB_editor.toggleRunning(top);
	});
};

ScriptsMorph.prototype.copySelection = function () {
	setClipboard(MB_editor.scriptsString(this.takeSelection()));
};

ScriptsMorph.prototype.deleteSelection = function () {
	this.takeSelection().forEach((top) => top.destroy());
	MB_editor.scriptChanged(); // their chunks are deleted at the next step
};

ScriptsMorph.prototype.duplicateSelection = function () {
	// A second hat would break one hat per function, so definitions are not copied.
	var copies = this.takeSelection().filter((top) => !top.isFunctionDefinition()).map((top) => top.fullCopy());
	if (copies.length > 0) this.pickUp(new SelectedScriptsMorph(copies));
};

ScriptsMorph.prototype.dragSelection = function () {
	var tops = this.takeSelection();
	if (tops.length === 1) {
		this.world().hand.grab(tops[0]);
	} else if (tops.length > 1) {
		this.pickUp(new SelectedScriptsMorph(tops));
	}
};

ScriptsMorph.prototype.pickUp = function (selected) {
	// In the pane first, so a drop elsewhere can slide it back here.
	this.add(selected);
	this.world().hand.grab(selected);
};

ScriptsMorph.prototype.hideSelectedDefinitions = function () {
	this.takeSelection().forEach((top) => {
		if (top.isFunctionDefinition()) MB_editor.hideDefinition(top.definedFunctionName());
	});
	MB_editor.definitionsShownOrHidden();
};

BlockMorph.prototype.showSelected = function (flag) {
	// Tint every block of this script green, or put its colours back.
	this.allChildren().forEach((b) => {
		if (!(b instanceof BlockMorph)) return;
		if (flag && !b.unselectedColor) {
			b.unselectedColor = b.color;
			b.setColor(b.color.mixed(0.5, new Color(0, 255, 0)));
		} else if (!flag && b.unselectedColor) {
			b.setColor(b.unselectedColor);
			b.unselectedColor = null;
		}
	});
};

// SelectionBandMorph //////////////////////////////////////////////////

// I am the band dragged over a scripts pane. I follow the hand while its
// button is down and select the scripts I touch when it is released.

SelectionBandMorph.prototype = new Morph();
SelectionBandMorph.prototype.constructor = SelectionBandMorph;
SelectionBandMorph.uber = Morph.prototype;

function SelectionBandMorph(scripts, origin) {
	this.init(scripts, origin);
}

SelectionBandMorph.prototype.init = function (scripts, origin) {
	SelectionBandMorph.uber.init.call(this);
	this.scripts = scripts;
	this.origin = origin;
	this.color = new Color(0, 128, 0);
	this.alpha = 50 / 255;
	this.bounds = new Rectangle(origin.x, origin.y, origin.x, origin.y);
};

SelectionBandMorph.prototype.destroy = function () {
	fireIDEEvent('dragend');
	SelectionBandMorph.uber.destroy.call(this);
};

SelectionBandMorph.prototype.step = function () {
	var hand = this.world().hand;
	this.update(hand.position());
	if (!hand.mouseButton) this.endSelection();
};

SelectionBandMorph.prototype.update = function (pos) {
	var o = this.origin,
		r = new Rectangle(Math.min(o.x, pos.x), Math.min(o.y, pos.y),
			Math.max(o.x, pos.x), Math.max(o.y, pos.y));
	this.changed();
	this.bounds = r.intersect(this.scripts.scrollFrame.bounds);
	this.changed();
	if (this.bounds.area() <= 1) return;
	this.scripts.topBlocks().forEach((top) => top.showSelected(this.touches(top)));
};

SelectionBandMorph.prototype.touches = function (top) {
	return top.allChildren().some((m) => (m instanceof BlockMorph) && m.bounds.intersects(this.bounds));
};

SelectionBandMorph.prototype.endSelection = function () {
	var scripts = this.scripts;
	if (this.bounds.area() > 1) {
		scripts.selection = scripts.topBlocks().filter((top) => this.touches(top));
	}
	scripts.selectionBand = null;
	this.destroy();
};

// SelectedScriptsMorph ////////////////////////////////////////////////

// I carry several scripts while they are dragged together, keeping the
// distances between them, and put them back in the pane I am dropped on.

SelectedScriptsMorph.prototype = new Morph();
SelectedScriptsMorph.prototype.constructor = SelectedScriptsMorph;
SelectedScriptsMorph.uber = Morph.prototype;

function SelectedScriptsMorph(tops) {
	this.init(tops);
}

SelectedScriptsMorph.prototype.init = function (tops) {
	SelectedScriptsMorph.uber.init.call(this);
	this.bounds = tops.map((top) => top.fullBounds()).reduce((a, b) => a.merge(b));
	tops.forEach((top) => this.add(top));
};

SelectedScriptsMorph.prototype.render = nop; // only the scripts are drawn

SelectedScriptsMorph.prototype.unpackInto = function (scripts) {
	this.children.slice().forEach((top) => scripts.add(top));
	this.destroy();
};

// ArgMorph //////////////////////////////////////////////////////////

/*
	I am a syntax element and the ancestor of all block inputs.
	I am present in block labels.
	I am just a receptacle for inherited methods and attributes.
*/

// ArgMorph inherits from SyntaxElementMorph:

ArgMorph.prototype = new SyntaxElementMorph();
ArgMorph.prototype.constructor = ArgMorph;
ArgMorph.uber = SyntaxElementMorph.prototype;

// ArgMorph instance creation:

function ArgMorph(type) {
	this.init(type);
}

ArgMorph.prototype.init = function (type) {
	this.type = type || null;
	this.icon = null;
	ArgMorph.uber.init.call(this);
	this.color = new Color(0, 17, 173);
};

// ArgMorph events:

ArgMorph.prototype.markUnsupplied = function () {
	// The source that built my block gave me no argument; see
	// MB_Parser.makeBlock and BlockMorph.argInputs.
	this.mbUnsupplied = true;
};

ArgMorph.prototype.isUnsupplied = function () {
	return this.mbUnsupplied === true;
};

ArgMorph.prototype.setContents = function () {
	// subclass responsibility
	nop();
};

// ArgMorph drag & drop: for demo puposes only

ArgMorph.prototype.justDropped = function () {
	if (!(this instanceof CommandSlotMorph)) {
		this.fixLayout();
		this.rerender();
	}
};

// ArgMorph spec extrapolation (for demo purposes)

ArgMorph.prototype.getSpec = function () {
	return '%auto';
};

// ArgMorph menu

ArgMorph.prototype.userMenu = function () {
	let sm = this.slotMenu();
	return sm ? sm : this.parent.userMenu();
};

ArgMorph.prototype.slotMenu = function () {
	// subclass responsibility
	return null;
};

// ArgMorph drawing

ArgMorph.prototype.fixLayout = function () {
	if (this.icon) {
		this.icon.setPosition(this.position());
		this.bounds.setExtent(this.icon.extent());
	} else {
		ArgMorph.uber.fixLayout.call(this);
	}
};

ArgMorph.prototype.render = function (ctx) {
	// make sure my icon's shadow color matches my block's color
	var block;
	if (this.icon) {
		block = this.parentThatIsA(BlockMorph);
		if (block) {
			this.icon.shadowColor = block.color.darker(this.labelContrast);
		}
	}
	ArgMorph.uber.render.call(this, ctx);
};

// ArgMorph evaluation

ArgMorph.prototype.evaluate = function () {
	return null;
};

// CommandSlotMorph ////////////////////////////////////////////////////

/*
	I am a CommandBlock-shaped input slot. I can nest command blocks
	and also accept reporters (containing reified scripts).

	my most important accessor is

	nestedBlock()	 - answer the command block I encompass, if any

	My command spec is %cmd

	evaluate() returns my nested block or null
*/

// CommandSlotMorph inherits from ArgMorph:

CommandSlotMorph.prototype = new ArgMorph();
CommandSlotMorph.prototype.constructor = CommandSlotMorph;
CommandSlotMorph.uber = ArgMorph.prototype;

// CommandSlotMorph instance creation:

function CommandSlotMorph() {
	this.init();
}

CommandSlotMorph.prototype.init = function () {
	CommandSlotMorph.uber.init.call(this);
	this.color = new Color(0, 17, 173);
	this.setExtent(
		new Point(230, this.corner * 4 + this.cSlotPadding)
	);
};

CommandSlotMorph.prototype.getSpec = function () {
	return '%cmd';
};

// CommandSlotMorph enumerating:

CommandSlotMorph.prototype.topBlock = function () {
	if (this.parent.topBlock) {
		return this.parent.topBlock();
	}
	return this.nestedBlock();
};

// CommandSlotMorph nesting:

CommandSlotMorph.prototype.isUnsupplied = function () {
	return (this.mbUnsupplied === true) && (this.nestedBlock() == null);
};

CommandSlotMorph.prototype.nestedBlock = function (block) {
	if (block) {
		var nb = this.nestedBlock();
		this.add(block);
		if (nb) {
			block.bottomBlock().nextBlock(nb);
		}
		this.fixLayout();
	} else {
		return detect(
			this.children,
			child => child instanceof CommandBlockMorph
		);
	}
};

// CommandSlotMorph attach targets:

CommandSlotMorph.prototype.slotAttachPoint = function () {
	return new Point(
		this.dentCenter(),
		this.top() + this.corner * 2
	);
};

CommandSlotMorph.prototype.dentLeft = function () {
	return this.left()
		+ this.corner
		+ this.inset * 2;
};

CommandSlotMorph.prototype.dentCenter = function () {
	return this.dentLeft()
		+ this.corner
		+ (this.dent * 0.5);
};

// CommandSlotMorph layout:

CommandSlotMorph.prototype.fixLayout = function () {
	var nb = this.nestedBlock();
	if (this.parent) {
		if (!this.color.eq(this.parent.color)) {
			this.setColor(this.parent.color);
		}
	}
	if (nb) {
		nb.setPosition(
			new Point(
				this.left() + this.edge + this.rfBorder,
				this.top() + this.edge + this.rfBorder
			)
		);
		this.bounds.setWidth(nb.fullBounds().width()
			+ (this.edge + this.rfBorder) * 2
			);
		this.bounds.setHeight(nb.fullBounds().height()
			+ this.edge + (this.rfBorder * 2) - (this.corner - this.edge)
			);
	} else {
		this.bounds.setHeight(this.corner * 4);
		this.bounds.setWidth(
			this.corner * 4
				+ this.inset
				+ this.dent
		);
	}
	if (this.fixesParentLayout && this.parent && this.parent.fixLayout) {
		this.parent.fixLayout();
	}
};

// CommandSlotMorph evaluating:

CommandSlotMorph.prototype.evaluate = function () {
	return this.nestedBlock();
};

// CommandSlotMorph drawing:

CommandSlotMorph.prototype.render = function (ctx) {
	this.cachedClr = this.color.toString();
	this.cachedClrBright = this.bright();
	this.cachedClrDark = this.dark();
	ctx.fillStyle = this.cachedClr;
	ctx.fillRect(0, 0, this.width(), this.height());

	// draw the 'flat' shape:
	ctx.fillStyle = this.rfColor.toString();
	this.drawFlat(ctx);
};

CommandSlotMorph.prototype.drawFlat = function (ctx) {
	var isFilled = this.nestedBlock() !== null,
		ins = (isFilled ? this.inset : this.inset / 2),
		dent = (isFilled ? this.dent : this.dent / 2),
		indent = this.corner * 2 + ins,
		edge = this.edge,
		rf = (isFilled ? this.rfBorder : 0),
		y = this.height() - this.corner - edge;

	ctx.beginPath();

	// top left:
	ctx.arc(
		this.corner + edge,
		this.corner + edge,
		this.corner,
		radians(-180),
		radians(-90),
		false
	);

	// dent:
	ctx.lineTo(this.corner + ins + edge + rf * 2, edge);
	ctx.lineTo(indent + edge + rf * 2, this.corner + edge);
	ctx.lineTo(
		indent + edge + rf * 2 + (dent - rf * 2),
		this.corner + edge
	);
	ctx.lineTo(
		indent + edge + rf * 2 + (dent - rf * 2) + this.corner,
		edge
	);
	ctx.lineTo(this.width() - this.corner - edge, edge);

	// top right:
	ctx.arc(
		this.width() - this.corner - edge,
		this.corner + edge,
		this.corner,
		radians(-90),
		radians(-0),
		false
	);

	// bottom right:
	ctx.arc(
		this.width() - this.corner - edge,
		y,
		this.corner,
		radians(0),
		radians(90),
		false
	);

	// bottom left:
	ctx.arc(
		this.corner + edge,
		y,
		this.corner,
		radians(90),
		radians(180),
		false
	);

	ctx.closePath();
	ctx.fill();

};

// CSlotMorph ////////////////////////////////////////////////////

/*
	I am a C-shaped input slot. I can nest command blocks and also accept
	reporters (containing reified scripts).

	my most important accessor is

	nestedBlock()	 - the command block I encompass, if any (inherited)

	My command spec is %c

	evaluate() returns my nested block or null
*/

// CSlotMorph inherits from CommandSlotMorph:

CSlotMorph.prototype = new CommandSlotMorph();
CSlotMorph.prototype.constructor = CSlotMorph;
CSlotMorph.uber = CommandSlotMorph.prototype;

// CSlotMorph instance creation:

function CSlotMorph() {
	this.init();
}

CSlotMorph.prototype.init = function () {
	CommandSlotMorph.uber.init.call(this);
	this.color = new Color(0, 17, 173);
	this.setExtent(new Point(230, this.corner * 4 + this.cSlotPadding));
};

CSlotMorph.prototype.getSpec = function () {
	return '%c';
};

// CSlotMorph layout:

CSlotMorph.prototype.wrapHeight = null; // set while the held block would wrap a stack

CSlotMorph.prototype.fixLayout = function () {
	var nb = this.nestedBlock();
	if (nb) {
		nb.setPosition(this.position().add(new Point(this.nestedLeft(), this.nestedTop())));
		this.bounds.setHeight(nb.fullBounds().height() + (3 * this.scale));
		this.bounds.setWidth(
			nb.fullBounds().width() + (this.cSlotPadding * 2)
		);
	} else {
		this.bounds.setHeight(this.wrapHeight || (this.corner * 4 + this.cSlotPadding)); // default, unless wrapping
		this.bounds.setWidth(
			this.corner * 4
				+ (this.inset * 2)
				+ this.dent
				+ (this.cSlotPadding * 2)
		);
	}

	if (this.fixesParentLayout && this.parent && this.parent.fixLayout) {
		this.parent.fixLayout();
	}
};

CSlotMorph.prototype.nestedLeft = function () {
	// In whole half CSS pixels, one more below 150%: 5.5 at 100%, 5 from 150% up.
	var s = 2 * ZOOM * this.scale;
	return (Math.floor(5 * s) + (s < 3 ? 1 : 0)) / (2 * ZOOM);
};

CSlotMorph.prototype.nestedTop = function () {
	// A unit down, cut to whole half CSS pixels as nestedLeft is: half a CSS pixel
	// at 75%, one at 100% and 125%, so on a 2x screen it is a whole device pixel.
	var s = 2 * ZOOM * this.scale;
	return Math.floor(s) / (2 * ZOOM);
};

CSlotMorph.prototype.armTop = function (nb) {
	// The nested block's body ends on a fraction of a screen pixel at some block
	// sizes (125%: 2.5 device pixels a unit). If the arm began there too, both
	// edges would cover only part of that pixel row and the pane would show
	// between them as a light line, so the arm starts at the top of the row,
	// under the nested block.
	var end = nb.bottom() - nb.corner,
		pixels = ZOOM * (window.devicePixelRatio || 1);
	return Math.floor(end * pixels + 1e-6) / pixels;
};

CSlotMorph.prototype.fixHolesLayout = function () {
	this.holes = [
		new Rectangle(
			this.inset,
			this.corner,
			this.width(),
			this.height() - this.corner
		)
	];
};

CSlotMorph.prototype.isLocked = function () {
	return this.isStatic;
};

// CSlotMorph drawing:

CSlotMorph.prototype.render = function (ctx) { return; };

CSlotMorph.prototype.outlinePath = function (ctx, inset, offset) {
	var ox = offset.x,
		oy = offset.y,
		radius = Math.max(this.corner - inset, 0),
		// the arms end at the block's right edge, not at the slot's, which reaches past it
		right = this.parent.width(),
		top = oy + this.scale, // the opening's top edge, within a device pixel of a nested block's top
		nb = this.nestedBlock() && this.nestedBlock().bottomBlock(),
		// the arm below the slot starts where the last nested block's body ends
		bottom = nb ? this.armTop(nb) - this.top() + this.corner : this.height() - (2 * this.scale),
		// with blocks inside, the inner edge straddles their left side, which covers part of it
		edge = this.inset + ox;

	// upper arm's right end:
	ctx.lineTo(right - inset, top - this.corner);
	ctx.arc(
		right - this.corner,
		top - this.corner,
		radius,
		radians(0),
		radians(90),
		false
	);

	// jigsaw shape:
	this.bottomTab(ctx, edge, top, inset);
	ctx.lineTo(
		edge + this.corner,
		top - inset
	);
	ctx.arc(
		edge + this.corner,
		top + this.corner,
		this.corner + inset,
		radians(270),
		radians(180),
		true
	);

	// bottom:
	ctx.lineTo(
		edge - inset,
		bottom - (this.corner * 2) + oy
	);
	ctx.arc(
		edge + this.corner,
		bottom - (this.corner * 2) + oy,
		this.corner + inset,
		radians(180),
		radians(90),
		true
	);
	ctx.lineTo(
		right - this.corner,
		bottom - this.corner + oy + inset
	);
	ctx.arc(
		right - this.corner,
		bottom + oy,
		radius,
		radians(-90),
		radians(-0),
		false
	);
};

// BlockExpanderMorph //////////////////////////////////////////////////////

/*
	I am used to expand and contract blocks with optional arguments.
*/

// BlockExpanderMorph inherits from ArgMorph:

BlockExpanderMorph.prototype = new Morph();
BlockExpanderMorph.prototype.constructor = BlockExpanderMorph;
BlockExpanderMorph.uber = Morph.prototype;

// BlockExpanderMorph instance creation:

function BlockExpanderMorph(aBlock) {
	this.init(aBlock);
}

BlockExpanderMorph.prototype.init = function (aBlock) {
	BlockExpanderMorph.uber.init.call(this);
	this.color = new Color(255, 255, 255, 220 / 255); // lets the block's colour show through
	this.showLeft = aBlock.canContract();
	this.showRight = aBlock.canExpand();
	this.bounds.setHeight(18 * aBlock.scale);
	this.fixLayout();
};

BlockExpanderMorph.prototype.fixLayout = function () {
	// A unit is half my height in device pixels, rounded down as GP's is, so it
	// changes with the world's zoom. At 125% my 45 pixels make a unit of 22.
	const size = this.height(), unit = blockHalf(size, this.pixelsPerUnit || 2 * ZOOM);
	this.bounds.setWidth((this.showLeft && this.showRight) ? (3 * unit) + this.gapFor(size) : 2 * unit);
};

BlockExpanderMorph.prototype.gapFor = function (size) {
	// the space between the two arrows of an expander the given size tall
	return Math.floor(2 * size / 3) / 2;
};

// BlockExpanderMorph drawing:

BlockExpanderMorph.prototype.render = function (ctx) {
	// Each arrow fills a box a unit wide, a block scale in from my top and
	// bottom; the first starts half a unit in from my left.
	const h = this.height(), ppu = this.pixelsPerUnit || 2 * ZOOM,
		unit = blockHalf(h, ppu), inset = h / 18;
	let x = blockHalf(unit, ppu);
	ctx.fillStyle = this.color.toString();

	if (this.showLeft) {
		ctx.beginPath();
		ctx.moveTo(x + unit, inset);
		ctx.lineTo(x, h / 2);
		ctx.lineTo(x + unit, h - inset);
		ctx.closePath();
		ctx.fill();
		x += unit + this.gapFor(h);
	}

	if (this.showRight) {
		ctx.beginPath();
		ctx.moveTo(x, inset);
		ctx.lineTo(x + unit, h / 2);
		ctx.lineTo(x, h - inset);
		ctx.closePath();
		ctx.fill();
	}
};

// BlockExpanderMorph user input:

BlockExpanderMorph.prototype.mouseClickLeft = function (pos) {
	const aBlock = this.parent;
	if (!(aBlock instanceof BlockMorph)) return; // should not happen
	aBlock.scriptChanged();

	if (!this.showLeft) {
		aBlock.expand();
	} else if (!this.showRight) {
		aBlock.contract();
	} else {
		if ((pos.x - this.left()) > (this.width() / 2)) {
			aBlock.expand();
		} else {
			aBlock.contract();
		}
	}
}

// BlockHighlightMorph /////////////////////////////////////////////////

/*
	I am a glowing halo around a block or stack of blocks indicating that
	a script is currently active or has encountered an error.
	I halso have an optional readout that can display a thread count
	if more than one process shares the same script
*/

// BlockHighlightMorph inherits from Morph:

BlockHighlightMorph.prototype = new Morph();
BlockHighlightMorph.prototype.constructor = BlockHighlightMorph;
BlockHighlightMorph.uber = Morph.prototype;

// BlockHighlightMorph instance creation:

function BlockHighlightMorph() {
	this.threadCount = 0;
	this.init();
}

BlockHighlightMorph.prototype.init = function () {
	BlockHighlightMorph.uber.init.call(this);
	this.isCachingImage = true;
};

BlockHighlightMorph.prototype.drawOn = function (ctx, rect) {
	// The image is drawn at the world's zoom, so it is scaled back to my bounds.
	var pic = this.cachedImage,
		k = (pic && pic.unitsPerPixel) || 1,
		clipped = rect.intersect(this.bounds);

	if (!pic || !clipped.extent().gt(ZERO)) return;
	ctx.save();
	ctx.globalAlpha = this.alpha;
	ctx.beginPath();
	ctx.rect(clipped.left(), clipped.top(), clipped.width(), clipped.height());
	ctx.clip();
	ctx.drawImage(pic, this.left(), this.top(), pic.width * k, pic.height * k);
	ctx.restore();
};

// BlockHighlightMorph thread count readout

BlockHighlightMorph.prototype.readout = function () {
	return this.children.length ? this.children[0] : null;
};

// BlockDefinitionMorph ////////////////////////////////////////////////

/*
	I am the prototype of a custom block in its definition hat: one
	BlockSectionDefinitionMorph per section of the block's spec. A click on
	the prototype shows or hides the details that edit it, and each edit
	becomes a new prototype for the function.
*/

BlockDefinitionMorph.prototype = new Morph();
BlockDefinitionMorph.prototype.constructor = BlockDefinitionMorph;
BlockDefinitionMorph.uber = Morph.prototype;

function BlockDefinitionMorph(op, spec, argNames, aBlock) {
	this.init(op, spec, argNames, aBlock);
}

BlockDefinitionMorph.prototype.init = function (op, spec, argNames, aBlock) {
	// spec is a project spec object; aBlock is the prototype block, whose
	// colours and fonts my labels take.
	BlockDefinitionMorph.uber.init.call(this);
	this.op = op;
	this.blockType = spec.blockType || ' ';
	this.isShort = false;
	const { sections, repeatLast } = specSections(spec);
	this.isRepeating = repeatLast;
	const slots = specSlotInfo(spec);
	let slotIndex = 0;
	sections.forEach((section, i) => {
		const sec = new BlockSectionDefinitionMorph((0 === i) ? 1 : 0);
		this.add(sec);
		for (const word of section.split(/\s+/).filter((w) => w.length > 0)) {
			if ('_' === word) {
				const [type, value] = slots[slotIndex] || ['auto', null];
				const name = (argNames && (slotIndex < argNames.length)) ? argNames[slotIndex] : 'args';
				sec.addInputPart(name, type, value);
				slotIndex += 1;
			} else {
				sec.addLabelPart(word, aBlock);
			}
		}
	});
	this.showDetails();
};

BlockDefinitionMorph.prototype.render = nop;

BlockDefinitionMorph.prototype.sections = function () {
	return this.children.filter((m) => m instanceof BlockSectionDefinitionMorph);
};

BlockDefinitionMorph.prototype.detailsHidden = function () {
	return this.isShort;
};

BlockDefinitionMorph.prototype.clicked = function () {
	if (this.isShort) this.showDetails(); else this.hideDetails();
};

BlockDefinitionMorph.prototype.showDetails = function () {
	if (this.isBuiltIn) return;
	this.sections().forEach((sec) => sec.showDetails());
	this.isShort = false;
	this.fixLayout();
};

BlockDefinitionMorph.prototype.hideDetails = function () {
	this.sections().forEach((sec) => sec.hideDetails());
	this.isShort = true;
	this.fixLayout();
};

BlockDefinitionMorph.prototype.fixLayout = function () {
	// Sections one below another, each starting at my left.
	const gap = blockScale();
	let y = this.top(), width = 0;
	this.sections().forEach((sec) => {
		sec.setPosition(new Point(this.left(), y));
		y += sec.height() + gap;
		width = Math.max(width, sec.width());
	});
	this.bounds.setExtent(new Point(width, Math.max(0, y - gap - this.top())));
	if (this.parent instanceof BlockMorph) {
		this.parent.fixLayout();
		this.parent.topBlock().fullChanged();
	}
};

BlockDefinitionMorph.prototype.newInputName = function () {
	// A default input name that isn't already taken.
	const taken = this.inputNames();
	const names = ['foo', 'bar', 'baz', 'quux', 'garply', 'spam', 'frob', 'corge', 'grault',
		'waldo', 'ham', 'eggs', 'plugh', 'fred', 'wibble', 'wobble', 'flob', 'inp', 'parm',
		'blah', 'blubb'];
	return names.find((n) => !taken.includes(n)) || ('input #' + taken.length);
};

// BlockDefinitionMorph spec:

BlockDefinitionMorph.prototype.specString = function () {
	const spec = this.sections().map((sec) => sec.specString()).join(' : ');
	return this.isRepeating ? spec + ' : ...' : spec;
};

BlockDefinitionMorph.prototype.typeString = function () {
	return this.sections().flatMap((sec) => sec.inputParts().map((v) => v.inputType)).join(' ');
};

BlockDefinitionMorph.prototype.defaults = function () {
	return this.sections().flatMap((sec) => sec.inputParts().map((v) => v.inputDefault));
};

BlockDefinitionMorph.prototype.inputNames = function () {
	return this.sections().flatMap((sec) => sec.inputParts().map((v) => v.blockSpec));
};

BlockDefinitionMorph.prototype.updateBlockDefinition = function () {
	// Give the function the prototype I now show. The editor rebuilds me.
	MB_editor.changeFunctionPrototype(this.op, this.blockType, this.specString(),
		this.typeString(), this.defaults(), this.inputNames());
};

// BlockSectionDefinitionMorph /////////////////////////////////////////

/*
	I am one section of a block prototype: a row of labels and inputs, then
	a drawer whose arrows add a part or remove the last one.
*/

BlockSectionDefinitionMorph.prototype = new Morph();
BlockSectionDefinitionMorph.prototype.constructor = BlockSectionDefinitionMorph;
BlockSectionDefinitionMorph.uber = Morph.prototype;

function BlockSectionDefinitionMorph(minElements) {
	this.init(minElements);
}

BlockSectionDefinitionMorph.prototype.init = function (minElements) {
	BlockSectionDefinitionMorph.uber.init.call(this);
	this.minElements = minElements || 0;
	this.drawer = new BlockDrawerMorph(this);
	this.add(this.drawer);
};

BlockSectionDefinitionMorph.prototype.render = nop;

BlockSectionDefinitionMorph.prototype.elements = function () {
	// My labels and inputs, in order. A label being edited has its cursor
	// beside it among my children.
	return this.children.filter((m) => (m instanceof BlockLabelMorph) || (m instanceof ReporterBlockMorph));
};

BlockSectionDefinitionMorph.prototype.inputParts = function () {
	return this.elements().filter((m) => m instanceof ReporterBlockMorph);
};

BlockSectionDefinitionMorph.prototype.definition = function () {
	return this.parentThatIsA(BlockDefinitionMorph);
};

BlockSectionDefinitionMorph.prototype.addElement = function (aMorph) {
	// Insert before the drawer, which stays last.
	this.add(aMorph);
	this.children.splice(this.children.indexOf(aMorph), 1);
	this.children.splice(this.children.indexOf(this.drawer), 0, aMorph);
};

BlockSectionDefinitionMorph.prototype.addLabelPart = function (text, aBlock) {
	const label = new BlockLabelMorph(text, aBlock.fontSize, aBlock.labelFontStyle, true, false,
		false, ZERO, aBlock.color.darker(aBlock.labelContrast), WHITE, aBlock.labelFontName);
	this.addElement(label);
	return label;
};

BlockSectionDefinitionMorph.prototype.addInputPart = function (name, type, value) {
	// An input is its variable, which a drag copies, holding its declaration.
	const v = new MB_Parser('').makeVariableReporter(name);
	v.isDraggable = false;
	v.isTemplate = true;
	v.inputType = type;
	v.inputDefault = value;
	v.declaration = new InputDeclarationMorph(type, value);
	this.addElement(v);
	return v;
};

BlockSectionDefinitionMorph.prototype.showDetails = function () {
	this.drawer.show();
	this.elements().forEach((m) => {
		if (m instanceof BlockLabelMorph) {
			m.isEditable = true;
			m.enableSelecting();
		} else if (m.declaration && !m.children.includes(m.declaration)) {
			m.add(m.declaration);
			m.fixLayout();
		}
	});
	this.fixLayout();
};

BlockSectionDefinitionMorph.prototype.hideDetails = function () {
	this.drawer.hide();
	this.elements().forEach((m) => {
		if (m instanceof BlockLabelMorph) {
			m.isEditable = false;
			m.disableSelecting();
		} else if (m.declaration && m.children.includes(m.declaration)) {
			m.removeChild(m.declaration);
			m.fixLayout();
		}
	});
	this.fixLayout();
};

BlockSectionDefinitionMorph.prototype.fixLayout = function () {
	// One row, centred vertically; a hidden part takes no room.
	const gap = 5 / ZOOM; // 5 screen pixels at every block size
	this.drawer.fixLayout();
	const parts = this.elements().concat(this.drawer.isVisible ? [this.drawer] : []);
	const height = Math.max(0, ...parts.map((m) => m.height()));
	let x = this.left();
	parts.forEach((m) => {
		m.setPosition(new Point(x, this.top() + (height - m.height()) / 2));
		x += m.width() + gap;
	});
	this.bounds.setExtent(new Point(Math.max(0, x - gap - this.left()), height));
	if (this.parent instanceof BlockDefinitionMorph) this.parent.fixLayout();
};

// BlockSectionDefinitionMorph editing:

BlockSectionDefinitionMorph.prototype.canExpand = function () {
	return true;
};

BlockSectionDefinitionMorph.prototype.canCollapse = function () {
	return this.elements().length > this.minElements;
};

BlockSectionDefinitionMorph.prototype.expand = function () {
	// After a label the next part is surely an input; otherwise ask.
	if (this.elements().at(-1) instanceof BlockLabelMorph) {
		this.addInput();
		return;
	}
	// After the click that asked for it, which would otherwise close it.
	const world = this.world();
	setTimeout(() => chromeMenuFor(world, [
		['label', () => this.addLabel()],
		['input', () => this.addInput()],
	]));
};

BlockSectionDefinitionMorph.prototype.collapse = function () {
	const last = this.elements().at(-1);
	if (!last) return;
	last.destroy();
	this.fixLayout();
	this.definition().updateBlockDefinition();
};

BlockSectionDefinitionMorph.prototype.addLabel = function () {
	this.addLabelPart('label', this.parentThatIsA(BlockMorph));
	this.fixLayout();
	this.definition().updateBlockDefinition();
};

BlockSectionDefinitionMorph.prototype.addInput = function () {
	this.addInputPart(this.definition().newInputName(), 'auto', '10');
	this.fixLayout();
	this.definition().updateBlockDefinition();
};

BlockSectionDefinitionMorph.prototype.reactToKeystroke = function () {
	this.fixLayout(); // a label grows as it is typed into
};

BlockSectionDefinitionMorph.prototype.reactToEdit = function () {
	// A label edit is done: the definition takes it unless nothing changed.
	const def = this.definition();
	const spec = MB_editor.project.blockSpecs.get(def.op);
	if (spec && (spec.specString === def.specString())) {
		// The spec stands, but a label may still show a colon or a lone '_' it dropped.
		const shown = this.elements().filter((m) => m instanceof BlockLabelMorph);
		if (shown.some((m) => m.text !== this.labelSpec(m.text))) {
			MB_editor.rebuildDefinitionsOf(MB_editor.project.functionNamed(def.op));
		}
		return;
	}
	if (!/[^\s:.]/.test(def.specString())) { // a block needs a word, so put the label back
		MB_editor.rebuildDefinitionsOf(MB_editor.project.functionNamed(def.op));
		return;
	}
	def.updateBlockDefinition();
};

BlockSectionDefinitionMorph.prototype.labelSpec = function (text) {
	// Colons mark sections in a spec and a lone '_' marks an input, so a label holds neither.
	return text.replaceAll(':', '').split(' ').filter((w) => w !== '_').join(' ');
};

BlockSectionDefinitionMorph.prototype.specString = function () {
	return this.elements().map((m) => {
		if (!(m instanceof BlockLabelMorph)) return '_';
		return this.labelSpec(m.text).trim();
	}).filter((w) => w.length > 0).join(' ');
};

// BlockDrawerMorph ////////////////////////////////////////////////////

/*
	I am the pair of arrows at the end of a prototype section. The right
	one asks my target to expand, the left one to collapse; each is drawn
	only when my target can do it.
*/

BlockDrawerMorph.prototype = new BlockExpanderMorph({ canContract: () => true, canExpand: () => true, scale: 1 });
BlockDrawerMorph.prototype.constructor = BlockDrawerMorph;
BlockDrawerMorph.uber = BlockExpanderMorph.prototype;

function BlockDrawerMorph(target) {
	this.target = target;
	BlockDrawerMorph.uber.init.call(this, {
		canContract: () => target.canCollapse(),
		canExpand: () => target.canExpand(),
		scale: blockScale(),
	});
}

BlockDrawerMorph.prototype.render = function (ctx) {
	this.showLeft = this.target.canCollapse();
	this.showRight = this.target.canExpand();
	BlockDrawerMorph.uber.render.call(this, ctx);
};

BlockDrawerMorph.prototype.fixLayout = function () {
	const size = 18 * blockScale(), unit = blockHalf(size, this.pixelsPerUnit || 2 * ZOOM);
	const both = this.target.canCollapse() && this.target.canExpand();
	this.bounds.setWidth(both ? (3 * unit) + this.gapFor(size) : 2 * unit);
};

BlockDrawerMorph.prototype.mouseClickLeft = function (pos) {
	const less = this.target.canCollapse();
	const more = this.target.canExpand();
	if (less && (!more || ((pos.x - this.left()) <= (this.width() / 2)))) {
		this.target.collapse();
	} else if (more) {
		this.target.expand();
	}
};

// InputDeclarationMorph ///////////////////////////////////////////////

/*
	I am a declared input's type and default: the slot a call gets for it,
	holding the default for editing, then a down arrow for the types menu.
*/

InputDeclarationMorph.prototype = new Morph();
InputDeclarationMorph.prototype.constructor = InputDeclarationMorph;
InputDeclarationMorph.uber = Morph.prototype;

function InputDeclarationMorph(type, value) {
	this.init(type, value);
}

InputDeclarationMorph.prototype.init = function (type, value) {
	InputDeclarationMorph.uber.init.call(this);
	this.isCachingImage = false;
	this.type = type || 'auto';
	this.default = value;
	this.buildSlot();
};

InputDeclarationMorph.prototype.buildSlot = function () {
	if (this.slot) this.slot.destroy();
	this.slot = this.slotFor(String(this.type).split('.')[0], this.default);
	this.slot.scriptChanged = () => this.setDefault(this.slotValue());
	this.add(this.slot);
	this.fixLayout();
};

InputDeclarationMorph.prototype.slotValue = function () {
	// Read on accept, before the slot's own value has caught up with its text.
	if (!(this.slot instanceof InputSlotMorph)) return this.slot.evaluate();
	const text = this.slot.contents().text;
	if (!this.slot.isNumeric || this.slot.isAlphanumeric) return text;
	const num = parseFloat(text);
	return isNaN(num) ? 0 : num;
};

InputDeclarationMorph.prototype.slotFor = function (type, value) {
	// The slot a call shows for an input of this type, holding this default.
	if (!['auto', 'num', 'str', 'bool', 'color'].includes(type)) {
		// A type the menu does not offer shows its name, and cannot be edited.
		const slot = SyntaxElementMorph.prototype.labelPart('%auto');
		slot.setContents(this.type);
		slot.isReadOnly = true;
		slot.tintBase = BlockMorph.prototype.colorFor('Control'); // the Control tint, not that of the input's reporter
		slot.fixLayout();
		return slot;
	}
	const known = type;
	const slot = SyntaxElementMorph.prototype.labelPart('%' + known);
	if ('bool' === known) {
		slot.setContents(value !== false);
	} else if ('color' === known) {
		if (value instanceof Color) slot.setContents(value);
	} else {
		slot.setContents((value == null) ? '' : value);
	}
	slot.fixLayout();
	return slot;
};

InputDeclarationMorph.prototype.fixLayout = function () {
	const s = blockScale();
	this.arrowWidth = 12 * s;
	this.arrowHeight = 9 * s;
	const pad = 4 * s;
	if (!this.slot) return;
	this.bounds.setExtent(new Point(this.slot.width() + (2 * s) + this.arrowWidth + (2 * pad),
		Math.max(this.slot.height(), this.arrowHeight + (2 * pad))));
	this.slot.setPosition(new Point(this.left(), this.top() + Math.floor((this.height() - this.slot.height()) / 2)));
	if (this.parent instanceof BlockMorph) this.parent.fixLayout();
};

InputDeclarationMorph.prototype.render = function (ctx) {
	// The down arrow, right of the slot, which draws itself.
	const s = blockScale();
	const left = this.width() - this.arrowWidth - (4 * s);
	const top = Math.floor((this.height() - this.arrowHeight) / 2);
	ctx.fillStyle = BLACK.toString();
	ctx.beginPath();
	ctx.moveTo(left, top);
	ctx.lineTo(left + this.arrowWidth, top);
	ctx.lineTo(left + (this.arrowWidth / 2), top + this.arrowHeight);
	ctx.closePath();
	ctx.fill();
};

InputDeclarationMorph.prototype.mouseClickLeft = function (pos) {
	// The arrow and its padding, right of the slot, open the menu; after the
	// click that asked for it, which would otherwise close it.
	if (this.slot && (pos.x < this.slot.right() + (2 * blockScale()))) return;
	setTimeout(() => this.typesMenu());
};

InputDeclarationMorph.prototype.typesMenu = function () {
	const sample = { auto: '', num: 123, str: 'ABC', bool: true, color: null };
	const item = (type, tip) => [type, () => this.setType(type), tip,
		MB_editor.pictureOf(this.slotFor(type, sample[type])), '--input', type === this.baseType()];
	const items = [item('auto', 'string or number')];
	if (MB_editor.devMode()) {
		items.push(item('num', 'number only'), item('str', 'string only'), '-');
	}
	items.push(item('bool', 'boolean switch'), item('color', 'color patch'));
	return chromeMenuFor(this.world() || world, items, '--single-option');
};

InputDeclarationMorph.prototype.baseType = function () {
	return String(this.type).split('.')[0];
};

InputDeclarationMorph.prototype.setType = function (type) {
	// Keep the default if it suits the new type, else convert it or use the type's own.
	let value = this.default;
	const isInteger = (v) => (typeof v === 'number') && Number.isInteger(v);
	if ('auto' === type) {
		if (!(isInteger(value) || (typeof value === 'string'))) value = 10;
	} else if ('num' === type) {
		// Digits after an optional minus, none at all included, read as an integer.
		if ((typeof value === 'string') && /^-?\d*$/.test(value)) value = parseInt(value, 10) || 0;
		if (!isInteger(value)) value = 10;
	} else if ('str' === type) {
		if (isInteger(value)) value = String(value);
		if (typeof value !== 'string') value = 'text';
	} else if ('bool' === type) {
		if (typeof value !== 'boolean') value = true;
	} else if ('color' === type) {
		if (!(value instanceof Color)) value = null;
	}
	this.type = type;
	this.default = value;
	this.buildSlot();
	this.declarationChanged();
};

InputDeclarationMorph.prototype.setDefault = function (value) {
	// The user edited the default in my slot. A number typed into an auto
	// slot is a number.
	if (('auto' === this.baseType()) && (typeof value === 'string') && /^-?\d+$/.test(value)) {
		value = Number(value);
	}
	if (value === this.default) return; // unchanged: Escape, or Tab's second report
	this.default = value;
	this.declarationChanged();
};

InputDeclarationMorph.prototype.declarationChanged = function () {
	const v = this.parent;
	if (!v) return;
	v.inputType = this.type;
	v.inputDefault = this.default;
	const def = v.parentThatIsA(BlockDefinitionMorph);
	if (def) def.updateBlockDefinition();
};
