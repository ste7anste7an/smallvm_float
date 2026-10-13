// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozillbutton.org/MPL/2.0/.

// Copyright 2025 John Maloney, Bernat Romagosa, and Jens Mönig

// menus.js - Create all sorts of menus.

// Bernat Romagosa, 2025

const Menus = {};

// TOP BAR MENUS

Menus.language = { selector: 'language', type: 'top', items: [] };

Menus.language.init = function () {
	// fill language menu out of available locales
	fetch('translations/locales.json')
		.then(response => response.json())
		.then(descriptors => {
			descriptors.forEach(descriptor => {
				this.items.push({
					label: descriptor[0],
					action: () => { GetText.setLocale(descriptor[1]); },
					checked: () => { return GetText.currentLocale == descriptor[1] }
				});
			})
		})
		.then(() => {
			this.items.push({ label: '-' });
			this.items.push({
				label: 'Missing language?',
				action: () => {
					window.open('https://wiki.microblocks.fun/en/translating', '_blank');
				}
			});
			this.items.push({ label: '-' });
			this.items.push({
				label: 'Custom...',
				action: () => { GP.apiCall('locale.loadCustomFile'); }
			});
		});
};
Menus.language.init();

Menus.settings = {
	selector: 'settings',
	type: 'top',
	items: [
		{
			label: 'about...',
			action: () => { FloatingWindow.about(); }
		},
		{ label: '-' },
		{
			label: 'update firmware on board',
			action: () => { GP.apiCall('board.installVM', [false, false]); }
		},
		{ label: '-' },
		{
			label: 'inform of new versions',
			checked: () => { return IDE.userPreference('versionCheckOnStartup'); },
			action: () => { IDE.toggleUserPreference('versionCheckOnStartup'); },
			tip: 'when opening the IDE, show a notification if a new version of ' +
						'MicroBlocks has been released'
		},
		{
			label: 'dark mode',
			checked: () => { return IDE.userPreference('darkMode'); },
			action: () => { IDE.toggleUserPreference('darkMode'); }
		},
		{
			label: 'advanced mode',
			checked: () => { return IDE.userPreference('devMode'); },
			action: () => { IDE.toggleAdvancedMode(); },
			tip: 'show advanced blocks, menu items and editor functionalities'
		},
		{ label: '-', hidden: () => { return !IDE.userPreference('devMode'); } },
		{
			label: 'show implementation blocks',
			checked: () => { return IDE.userPreference('showImplementationBlocks'); },
			action: () => { IDE.toggleUserPreference('showImplementationBlocks'); },
			hidden: () => { return !IDE.userPreference('devMode'); },
			tip: 'show blocks and variables that are internal to libraries (i.e. ' +
						'those whose name begins with underscore)'
		},
		{
			label: 'autoload board libraries',
			checked: () => { return !IDE.userPreference('boardLibAutoLoadDisabled'); },
			action: () => { IDE.toggleUserPreference('boardLibAutoLoadDisabled'); },
			hidden: () => { return !IDE.userPreference('devMode'); }
		},
		{ label: '-', hidden: () => { return !IDE.userPreference('devMode'); } },
		{
			label: 'install ESP firmware from URL',
			action: () => { GP.apiCall('board.installVMfromURL'); },
			hidden: () => { return !IDE.userPreference('devMode'); },
		},
		{
			label: 'install ESP firmware from microblocks.fun',
			action: () => { GP.apiCall('board.installVMfromRepo'); },
			hidden: () => { return !IDE.userPreference('devMode'); },
		},
		{
			label: 'erase flash and update firmware on ESP board',
			action: () => { GP.apiCall('board.installVM', [true, false]); },
			hidden: () => { return !IDE.userPreference('devMode'); },
		},
		{ label: '-', hidden: () => { return !IDE.userPreference('devMode'); } },
		{
			label: 'compact code store',
			action: () => { GP.apiCall('board.compactStorage'); },
			hidden: () => { return !IDE.userPreference('devMode'); },
			disabled: () => { return !IDE.board.connected; }
		},
		{
			label: '-',
			hidden: () => {
				return !IDE.userPreference('devMode') || !IDE.board.canDoBLE;
			}
		},
		{
			label: 'enable or disable BLE',
			action: () => { GP.apiCall('board.toggleBLE'); },
			hidden: () => {
				return !IDE.userPreference('devMode') || !IDE.board.canDoBLE;
			}
		}
	]
};

