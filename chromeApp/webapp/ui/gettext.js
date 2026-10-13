// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2025 John Maloney, Bernat Romagosa, and Jens Mönig

// gettext.js - A GetText subset parser. Not by any means a complete GetText
// engine. Just the very few parts that we need for MicroBlocks.

// Bernat Romagosa, 2025


// A GetText object containing all properties, dictionaries and functions
// necessary for localization.
const GetText = {
	locales: [], // keeps localization dictionaries
	currentLocale: 'en',
	localizable: [] // remember all <-l> elements so they track locale changes
};

GetText.init = function () {
	GetText.readLocale('en');
};

GetText.addLocalizable = function (element) { this.localizable.push(element); }

// read a .po file and parse it into a localization dictionary
GetText.readLocale = function (langcode, callback) {
	this.locales[langcode] = {};
	fetch('translations/' + langcode + '.po')
		.then(response => response.text())
		.then(text => {
			this.parseLocale(text, langcode);
			if (callback) { callback.call(); }
		});
};

GetText.parseLocale = function (text, langcode) {
	var lines = text.split(/\r?\n|\r|\n/g); // make Windows happy about newlines
	// populate the locale dictionary with all key and values
	// skip the first line, as it's always an empty key
	for (var i = 1; i < lines.length; i++) {
		if (lines[i].indexOf('msgid') > -1) {
			// key is always in a single line
			var key = lines[i].substring(7, lines[i].length - 1);
			var value = '';
			i++;
			while (
					(lines[i] !== undefined) &&
					(lines[i].indexOf('msgid') == -1) &&
					(lines[i] !== '')
			) {
				if (lines[i].indexOf('msgstr') > -1) {
					// remove msgstr and quotes
					value += lines[i].substring(8, lines[i].length - 1);
				} else {
					// remove quotes
					value += lines[i].substring(1, lines[i].length - 1);
				}
				i++;
			}
			this.locales[langcode][key] = value;
		}
	}
};

// change the current locale and trigger the localization of all <l-> elements
GetText.setLocale = function (langcode) {
	if (this.locales[langcode] == undefined) {
		this.readLocale(langcode, () => { this.setLocale(langcode);} )
	} else {
		this.currentLocale = langcode;
		GP.apiCall('locale.setLanguage', [langcode]);
		this.localizable.forEach(e => e.localize());
	}
};

// localize a particular key into the current language, or fall back to defaults
// if not found
GetText.localize = function (key, ...replacementStrings) {
	if (this.locales[this.currentLocale]) {
		var value = this.locales[this.currentLocale][key];
		// default to EN if GetText locale doesn't have a translation for GetText key
		if ((value == undefined) || (value == '')) {
			value = this.locales['en'][key];
		}
	}
	// default to the key itself if there's no EN translation either
	if ((value == undefined) || (value == '')) { value = key; }
	if (value && value.includes('%1')) {
		return this.replaceParams(value, ...replacementStrings);
	}
	return value;
};

GetText.replaceParams = function (string, ...replacementStrings) {
	let replaced = string;
	for (var i = 0; i < replacementStrings.length; i++) {
		string = string.replace(`%${i+1}`, replacementStrings[i]);
	}
	return string;
};

GetText.init();


// An <l-> HTML element that is automatically localized into the current locale.
// GetText makes sure to trigger the localization of all <l-> elements whenever
// the locale changes.
class LocalizableText extends HTMLElement {
	constructor() {
		super();
		this.key = '';
	}

	connectedCallback() {
		this.key = this.textContent;
		GetText.addLocalizable(this);
		this.localize();
	}

	localize () { this.innerText = GetText.localize(this.key); }
}

customElements.define('l-', LocalizableText);
