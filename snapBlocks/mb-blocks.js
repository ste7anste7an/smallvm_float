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
		BlockExpanderMorph
		BlockHighlightMorph
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
	InputSlotMorph
	InputSlotStringMorph
	InputSlotTextMorph
	BooleanSlotMorph
	ArrowMorph
	TextSlotMorph
	ColorSlotMorph
	TemplateSlotMorph
	BlockExpanderMorph
	BlockHighlightMorph
	MicroBitDisplaySlotMorph

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
Color, ColorPaletteMorph, FrameMorph, Function, HandleMorph, Math, MenuMorph,
Morph, MorphicPreferences, Object, ScrollFrameMorph, ShadowMorph, ZERO, Sound,
String, StringMorph, TextMorph, contains, degrees, detect, PianoMenuMorph, nop,
document, getDocumentPositionOf, isNaN, isString, newCanvas, parseFloat, isNil,
radians, useBlurredShadows, SpeechBubbleMorph, modules, StageMorph,
fontHeight, TableFrameMorph, SpriteMorph, Context, ListWatcherMorph, Rectangle,
DialogBoxMorph, BlockInputFragmentMorph, PrototypeHatBlockMorph, WHITE, display,
Costume, IDE_Morph, BlockDialogMorph, BlockEditorMorph, localize, CLEAR, Point,
isSnapObject, PushButtonMorph, SpriteIconMorph, Process, AlignmentMorph, List,
ToggleButtonMorph, DialMorph, SnapExtensions, CostumeIconMorph, SoundIconMorph,
SVG_Costume, embedMetadataPNG, ThreadManager, snapEquals, InputList, BLACK,
CustomHatBlockMorph, MB_Compiler, MB_editor, MB_Function, MB_Project, MB_Specs, world */

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
var ColorSlotMorph;
var HatBlockMorph;
var BlockExpanderMorph;
var BlockHighlightMorph;
var MicroBitDisplaySlotMorph;
var TemplateSlotMorph;
var TextSlotMorph;

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
				hatWidth	- minimum width for hat blocks
				rfBorder	- pixel width of reification border (grey outline)

		jigsaw shape:

				inset		- distance from indentation to left edge
				dent		- width of indentation bottom

		paddings:

				bottomPadding	- adds to the width of the bottom most c-slot
				cSlotPadding	- adds to the width of the open "C" in c-slots
				typeInPadding	- adds pixels between text and edge in input slots
				labelPadding	- adds left/right pixels to block labels

		label:

				labelFontName		- <string> specific font family name
				labelFontStyle		- <string> generic font family name, cascaded
				fontSize			- duh
				labelWidth			- column width, used for word wrapping
				labelWordWrap		- <bool> if true labels can break after each word

		snapping:

				feedbackMinHeight	- height of white line for command block snaps
				minSnapDistance		- threshold when commands start snapping
				reporterDropFeedbackPadding	 - increases reporter drop feedback

		color gradients:

				contrast		- <percent int> 3D-ish shading gradient contrast
				labelContrast	- <percent int> 3D-ish label shading contrast
				activeHighlight - <Color> for stack highlighting when active
				errorHighlight	- <Color> for error highlighting
				activeBlur		- <pixels int> shadow for blurred activeHighlight
				activeBorder	- <pixels int> unblurred activeHighlight
				rfColor			- <Color> for reified outlines and slot backgrounds
*/

SyntaxElementMorph.prototype.contrast = 20;

SyntaxElementMorph.prototype.setScale = function (num) {
	var scale = Math.min(Math.max(num, 1), 25);
	this.scale = scale;
	this.corner = 3 * scale;
	this.rounding = 9 * scale;
	this.edge = scale;
	this.flatEdge = scale * 0.5;
	this.jag = 5 * scale;
	this.inset = 6 * scale;
	this.hatHeight = 12 * scale;
	this.hatWidth = 70 * scale;
	this.rfBorder = 3 * scale;
	this.dent = 8 * scale;
	this.bottomPadding = 3 * scale;
	this.cSlotPadding = 4 * scale;
	this.typeInPadding = scale;
	this.labelPadding = 4 * scale;
	this.labelFontName = 'Verdana';
	this.labelFontStyle = 'sans-serif';
	this.fontSize = 10 * scale;
	this.labelWidth = 450 * scale;
	this.labelWordWrap = true;
	this.feedbackMinHeight = 5;
	this.minSnapDistance = 20;
	this.reporterDropFeedbackPadding = 10 * scale;
	this.labelContrast = 25;
	this.activeHighlight = new Color(153, 255, 213);
	this.errorHighlight = new Color(173, 15, 0);
	this.activeBlur = 20;
	this.activeBorder = 4;
	this.rfColor = new Color(120, 120, 120);
};