Menus.project = {
	selector: 'project',
	type: 'top',
	items: [
		{
			label: 'Save',
			action: () => { GP.apiCall('project.save'); }
		},
		{ label: '-' },
		{
			label: 'New',
			action: () => { GP.apiCall('project.new'); }
		},
		{
			label: 'Open',
			action: () => { GP.apiCall('project.open'); }
		},
		{
			label: 'Open from board',
			action: () => { GP.apiCall('board.retrieveProject'); }
		},
		{ label: '-' },
		{
			label: 'Copy project URL to clipboard',
			action: () => { GP.apiCall('project.copyURL'); }
		},
		{ label: '-', hidden: () => { return !IDE.userPreference('devMode'); } },
		{
			label: 'export functions as library',
			action: () => { GP.apiCall('project.exportBlocksLibrary'); },
			hidden: () => {
				return !IDE.userPreference('devMode') && !IDE.project.hasCustomBlocks;
			},
			disabled: () => { return !IDE.project.hasCustomBlocks; }
		},
		{
			label: 'put file on board',
			action: () => { GP.apiCall('board.uploadFile'); },
			hidden: () => { return !IDE.userPreference('devMode'); },
			disabled: () => { return !IDE.board.hasFS }
		},
		{
			label: 'get file from board',
			action: () => { GP.apiCall('board.downloadFile'); },
			hidden: () => { return !IDE.userPreference('devMode'); },
			disabled: () => { return !IDE.board.hasFS }
		}
	]
};

Menus.connection = {
	selector: 'connection',
	type: 'top',
	items: [
		{
			label: 'connect (USB)',
			action: () => { GP.apiCall('board.connect', ['USB']); },
			hidden: () => { return IDE.board.connected }
		},
		{
			label: 'connect (BLE)',
			action: () => { GP.apiCall('board.connect', ['BLE']); },
			hidden: () => { return IDE.board.connected }
		},
		{
			label: '-',
			hidden: () => { return IDE.board.connected }
		},
		{
			label: 'open Boardie',
			action: () => { GP.apiCall('board.connect', ['Boardie']); },
			hidden: () => { return IDE.board.connected }
		},
		{
			label: 'disconnect',
			action: () => { GP.apiCall('board.disconnect'); },
			hidden: () => { return !IDE.board.connected }
		}
	]
};

// CONTEXT MENUS

Menus.library = {
	selector: 'library',
	type: 'context',
	items: [
		{
			label: 'library information',
			action: (libName) => { GP.apiCall('library.showInfoDialog', [libName]); },
		},
		{
			label: 'reload library',
			action: (libName) => { GP.apiCall('library.reload', [libName]); },
		},
		{
			label: 'show all block definitions',
			action: (libName) => { GP.apiCall('library.showDefs', [libName]); },
		},
		{
			label: 'hide all block definitions',
			action: (libName) => { GP.apiCall('library.hideDefs', [libName]); },
		},
		{
			label: 'export this library',
			action: (libName) => { GP.apiCall('library.export', [libName]); },
		},
		{ label: '-' },
		{
			label: 'delete library',
			action: (libName) => { GP.apiCall('library.delete', [libName]); },
		},
	]
};

Menus.myBlocks = {
	selector: 'myBlocks',
	type: 'context',
	items: [
		{
			label: 'show all block definitions',
			action: () => { GP.apiCall('project.showAllMyBlocks'); },
		},
		{
			label: 'hide all block definitions',
			action: () => { GP.apiCall('project.hideAllMyBlocks'); },
		}
	]
};

