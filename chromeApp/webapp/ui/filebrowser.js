// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// filebrowser.js - Dialogs to load libraries or projects

// Bernat Romagosa, 2026

class FileBrowser extends FloatingWindow {
	constructor(purpose) {
		const contents = document.createElement('div'),
			sidebar = document.createElement('div'),
			buttons = [
				{ label: 'Open', action: onOpen, closesWindow: true },
				{ label: 'Cancel', action: ()=>{}, closesWindow: true }
			];
		super({
			title: { library: 'Load Library', project: 'Load Project' }[purpose],
			body: contents,
			sidebar: sidebar,
			buttons: buttons,
			height: 470,
			width: 600,
			resizable: true,
			className: purpose
		});

		this.purpose = purpose;

		contents.replaceWith(this.bodyDiv());
		sidebar.replaceWith(this.sideDiv());

		function onOpen() { this.loadSelectedFile(); }
	}

	loadSelectedFile() {
	}

	bodyDiv() {
		let div = document.createElement('div');
		return div;
	}
	sideDiv() {
		let div = document.createElement('div');
		return div;
	}
}

customElements.define('browser-', FileBrowser);
