// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2025 John Maloney, Bernat Romagosa, and Jens Mönig

// ide.js - A bunch of IDE utilities. Eventually, the whole IDE.

// Bernat Romagosa, 2025

// GP sets the IDE object properties via `setProperty MicroBlocksAPI path value`
// When a property is set, an event with that path is fired in the document.
// The document can listen for that event and act accordingly. The `details`
// object in the event contains the value of the property.

// There is a reason for IDE not to be a const. Try it and see the console
// WASM error to know why.
IDE = {
	currentMenu: null, // remember open menu so it can be closed on outside click
	currentCategory: 'cat;Control',
	libraryList: [],
	scripts: {
		undoAvailable: false,
		redoAvailable: false
	}
};

// Initialization
IDE.init = function () {
	this.element = document.querySelector('[data-ide="ide"]');
	this.project = this.emptyProject();
	this.topBarElement = document.querySelector('[data-ide="top-bar"]');
	this.tipBarElement = document.querySelector('[data-ide="bottom-bar"]');
	this.leftBarElement = document.querySelector('[data-ide="workspace-left"]');
	this.board = this.emptyBoard();
	this.applyUserPreferences();
	this.build();
	this.element.lastWidth = this.element.clientWidth;
	this.element.lastHeight = this.element.clientHeight;
	setInterval(
		()=>{
			let newWidth = this.element.clientWidth,
				newHeight = this.element.clientHeight;
			if (this.element.lastHeight !== newHeight) {
				this.element.lastHeight = newHeight;
				this.resize();
			}
			if (this.element.lastWidth !== newWidth) {
				this.element.lastWidth = newWidth;
				this.resize();
			}
		},
		100
	);
	GetText.setLocale(this.userPreference('locale'));
};

IDE.resize = function () {
	// TODO Rename vars to match CSS classes (new naming)
	if (!IDE.topBarElement) {
		IDE.topBarElement = document.querySelector('[data-ide="top-bar"]');
	}

	let winHeight = window.innerHeight,
		topBarHeight = IDE.topBarElement.clientHeight,
		tipBarHeight = IDE.tipBarElement.clientHeight,
		winWidth = window.innerWidth,
		leftBarWidth =
			IDE.element.classList.contains('--is-left-collapsed') ? 64 : 192,
		newHeight = winHeight - (topBarHeight + tipBarHeight),
		newWidth = winWidth - leftBarWidth,
		canvas = document.querySelector('#canvas');

	// Always use 'retina mode' in browser (i.e. double resolution)
	canvas.style.height = newHeight + 'px';
	canvas.style.width = newWidth + 'px';
	canvas.height = 2 * newHeight;
	canvas.width = 2 * newWidth;

	GP.apiCall('ide.resize', [ newWidth, newHeight ]);
};

IDE.emptyProject = function () {
	return { title: null, hasCustomBlocks: false };
};

IDE.emptyBoard = function () {
	return { hasFS: false, canDoBLE: false, connected: false, type: null };
};


// Event firing, for easy communication between modules
IDE.fireEvent = function (name, value) {
	document.dispatchEvent(new CustomEvent(name, { detail: { value: value } }));
};


// User preferences, settable via the gear menu

// The stored preferences, or an empty object: the key is absent until one is
// first changed. GP's readUserPreferences answers the same (MicroBlocksEditor.gp).
IDE.readUserPreferences = function () {
	let prefs = JSON.parse(localStorage['user-prefs'] || '{}');
	return (prefs && prefs.constructor === Object) ? prefs : {};
};

IDE.userPreference = function (pref) {
	let value = this.readUserPreferences()[pref];
	if (value == undefined) { value = false; }
	return value;
};

IDE.setUserPreference = function (pref, value) {
	let prefs = this.readUserPreferences();
	prefs[pref] = value;
	localStorage['user-prefs'] = JSON.stringify(prefs);
	this.applyUserPreferences();
};

IDE.toggleUserPreference = function (pref) {
	this.setUserPreference(pref, !this.userPreference(pref));
	this.applyUserPreferences();
};

IDE.applyUserPreferences = function () {
	GP.apiCall('ide.applyUserPreferences');
	let prefs = this.readUserPreferences();
	Object.keys(prefs).forEach(
		pref => this.fireEvent('preference.' + pref, prefs[pref])
	);
};

IDE.toggleAdvancedMode = function () {
	this.toggleUserPreference('devMode')
	// rebuild categories
	this.populateCategories(document.querySelector('[data-ide="categories-list"]'));
};