Menus.scriptingArea = {
	selector: 'scriptingArea',
	type: 'context',
	items: [
		{
			label: 'set block size...',
			action: (target, event) => {
				Menus.popUp('blockZoomLevels', null, target, event);
			},
			keepOpenAfterClick: true
		},
		{ label: '-' },
		{
			label: 'clean up',
			action: () => { GP.apiCall('scripts.cleanUp'); }
		},
		{ label: '-' },
		{
			label: 'copy all scripts to clipboard',
			action: () => { GP.apiCall('scripts.copyToClipboard'); }
		},
		{
			label: 'copy all scripts to clipboard as URL',
			action: () => { GP.apiCall('scripts.copyToClipboardAsURL'); }
		},
		{ label: '-' },
		{
			label: 'paste all scripts from clipboard',
			action: () => { GP.apiCall('scripts.paste'); },
			hidden: () => {
				readGPClipboard();
				return GP.clipboardBytes.length == 0 ||
					!clipboardText().startsWith('GP Scripts');
			}
		},
		{
			label: 'paste script from clipboard',
			action: () => { GP.apiCall('scripts.paste'); },
			hidden: () => {
				readGPClipboard();
				return GP.clipboardBytes.length == 0 ||
					!clipboardText().startsWith('GP Script\n');
			}
		},
		{
			label: '-',
			hidden: () => { return GP.clipboardBytes.length == 0; }
		},
		{
			label: 'save a picture of all visible scripts',
			action: () => { GP.apiCall('scripts.saveImage'); }
		},
		{
			label: 'set exported script scale',
			action: (target, event) => {
				Menus.popUp('exportedScriptScale', null, target, event);
			},
			keepOpenAfterClick: true,
			hidden: () => { return !IDE.userPreference('devMode'); }
		}
	]
};

Menus.blockZoomLevels = {
	selector: 'blockZoomLevels',
	type: 'context',
	class: '--single-option',
	items: [50,75,100,125,150,200,250].map(level => {
		return {
			label: level + '%',
			action: (target) => { GP.apiCall('scripts.setZoom', [level]); },
			checked: () => { return IDE.userPreference('blockSizePercent') == level }
		}
	})
};

Menus.exportedScriptScale = {
	selector: 'exportedScriptScale',
	type: 'context',
	items: [50,65,100,200].map((level, index) => {
		return {
			label: `${['small', 'normal', 'large', 'printable'][index]} (${level}%)`,
			action: (target) => {
				GP.apiCall('scripts.setExportedScriptScale', [level]);
			}
		}
	})
};


// MENU HTML GENERATION

Menus.elementFor = function (descriptor, target) {
	// return an HTML tree containing the menu for a menu selector or menu
	// descriptor, and dynamically generate the menu each time, since it can
	// change depending on the state of the board, preferences, etc
	let menu = document.createElement('ul');
	menu.classList.add('menu');

	// optional extra CSS class
	if (descriptor.class) { menu.classList.add(descriptor.class); }

	descriptor.items.forEach((item, index) => {

		if (!(item.hidden?.())) {
			let li = document.createElement('li');

			if (item.label == '-') {
				// vertical separator, unless this is the last item
				// or the previous one was also a separator
				if (descriptor.items[index - 1].label != '-') {
					li.classList.add('menu__separator');
					li.setAttribute('role', 'presentation');
				}

			} else {
				let button = document.createElement('button');
				let text, textLocalization;

				menu.id = `menu-${descriptor.selector}`;
				li.classList.add('menu__list-item');
				button.classList.add('menu__button');

				// Set the menu item action
				button.onclick = (event) => {
					event.ignoreGlobalListener = true;
					item.action(target, event);
					if (!item.keepOpenAfterClick) { this.close(); }
				};

				// Set the item text or image contents
				if (item.image) {
					text = document.createElement('img');
					text.src = item.image;

					if (text.complete) {
						Menus.keepInsideBounds()
					} else {
						text.addEventListener('load', () => { Menus.keepInsideBounds(); });
					}

				} else {
					// Create a span element with a <l-> inside
					text = document.createElement('span');
					text.classList.add('menu__button-text');
					textLocalization = document.createElement('l-');
					text.appendChild(textLocalization);

					if (typeof item.label == 'string') {
						textLocalization.innerText = item.label;
					} else if (typeof item.label == 'function') {
						textLocalization.innerText = item.label();
					}
				}

				// Optional CSS class
				if (item.class) { button.classList.add(item.class); }

				// Tip Bar data
				if (item.tip) {
					button.ariaLabel = 'Menu option';
					button.ariaDescription = item.tip;
					IDE.tipBar.enableFor(button);
				}

				// State: disabled
				if (item.disabled?.()) {
					button.classList.add('--is-disabled');
				}

				// States: checked and unchecked
				if (item.checked !== undefined) {
					let checked;
					if (typeof item.checked == 'boolean') {
						checked = item.checked;
					} else {
						// checked is a callback, let's run it
						checked = item.checked();
					}

					// Can be checked, so it needs a tick icon
					let tick = document.createElement('span');
					tick.innerHTML = Icon.cache.tick;
					tick.classList.add('menu__button-tick');
					button.appendChild(tick);
					button.classList.add(checked ? '--is-checked' : '--is-unchecked');
				}

				button.appendChild(text);
				li.appendChild(button);
			}

			menu.appendChild(li);
		}
	});

	return menu;
};

