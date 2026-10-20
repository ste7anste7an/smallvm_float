// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozillbutton.org/MPL/2.0/.
//
// Copyright 2025 John Maloney, Bernat Romagosa, and Jens Mönig
//
// mb-jsAPI.js - Support for Javascript calls to GP functions
//
// John Maloney, Bernat Romagosa, and Sam McHardy 2026

// This API mechanism is used to make calls from the DOM part of the UI into the "engine".
// It behaves the same as the API mechanism used to interfact the DOM-based UI to GP.
// However, instead of queueing a call to be handled by GP, it dispatches the call directly
// with the given parameters, then invokes the callback function with the result, if any.

GP = { apiResponses: {} } // windows.js stores a dialog's answer in apiResponses
GP.apiCall = function (endPoint, params, callback) {
	// example, get a random number from 10 to 20:
	// GP.apiCall('random', [10, 20], function (value) { console.log(value) });

	this.lastCallId = (this.lastCallId + 1) % 100000;

	if (typeof params == 'undefined') { params = ""; }
	if (typeof callback == 'undefined') { callback = ()=>{}; }

	switch (endPoint) {
		// Entry points the Javascript runtime serves. Each replies as the GP API
		// dispatcher does: 0 for an action, the value for a query.
		case 'board.compactStorage':
			// GP sends systemResetMsg with chunk id 2 and no body (MicroBlocksAPI.gp).
			MB_connection.sendMsg('systemResetMsg', 2, null);
			callback(0);
			break;
		case 'board.connect':
			// menus.js sends 'USB', 'BLE' or 'Boardie'; MB_CommPort.connect takes
			// 'serial', 'BLE' or 'boardie' (mb-comm-port.js). GP's webSerialConnect
			// matches BLE by prefix and treats the rest as serial (MicroBlocksRuntime.gp).
			if ('Boardie' == params[0]) {
				GP_openBoardie(); // mb-boardie.js
			} else {
				MB_connection.connect(String(params[0]).startsWith('BLE') ? 'BLE' : 'serial');
			}
			callback(0);
			break;
		case 'board.disconnect':
			// As GP's closePort (MicroBlocksRuntime.gp).
			if (GP.boardie.isOpen) {
				GP_closeBoardie(); // also disconnects
			} else if (MB_connection.isConnected()) {
				// A disconnect the user asked for leaves the board running the
				// IDE's program, as it will after its next power-up.
				MB_editor.stopSyncAndStartAll().finally(() => MB_connection.disconnect());
			} else {
				MB_connection.disconnect();
			}
			callback(0);
			break;
		case 'board.vmVersion':
			// The version number the board reported, or null before it has.
			callback(MB_connection.vmVersion);
			break;
		case 'ide.startAll':
			MB_editor.startAll();
			callback(0);
			break;
		case 'ide.stopAll':
			// params[0] is shift, from the button's own click event. Anything
			// that is not true, a missing argument included, is not shift.
			MB_editor.stopAll(true === params[0]);
			callback(0);
			break;
		case 'ide.updateConnection':
			// justConnected, versionReceived and disconnect() push these too, as GP does
			// (MicroBlocksRuntime.gp). This poll stays the writer of record for a board
			// that goes quiet or never sends a version, and for the 'Connect' fallback.
			storeIDEProperty('board.connected',
				'connected' == MB_connection.updateConnection());
			storeIDEProperty('board.type',
				(MB_connection.boardType != null) ? MB_connection.boardType : 'Connect');
			// board.canDoBLE and board.hasFS are pushed on first contact and on disconnect.
			callback(0);
			break;
		case 'project.save':
			// As saveProjectToFile (MicroBlocksEditor.gp): no prompt, the file is a download.
			MB_editor.saveProject();
			callback(0);
			break;
		case 'scripts.cleanUp':
			MB_editor.scriptsPane().cleanUp();
			callback(0);
			break;

		case 'board.installVM':
			// params: eraseFlash, downloadFromServer (unused)
			callback(0);
			// Deferred so the menu item that called this has closed before installVM may open a menu.
			Promise.resolve().then(() => MB_Firmware.installVM(params[0]));
			break;
		case 'board.installVMfromURL':
			// Installs ESP firmware only, as does installVMfromRepo.
			callback(0);
			Promise.resolve().then(() => MB_Firmware.installESPFirmwareFromURL())
				.catch((e) => MB_editor.reportError(e));
			break;
		case 'board.installVMfromRepo':
			// Deferred, as installVM is, so the menu item has closed before this opens a menu.
			callback(0);
			Promise.resolve().then(() => MB_Firmware.installESPFirmwareFromRepo())
				.catch((e) => MB_editor.reportError(e));
			break;
		case 'board.downloadFile':
			// Answer, then act: the download waits on a menu and the board.
			callback(0);
			MB_editor.downloadFileFromBoard();
			break;
		case 'board.retrieveProject':
			// GP answers before acting (MicroBlocksAPI.gp:112). openFromBoard
			// clears the project and waits for the NEXT board to connect; it does
			// not read a board that is already connected.
			callback(0);
			MB_editor.openFromBoard();
			break;
		case 'edit.undo':
			MB_editor.undo();
			callback(0);
			break;
		case 'edit.redo':
			MB_editor.redo();
			callback(0);
			break;
		case 'board.toggleBLE':
			callback(0);
			MB_editor.toggleBLE();
			break;
		case 'board.uploadFile':
			callback(0);
			MB_editor.uploadFileToBoard();
			break;
		case 'board.snapshotCode':
			callback(0);
			MB_editor.snapshotCode();
			break;
		case 'ide.openVMFolder':
			callback(0);
			MB_editor.openVMFolder();
			break;
		case 'ide.applyUserPreferences':
			// Answer, then repaint: the chrome sends this on every tick of a
			// settings menu item and does not wait for the canvas to catch up.
			callback(0);
			MB_editor.applyUserPreferences();
			break;
		case 'ide.resize':
			// IDE.resize has just sized #canvas, the workspace slot; place the world canvas over it
			if (typeof world === 'object') {
				const slot = document.getElementById('canvas').getBoundingClientRect();
				const cnv = world.worldCanvas;
				cnv.style.position = 'unset';
				cnv.width = slot.width;
				cnv.height = slot.height;
				world.setExtent(new Point(slot.width, slot.height).divideBy(ZOOM)); // the world is drawn ZOOM times its size
				if (typeof mbEditor === 'object') { mbEditor.fixLayout(); }
			}
			callback(0);
			break;
		case 'ide.selectCategory':
			// categories.js sends the label with its 'cat;' prefix, the form
			// selectCategory takes.
			MB_editor.selectCategory(params[0]);
			callback(0);
			break;
		case 'ide.selectLibrary':
			MB_editor.selectLibrary(params[0]);
			callback(0);
			break;
		case 'ide.setSerialDelay':
			// GP answers before acting (MicroBlocksAPI.gp:33). graph.js:338 sends
			// the delay the user picked from the serial delay menu.
			callback(0);
			MB_connection.setSerialDelay(params[0]);
			break;
		case 'ide.showLibraryDialog':
			// Reply first, then show the picker. The "+ Add Library" button
			// sends this and waits on the reply, not on the dialog.
			callback(0);
			MB_editor.importLibrary();
			break;
		case 'ide.spinnerCancelled':
			// Reply first, then act. The chrome sends this for every Escape key
			// whether a spinner is up or not. What a spinner here stands over that can
			// be stopped is a file transfer or a firmware download: a project read
			// shows one and runs to its end either way.
			callback(0);
			if (MB_editor.spinnerShowing && MB_connection.busy()) MB_connection.abortFileTransfer();
			if (MB_Firmware.downloadAborter) MB_Firmware.downloadAborter.abort();
			MB_editor.spinnerShowing = false; // cancelled or not, the overlay is gone
			break;
		case 'ide.version':
			// A value endpoint: windows.js:272 renders it as `MicroBlocks v${...}`.
			// GP answers a field it read at startup; here the read is a fetch, so
			// the answer waits for it.
			MB_connection.readVersionFile().then(callback);
			break;
		case 'library.delete':
			// Reply first, then act.
			callback(0);
			MB_editor.removeLibraryNamed(params[0]);
			break;
		case 'library.export':
			// Reply first, then act.
			callback(0);
			MB_editor.exportLibrary(params[0]);
			break;
		case 'library.reload':
			// Reply first, then act. The reload reads a file, so it finishes after
			// the reply.
			callback(0);
			MB_editor.reloadLibrary(params[0]);
			break;
		case 'library.showDefs':
			// Answer, then act, as the other library endpoints do.
			callback(0);
			MB_editor.showFunctions(MB_editor.functionsOfLibrary(params[0]));
			break;
		case 'library.hideDefs':
			callback(0);
			MB_editor.hideFunctions(MB_editor.functionsOfLibrary(params[0]));
			break;
		case 'project.showAllMyBlocks':
			callback(0);
			MB_editor.showFunctions(MB_editor.project.main.functions);
			break;
		case 'project.hideAllMyBlocks':
			callback(0);
			MB_editor.hideFunctions(MB_editor.project.main.functions);
			break;
		case 'project.exportBlocksLibrary':
			callback(0);
			MB_editor.exportMyBlocksAsLibrary();
			break;
		case 'library.showInfoDialog':
			callback(0);
			MB_editor.showLibraryInfo(params[0]);
			break;
		case 'locale.loadCustomFile':
			callback(0);
			MB_editor.readCustomTranslationFile();
			break;
		case 'locale.setLanguage':
			callback(0);
			// The chrome sends false at startup when no language has been saved.
			if (typeof params[0] === 'string') MB_editor.saveToUserPreferences('locale', params[0]);
			MB_editor.updateAfterLanguageChange();
			break;
		case 'project.new':
			// GP answers before acting (MicroBlocksAPI.gp:70), because newProject
			// asks 'Discard current project?' first when there is work to lose.
			callback(0);
			MB_editor.newProject();
			break;
		case 'project.open':
			// The same order: answer, then show the file picker.
			callback(0);
			MB_editor.openProjectMenu();
			break;
		case 'scripts.copyToClipboard':
			// Answer, then act, as the endpoints below do.
			callback(0);
			setClipboard(MB_editor.allScriptsString());
			break;
		case 'scripts.copyToClipboardAsURL':
			callback(0);
			setClipboard(MB_editor.scriptsURL(location.href));
			break;
		case 'project.copyURL':
			callback(0);
			setClipboard(MB_editor.projectURL(location.href));
			break;
		case 'scripts.paste':
			callback(0);
			MB_editor.pasteScriptText(clipboardText(), true);
			break;
		case 'scripts.saveImage':
			callback(0);
			MB_editor.saveScriptsImage();
			break;
		case 'scripts.setExportedScriptScale':
			callback(0);
			MB_editor.exportedScriptScale = Number(params[0]) / 100;
			break;
		case 'scripts.restoreZoom':
			MB_editor.restoreZoom();
			callback(0);
			break;
		case 'scripts.setZoom':
			callback(0);
			MB_editor.setBlockScalePercent(params[0]);
			break;
		case 'scripts.zoomIn':
			MB_editor.zoomIn();
			callback(0);
			break;
		case 'scripts.zoomOut':
			MB_editor.zoomOut();
			callback(0);
			break;
		default:
			console.log('unknown API endpoint', endPoint);
			callback('Unknown API endpoint');
	}
};

// menus.js shows its paste items from GP.clipboardBytes and clipboardText().
// mb-editor.js fills that buffer and defines clipboardText().
GP.clipboardBytes = [];

function setClipboard(text) { setGPClipboard(text); }

// The id the chrome answers a menu or a dialog under, counted as primBrowserNextCallId
// counts it (chromeApp/emscripten/browserPrims.c).
function nextCallId() {
	GP.lastCallId = ((GP.lastCallId || 0) + 1) % 100000;
	return GP.lastCallId;
}

// Mirrors primBrowserStoreIDEProperty (chromeApp/emscripten/browserPrims.c):
// assign, then fire an event of the same name. menus.js reads the object and
// buttons.js listens for the event, so both halves are needed.
function storeIDEProperty(path, value) {
	const parts = path.split('.');
	let obj = IDE;
	while (parts.length > 1) {
		const part = parts.shift();
		if (!obj.hasOwnProperty(part)) { obj[part] = {}; }
		obj = obj[part];
	}
	// ide.js polls twice a second, so compare: without this the page fires 120
	// events a minute that carry no change.
	if (obj[parts[0]] === value) { return; }
	obj[parts[0]] = value;
	IDE.fireEvent(path, value);
}
