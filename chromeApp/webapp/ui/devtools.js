// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2025 John Maloney, Bernat Romagosa, and Jens Mönig

// devtools.js - Developer tools for building and debugging the MicroBlocks IDE

// Bernat Romagosa, 2025

const LiveReload = {
	watchedFiles: [
		'microblocks.html',

		'styles/config/_config.css',
		'styles/generic/minireset.css',
		'styles/generic/_body.css',
		'styles/generic/_button.css',
		'styles/components/_app-preloader.css',
		'styles/components/_buttons.css',
		'styles/components/_categories-libraries.css',
		'styles/components/_ide.css',
		'styles/components/_menus.css',
		'styles/components/_scripts-pane-controls.css',
		'styles/components/_tips.css',
		'styles/components/_top-bar.css',
		'styles/components/_window.css',
		'styles/components/_wysiwyg.css',
		'styles/utilities/_drag.css',

		'buttons.js',
		'ide.js',
		'menus.js',
		'buttons.js',
		'categories.js',
		'windows.js'
	],
	lastVersions: {},
	interval: null,
	watchInterval: 1000,
	reloadGP: false // try to reload the whole page except for the GP canvas
};

LiveReload.enable = function() {
	this.disable();
	console.log('LiveReload enabled');
	console.log('Currently watching', this.watchedFiles.join(', '));
	this.interval = setInterval(() => {
		this.watchedFiles.forEach(file => {
			fetch(file)
				.then(res => res.text())
				.then(text => {
					if (this.lastVersions[file] == text) { return; }
					if (this.lastVersions[file] == undefined) {
						this.lastVersions[file] = text;
						return;
					}
					console.log('live-reloading', file);
					this.lastVersions[file] = text;
					// apply cache buster to URLs so they get reloaded
					let newUrl = file + '?' + Math.floor(Math.random() * 100000);
					if (file.endsWith('.css')) {
						document.querySelector('link[href^="' + file + '"]').href = newUrl;
					} else if (['.svg', '.png', '.jpg'].some(ext=>file.endsWith(ext))) {
						document.querySelector('*[src^="' + file + '"]').src = newUrl;
					} else if (file.endsWith('.html')) {
						// redo the whole page
						this.reloadPage(text);
						return;
					} else if (file.endsWith('.js')) {
						// redo the whole page
						/*
						// this was beautiful...er, but it didn't work. Meh.
						fetch('microblocks.html')
							.then(res => res.text())
							.then(text => { this.reloadPage(text); });
						*/
						this.reloadGP = true;
						this.reloadPage();
						return;
					} else {
						console.log('file extension not recognized:', file);
					}
				});
		});
	}, this.watchInterval);
};

LiveReload.disable = function() {
	if (this.interval) { clearInterval(this.interval); }
};

LiveReload.reloadPage = function (contents) {
	if (this.reloadGP) {
		location.replace(location.pathname + '?refresh=' + new Date().getTime());
	} else {
		// Load the whole HTML, but take care of not reloading the GP div.
		// This can have some issues but it seems to work right now :)
		let newPage = document.createElement('html');
		newPage.innerHTML = contents;
		let canvas = document.querySelector('#canvas');
		newPage.querySelector('#canvas').remove();
		newPage.querySelector('.workspace .emscripten').appendChild(canvas);
		document.documentElement.innerHTML = newPage.innerHTML;
		IDE.fireEvent('ready');
		initGPEventHandlers();
	}
};

//LiveReload.enable();
document.body.oncontextmenu = null; // enable context menu when in dev mode
