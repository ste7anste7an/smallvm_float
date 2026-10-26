// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// elements.js - HTML element creator utilities

// Bernat Romagosa, 2026

function newElement(name, className) {
	let element = document.createElement(name);
	if (className) { element.classList.add(className); }
	return element;
}

function newButton(label, action) {
	let button = newElement('button', 'button-rounded');
	button.appendChild(newLabel(label));
	button.onclick = action;
	return button;
};

function newDiv(className) {
	return newElement('div', className);
};

function newLabel(text) {
	let label = document.createElement('l-');
	label.innerText = text;
	return label;
};
