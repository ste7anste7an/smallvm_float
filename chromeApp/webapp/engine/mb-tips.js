// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-tips.js - the bar under the panes that says what a block does.
//
// Plain HTML, not morphs, as the category selector is. It reads the block
// under the pointer and MB_Help, and nothing reads it. On a page with the
// chrome, the chrome's own tip bar shows the tip instead.

/* global MB_Help, world, IDE, HatBlockMorph, storeIDEProperty, BooleanSlotMorph, ColorSlotMorph,
	InputSlotMorph, BlockExpanderMorph, ArgMorph, BlockMorph, TriggerMorph, MenuItemMorph */

MB_Tips = {
	get height() {
		return this.usesChrome() ? 0 : 28; // the chrome's bar is outside the world
	},
	element: null,
	textElement: null,
	linkElement: null,
	op: null, // the op currently described, so an unchanged pointer costs nothing
	timer: null,
};

MB_Tips.usesChrome = function () {
	return (typeof IDE === 'object') && !!IDE.tipBar && !!IDE.tipBar.tipsContainer;
}

MB_Tips.open = function () {
	// Build the bar, or put it back if something removed it.

	if (this.usesChrome()) {
		this.start();
		return;
	}
	if (!this.element) {
		this.element = document.createElement('div');
		this.element.setAttribute('data-mb', 'tip-bar');
		this.textElement = document.createElement('span');
		this.textElement.setAttribute('data-mb', 'tip-text');
		this.linkElement = document.createElement('a');
		this.linkElement.setAttribute('data-mb', 'tip-link');
		this.linkElement.target = '_blank';
		this.linkElement.textContent = 'help';
		this.linkElement.hidden = true;
		this.element.appendChild(this.textElement);
		this.element.appendChild(this.linkElement);
	}
	if (!this.element.isConnected) document.body.appendChild(this.element);

	// Fixed to the bottom of the window, where GP's tip bar sits. Morphic binds
	// the mouse to the canvas, so a strip that takes events is a dead zone the
	// full width of it; pointerEvents none lets the drag through.
	Object.assign(this.element.style, {
		position: 'fixed', left: '0px', bottom: '0px', zIndex: '10',
		width: '100%', height: this.height + 'px', boxSizing: 'border-box',
		padding: '6px 10px', background: '#2b3040', color: '#e8e8e8',
		font: '12px sans-serif', whiteSpace: 'nowrap', overflow: 'hidden',
		pointerEvents: 'none',
	});
	Object.assign(this.linkElement.style,
		{ color: '#7fc4ff', marginLeft: '10px', pointerEvents: 'auto' });
	this.start();
}

MB_Tips.start = function () {
	if (this.timer) return;
	this.timer = setInterval(() => { this.update(); }, 100);
}

MB_Tips.blockUnderPointer = function () {
	// The innermost block under the pointer, or null. A block is recognised by
	// the two members every one carries rather than by its class.

	if ((typeof world === 'undefined') || !world.hand) return null;
	let m = world.hand.morphAtPointer();
	while (m) {
		if (m.selector && (typeof m.blockSpec === 'string')) return m;
		m = m.parent;
	}
	return null;
}

MB_Tips.opUnderPointer = function () {
	let block = this.blockUnderPointer();
	return block ? block.selector : null;
}

MB_Tips.chromeTips = {
	BooleanSlot: ['Boolean Input', '[l] toggle value, or drop a reporter into it.'],
	ColorSlot: ['Color Input', '[l] change the color, or drop a reporter into it.'],
	InputSlot: ['Input', '[l] edit its value, or drop a reporter into it.'],
	BlockDrawer: ['Block Extension', '[l] right arrow to show optional inputs, left arrow to hide.'],
	PaneResizer: ['Pane Divider', 'Drag to change pane width.'],
	BlocksPalette: ['Palette', 'Drag blocks from here to build scripts. Drop scripts here to delete them.'],
	ScriptEditor: ['Scripts Pane', 'Drag blocks here to build scripts. [r] menu.'],
};