SyntaxElementMorph.prototype.setScale(1.5);
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
		if ('auto' == specParts[1]) result.tags = 'numstring';
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
	'%auto': {
		type: 'input',
		tags: 'alphanum'
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

SyntaxElementMorph.prototype.debugCachedInputs = function () {
	// private - only used for manually debugging inputs caching
	var realInputs, i;
	if (!isNil(this.cachedInputs)) {
		realInputs = this.parts().filter(part =>
			part instanceof SyntaxElementMorph
		);
	}
	if (this.cachedInputs.length !== realInputs.length) {
		throw new Error('cached inputs size do not match: ' +
			this.constructor.name);
	}
	for (i = 0; i < realInputs.length; i += 1) {
		if (this.cachedInputs[i] !== realInputs[i]) {
			throw new Error('cached input does not match: ' +
				this.constructor.name +
				' #' +
				i +
				' ' +
				this.cachedInputs[i].constructor.name +
				' != ' +
				realInputs[i].constructor.name);
		}
	}
};

SyntaxElementMorph.prototype.allInputs = function () {
	// answer arguments and nested reporters of all children
	return this.allChildren().slice(0).reverse().filter(child =>
		(child instanceof ArgMorph) ||
		(child instanceof ReporterBlockMorph &&
			child !== this)
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
			deflt = this.labelPart(this.parseSpec(this.blockSpec)[idx]);
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
	// answer true if I can be exchanged by a dropped reporter
	return this.isStatic;
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
				part.category = 'variables';
				part.color = SpriteMorph.prototype.blockColor.variables;
				part.setSpec(localize('Input name'));
				break;
			default:
				throw new Error('unknown label part type: "' + info.type + '"');
		}

		// apply the tags
		// ---------------
		// input: numeric, numstring, alphanum, read-only, static
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
							part.setContents(0);
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
	} else {
		part = new BlockLabelMorph(
			spec, // text
			this.fontSize, // fontSize
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
		maxX = 0,
		blockWidth = 0,
		blockHeight,
		l = [],
		lines = [],
		space = this.isPrototype ?
		1 : Math.floor(fontHeight(this.fontSize) / 3),
		bottomCorrection,
		rightCorrection = 0,
		rightMost;

	if (this instanceof ReporterBlockMorph) {
		blockWidth += (this.rounding * 2) + (this.edge * 2);
	} else {
		blockWidth += (this.corner * 4)
			+ (this.edge * 2)
			+ (this.inset * 3)
			+ this.dent;
	}

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
			if ((x > this.labelWidth) || part.isBlockLabelBreak) {
				if (l.length > 0) {
					lines.push(l);
					l = [];
					x = part.fullBounds().width() + space;
				}
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

	// distribute parts on lines
	if (this instanceof CommandBlockMorph) {
		y = this.top() + this.corner + this.edge;
		if (this instanceof HatBlockMorph) {
			y += this.hatHeight;
		}
	} else if (this instanceof ReporterBlockMorph) {
		y = this.top() + (this.edge * 2);
	}
	lines.forEach(line => {
		x = this.left() + this.edge + this.labelPadding;
		y += lineHeight;
		lineHeight = 0;
		line.forEach(part => {
			if (part instanceof CSlotMorph) {
				x -= this.labelPadding;
				part.setColor(this.color);
				part.setPosition(new Point(x, y));
				lineHeight = part.height();
			} else {
				part.setPosition(new Point(x, y));
				if (!part.isBlockLabelBreak) {
					if (part.slotSpec === '%c') {
						x += part.width();
					} else if (part.isVisible) {
						x += part.fullBounds().width() + space;
					}
				}
				maxX = Math.max(maxX, x);
				lineHeight = Math.max(
					lineHeight,
					part instanceof StringMorph ?
					part.rawHeight() : part.height()
				);
			}
		});

		// center parts vertically on each line:
		line.forEach(part => {
			part.moveBy(new Point(
				0,
				Math.floor((lineHeight - part.height()) / 2)
			));
		});
	});

	// determine my height:
	y += lineHeight;
	if (this.children.some(any => any instanceof CSlotMorph)) {
		bottomCorrection = this.bottomPadding;
		rightMost = this.inputs()[this.inputs().length - 1];
		if (this instanceof ReporterBlockMorph) {
			bottomCorrection = Math.max(
				this.bottomPadding,
				this.rounding - this.bottomPadding
			);
		}
		y += bottomCorrection;
	}
	if (this instanceof CommandBlockMorph) {
		blockHeight = y - this.top() + (this.corner * 2);
	} else if (this instanceof ReporterBlockMorph) {
		blockHeight = y - this.top() + (this.edge * 2);
	}

	// determine my width:
	blockWidth = Math.max(
		blockWidth,
		maxX - this.left() + this.labelPadding - this.edge
	);
	rightCorrection = space;

	// adjust width to hat width
	if (this instanceof HatBlockMorph) {
		blockWidth = Math.max(blockWidth, this.hatWidth * 1.5);
	}

	// set my extent (silently, because we'll redraw later anyway):
	this.bounds.setWidth(blockWidth);
	this.bounds.setHeight(blockHeight);

	// adjust CSlots and collect holes
	this.holes = [];
	parts.forEach(part => {
		var adjustMultiWidth = 0;
		if (part instanceof CSlotMorph ||
			(part.slotSpec && part.slotSpec.includes('%cmd'))
		) {
			part.bounds.setWidth(blockWidth - this.edge);
			adjustMultiWidth = this.corner + this.edge;
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
		this.parent.fixLayout();
		this.parent.changed();
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

// SyntaxElementMorph evaluating:

SyntaxElementMorph.prototype.evaluate = function () {
	// responsibility of my children, default is to answer null
	return null;
};

SyntaxElementMorph.prototype.isEmptySlot = function () {
	// responsibility of my children, default is to answer false
	return false;
};

// SyntaxElementMorph speech bubble feedback:

SyntaxElementMorph.prototype.showBubble = function (value, exportPic, target) {
	alert('not implemented yet');
	return;
	var bubble,
		txt,
		img,
		morphToShow,
		isClickable = true,
		ide = this.parentThatIsA(IDE_Morph) || target.parentThatIsA(IDE_Morph),
		anchor = this,
		pos = this.rightCenter().add(new Point(2, 0)),
		sf = this.parentThatIsA(ScrollFrameMorph),
		wrrld = this.world() || target.world(),
		maxHeight,
		scroller;

	async function writeClipboardText(text, ide) {
		try {
			await navigator.clipboard.writeText(text);
			ide.showMessage('copied to clipboard', 1, true);
		} catch (error) {
			ide.showMessage(error.message, 2, true);
		}
	}

	if ((value === undefined) || !wrrld) {
		return null;
	}
	if (typeof value === 'boolean') {
		morphToShow = SpriteMorph.prototype.booleanMorph.call(
			null,
			value
		);
	} else if (value instanceof Color) {
		morphToShow = SpriteMorph.prototype.colorSwatch(
			value,
			this.fontSize * 1.4
		);
	} else if (isString(value)) {
		// shorten the string, commented out because we now scroll it
		// txt	= value.length > 500 ? value.slice(0, 500) + '...' : value;
		txt	 = value;
		maxHeight = ide.height() / 2;
		morphToShow = new TextMorph(
			txt,
			this.fontSize
		);

		if (morphToShow.height() > maxHeight) { // scroll
			scroller = new ScrollFrameMorph();
			scroller.acceptsDrops = false;
			scroller.contents.acceptsDrops = false;
			scroller.bounds.setWidth(morphToShow.width());
			scroller.bounds.setHeight(maxHeight);
			scroller.addContents(morphToShow);
			scroller.color = new Color(0, 0, 0, 0);
			morphToShow = scroller;
		}

		// support exporting text / numbers directly from result bubbles:
		morphToShow.userMenu = function () {
			var menu = new MenuMorph(this);
			menu.addItem(
				'export',
				() => ide.saveFileAs(
					value,
					'text/plain;charset=utf-8',
					localize('data')
				)
			);
			menu.addItem(
				'copy',
				() => writeClipboardText(value, ide)
			);
			return menu;
		};
	} else {
		return this.showBubble(
			display(value),
			exportPic,
			target
		);
	}
	if (ide && (ide.currentSprite !== target)) {
		if (target instanceof StageMorph) {
			anchor = ide.corral.stageIcon;
		} else if (target) {
			if (target.isTemporary) {
				target = detect(
					target.allExemplars(),
					each => !each.isTemporary
				);
			}
			anchor = detect(
				ide.corral.frame.contents.children,
				icon => icon.object === target
			);
		} else {
			target = ide;
		}
		pos = anchor.center();
	}
	bubble = new SpeechBubbleMorph(
		morphToShow,
		null,
		Math.max(this.rounding - 2, 6),
		0
	);
	bubble.popUp(
		wrrld,
		pos,
		isClickable
	);
	if (exportPic) {
		this.exportPictureWithResult(bubble);
	}
	if (anchor instanceof SpriteIconMorph) {
		bubble.keepWithin(ide.corral);
	} else if (sf) {
		bubble.keepWithin(sf);
	}
};

SyntaxElementMorph.prototype.exportPictureWithResult = function (aBubble) {
	alert('not implemented yet');
	return;
	if (this.removeHighlight) {this.removeHighlight(); }
	var ide = this.parentThatIsA(IDE_Morph) ||
		this.parentThatIsA(BlockEditorMorph).target.parentThatIsA(
			IDE_Morph
		),
		scr = this.fullImage(),
		bub = aBubble.fullImage(),
		taller = Math.max(0, bub.height - scr.height),
		pic = newCanvas(new Point(
			scr.width + bub.width + 2,
			scr.height + taller
		)),
		ctx = pic.getContext('2d');
	ctx.drawImage(scr, 0, pic.height - scr.height);
	ctx.drawImage(bub, scr.width + 2, 0);
	// request to open pic in new window.

	ide.saveFileAs(
		embedMetadataPNG(pic, this.toXMLString()),
		'image/png',
		(ide.getProjectName() || localize('untitled')) + ' ' +
		localize('script pic')
	);
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
BlockMorph.prototype.zebraContrast = 20; // alternating color brightness

// BlockMorph sound feedback:

BlockMorph.prototype.snapSound = null;

BlockMorph.prototype.toggleSnapSound = function () {
	if (this.snapSound !== null) {
		this.snapSound = null;
	} else {
		BlockMorph.prototype.snapSound = document.createElement('audio');
		BlockMorph.prototype.snapSound.src = 'src/click.wav';
	}
};

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
	// Call the given function on all command and reporter blocks in this script.

	let todo = [this];
	while (todo.length > 0) {
		let b = todo.pop();
		func(b);
		if (b instanceof CommandBlockMorph) {
			if (b.nextBlock()) todo.push(b.nextBlock());
		}
		for (const arg of b.inputs()) {
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

BlockMorph.prototype.localizeBlockSpec = function (spec) {
	// answer the translated block spec where the translation itself
	// is in the form of an abstract spec, i.e. with padded underscores
	// in place for percent-sign prefixed slot specs.
	var prefixes = ['%', '$'],
		slotSpecs = [],
		slotCount = -1,
		abstractSpec,
		translation;

	abstractSpec = this.parseSpec(spec).map(str => {
		if (str.length > 1 && prefixes.includes(str[0])) {
			slotSpecs.push(str);
			return '_';
		}
		return str;
	}).join(' ');

	// make sure to also remove any explicit slot specs from the translation
	translation = this.parseSpec(localize(abstractSpec)).map(str =>
		(str.length > 1 && prefixes.includes(str[0])) ? '_' : str
	).join(' ');

	// replace abstract slot placeholders in the translation with their
	// concrete specs from the original block spec
	return translation.split(' ').map(word => {
		if (word === '_') {
			slotCount += 1;
			return slotSpecs[slotCount] || '';
		}
		return word;
	}).join(' ');
};

// BlockMorph menu:

BlockMorph.prototype.userMenu = function () {
	var menu = new MenuMorph(this),
		shiftClicked = this.world().currentKey === 16;

	menu.addItem(
		'copy to clipboard',
		() => {
			let s = 'GP Script\n\n' +
				'script ' + Math.round(this.left() - 200) + ' ' + Math.round(this.top()) + ' {\n' +
				this.codeString() +
				'\n}';
			navigator.clipboard.writeText(s);
		},
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
			var project = new MB_Project();
			var compiler = new MB_Compiler(project);
			console.log(compiler.showInstructions(this));
			console.log(compiler.compiledBytesFor(this));
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
		() => { this.destroy(); },
		'delete this morph'
	);
	menu.addLine();
	menu.addItem('scripts pic...', 'exportScriptsPicture', 'save a picture\nof all scripts');

	menu.addLine();
	menu.addItem(
		'run/stop',
		() => { MB_editor.toggleRunning(this.topBlock()); },
		'run or stop this script'
	);

	return menu;
};

BlockMorph.prototype.type = function () {
	// private
	return this instanceof CommandBlockMorph ? 'command' : 'reporter';
};

BlockMorph.prototype.nextBlock = function (block) {
	// Overridden by CommandBlockMorph to get or set the next block
	return null;
}

BlockMorph.prototype.deleteBlock = function () {
	// delete just this one block, keep inputs and next block around
	var scripts = this.parentThatIsA(ScriptsMorph),
		nb = this.nextBlock ? this.nextBlock() : null,
		tobefixed,
		isindef;
	if (scripts) {
		if (nb) {
			scripts.add(nb);
		}
		this.inputs().forEach(inp => {
			if (inp instanceof BlockMorph) {
				scripts.add(inp);
			}
		});
	}
	if (this instanceof ReporterBlockMorph && (this.parent instanceof BlockMorph)) {
		this.parent.revertToDefaultInput(this);
	} else { // CommandBlockMorph
		if (this.parent && this.parent.fixLayout) {
			tobefixed = this.parentThatIsA(ArgMorph);
		} else { // must be in a custom block definition
			isindef = true;
		}
	}
	this.destroy();
	if (isindef) {
		/*
						since the definition's body still points to this block
						even after it has been destroyed, mark it to be deleted
						later.
		*/
	}
	if (tobefixed) {
		tobefixed.fixLayout();
	}
};

BlockMorph.prototype.relabel = function (alternativeSelectors) {
	alert('not yet implemented');
	return;

	// morph one block into another trying to keep the inputs in place
	// alternative Selector can either be a string representing
	// a block selector or a 2-item array containing a string and
	// an integer offset for restoring inputs
	var menu, oldInputs,
		target = this.selectForEdit(); // copy-on-edit
	if (target !== this) {
		return this.relabel.call(target, alternativeSelectors);
	}
	menu = new MenuMorph(this);
	oldInputs = this.inputs();
	alternativeSelectors.forEach(alternative => {
		var block, selector, offset;
		if (alternative instanceof Array) {
			selector = alternative[0];
			offset = -alternative[1];
		} else {
			selector = alternative;
			offset = 0;
		}
		block = SpriteMorph.prototype.blockForSelector(selector, true);
		block.restoreInputs(oldInputs, offset);
		block.fixBlockColor(null, true);
		block.addShadow(new Point(3, 3));
		menu.addItem(
			block.doWithAlpha(1, () => block.fullImage()),
			() => { this.setSelector(selector, -offset); });
	});
	menu.popup(this.world(), this.bottomLeft().subtract(new Point(
		8,
		this instanceof CommandBlockMorph ? this.corner : 0
	)));
};

BlockMorph.prototype.setSelector = function (aSelector, inputOffset = 0) {
	// private - used only for relabel()
	// input offset is optional and can be used to shift the inputs
	// to be restored
	var oldInputs = this.inputs(),
		scripts = this.parentThatIsA(ScriptsMorph),
		surplus,
		info,
		slots,
		i;
	info = SpriteMorph.prototype.blocks[aSelector];
	this.setCategory(info.category);
	this.selector = aSelector;
	this.setSpec(this.localizeBlockSpec(info.spec));
	this.defaults = info.defaults || [];

	// restore default values
	slots = this.inputs();
	for (i = 0; i < this.defaults.length; i += 1) {
		if (this.defaults[i] !== null && slots[i].setContents) {
			slots[i].setContents(this.defaults[i]);
		}
	}

	// restore previous inputs
	surplus = this.restoreInputs(oldInputs, -inputOffset);
	this.fixLabelColor();
	this.fixLayout();

	// place surplus blocks on scipts
	if (scripts && surplus?.length) {
		surplus.forEach(blk => {
			blk.moveBy(10);
			scripts.add(blk);
		});
	}
};

BlockMorph.prototype.restoreInputs = function (oldInputs, offset = 0) {
	// private - used only for relabel()
	// try to restore my previous inputs when my spec has been changed
	// return an Array of left-over blocks, if any
	// optional offset parameter allows for shifting the range
	// of inputs to be restored
	var old, nb, i, src, trg,
		element = this,
		inputs = this.inputs(),
		leftOver = [];

	function preserveBlocksIn(slot) {
		if (slot instanceof ReporterBlockMorph) {
			leftOver.push(slot);
		} else if (slot instanceof CommandSlotMorph) {
			nb = slot.nestedBlock();
			if (nb) {
				leftOver.push(nb);
			}
		}
	}

	// gather leading surplus blocks
	for (i = 0; i < offset; i += 1) {
		preserveBlocksIn(oldInputs[i]);
	}

	// restore matching inputs in their original order
	inputs.forEach(inp => {
		old = oldInputs[offset];
		if (old instanceof ReporterBlockMorph) {
			if (inp instanceof TemplateSlotMorph || inp.isStatic) {
				leftOver.push(old);
			} else {
				element.replaceInput(inp, old.fullCopy());
			}
		} else if (old && inp instanceof InputSlotMorph) {
			// original - turns empty numberslots to 0:
			// inp.setContents(old.evaluate());
			// "fix" may be wrong b/c constants
			if (old.contents) {
				inp.setContents(old.contents().text);
			}
		} else if (old instanceof CSlotMorph && inp instanceof CSlotMorph) {
			nb = old.nestedBlock();
			if (nb) {
				inp.nestedBlock(nb.fullCopy());
			}
		} else {
			preserveBlocksIn(old);
		}
		offset += 1;
	});

	// gather trailing surplus blocks
	for (offset; offset < oldInputs.length; offset += 1) {
		preserveBlocksIn(oldInputs[offset]);
	}
	element.cachedInputs = null;
	this.cachedInputs = null;
	return leftOver;
};

// BlockMorph expand/collapse

BlockMorph.prototype.canExpand = function () {
	return (this.inputs().length < this.maxInputCount());
}

BlockMorph.prototype.canContract = function () {
	return (this.inputs().length > this.minInputCount());
}

BlockMorph.prototype.expand = function () {
	// Expand the given block if possible.

	if (!this.canExpand()) return;

	if (this.expander) this.expander.destroy(); // remove the expander before appending parts
	for (const p of this.specForExpand().split(/\s+/)) {
		this.addChild(this.labelPart(p));
	}
	this.cachedInputs = null;
	this.addExpander();
	this.fixLayout();
}

BlockMorph.prototype.contract = function () {
	// Expand the given block if possible.

	if (!this.canContract()) return;

	if (this.expander) this.expander.destroy(); // remove the expander before appending parts
	for (const _ of this.specForContract().split(/\s+/)) {
		this.removeChild(this.children.at(-1));
	}
	this.cachedInputs = null;
	this.addExpander();
	this.fixLayout();
}

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
	// Return a string containing the block spec section for the next level of expansion.

	let currentInputCount = this.inputs().length;
	let specSections = this.blockSpec.split(':').map(s => s.trim());

	let count = this.inputCountForSpecSection(specSections[0]);
	for (let i = 1; i < specSections.length; i++) {
		count += this.inputCountForSpecSection(specSections[i]);
		if (count >= currentInputCount) {
			return specSections[i - 1];
		}
	}
	return specSections.at(-1);
}

BlockMorph.prototype.addExpander = function () {
	this.expander = new BlockExpanderMorph(this);
	this.addChild(this.expander);
}

// BlockMorph exporting picture with result bubble

BlockMorph.prototype.exportResultPic = function () {
	alert('not implemented yet');
	return;
	var top = this.topBlock();
	if (top !== this) {return; }
};

// BlockMorph thumbnail and script pic

BlockMorph.prototype.thumbnail = function (scale, clipWidth) {
	var nb = this.nextBlock(),
		fadeout = 12,
		ext,
		trgt,
		ctx,
		gradient;

	if (nb) {nb.isVisible = false; }
	ext = this.fullBounds().extent();
	trgt = newCanvas(new Point(
		clipWidth ? Math.min(ext.x * scale, clipWidth) : ext.x * scale,
		ext.y * scale
	));
	ctx = trgt.getContext('2d');
	ctx.scale(scale, scale);
	ctx.drawImage(this.fullImage(), 0, 0);
	// draw fade-out
	if (clipWidth && ext.x * scale > clipWidth) {
		gradient = ctx.createLinearGradient(
			trgt.width / scale - fadeout,
			0,
			trgt.width / scale,
			0
		);
		gradient.addColorStop(0, 'transparent');
		gradient.addColorStop(1, 'black');
		ctx.globalCompositeOperation = 'destination-out';
		ctx.fillStyle = gradient;
		ctx.fillRect(
			trgt.width / scale - fadeout,
			0,
			trgt.width / scale,
			trgt.height / scale
		);
	}
	if (nb) {nb.isVisible = true; }
	return trgt;
};

BlockMorph.prototype.scriptPic = function () {
	// answer a canvas image
	var scr = this.fullImage(),
		fb = this.stackFullBounds(),
		pic = newCanvas(fb.extent()),
		ctx = pic.getContext('2d');

	ctx.drawImage(scr, 0, 0);
	return pic;
};

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
			result.push((c.r << 16) | (c.g << 8) | c.b);
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

// BlockMorph drawing

BlockMorph.prototype.render = function (ctx) {
	this.cachedClr = this.color.toString();
	this.cachedClrBright = this.bright();
	this.cachedClrDark = this.dark();

	// draw the outline
	ctx.fillStyle = this.cachedClrDark;
	ctx.beginPath();
	this.outlinePath(ctx, 0);
	ctx.closePath();
	ctx.fill();

	// draw the inner filled shaped
	ctx.fillStyle = this.cachedClr;
	ctx.beginPath();
	this.outlinePath(ctx, this.flatEdge);
	ctx.closePath();
	ctx.fill();
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
		this.activeBorder
	);
	this.addBack(highlight);
	this.fullChanged();
	if (isHidden) {this.hide(); }
	return highlight;
};

BlockMorph.prototype.addErrorHighlight = function () {
	var isHidden = !this.isVisible,
		highlight;

	if (isHidden) {this.show(); }
	this.removeHighlight();
	highlight = this.highlight(
		this.errorHighlight,
		this.activeBlur,
		this.activeBorder
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

BlockMorph.prototype.toggleHighlight = function () {
	if (this.getHighlight()) {
		this.removeHighlight();
	} else {
		this.addHighlight();
	}
};

BlockMorph.prototype.highlight = function (color, blur, border) {
	var highlight = new BlockHighlightMorph(),
		fb = this.fullBounds(),
		edge = border;
	highlight.bounds.setExtent(fb.extent().add(edge * 2));
	highlight.holes = [highlight.bounds]; // make the highlight untouchable
	highlight.color = color;
	highlight.cachedImage = this.highlightImage(color, border);
	highlight.setPosition(fb.origin.subtract(new Point(edge, edge)));
	return highlight;
};

BlockMorph.prototype.highlightImage = function (color, border) {
	var fb, img, hi, ctx, out;
	fb = this.fullBounds().extent();
	this.doWithAlpha(1, () => img = this.fullImage());

	hi = newCanvas(fb.add(border * 2));
	ctx = hi.getContext('2d');

	ctx.drawImage(img, 0, 0);
	ctx.drawImage(img, border, 0);
	ctx.drawImage(img, border * 2, 0);
	ctx.drawImage(img, border * 2, border);
	ctx.drawImage(img, border * 2, border * 2);
	ctx.drawImage(img, border, border * 2);
	ctx.drawImage(img, 0, border * 2);
	ctx.drawImage(img, 0, border);

	ctx.globalCompositeOperation = 'destination-out';
	ctx.drawImage(img, border, border);

	out = newCanvas(fb.add(border * 2));
	ctx = out.getContext('2d');
	ctx.drawImage(hi, 0, 0);
	ctx.globalCompositeOperation = 'source-atop';
	ctx.fillStyle = color.toString();
	ctx.fillRect(0, 0, out.width, out.height);

	return out;
};

BlockMorph.prototype.highlightImageBlurred = function (color, blur) {
	var fb, img, hi, ctx;
	fb = this.fullBounds().extent();
	this.doWithAlpha(1, () => img = this.fullImage());

	hi = newCanvas(fb.add(blur * 2));
	ctx = hi.getContext('2d');
	ctx.shadowBlur = blur;
	ctx.shadowColor = color.toString();
	ctx.drawImage(img, blur, blur);

	ctx.shadowBlur = 0;
	ctx.globalCompositeOperation = 'destination-out';
	ctx.drawImage(img, blur, blur);
	return hi;
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

BlockMorph.prototype.flashOutline = function (color, border) {
	this.removeHighlight();
	this.addBack(this.outline(color, border));
	this.fullChanged();
};

BlockMorph.prototype.outline = function (color, border) {
	var highlight = new BlockHighlightMorph(),
		fb = this.fullBounds(),
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
		clr,
		cslot;

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
			} else { // command
				cslot = this.parentThatIsA(CommandSlotMorph);
				if (cslot) {
					nearest = cslot.parentThatIsA(BlockMorph);
				}
			}
		}
	}
	if (!nearest) { // top block
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

BlockMorph.prototype.ghost = function () {
	this.setColor(
		this.colorFor(this.category).lighter(35)
	);
};

BlockMorph.prototype.fixLabelColor = function () {
	if (this.zebraContrast > 0 && this.category) {
		var clr = this.colorFor(this.category);
		if (this.color.eq(clr)) {
			this.setLabelColor(
				WHITE,
				clr.darker(this.labelContrast)
			);
		} else {
			this.setLabelColor(
				BLACK,
				clr.lighter(this.zebraContrast)
					.lighter(this.labelContrast * 2)
			);
		}
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
	this.category = aString;
	this.fixBlockColor();
};

BlockMorph.prototype.hasLabels = function () {
	return this.children.some(any => any instanceof StringMorph);
};

// BlockMorph copying

BlockMorph.prototype.fullCopy = function () {
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
	this.forceNormalColoring();
};

BlockMorph.prototype.pickUp = function (wrrld) {
	// used when duplicating and grabbing a block via its context menu
	// position the duplicate's top-left corner at the mouse pointer
	var world = wrrld || this.world();
	this.setPosition(world.hand.position().subtract(this.rounding));
	world.hand.grab(this);
};

// BlockMorph events

BlockMorph.prototype.mouseClickLeft = function () {
	MB_editor.toggleRunning(this.topBlock());
	return;

	var top = this.topBlock(),
		receiver = top.scriptTarget(),
		shiftClicked = this.world().currentKey === 16,
		stage;
	if (shiftClicked && !this.isTemplate) {
		return this.selectForEdit().focus(); // enable copy-on-edit
	}
	if (top instanceof PrototypeHatBlockMorph) {
		return; // top.mouseClickLeft();
	}
	if (receiver) {
		stage = receiver.parentThatIsA(StageMorph);
		if (stage) {
			stage.threads.toggleProcess(top, receiver);
		}
	}
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
	// see recordDrop() and userExtractJustThis()
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
};

BlockMorph.prototype.destroy = function (justThis) {
	// private - use IDE_Morph.removeBlock() to first stop all my processes
	BlockMorph.uber.destroy.call(this);
};

BlockMorph.prototype.stackHeight = function () {
	var fb = this.fullBounds();
	return fb.bottom() - fb.top();
};

BlockMorph.prototype.stackFullBounds = function () {
	return this.fullBounds();
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

CommandBlockMorph.prototype.wrapAttachPoint = function () {
	var cslot = detect( // could be a method making uses of caching...
		this.inputs(), // ... although these already are cached
		each => each instanceof CSlotMorph
	);
	if (cslot && !cslot.nestedBlock()) {
		return new Point(
			cslot.left() + (cslot.inset * 2) + cslot.corner,
			cslot.top() + (cslot.corner * 2)
		);
	}
	return null;
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

CommandBlockMorph.prototype.attachTargets = function () {
	var answer = [],
		tp;
	if (!(this instanceof HatBlockMorph)) {
		tp = this.topAttachPoint();
		if (!(this.parent instanceof SyntaxElementMorph)) {
			answer.push({
				point: tp,
				element: this,
				loc: 'top',
				type: 'block'
			});
		}
		if (ScriptsMorph.prototype.enableNestedAutoWrapping ||
				!this.parentThatIsA(CommandSlotMorph)) {
			answer.push({
				point: tp,
				element: this,
				loc: 'wrap',
				type: 'block'
			});
		}
	}
	if (!this.isStop()) {
		answer.push({
			point: this.bottomAttachPoint(),
			element: this,
			loc: 'bottom',
			type: 'block'
		});
	}
	return answer;
};

CommandBlockMorph.prototype.allAttachTargets = function (newParent) {
	var target = newParent || this.parent,
		answer = [],
		topBlocks;

	if (this instanceof HatBlockMorph &&
		((newParent.rejectsHats && !this.isCustomBlockSpecific()) ||
			(!newParent.rejectsHats && this.isCustomBlockSpecific()))
	) {
		return answer;
	}
	topBlocks = target.children.filter(child =>
		(child !== this) &&
			child instanceof SyntaxElementMorph &&
				!child.isTemplate
	);
	topBlocks.forEach(block =>
		block.forAllChildren(child => {
			if (child.attachTargets) {
				child.attachTargets().forEach(at =>
					answer.push(at)
				);
			}
		})
	);
	return answer;
};

CommandBlockMorph.prototype.closestAttachTarget = function (newParent) {
	var target = newParent || this.parent,
		bottomBlock = this.bottomBlock(),
		answer = null,
		thresh = Math.max(
			this.corner * 2 + this.dent,
			this.minSnapDistance
		),
		dist,
		ref = [],
		minDist = 1000,
		wrap;

	if (!(this instanceof HatBlockMorph)) {
		ref.push(
			{
				point: this.topAttachPoint(),
				loc: 'top'
			}
		);
		wrap = this.wrapAttachPoint();
		if (wrap) {
			ref.push(
				{
					point: wrap,
					loc: 'wrap'
				}
			);
		}
	}
	if (!bottomBlock.isStop()) {
		ref.push(
			{
				point: bottomBlock.bottomAttachPoint(),
				loc: 'bottom'
			}
		);
	}
	this.allAttachTargets(target).forEach(eachTarget =>
		ref.forEach(eachRef => {
			// match: either both locs are 'wrap' or both are different,
			// none being 'wrap' (can this be expressed any better?)
			if ((eachRef.loc === 'wrap' && (eachTarget.loc === 'wrap')) ||
				((eachRef.loc !== eachTarget.loc) &&
					(eachRef.loc !== 'wrap') && (eachTarget.loc !== 'wrap'))
			) {
				dist = eachRef.point.distanceTo(eachTarget.point);
				if ((dist < thresh) && (dist < minDist)) {
					minDist = dist;
					answer = eachTarget;
				}
			}
		})
	);
	return answer;
};

CommandBlockMorph.prototype.snap = function (hand) {
	var target = this.closestAttachTarget(),
		scripts = this.parentThatIsA(ScriptsMorph),
		before,
		next,
		offsetY,
		cslot,
		affected;

	if (target === null) {
		this.fixBlockColor();
		return;
	}
	if (target.loc === 'bottom') {
		if (target.type === 'slot') {
			this.removeHighlight();
			scripts.lastNextBlock = target.element.nestedBlock();
			target.element.nestedBlock(this);
		} else {
			scripts.lastNextBlock = target.element.nextBlock();
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
		scripts.lastWrapParent = before;

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

CommandBlockMorph.prototype.prepareToBeGrabbed = function (handMorph) {
	// check whether the shift-key is held down and if I can be "extracted"
	if (handMorph && handMorph.world.currentKey === 16 && this.nextBlock()) {
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
	if (cslot) {
		cslot.fixLayout();
	}
	if (parent) {
		parent.reactToGrabOf(this); // fix highlight
	}
};

CommandBlockMorph.prototype.userDestroyJustThis = function () {
	// delete just this one block, reattach next block to the previous one,
	var scripts = this.parentThatIsA(ScriptsMorph),
		nb = this.nextBlock();

	// for undrop / redrop
	if (scripts) {
		scripts.clearDropInfo();
		scripts.lastDroppedBlock = this;
		scripts.recordDrop(this.situation());
		scripts.dropRecord.lastNextBlock = nb;
		scripts.dropRecord.action = 'delete';
	}

	this.extract();
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

// CommandBlockMorph drawing:

CommandBlockMorph.prototype.outlinePath = function(ctx, inset) {
	var indent = this.corner * 2 + this.inset,
		bottom = this.height() - this.corner,
		bottomCorner = this.height() - this.corner * 2,
		radius = Math.max(this.corner - inset, 0),
		pos = this.position();

	// top left:
	ctx.arc(
		this.corner,
		this.corner,
		radius,
		radians(-180),
		radians(-90),
		false
	);

	// top dent:
	ctx.lineTo(this.corner + this.inset, inset);
	ctx.lineTo(indent, this.corner + inset);
	ctx.lineTo(indent + this.dent, this.corner + inset);
	ctx.lineTo(this.corner * 3 + this.inset + this.dent, inset);
	ctx.lineTo(this.width() - this.corner, inset);

	// top right:
	ctx.arc(
		this.width() - this.corner,
		this.corner,
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
		this.width() - this.corner,
		bottomCorner,
		radius,
		radians(0),
		radians(90),
		false
	);

	if (!this.isStop()) {
		ctx.lineTo(this.width() - this.corner, bottom - inset);
		ctx.lineTo(this.corner * 3 + this.inset + this.dent, bottom - inset);
		ctx.lineTo(indent + this.dent, bottom + this.corner - inset);
		ctx.lineTo(indent, bottom + this.corner - inset);
		ctx.lineTo(this.corner + this.inset, bottom - inset);
	}

	// bottom left:
	ctx.arc(
		this.corner,
		bottomCorner,
		radius,
		radians(90),
		radians(180),
		false
	);
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

HatBlockMorph.prototype.definedFunctionName = function () {
	if (!this.isFunctionDefinition()) return 'Not a function definition';
	return this.functionDefinition.functionName;
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
		h = this.hatHeight,
		r = ((4 * h * h) + (s * s)) / (8 * h),
		a = degrees(4 * Math.atan(2 * h / s)),
		sa = a / 2,
		sp = Math.min(s * 1.7, this.width() - this.corner),
		pos = this.position();


	// top arc:
	ctx.moveTo(inset, h + this.corner);
	ctx.arc(
		s / 2,
		r,
		r,
		radians(-sa - 90),
		radians(-90),
		false
	);
	ctx.bezierCurveTo(
		s,
		0,
		s,
		h,
		sp,
		h
	);

	// top right:
	ctx.arc(
		this.width() - this.corner,
		h + this.corner,
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
		this.width() - this.corner,
		bottomCorner,
		radius,
		radians(0),
		radians(90),
		false
	);

	if (!this.isStop()) {
		ctx.lineTo(this.width() - this.corner, bottom - inset);
		ctx.lineTo(this.corner * 3 + this.inset + this.dent, bottom - inset);
		ctx.lineTo(indent + this.dent, bottom + this.corner - inset);
		ctx.lineTo(indent, bottom + this.corner - inset);
		ctx.lineTo(this.corner + this.inset, bottom - inset);
	}

	// bottom left:
	ctx.arc(
		this.corner,
		bottomCorner,
		radius,
		radians(90),
		radians(180),
		false
	);
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

	target = scripts.closestInput(this, hand);
	if (target !== null) {
		scripts.lastReplacedInput = target;
		scripts.lastDropTarget = target.parent;
		if (target instanceof CommandSlotMorph) {
			scripts.lastReplacedInput = target;
			nb = target.nestedBlock();
			if (nb) {
				nb = nb.fullCopy();
				scripts.add(nb);
				nb.moveBy(nb.extent());
				nb.fixBlockColor();
				scripts.lastPreservedBlocks = [nb];
			}
		}
		target.parent.replaceInput(target, this);
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
	if (handMorph) {
		handMorph.alpha = this.alpha < 1 ? 1 : 0.85;
	}
	this.cachedSlotSpec = null;
};

// ReporterBlockMorph enumerating

ReporterBlockMorph.prototype.blockSequence = function () {
	// reporters don't have a sequence, answer myself
	return this;
};

// ReporterBlockMorph evaluating

ReporterBlockMorph.prototype.isLocked = function () {
	// answer true if I can be exchanged by a dropped reporter
	return this.isStatic || (this.getSlotSpec() === '%var');
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
		let newName = prompt('Variable name?', this.blockSpec);
		if (newName != null) this.userSetSpec(newName);
	} else {
		ReporterBlockMorph.uber.mouseClickLeft.call(this, pos);
	}
};

// ReporterBlockMorph deleting

ReporterBlockMorph.prototype.userDestroy = function () {
	// make sure to restore default slot of parent block
	var parent;

	parent = this.parentThatIsA(SyntaxElementMorph);
	if (parent) {
		this.parent.reactToGrabOf(this); // fix highlight and variadic case
	}

	// for undrop / redrop
	var scripts = this.parentThatIsA(ScriptsMorph);
	if (scripts) {
		scripts.clearDropInfo();
		scripts.lastDroppedBlock = this;
		scripts.recordDrop(this.situation());
		scripts.dropRecord.action = 'delete';
	}

	this.topBlock().fullChanged();
	this.prepareToBeGrabbed(this.world().hand);
	this.destroy();
};

// ReporterBlockMorph drawing:

ReporterBlockMorph.prototype.outlinePath = function (ctx, inset) {
	this.outlinePathOval(ctx, inset);
};

ReporterBlockMorph.prototype.outlinePathOval = function (ctx, inset) {
	// draw the 'flat' shape
	var h = this.height(),
		r = Math.min(this.rounding, h / 2),
		radius = Math.max(r - inset, 0),
		w = this.width(),
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

ScriptsMorph.prototype.cleanUpMargin = 20;
ScriptsMorph.prototype.cleanUpSpacing = 15;
ScriptsMorph.prototype.isPreferringEmptySlots = true;
ScriptsMorph.prototype.enableKeyboard = true;
ScriptsMorph.prototype.enableNestedAutoWrapping = true;
ScriptsMorph.prototype.feedbackColor = WHITE;

// ScriptsMorph instance creation:

function ScriptsMorph() {
	this.init();
}

ScriptsMorph.prototype.init = function () {
	this.feedbackMorph = new BoxMorph();
	this.rejectsHats = false;

	// "undrop" attributes:
	this.lastDroppedBlock = null;
	this.lastReplacedInput = null;
	this.lastDropTarget = null;
	this.lastPreservedBlocks = null;
	this.lastNextBlock = null;
	this.lastWrapParent = null;

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

ScriptsMorph.prototype.showReporterDropFeedback = function (block, hand) {
	var target = this.closestInput(block, hand);

	if (target === null) {
		return null;
	}
	this.feedbackMorph.edge = SyntaxElementMorph.prototype.rounding;
	this.feedbackMorph.border = Math.max(
		SyntaxElementMorph.prototype.edge,
		3
	);
	this.feedbackMorph.color = this.feedbackColor.copy();
	this.feedbackMorph.borderColor = this.feedbackColor;
	this.feedbackMorph.bounds = target.fullBounds()
		.expandBy(Math.max(
			block.edge * 2,
			block.reporterDropFeedbackPadding
		));
	this.feedbackMorph.color.a = 0.5;
	this.feedbackMorph.rerender();
	this.add(this.feedbackMorph);
};

ScriptsMorph.prototype.showCommandDropFeedback = function (block) {
	var y, target;

	target = block.closestAttachTarget(this);
	if (!target) {
		return null;
	}
	if (target.loc === 'wrap') {
		this.showCSlotWrapFeedback(block, target.element);
		return;
	}
	this.add(this.feedbackMorph);
	this.feedbackMorph.border = 0;
	this.feedbackMorph.edge = 0;
	this.feedbackMorph.alpha = 1;
	this.feedbackMorph.bounds.setWidth(target.element.width());
	this.feedbackMorph.bounds.setHeight(Math.max(
			SyntaxElementMorph.prototype.corner,
			SyntaxElementMorph.prototype.feedbackMinHeight
		)
	);
	this.feedbackMorph.color = this.feedbackColor;
	y = target.point.y;
	if (target.loc === 'bottom') {
		if (target.type === 'block') {
			if (target.element.nextBlock()) {
				y -= SyntaxElementMorph.prototype.corner;
			}
		} else if (target.type === 'slot') {
			if (target.element.nestedBlock()) {
				y -= SyntaxElementMorph.prototype.corner;
			}
		}
	}
	this.feedbackMorph.setPosition(new Point(
		target.element.left(),
		y
	));
};

ScriptsMorph.prototype.showCSlotWrapFeedback = function (srcBlock, trgBlock) {
	var clr;
	this.feedbackMorph.bounds = trgBlock.fullBounds()
		.expandBy(BlockMorph.prototype.corner);
	this.feedbackMorph.edge = SyntaxElementMorph.prototype.corner;
	this.feedbackMorph.border = Math.max(
		SyntaxElementMorph.prototype.edge,
		3
	);
	this.add(this.feedbackMorph);
	clr = srcBlock.color.lighter(40);
	this.feedbackMorph.color = clr.copy();
	this.feedbackMorph.color.a = 0.1;
	this.feedbackMorph.borderColor = clr;
	this.feedbackMorph.rerender();
};

ScriptsMorph.prototype.closestInput = function (reporter, hand) {
	// passing the hand is optional (when dragging reporters)
	var fb = reporter.fullBoundsNoShadow(),
		stacks = this.children.filter(child =>
			(child instanceof BlockMorph) &&
				(child.fullBounds().intersects(fb))
		),
		blackList = reporter.allInputs(),
		handPos,
		target,
		all;

	all = [];
	stacks.forEach(stack =>
		all = all.concat(stack.allInputs())
	);
	if (all.length === 0) {return null; }

	function touchingVariadicArrowsIfAny(inp, point) {
		return true;
	}

	if (this.isPreferringEmptySlots) {
		if (hand) {
			handPos = hand.position();
			target = detect(
				all,
				input => (input instanceof InputSlotMorph ||
						(input instanceof ArgMorph && !(input instanceof CommandSlotMorph)
						) || input.isEmptySlot()
					) &&
						!input.isLocked() &&
							input.bounds.containsPoint(handPos) &&
								!contains(blackList, input)
			);
			if (target) {
				return target;
			}
		}
		target = detect(
			all,
			input => (input instanceof InputSlotMorph ||
					input instanceof ArgMorph ||
					input.isEmptySlot()
				) &&
					!input.isLocked() &&
						input.bounds.intersects(fb) &&
							!contains(blackList, input) &&
								touchingVariadicArrowsIfAny(input, handPos)
		);
		if (target) {
			return target;
		}
	}

	if (hand) {
		handPos = hand.position();
		target = detect(
			all,
			input => (input !== reporter) &&
				!input.isLocked() &&
					input.bounds.containsPoint(handPos) &&
							!contains(blackList, input) &&
								touchingVariadicArrowsIfAny(input, handPos)
		);
		if (target) {
			return target;
		}
	}
	return detect(
		all,
		input => (input !== reporter) &&
			!input.isLocked() &&
				input.fullBounds().intersects(fb) &&
						!contains(blackList, input) &&
							touchingVariadicArrowsIfAny(input)
	);
};

// ScriptsMorph user menu

ScriptsMorph.prototype.userMenu = function () {
	var menu = new MenuMorph(this),
		shiftClicked = this.world().currentKey === 16;

	menu.addItem(
		'connect',
		() => { MB_connection.connect('serial') },
		'connect via serial for testing');
	menu.addLine();

	menu.addItem(
		'new project', () => { MB_editor.newProject() }, 'clear current project');
	menu.addItem(
		'open project', () => { MB_editor.openProject() }, 'open a project from a file');
	menu.addItem(
		'save project', () => { MB_editor.saveProject() }, 'save this project to a file');
	menu.addItem(
		'read from board', () => { MB_editor.openProjectFromBoard() },
		'replace this project with the one\nstored on the connected board');
	menu.addLine();

	menu.addItem(
		'run', () => { MB_editor.startAll() }, 'run the current project');
	menu.addItem(
		'stop', () => { MB_editor.stopAll() }, 'stop all scripts');
	menu.addLine();

	menu.addItem('clean up', 'cleanUp', 'arrange scripts\nvertically');
	menu.addItem('scripts pic...', 'exportScriptsPicture', 'save a picture\nof all scripts');

	menu.addLine();
	menu.addItem('compile function test',
		async () => {
			data = await MB_Files.readFile('Examples/Blink.ubp');
			this.doGPCall('test.compileExample', [data])
		},
		'Compile a function from the "Blink" project');

	return menu;
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
	var target = this.selectForEdit(), // enable copy-on-edit
		origin = target.topLeft(),
		y = target.cleanUpMargin;
	target.children.sort(target.definitionsFirst).forEach(child => {
		child.setPosition(origin.add(new Point(target.cleanUpMargin, y)));
		y += child.stackHeight() + target.cleanUpSpacing;
	});
	if (target.parent) {
		target.setPosition(target.parent.topLeft());
	}
	target.adjustBounds();
};

ScriptsMorph.prototype.exportScriptsPicture = function () {
	var pic = this.scriptsPicture(),
		ide = this.world().children[0],
		xml = this.scriptsXML();

	if (pic) {
		if (xml) {
			ide.saveFileAs(
				embedMetadataPNG(pic, xml),
				'image/png',
				(ide.getProjectName() || localize('untitled')) + ' ' +
					localize('script pic')
			);
		} else {
			ide.saveCanvasAs(
				pic,
				(ide.getProjectName() || localize('untitled')) + ' ' +
					localize('script pic')
			);
		}
	}
};

ScriptsMorph.prototype.scriptsPicture = function () {
	// private - answer a canvas containing the pictures of all scripts
	var boundingBox, pic, ctx;
	if (this.children.length === 0) {return; }
	boundingBox = this.children[0].fullBounds();
	this.children.forEach(child => {
		if (child.isVisible) {
			boundingBox = boundingBox.merge(child.fullBounds());
		}
	});
	pic = newCanvas(boundingBox.extent());
	ctx = pic.getContext('2d');
	this.children.forEach(child => {
		var pos = child.fullBounds().origin;
		if (child.isVisible) {
			ctx.drawImage(
				child.fullImage(),
				pos.x - boundingBox.origin.x,
				pos.y - boundingBox.origin.y
			);
		}
	});
	return pic;
};

ScriptsMorph.prototype.doGPCall = function (apiCall, params) {
	// Call the given GP API function with the given parameters and print the result.

	GP.apiCall(
		apiCall,
		params,
		function(value) { console.log("return value:", value) });
}

// ScriptsMorph sorting blocks

ScriptsMorph.prototype.sortedElements = function () {
	// return all scripts
	var scripts = this.children.slice(); // make a copy
	scripts.sort(this.definitionsFirst);
	return scripts;
};

// ScriptsMorph drag & drop:

ScriptsMorph.prototype.wantsDropOf = function (aMorph) {
	// override the inherited method
	if (aMorph instanceof HatBlockMorph) {
		return (!this.rejectsHats && !aMorph.isCustomBlockSpecific()) ||
			(this.rejectsHats && aMorph.isCustomBlockSpecific());
	}
	return aMorph instanceof SyntaxElementMorph;
};

ScriptsMorph.prototype.reactToDropOf = function (droppedMorph, hand) {
	if (droppedMorph instanceof BlockMorph) {
		droppedMorph.snap(hand);
	}
	this.adjustBounds();
};

// ScriptsMorph events

ScriptsMorph.prototype.mouseClickLeft = function (pos) {
	if (this.focus) {this.focus.stopEditing(); }
};

ScriptsMorph.prototype.selectForEdit = function () {
	return this;
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

ArgMorph.prototype.isEmptySlot = function () {
	return this.type !== null;
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

CommandSlotMorph.prototype.attachTargets = function () {
	var answer = [];
	answer.push({
		point: this.slotAttachPoint(),
		element: this,
		loc: 'bottom',
		type: 'slot'
	});
	return answer;
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
	if (this.parent && this.parent.fixLayout) {
		this.parent.fixLayout();
	}
};

// CommandSlotMorph evaluating:

CommandSlotMorph.prototype.evaluate = function () {
	return this.nestedBlock();
};

CommandSlotMorph.prototype.isEmptySlot = function () {
	return !this.isStatic && (this.nestedBlock() === null);
};

// CommandSlotMorph context menu ops

CommandSlotMorph.prototype.attach = function () {
	// for context menu demo and testing purposes
	// override inherited version to adjust new owner's layout
	var choices = this.overlappedMorphs(),
		menu = new MenuMorph(this, 'choose new parent:');

	choices.forEach(each =>
		menu.addItem(
			each.toString().slice(0, 50),
			() => {
				each.add(this);
				this.isDraggable = false;
				if (each.fixLayout) {
					each.fixLayout();
				}
			}
		)
	);
	if (choices.length > 0) {
		menu.popUpAtHand(this.world());
	}
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

CSlotMorph.prototype.fixLayout = function () {
	var nb = this.nestedBlock();
	if (nb) {
		nb.setPosition(
			new Point(
				this.left() + this.inset,
				this.top() + this.corner
			)
		);
		this.bounds.setHeight(nb.fullBounds().height() + this.corner);
		this.bounds.setWidth(
			nb.fullBounds().width() + (this.cSlotPadding * 2)
		);
	} else {
		this.bounds.setHeight(this.corner * 4 + this.cSlotPadding); // default
		this.bounds.setWidth(
			this.corner * 4
				+ (this.inset * 2)
				+ this.dent
				+ (this.cSlotPadding * 2)
		);
	}

	if (this.parent && this.parent.fixLayout) {
		this.parent.fixLayout();
	}
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
		radius = Math.max(this.corner - inset, 0);

	// top corner:
	ctx.lineTo(this.width() + ox - inset, oy);

	// top right:
	ctx.arc(
		this.width() - this.corner + ox,
		oy,
		radius,
		radians(90),
		radians(0),
		true
	);

	// jigsaw shape:
	ctx.lineTo(
		this.width() - this.corner + ox,
		this.corner + oy - inset
	);
	ctx.lineTo(
		(this.inset * 2) + (this.corner * 3) + this.dent + ox,
		this.corner + oy - inset
	);
	ctx.lineTo(
		(this.inset * 2) + (this.corner * 2) + this.dent + ox,
		this.corner * 2 + oy - inset
	);
	ctx.lineTo(
		(this.inset * 2) + (this.corner * 2) + ox,
		this.corner * 2 + oy - inset
	);
	ctx.lineTo(
		(this.inset * 2) + this.corner + ox,
		this.corner + oy - inset
	);
	ctx.lineTo(
		this.inset + this.corner + ox,
		this.corner + oy - inset
	);
	ctx.arc(
		this.inset + this.corner + ox,
		this.corner * 2 + oy,
		this.corner + inset,
		radians(270),
		radians(180),
		true
	);

	// bottom:
	ctx.lineTo(
		this.inset + ox - inset,
		this.height() - (this.corner * 2) + oy
	);
	ctx.arc(
		this.inset + this.corner + ox,
		this.height() - (this.corner * 2) + oy,
		this.corner + inset,
		radians(180),
		radians(90),
		true
	);
	ctx.lineTo(
		this.width() - this.corner + ox,
		this.height() - this.corner + oy + inset
	);
	ctx.arc(
		this.width() - this.corner + ox,
		this.height() + oy,
		radius,
		radians(-90),
		radians(-0),
		false
	);
};

// InputSlotMorph //////////////////////////////////////////////////////

/*
	I am an editable text input slot. I can be either rectangular or
	rounded, and can have an optional drop-down menu. If I'm set to
	read-only I must have a drop-down menu and will assume a darker
	shade of my parent's color.

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
		arrow = new ArrowMorph(
			'down',
			0,
			Math.max(Math.floor(this.fontSize / 6), 1),
			BLACK,
			true
		);

	contents.fontSize = this.fontSize;
	contents.isShowingBlanks = true;

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

InputSlotMorph.prototype.dropDownMenu = function (enableKeyboard) {
	let menu = this.mbMenu(this.choices);
	if (!menu) return;
	if (menu.items.length > 0) {
		if (enableKeyboard) {
			menu.popup(this.world(), this.bottomLeft());
			menu.getFocus();
		} else {
			menu.popUpAtHand(this.world());
		}
	}
};

InputSlotMorph.prototype.mbMenu = function (slotMenuName) {
	let menu = new MenuMorph(this.setContents);
	menu.environment = this;
	menu.fontSize = this.fontSize;

	if (slotMenuName && slotMenuName.startsWith('range:')) {
		// an integer range such as 'range:1-8', as GP's InputSlot does
		const pair = slotMenuName.slice(6).split('-');
		if ((pair.length == 2) && /^\d+$/.test(pair[0]) && /^\d+$/.test(pair[1])) {
			for (let i = Number(pair[0]); i <= Number(pair[1]); i++) {
				menu.addItem('' + i, i);
			}
			return menu;
		}
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

	// todo when we have a runtime: allVarsMenu, broadcastMenu, functionNameMenu

	console.log('unhandled slot menu:', slotMenuName);
	return null;
}

// InputSlotMorph layout:

InputSlotMorph.prototype.fixLayout = function () {
	var width, height, arrowWidth,
		contents = this.contents(),
		arrow = this.arrow(),
		tp = this.topBlock();

	contents.isNumeric = this.isNumeric && !this.isAlphanumeric;
	contents.isEditable = (!this.isReadOnly);
	if (this.isReadOnly) {
		contents.disableSelecting();
		contents.color = WHITE;
	} else {
		contents.enableSelecting();
		contents.color = BLACK;
	}

	if (this.choices) {
		arrow.setSize(fontHeight(this.fontSize));
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
	} else {
		height = contents.height() + this.edge * 2; // + this.typeInPadding * 2
		if (this.isNumeric) {
			width = contents.width()
				+ Math.floor(arrowWidth * 0.5)
				+ height
				+ this.typeInPadding * 2;
		} else {
			width = Math.max(
				contents.width()
					+ arrowWidth
					+ this.edge * 2
					+ this.typeInPadding * 2,
				contents.rawHeight ? // single vs. multi-line contents
					contents.rawHeight() + arrowWidth :
					(fontHeight(contents.fontSize) / 1.3) + arrowWidth
			);
		}
	}
	this.bounds.setExtent(new Point(width, height));

	if (this.isNumeric) {
		contents.setPosition(new Point(
			Math.floor(height / 2),
			this.edge
		).add(new Point(this.typeInPadding, 0)).add(this.position()));
	} else {
		contents.setPosition(new Point(
			this.edge,
			this.edge
		).add(new Point(this.typeInPadding, 0)).add(this.position()));
	}

	if (arrow.isVisible) {
		arrow.setPosition(new Point(
			this.right() - arrowWidth - this.edge,
			contents.top() - arrowWidth / 8
		));
	}

	if (this.parent && this.parent.fixLayout) {
		tp.fullChanged();
		this.parent.fixLayout();
		tp.fullChanged();
	}
};

// InputSlotMorph events:

InputSlotMorph.prototype.mouseDownLeft = function (pos) {
	if (this.isReadOnly || this.symbol ||
			this.arrow().bounds.containsPoint(pos)) {
		this.escalateEvent('mouseDownLeft', pos);
	}
};

InputSlotMorph.prototype.mouseClickLeft = function (pos) {
	if (this.arrow().bounds.containsPoint(pos)) {
		this.dropDownMenu();
	} else if (this.isReadOnly || this.symbol) {
		this.dropDownMenu();
	} else {
		this.contents().edit();
	}
};

InputSlotMorph.prototype.reactToEdit = function () {
	var block = this.parentThatIsA(BlockMorph);
	this.contents().clearSelection();
};

InputSlotMorph.prototype.freshTextEdit = function (aStringOrTextMorph) {
	this.onNextStep = () => aStringOrTextMorph.selectAll();
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
	let val = this.contents().text;
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
	return (this.mbUnsupplied === true) && (this.contents().text === this.mbValueText);
};

InputSlotMorph.prototype.isEmptySlot = function () {
	return this.contents().text === '' && !this.selectedBlock && !this.symbol;
};

// InputSlotMorph drawing:

InputSlotMorph.prototype.render = function (ctx) {
	var borderColor, r;

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
		ctx.fillStyle = borderColor.darker().toString();
	}

	// cache my border colors
	this.cachedClr = borderColor.toString();
	this.cachedClrBright = borderColor.lighter(this.contrast)
		.toString();
	this.cachedClrDark = borderColor.darker(this.contrast).toString();

	if (!this.isNumeric) {
		ctx.fillRect(
			this.edge,
			this.edge,
			this.width() - this.edge * 2,
			this.height() - this.edge * 2
		);
	} else {
		r = Math.max((this.height() - (this.edge * 2)) / 2, 0);
		ctx.beginPath();
		ctx.arc(
			r + this.edge,
			r + this.edge,
			r,
			radians(90),
			radians(-90),
			false
		);
		ctx.arc(
			this.width() - r - this.edge,
			r + this.edge,
			r,
			radians(-90),
			radians(90),
			false
		);
		ctx.closePath();
		ctx.fill();
	}

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
	tmp.setSpec(aString instanceof Array? localize(aString[0]) : aString);
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
	this.bounds.setExtent(template.extent().add(this.edge * 2 + 2));
	template.setPosition(this.position().add(this.edge + 1));
	if (this.parent) {
		if (this.parent.fixLayout) {
			this.parent.fixLayout();
		}
	}
};

// TemplateSlotMorph drop behavior:

TemplateSlotMorph.prototype.wantsDropOf = function (aMorph) {
	return aMorph.selector === 'v';
};

TemplateSlotMorph.prototype.reactToDropOf = function (droppedMorph) {
	if (droppedMorph.selector === 'v') {
		droppedMorph.destroy();
	}
};

// TemplateSlotMorph drawing:

TemplateSlotMorph.prototype.render = function (ctx) {
	if (this.parent instanceof Morph) {
		this.color = this.parent.color.copy();
	}
	BlockMorph.prototype.render.call(this, ctx);
};

TemplateSlotMorph.prototype.outlinePath =
	ReporterBlockMorph.prototype.outlinePathOval;

TemplateSlotMorph.prototype.cSlots = function () {
	return [];
};

// BooleanSlotMorph ////////////////////////////////////////////////////

/*
	I am a diamond-shaped argument slot.
	My block spec is

	%bool	- Boolean

	I can be directly edited. When the user clicks on me I toggle
	between <true>, <false> and <null> values.

	evaluate() returns my value.

	my most important public attributes and accessors are:

	value						- user editable contents (Boolean or null)
	setContents(Boolean/null)	- display the argument (Boolean or null)
*/

// BooleanSlotMorph inherits from ArgMorph:

BooleanSlotMorph.prototype = new ArgMorph();
BooleanSlotMorph.prototype.constructor = BooleanSlotMorph;
BooleanSlotMorph.uber = ArgMorph.prototype;

// BooleanSlotMorph preferences settings

BooleanSlotMorph.prototype.isTernary = false;

// BooleanSlotMorph instance creation:

function BooleanSlotMorph(initialValue) {
	this.init(initialValue);
}

BooleanSlotMorph.prototype.init = function (initialValue) {
	this.value = (typeof initialValue === 'boolean') ? initialValue : null;
	this.progress = 0; // for animation state, not persisted
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

BooleanSlotMorph.prototype.isBinary = function () {
	return !this.isTernary && !isNil(this.parentThatIsA(ScriptsMorph));
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
	this.value = this.nextValue();
	if (block && (block.isCustomBlock)) {
		block.fireSlotEditedEvent(this);
	}
	this.progress = 3;
	this.rerender();
	this.nextSteps ([
		() => {
			this.progress = 2;
			this.rerender();
		},
		() => {
			this.progress = 1;
			this.rerender();
		},
		() => {
			this.progress = 0;
			this.rerender();
		},
	]);
};

BooleanSlotMorph.prototype.nextValue = function () {
	if (this.isStatic || this.isBinary()) {
		return !this.value;
	}
	switch (this.value) {
	case true:
		return false;
	case false:
		return null;
	default:
		return true;
	}
};

// BooleanSlotMorph events:

BooleanSlotMorph.prototype.mouseClickLeft = function () {
	this.toggleValue();
};

BooleanSlotMorph.prototype.mouseEnter = function () {
	if (this.nextValue() === null) {
		this.progress = -1; // 'fade'
	} else {
		this.progress = 1;
	}
	this.rerender();
};

BooleanSlotMorph.prototype.mouseLeave = function () {
	this.progress = 0;
	this.rerender();
};

// BooleanSlotMorph layout:

BooleanSlotMorph.prototype.fixLayout = function () {
	// determine my extent
	this.bounds.setWidth((this.fontSize + this.edge * 2) * 2);
	this.bounds.setHeight(this.fontSize + this.edge * 2);
};

// BooleanSlotMorph drawing:

BooleanSlotMorph.prototype.render = function (ctx) {
	if (!(this.cachedNormalColor)) { // unless flashing
		this.color = this.parent ?
				this.parent.color : new Color(200, 200, 200);
	}
	this.cachedClr = this.color.toString();
	this.cachedClrBright = this.bright();
	this.cachedClrDark = this.dark();
	this.drawDiamond(ctx, this.progress);
	this.drawLabel(ctx);
	this.drawKnob(ctx, this.progress);
};

BooleanSlotMorph.prototype.drawDiamond = function (ctx, progress) {
	var w = this.width(),
		h = this.height(),
		r = h / 2,
		w2 = w / 2,
		shift = this.edge / 2,
		gradient;

	// draw the 'flat' shape:
	if (this.cachedNormalColor) { // if flashing
		ctx.fillStyle = this.color.toString();
	} else if (progress < 0 ) { // 'fade'
		ctx.fillStyle = this.color.darker(25).toString();
	} else {
		switch (this.value) {
		case true:
			ctx.fillStyle = 'rgb(0, 200, 0)';
			break;
		case false:
			ctx.fillStyle = 'rgb(200, 0, 0)';
			break;
		default:
			ctx.fillStyle = this.color.darker(25).toString();
		}
	}

	if (progress > 0 && !this.isEmptySlot()) {
		// left half:
		ctx.fillStyle = 'rgb(0, 200, 0)';
		ctx.beginPath();
		ctx.moveTo(0, r);
		ctx.lineTo(r, 0);
		ctx.lineTo(w2, 0);
		ctx.lineTo(w2, h);
		ctx.lineTo(r, h);
		ctx.closePath();
		ctx.fill();

		// right half:
		ctx.fillStyle = 'rgb(200, 0, 0)';
		ctx.beginPath();
		ctx.moveTo(w2, 0);
		ctx.lineTo(w - r, 0);
		ctx.lineTo(w, r);
		ctx.lineTo(w - r, h);
		ctx.lineTo(w2, h);
		ctx.closePath();
		ctx.fill();
	} else {
		ctx.beginPath();
		ctx.moveTo(0, r);
		ctx.lineTo(r, 0);
		ctx.lineTo(w - r, 0);
		ctx.lineTo(w, r);
		ctx.lineTo(w - r, h);
		ctx.lineTo(r, h);
		ctx.closePath();
		ctx.fill();
	}
};

BooleanSlotMorph.prototype.drawLabel = function (ctx) {
	var w = this.width(),
		r = this.height() / 2 - this.edge,
		r2 = r / 2,
		shift = this.edge / 2,
		text,
		x,
		y = this.height() / 2;

	if (this.isEmptySlot() || this.progress < 0) {
		return;
	}

	// "tick:"
	x = r + (this.edge * 2) + shift;
	ctx.strokeStyle = 'white';
	ctx.lineWidth = this.edge + shift;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'miter';
	ctx.beginPath();
	ctx.moveTo(x - r2, y);
	ctx.lineTo(x, y + r2);
	ctx.lineTo(x + r2, r2 + this.edge);
	ctx.stroke();

	// "cross:"
	x = w - y - (this.edge * 2);
	ctx.strokeStyle = 'white';
	ctx.lineWidth = this.edge;
	ctx.lineCap = 'butt';
	ctx.beginPath();
	ctx.moveTo(x - r2, y - r2);
	ctx.lineTo(x + r2, y + r2);
	ctx.moveTo(x - r2, y + r2);
	ctx.lineTo(x + r2, y - r2);
	ctx.stroke();
};

BooleanSlotMorph.prototype.drawKnob = function (ctx, progress) {
	var w = this.width(),
		r = this.height() / 2,
		shift = this.edge / 2,
		slideStep = (this.width() - this.height()) / 4 *
			Math.max(0, (progress || 0)),
		gradient,
		x,
		y = r,
		outline = 1,
		outlineColor = new Color(30, 30, 30),
		color = new Color(220, 220, 220),
		contrast = 60,
		topColor = color.lighter(contrast),
		bottomColor = color.darker(contrast);

	// draw the 'flat' shape:
	switch (this.value) {
	case false:
		x = r + slideStep;
		if (progress < 0) {
			ctx.globalAlpha = 0.6;
		}
		break;
	case true:
		x = w - r - slideStep;
		break;
	default:
		if (!progress) {return; }
		x = r;
		ctx.globalAlpha = 0.6;
	}

	ctx.fillStyle = color.toString();
	ctx.beginPath();
	ctx.arc(x, y, r, radians(0), radians(360));
	ctx.closePath();
	ctx.fill();

	ctx.globalAlpha = 1;
};

BooleanSlotMorph.prototype.textLabelExtent = function () {
	var t, f;
	t = new StringMorph(
		localize('true'),
		this.fontSize,
		null,
		true // bold
	);
	f = new StringMorph(
		localize('false'),
		this.fontSize,
		null,
		true // bold
	);
	return new Point(Math.max(t.width(), f.width()), t.height());
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
		arrow = new ArrowMorph(
			'down',
			0,
			Math.max(Math.floor(this.fontSize / 6), 1),
			BLACK,
			true
		);

	contents.fontSize = this.fontSize;
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

// ColorSlotMorph //////////////////////////////////////////////////////

/*
	I am an editable input slot for a color. Users can edit my color by
	clicking on me, in which case a display a color gradient palette
	and let the user select another color. Note that the user isn't
	restricted to selecting a color from the palette, any color from
	anywhere within the World can be chosen.

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

// ColorSlotMorph color sensing:

ColorSlotMorph.prototype.getUserColor = function () {
	var myself = this,
		world = this.world(),
		hand = world.hand,
		posInDocument = getDocumentPositionOf(world.worldCanvas),
		mouseMoveBak = hand.processMouseMove,
		mouseDownBak = hand.processMouseDown,
		mouseUpBak = hand.processMouseUp,
		pal = new ColorPaletteMorph(null, new Point(
			this.fontSize * 16,
			this.fontSize * 10
		)),
		ctx;
	world.add(pal);
	pal.setPosition(this.bottomLeft().add(new Point(0, this.edge)));

	// cache the world surface property (its full image)
	// to prevent memory issues from constantly generating
	// huge canvasses and and reading back pixel data only once
	// note: this optimization makes it hard / impossible for the
	// user to "catch" and sample the color of moving sprites
	// but without it Chrome crashes as of Fall 2023
	ctx = Morph.prototype.fullImage.call(world).getContext('2d');

	hand.processMouseMove = function (event) {
		var pos = hand.position(),
			dta = ctx.getImageData(pos.x, pos.y, 1, 1).data;
		hand.setPosition(new Point(
			event.pageX - posInDocument.x,
			event.pageY - posInDocument.y
		));
		myself.setContents(new Color(dta[0], dta[1], dta[2]));
	};

	hand.processMouseDown = nop;

	hand.processMouseUp = function () {
		pal.destroy();
		hand.processMouseMove = mouseMoveBak;
		hand.processMouseDown = mouseDownBak;
		hand.processMouseUp = mouseUpBak;
	};
};

// ColorSlotMorph events:

ColorSlotMorph.prototype.mouseClickLeft = function () {
	this.getUserColor();
};

// ColorSlotMorph evaluating:

ColorSlotMorph.prototype.evaluate = function () {
	return (this.mbValue === undefined) ? this.color : this.mbValue;
};

// ColorSlotMorph drawing:

ColorSlotMorph.prototype.fixLayout = function () {
	// determine my extent
	var side = this.fontSize + this.edge * 2 + this.typeInPadding * 2;
	this.bounds.setWidth(side);
	this.bounds.setHeight(side);
};

ColorSlotMorph.prototype.render = function (ctx) {
	var borderColor;

	if (this.parent) {
		borderColor = this.parent.color;
	} else {
		borderColor = new Color(120, 120, 120);
	}
	ctx.fillStyle = this.color.toString();

	// cache my border colors
	this.cachedClr = borderColor.toString();
	this.cachedClrBright = borderColor.lighter(this.contrast)
		.toString();
	this.cachedClrDark = borderColor.darker(this.contrast).toString();

	ctx.fillRect(
		this.edge,
		this.edge,
		this.width() - this.edge * 2,
		this.height() - this.edge * 2
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
	this.color = new Color(0, 0, 0);
	this.showLeft = aBlock.canContract();
	this.showRight = aBlock.canExpand();
	const w = (this.showLeft && this.showRight) ? 18 : 10;
	this.bounds.setWidth(w * aBlock.scale);
	this.bounds.setHeight(14 * aBlock.scale);
};

// BlockExpanderMorph drawing:

BlockExpanderMorph.prototype.render = function (ctx) {

	const w = this.width();
	const h = this.height();
	ctx.fillStyle = this.color.toString();

// this.showLeft = false;
// this.showRight = true;

	if (this.showLeft) {
		const right = h / 2;
		ctx.beginPath();
		ctx.moveTo(right, 0);
		ctx.lineTo(0, (h / 2));
		ctx.lineTo(right, h);
		ctx.closePath();
		ctx.fill();
	}

	if (this.showRight) {
		const left = w - (h / 2);
		ctx.beginPath();
		ctx.moveTo(left, 0);
		ctx.lineTo(w, (h / 2));
		ctx.lineTo(left, h);
		ctx.closePath();
		ctx.fill();
	}
};

// BlockExpanderMorph user input:

BlockExpanderMorph.prototype.mouseClickLeft = function (pos) {
	const aBlock = this.parent;
	if (!(aBlock instanceof BlockMorph)) return; // should not happen

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

// BlockHighlightMorph thread count readout

BlockHighlightMorph.prototype.readout = function () {
	return this.children.length ? this.children[0] : null;
};

BlockHighlightMorph.prototype.updateReadout = function () {
	var readout = this.readout(),
		inset = SyntaxElementMorph.prototype.activeBorder * -2;
	if (this.threadCount < 2) {
		if (readout) {
			readout.destroy();
		}
		return;
	}
	if (readout) {
		readout.changed();
		readout.contents = this.threadCount.toString();
		readout.fixLayout();
		readout.rerender();
	} else {
		readout = new SpeechBubbleMorph(
			this.threadCount.toString(),
			this.color, // color,
			null, // edge,
			null, // border,
			this.color.darker(), // borderColor,
			null, // padding,
			1, // isThought - don't draw a hook
			true // no shadow - faster
		);
		this.add(readout);
	}
	readout.setPosition(this.position().add(inset));
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
	this.insetX = 2;
	this.insetY = 9;
	this.stride = 18;
	this.ledWidth = 11;
	this.ledHeight = 14;
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

// MicroBitDisplaySlotMorph drawing:

MicroBitDisplaySlotMorph.prototype.fixLayout = function () {
	this.bounds.setWidth(84);
	this.bounds.setHeight(100);
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
			// todo: use on/off from display array
			let x = this.insetX + (col * this.stride);
			let y = this.insetY + (row * this.stride);
			let isOn = this.display[(5 * row) + col];
			ctx.fillStyle = (isOn ? onColor : offColor).toString();
			ctx.fillRect(x, y, this.ledWidth, this.ledHeight);
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
	}
};

MicroBitDisplaySlotMorph.prototype.pixelIndex = function (pos) {
	// Return the display pixel index for the given pointer position or -1
	// the pointer is not over any pixel.

	let relativePoint = pos.subtract(this.topLeft());
	let x = relativePoint.x - this.insetX;
	let y = relativePoint.y - this.insetY;
	if ((x < 0) || (y < 0)) return -1; // in the margin above or left of the grid
	if ((x % this.stride) >= this.ledWidth) return -1; // between pixels
	if ((y % this.stride) >= this.ledHeight) return -1; // between pixels

	let col = Math.trunc(x / this.stride);
	let row = Math.trunc(y / this.stride);
	if ((col > 4) || (row > 4)) return -1;
	return (row * 5) + col;
};