// Top Bar
IDE.populateTopBar = function (container) {
	// Add main menu buttons
	const mainMenuButtons = container.querySelector('[data-ide="main-menu"]');
	['language', 'settings', 'project'].forEach(selector => {
		mainMenuButtons.appendChild(Buttons.elementFor(selector));
	});

	// Add listener to title
	let title = container.querySelector('[data-ide="title"]');
	document.addEventListener(
		'project.title',
		(e) => {
			title.innerText = e.detail.value;
			title.classList.add('--has-title');
		}
	);

	// Progress indicator
	// To test, execute in console: IDE.fireEvent('ide.downloadProgress',[1, 0.33])
	// - First number is the phase number out of three (compile, send, sync)
	// - Second number is the percentage of the phase
	let progress =  container.querySelector('[data-ide="progress"]');

	document.addEventListener(
		'ide.downloadProgress',
		(e) => {
			let colors = [
				['lightgreen', 'var(--color-blue-grey-850)'],
				['green', 'var(--color-blue-grey-850)'],
				['darkgreen', 'var(--color-blue-grey-850)']
			];
			if (typeof e.detail.value != 'object') { return; }
			let phase = e.detail.value[0];
			let percentage = e.detail.value[1] * 100;
			if (percentage < 100) {
				progress.style.background =
					'conic-gradient(' +
						colors[phase - 1][0] + ' ' + percentage + '%, ' +
						colors[phase - 1][1] + ' 0)';
			} else {
				progress.style.background = null;
			}
		}
	);

	// Add controls buttons
	this.controlsButtons = container.querySelector('[data-ide="controls"]');
	['graph', '|', 'connect', '|', 'run', 'stop' ].forEach(selector => {
		this.controlsButtons.appendChild(Buttons.elementFor(selector));
	});
};


// Tip Bar
IDE.tipBar = { icons: {} };
IDE.tipBar.init = function () {
	this.icons['[l]'] = 'mouse-left-button';
	this.icons['[r]'] = 'mouse-right-button';
	this.icons['(-o)'] = 'bool_true';
	this.icons['(o-)'] = 'bool_false';

	this.tipsContainer = document.querySelector('[data-ide="tips-container"]');

	document.addEventListener(
		'ide.tip',
		e => {
			if (typeof e.detail.value != 'object') { return; }
			IDE.tipBar.setTip(e.detail.value[0], e.detail.value[1]);
		}
	);

	document.querySelectorAll('*').forEach(element => this.enableFor(element));
};

IDE.tipBar.enableFor = function (element) {
	// preserve previous onmouseenter behavior
	let onmouseenter = element.onmouseenter;
	element.onmouseenter = () => {
		if (onmouseenter) { onmouseenter.call(element); }
		if (element.ariaLabel && element.ariaDescription) {
			this.setTip(element.ariaLabel, element.ariaDescription);
		}
	}
};

IDE.tipBar.setTip = function (title, content) {
	let tipTitle = GetText.localize(title);
	let tipHTML = GetText.localize(content);
	if (content !== null) {
		Object.keys(this.icons).forEach(key => {
			tipHTML =
				tipHTML.replaceAll(
					key,
					'<span class="tips__icon"><img src="img/' + this.icons[key] + '.svg"></span>'
				);
		});
	}

	this.tipsContainer.innerHTML = title
		? `<span class="tips__title">${tipTitle}</span><span class="tips__content">${tipHTML}</span>`
		: '';
};

// Spinner and overlay
//
// Testing with:
// IDE.spinner.show('Testing', 'Doing some stuff...', 'Please hold on', 30)
// IDE.spinner.setPercent(50)
IDE.spinner = {
	init: function () {
		this.overlay = IDE.element.querySelector('[data-ide="overlay"]');
		this.spinner = this.overlay.querySelector('[data-ide="overlay-spinner"]');
		this.titleSpan = this.overlay.querySelector('[data-ide="overlay-title"]');
		this.subtitleSpan = this.overlay.querySelector('[data-ide="overlay-subtitle"]');
		this.noteSpan = this.overlay.querySelector('[data-ide="overlay-note"]');

		this.overlay.onkeypress = function (e) {
			console.log('keypress from ide.js');
			if (e.key == 'Escape') {
				IDE.spinner.cancel();
			}
		}
	},

	show: function (title, subtitle, note, percent, onCancel, onDone) {
		this.onCancel = onCancel;
		this.onDone = onDone;
		this.update(title, subtitle, note ?? '(press ESC to cancel)', percent);
		this.overlay.classList.add('--is-active');
		this.overlay.focus();
	},

	update: function (title, subtitle, note, percent) {
		this.setTitle(title);
		this.setSubtitle(subtitle);
		this.setNote(note);
		this.setPercent(percent);
	},

	setTitle: function (title) {
		if (title) { this.titleSpan.innerText = GetText.localize(title); }
	},

	setSubtitle: function (subtitle) {
		if (subtitle) { this.subtitleSpan.innerText = GetText.localize(subtitle); }
	},

	setNote: function (note) {
		if (note) { this.noteSpan.innerText = GetText.localize(note); }
	},

	setPercent: function (percent) {
		this.spinner.style.setProperty(
			'--percent',
			(percent ?? 75)/100 * 360 + 'deg'
		);
		if ((percent >= 100) && this.onDone) {
			this.onDone.call();
			this.hide();
		}
	},

	hide: function () {
		this.overlay.classList.remove('--is-active');
		this.onCancel = null;
		this.onDone = null;
	},

	cancel: function () {
		if (this.onCancel) { this.onCancel(); }
		GP.apiCall('ide.spinnerCancelled');
		this.hide();
	}
};

