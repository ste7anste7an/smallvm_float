// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-tips.js - the bar under the panes that says what a block does.
//
// Plain HTML, not morphs, as the category selector is. It reads the block
// under the pointer and MB_Help, and nothing reads it.

/* global MB_Help, world */

MB_Tips = {
	height: 28,
	element: null,
	textElement: null,
	linkElement: null,
	op: null, // the op currently described, so an unchanged pointer costs nothing
	timer: null,
};

MB_Tips.open = function () {
	// Build the bar, or put it back if something removed it.

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

MB_Tips.opUnderPointer = function () {
	// The selector of the innermost block under the pointer, or null. A block
	// is recognised by the two members every one carries rather than by its
	// class, so this file names nothing in mb-blocks.js.

	if ((typeof world === 'undefined') || !world.hand) return null;
	let m = world.hand.morphAtPointer();
	while (m) {
		if (m.selector && (typeof m.blockSpec === 'string')) return m.selector;
		m = m.parent;
	}
	return null;
}

MB_Tips.update = function () {
	// The op is remembered only after the bar has been rewritten, so a lookup
	// that throws leaves the bar to retry rather than freeze on the last block.

	if (!this.element || (typeof MB_Help === 'undefined')) return;
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
