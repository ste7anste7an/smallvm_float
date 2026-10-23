// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// filebrowser.js - Dialogs to load libraries or projects

// Bernat Romagosa, 2026

class FileBrowser extends FloatingWindow {
	constructor(purpose) {
		const contents = document.createElement('div'),
			buttons = [
				{ label: 'Open', action: onOpen, closesWindow: true },
				{ label: 'Cancel', action: ()=>{}, closesWindow: true }
			];

		super({
			title: { library: 'Load Library', project: 'Load Project' }[purpose],
			body: contents,
			buttons: buttons,
			minHeight: 470,
			minWidth: 600,
			resizable: true,
			className: purpose
		});

		this.purpose = purpose;

		contents.replaceWith(this.bodyDiv());

		function onOpen() { this.loadSelectedFile(); }
		function createLibrary() { this.createLibrary(); }
	}

	loadSelectedFile() {
	}

	createLibrary() {
	}

	bodyDiv() {
		let div = document.createElement('div');
		div.appendChild(this.sideDiv());
		return div;
	}
	sideDiv() {
		let div = document.createElement('div');
		div.classList = 'sidebar';
		if (this.purpose == 'library') {
			let button = document.createElement('button');
			button.innerHTML = '<l->New Library</l->';
			button.classList.add('button-rounded');
			button.onclick = this.createLibrary;
			div.appendChild(button);
		}
		return div;
	}
}

customElements.define('browser-', FileBrowser);
