// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozillbutton.org/MPL/2.0/.
//
// Copyright 2025 John Maloney, Bernat Romagosa, and Jens Mönig
//
// mb-gpAPI.js - Support for Javascript calls to GP functions
//
// John Maloney and Bernat Romagosa, 2026

// Mechanism that allows Javascript to call GP functions. Used for testing during
// the transition from a hybrid GP-Javascript system to an all Javascript system.
//
// This file supports the GP primitives defined in chromeApp/emscripten/browserPrims.c:
//
//		browserNextCallId
//		browserLastAPIRequest
//		browserRespondAPIRequest
//
// These are used by the API dispatcher defined in ide/MicroBlocksRuntime.gp

var GP = {
	lastCallId: 0,
	callQueue: [],
	apiResponses: {},
};

GP.apiCall = function (endPoint, params, callback) {
	// example, get a random number from 10 to 20:
	// GP.apiCall('random', [10, 20], function (value) { console.log(value) });

	this.lastCallId = (this.lastCallId + 1) % 100000;

	if (typeof params == 'undefined') { params = ""; }
	if (typeof callback == 'undefined') { callback = ()=>{}; }

	this.callQueue.push([
		this.lastCallId,			// unique call ID
		endPoint,					// API endpoint selector (e.g. "ide.stopAll")
		callback,					// called on return; takes a param with the return value
		JSON.stringify(params)		// call params, JSON encoded
	]);
};

function toUTF8Array(str) {
	// Convert a Javascript string into an array of UTF8 bytes that can be read by GP.
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