MB_Tips.chromeTipKey = function (morph) {
	// [kind, morph] for what the pointer is over, kind null for something with
	// no tip. Text in an input slot counts as the slot, and a scroll bar as the
	// pane it scrolls.

	if (morph === MB_editor.paletteResizer) return ['PaneResizer', morph];
	for (let m = morph; m; m = m.parent) {
		if (m instanceof BooleanSlotMorph) return ['BooleanSlot', m];
		if (m instanceof ColorSlotMorph) return ['ColorSlot', m];
		if (m instanceof InputSlotMorph) return ['InputSlot', m];
		if (m instanceof BlockExpanderMorph) return ['BlockDrawer', m];
		if (m instanceof ArgMorph) return [null, m]; // a C-slot or the LED display
		if (m instanceof BlockMorph) return ['Block', m];
		// GP's palette buttons are Triggers, for which its tip bar has no tip.
		if ((m instanceof TriggerMorph) && !(m instanceof MenuItemMorph)) {
			return [(m.parent === MB_editor.palette.contents) ? null : 'Button', m];
		}
		if (m === MB_editor.palette) return ['BlocksPalette', m];
		if (m === MB_editor.scriptsFrame) return ['ScriptEditor', m];
	}
	return [null, morph];
}

MB_Tips.chromeTip = function () {
	// [title, text] for the chrome's tip bar, for the morph under the pointer.
	// Blank while the hand is busy, except that a block carried over the
	// palette is told it can be dropped there to delete it.

	if ((typeof world === 'undefined') || !world.hand) return ['', ''];
	const hand = world.hand;
	const [key, target] = this.chromeTipKey(hand.morphAtPointer());
	if (hand.children.length || hand.inputTarget || world.activeMenu) {
		const carried = hand.children[0];
		if (!((carried instanceof BlockMorph) && ('BlocksPalette' === key))) return ['', ''];
	}
	if ('Block' === key) return this.chromeTipFor(target);
	if ('Button' === key) {
		return [localized('Button'), ('string' === typeof target.hint) ? localized(target.hint) : ''];
	}
	const tip = this.chromeTips[key];
	return tip ? [localized(tip[0]), localized(tip[1])] : ['', ''];
}

MB_Tips.chromeTipFor = function (block) {
	// [title, text] for a block: what kind it is, what it does, and its gestures.

	let top = block.topBlock();
	let next = block.nextBlock ? block.nextBlock() : null;
	let tip = [
		localized('Script'),
		localized('[l] to run. [r] menu.')];
	if ((typeof HatBlockMorph !== 'undefined') && (block instanceof HatBlockMorph) && !next) {
		tip = [
			localized('Hat Block'),
			localized('[l] to run, or drag to build scripts. [r] menu.')];
	} else if ('reporter' === block.type()) {
		if (block === top) tip = [
			localized('Reporter Block'),
			localized('[l] to see value, or drop into an input slot. [r] menu.')];
	} else if ((block === top) && !next) {
		tip = [
			localized('Command Block'),
			localized('[l] to run, or drag to build scripts. [r] menu.')];
	}
	let description = ('Script' === tip[0]) ? '' : localized(MB_Help.descriptionFor(block.selector));
	if (MB_editor.devMode()) {
		tip[1] = ''; // suppress the gesture hint in dev mode
	}
	return description ? [tip[0], description + '    ' + tip[1]] : tip;
}

MB_Tips.update = function () {
	// The op is remembered only after the bar has been rewritten, so a lookup
	// that throws leaves the bar to retry rather than freeze on the last block.

	if (typeof MB_Help === 'undefined') return;
	if (this.usesChrome()) {
		let tip = this.chromeTip();
		if (JSON.stringify(tip) !== JSON.stringify(this.op)) storeIDEProperty('ide.tip', tip);
		this.op = tip;
		return;
	}
	if (!this.element) return;
	let op = this.opUnderPointer();
	if (op === this.op) return;

	// One entry, the variable reporter, has an empty description in GP. A link
	// with no text beside it reads as a broken bar, so it is hidden instead.
	let description = op ? MB_Help.descriptionFor(op) : '';
	let url = description ? MB_Help.wikiURLFor(op) : null;
	this.textElement.textContent = description;
	this.linkElement.hidden = !url;
	if (url) this.linkElement.href = url;
	else this.linkElement.removeAttribute('href'); // not the last block's page
	this.op = op;
}