document.addEventListener('spinner.show', e => {
	let options = e.detail.value;
	IDE.spinner.show(
		options.title,
		options.subtitle,
		options.note,
		options.percent
		//TODO ondone, oncancel
	);
});

document.addEventListener('spinner.setTitle', e => {
	IDE.spinner.setTitle(e.detail.value);
});

document.addEventListener('spinner.setNote', e => {
	IDE.spinner.setNote(e.detail.note);
});

document.addEventListener('spinner.setPercent', e => {
	IDE.spinner.setPercent(e.detail.value);
});

document.addEventListener('ide.keyPressed', e => {
	if (e.detail.value == 'ESC') { IDE.spinner.cancel(); }
});

document.addEventListener('spinner.hide', e => { IDE.spinner.hide(); });

// Zoom buttons and undo/redo
IDE.populateScriptControls = function (element) {
	['undo', 'redo', '|', 'zoomOut', 'restoreZoom', 'zoomIn'].forEach(selector => {
		element.appendChild(Buttons.elementFor(selector));
	});
};

IDE.recreateScriptControls = function () {
	let element = document.querySelector('[data-ide="scripts-pane-controls"]');
	element.innerHTML = '';
	this.populateScriptControls(element);
};

document.addEventListener('scripts.undoAvailable', e => {
	let button = document.querySelector('[data-ide="scripts-pane-controls"] button.--undo');
	if (e.detail.value) {
		button.classList.remove('--is-disabled');
	} else {
		button.classList.add('--is-disabled');
	}
});

document.addEventListener('scripts.redoAvailable', e => {
	let button = document.querySelector('[data-ide="scripts-pane-controls"] button.--redo');
	if (e.detail.value) {
		button.classList.remove('--is-disabled');
	} else {
		button.classList.add('--is-disabled');
	}
});


// Dark Mode
document.addEventListener('preference.darkMode', e => {
	if (e.detail.value) {
		IDE.element.classList.add('--dark-mode');
	} else {
		IDE.element.classList.remove('--dark-mode');
	}
});


// Dragging
document.addEventListener('dragstart', () => {
	document.querySelector('body').classList.add('--is-dragging');
});

document.addEventListener('dragend', () => {
	document.querySelector('body').classList.remove('--is-dragging');
});


// Category and library lists
IDE.populateCategories = function (element) {
	element.replaceWith(Categories.buildStandard());
};

IDE.populateLibraries = function (element) {
	element.replaceWith(Categories.buildLibraries(this.libraryList));
};


// Collapse left bar
IDE.collapseLeftBar = {
	init: function () {
		const collapseButton =
			document.querySelector('[data-ide="collapse-left-btn"]');
		let resizeInterval;

		collapseButton.addEventListener('click', () => {
			IDE.element.classList.toggle('--is-left-collapsed');
			IDE.element.classList.add('--is-transitioning');
		});

		IDE.leftBarElement.addEventListener('transitionstart', () => {
			if (event.propertyName == 'max-width') {
				clearInterval(resizeInterval);
				resizeInterval = setInterval(() => { IDE.resize(); }, 100);
			}
		});

		IDE.leftBarElement.addEventListener('transitionend', () => {
			if (event.propertyName == 'max-width') {
				IDE.element.classList.remove('--is-transitioning');

				clearInterval(resizeInterval);
				resizeInterval = null;

				IDE.resize();
			}
		});
	}
};


// Build the IDE
IDE.build = function () {
	this.populateTopBar(document.querySelector('[data-ide="top-bar"]'));
	this.populateCategories(document.querySelector('[data-ide="categories-list"]'));
	this.populateScriptControls(document.querySelector('[data-ide="scripts-pane-controls"]'));
	this.tipBar.init();
	this.spinner.init();
	this.collapseLeftBar.init();
	const appPreloader = document.querySelector('[data-ide="app-preloader"]');

	// check connection every 500ms
	setInterval(() => { GP.apiCall('ide.updateConnection'); }, 500);
	this.resize();
	setTimeout(() =>
		{
			appPreloader.classList.add('--is-loaded');
			appPreloader.addEventListener('transitionend', () => {
				appPreloader.style.visibility = 'hidden';
			})
		},
		500 // it takes a bit for all elements to position and show themselves
	);
};
