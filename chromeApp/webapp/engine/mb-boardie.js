// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-boardie.js - Boardie, the MicroBlocks VM that runs in the browser, in a panel over the IDE.
//
// The panel is boardie/boardie.html; its buttons call GP.boardie and GP_closeBoardie by name.
// MB_CommPort carries the bytes; this file handles the panel and Boardie's other messages.

GP.boardie = {
	element: null,
	iframe: null,
	isOpen: false,
	isOpening: false, // the panel's html is being fetched
	position: null, // where the panel was last dragged to; windows.js records it
	reset: function () {
		let win = this.iframe.contentWindow;
		win.postMessage(new Uint8Array([ 0xFA, 0x0F, 3 ]), '*'); // system reset w/ Boardie option
		let ctx = win.document.querySelector('canvas').getContext('2d');
		ctx.fillStyle = "#000";
		ctx.fillRect(0, 0, 240, 240); // clear screen
		win.postMessage(new Uint8Array([ 0xFA, 0x05, 0 ]), '*'); // start all
	},
	buttonForCode: function (keyCode) {
		switch (parseInt(keyCode)) {
			case 37:
			case 65:
				return 'a';
			case 39:
			case 66:
				return 'b';
			case 84:
				return 'ab';
			default:
				return '';
		}
	},
	press: function (keyCode, andSendToBoard) {
		let button = this.buttonForCode(keyCode),
			element = this.element.querySelector(`[data-button="${button}"]`);
		if (element) { element.classList.add('--is-active'); }
		if (andSendToBoard) {
			this.iframe.contentWindow.postMessage(['keyDown', keyCode], '*');
		}
	},
	unpress: function (keyCode, andSendToBoard) {
		let button = this.buttonForCode(keyCode),
			element = this.element.querySelector(`[data-button="${button}"]`);
		if (element) { element.classList.remove('--is-active'); }
		if (andSendToBoard) {
			this.iframe.contentWindow.postMessage(['keyUp', keyCode], '*');
		}
	}
};

function GP_openBoardie() {
	let boardie = GP.boardie;
	if (boardie.isOpen || boardie.isOpening) return;
	boardie.isOpening = true;

	if (MB_connection.port != null) MB_connection.disconnect(); // close serial port if open

	fetch('boardie/boardie.html').then(response => {
		if (response.ok) return response.text();
	}).catch(() => null).then(html => {
		if (!boardie.isOpening) return; // closed while loading
		boardie.isOpening = false;
		if (html == null) return;
		boardie.element = document.createElement('div');
		boardie.element.classList.add('--can-drag-through');
		boardie.element.innerHTML = html;
		boardie.element.style.position = 'absolute';
		boardie.element.style.width = '272px';
		boardie.element.style.zIndex = 999;

		let ideCnv = document.getElementById('canvas');
		if (boardie.position &&
			(boardie.position.x <= ideCnv.clientWidth - 45) &&
			(boardie.position.y <= ideCnv.clientHeight - 45)) {
				boardie.element.style.left = boardie.position.x + 'px';
				boardie.element.style.top = boardie.position.y + 'px';
		} else {
			boardie.element.style.top = '70px';
			boardie.element.style.right = '34px';
		}
		boardie.element.style.cursor = 'grab';

		let isStandAlone = window.matchMedia('(display-mode: standalone)').matches;
		boardie.iframe = boardie.element.querySelector('iframe');
		if ((window.location.hostname == 'microblocks.fun') && !isStandAlone) {
			// Run Boardie from a separate domain to ensure it runs as an OOPIF
			boardie.iframe.src = 'https://boardie.microblocks.fun/vm.html';
		} else {
			// On the same domain the UI can interfere with time-sensitive threads,
			// such as when making music.
			boardie.iframe.src = 'boardie/vm.html';
		}

		boardie.element.onclick = function (evt) {
			if (!evt.target.closest('[data-button]')) {
				boardie.iframe.focus();
			}
		};

		document.body.append(boardie.element);

		makeDraggable(boardie.element);

		boardie.element.querySelectorAll('[data-button]').forEach(
			button => {
				button.addEventListener('keydown', (evt) => {
					boardie.press(evt.keyCode, true);
					boardie.iframe.focus();
				});
			}
		);

		boardie.iframe.contentWindow.addEventListener('click', (event) => {
			boardie.element.classList.add('--is-active');
		});

		boardie.isOpen = true;
		// The connection keeps pinging until the VM in the iframe has loaded and answers.
		MB_connection.connect('boardie', boardie.iframe);
		GP.apiCall('ide.updateConnection');
	});
}

function GP_closeBoardie() {
	GP.boardie.isOpening = false;
	if (GP.boardie.element) {
		document.body.removeChild(GP.boardie.element);
		GP.boardie.element = null;
		GP.boardie.iframe = null;
		GP.boardie.isOpen = false;
		MB_connection.disconnect();
		GP.apiCall('ide.updateConnection');
	}
}

// Boardie's messages other than bytes: its keyboard and its sound indicator.
window.addEventListener('message', (evt) => {
	let boardie = GP.boardie, msg = evt.data;
	if (!boardie.isOpen || (evt.source !== boardie.iframe.contentWindow)) return;
	if (!(msg instanceof Array)) return; // bytes, for MB_CommPort
	switch (msg[0]) {
		case 'boardieKeyDown':
			boardie.press(msg[1]);
			return;
		case 'boardieKeyUp':
			boardie.unpress(msg[1]);
			return;
		case 'boardieSoundStart':
			boardie.element.querySelector('.audio').classList.add('--is-active');
			return;
		case 'boardieSoundStop':
			boardie.element.querySelector('.audio').classList.remove('--is-active');
			return;
	}
}, false);

document.addEventListener('click', (event) => {
	// mark the panel active after a click on it, inactive after a click elsewhere
	let element = document.querySelector('.boardie');
	if (element) {
		if (event.target.closest('.boardie')) {
			element.classList.add('--is-active');
		} else {
			element.classList.remove('--is-active');
		}
	}
});