Menus.popUp = function (selector, triggerElement, target, event) {
	this.popUpFromDescriptor(this[selector], triggerElement, target, event);
};

Menus.popUpFromDescriptor = function (
	descriptor, triggerElement, target, event
) {
	this.close();
	let container = document.querySelector('[data-ide="menu-container"]'),
		nav = this.elementFor(descriptor, target),
		type = descriptor.type,
		pos = type == 'context'
			? { x: event.clientX, y: event.clientY }
			: triggerElement.getClientRects()[0];

	nav.trigger = triggerElement;
	container.appendChild(nav);

	if (!window.maxZIndex) { window.maxZIndex = 999; };
	container.style.zIndex = maxZIndex + 1;

	if (type == 'context') {
		container.classList.add('--context-menu');
		container.classList.remove('--top-menu');
	} else {
		container.classList.remove('--context-menu');
		container.classList.add('--top-menu');
	}

	container.style.left = `${pos.x}px`;
	container.style.top = `${pos.y + (triggerElement ? triggerElement.clientHeight : 0)}px`;

	this.keepInsideBounds();
};

Menus.keepInsideBounds = function () {
	let container = document.querySelector('[data-ide="menu-container"]'),
		bounds = container.getBoundingClientRect();
	if (bounds.bottom > IDE.element.clientHeight) {
		container.style.top = `${IDE.element.clientHeight - bounds.height - 8}px`;
	}
	if (bounds.right > IDE.element.clientWidth) {
		container.style.left = `${IDE.element.clientWidth - bounds.width - 8}px`;
	}
};

Menus.current = function () {
	return document.querySelector('[data-ide="menu-container"] .menu');
};

Menus.close = function () {
	this.current()?.remove();
};

// MENU EVENTS

document.addEventListener('click', (event) => {
	// close any open menu when clicking outside its influence area
	let currentMenu = Menus.current();
	if (currentMenu) {
		if (
			!currentMenu.contains(event.target) &&
			!currentMenu.trigger?.contains(event.target) &&
			!event.ignoreGlobalListener
		) {
			currentMenu.remove();
		}
	}
});

document.addEventListener('context', (e) => {
	let descriptor = e.detail.value;
	if (descriptor.x) { // this comes from GP
		// we have to offset it by the GP canvas position
		let canvas = document.querySelector('#canvas.emscripten');
		e.clientX = descriptor.x + canvas.offsetLeft;
		e.clientY = descriptor.y + canvas.offsetTop;
	}
	Menus.popUp(descriptor.selector, null, null, e);
	e.preventDefault();
});

document.addEventListener('menu', (e) => {
	let descriptor = e.detail.value;
	if (descriptor.x) { // this comes from GP
		// we have to offset it by the GP canvas position
		let canvas = document.querySelector('#canvas.emscripten');
		e.clientX = descriptor.x + canvas.offsetLeft;
		e.clientY = descriptor.y + canvas.offsetTop;
	}
	descriptor.items.forEach(item => {
		item.action = () => {
			GP.apiResponses[descriptor.id] = JSON.stringify(item.label);
		};
		item.type = item.image ? 'image' : 'label';
	})
	Menus.popUpFromDescriptor(
		{ type: 'context', items: descriptor.items, class: descriptor.class },
		null,
		null,
		e
	);
	e.preventDefault();
});
