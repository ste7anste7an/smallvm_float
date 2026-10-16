// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-help.js - what a block does, and where its documentation lives.
//
// The strings are in mb-help-strings.js, which buildHelp.sh generates from
// ide/MicroBlocksHelp.gp.

/* global MB_HelpStrings */

MB_Help = {
	WIKI: 'https://wiki.microblocks.fun',
	MANUAL: 'https://wiki.microblocks.fun/reference_manual/',
};

MB_Help.entryForOp = function (op) {
	// Return [wiki path, description] for the given op, or null. Own keys
	// only: a block's selector comes from project text, so a user function
	// named toString would otherwise be answered by Object.prototype.

	if (typeof MB_HelpStrings === 'undefined') return null;
	if (!Object.prototype.hasOwnProperty.call(MB_HelpStrings, op)) return null;
	return MB_HelpStrings[op] || null;
}

MB_Help.descriptionFor = function (op) {
	let entry = this.entryForOp(op);
	return entry ? entry[1] : '';
}

MB_Help.wikiURLFor = function (op) {
	// A path starting with a slash is site-absolute; anything else names a
	// section of the reference manual, as GP does at openHelp
	// (MicroBlocksEditor.gp:913).

	let entry = this.entryForOp(op);
	if (!entry) return null;
	let path = entry[0];
	return path.startsWith('/') ? (this.WIKI + path) : (this.MANUAL + path);
}
