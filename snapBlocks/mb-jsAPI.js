// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozillbutton.org/MPL/2.0/.
//
// Copyright 2025 John Maloney, Bernat Romagosa, and Jens Mönig
//
// mb-gpAPI.js - Support for Javascript calls to GP functions
//
// John Maloney and Bernat Romagosa, 2026

// This is an alternative to the API mechanism that calls GP for use in the all-Javascript
// version -- at least during the transition period. Instead of queueing a call to be
// handled by GP, it dispatches the call directly with the given parameters, then calls
// the callback function.
//
// NOTE: Either this file or mb-gpAPI.js should be loaded, not both.

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
				// Not wired: Boardie needs the iframe GP builds in GP_openBoardie
				// (gpSupport.js), which this build does not include.
				alert(localized('Boardie is not available in this build.'));
			} else {
				MB_connection.connect(String(params[0]).startsWith('BLE') ? 'BLE' : 'serial');
			}
			callback(0);
			break;
		case 'board.disconnect':
			// As GP's closePort (MicroBlocksRuntime.gp).
			MB_connection.disconnect();
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

		// The following entry points are not yet implemented (noops):
		case 'board.downloadFile':
		case 'board.installVM':
		case 'board.installVMfromRepo':
		case 'board.installVMfromURL':
			break; // do nothing for now
		case 'board.retrieveProject':
			// GP answers before acting (MicroBlocksAPI.gp:112). openFromBoard
			// clears the project and waits for the NEXT board to connect; it does
			// not read a board that is already connected.
			callback(0);
			MB_editor.openFromBoard();
			break;
		case 'board.toggleBLE':
		case 'board.uploadFile':
		case 'edit.redo':
		case 'edit.undo':
		case 'ide.applyUserPreferences':
			callback(0); // not implemented yet, but every request gets its reply
			break;
		case 'ide.resize':
			// IDE.resize has just sized #canvas, the workspace slot; place the world canvas over it
			if (typeof world === 'object') {
				const slot = document.getElementById('canvas').getBoundingClientRect();
				const cnv = world.worldCanvas;
				cnv.style.left = slot.left + 'px';
				cnv.style.top = slot.top + 'px';
				cnv.style.width = slot.width + 'px';
				cnv.style.height = slot.height + 'px';
				cnv.width = slot.width;
				cnv.height = slot.height;
				world.setExtent(new Point(slot.width, slot.height));
				if (typeof mbEditor === 'object') { mbEditor.fixLayout(); }
			}
			callback();
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
		case 'ide.spinnerCancelled':
			callback();
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
		case 'library.hideDefs':
			callback();
			break;
		case 'library.reload':
			// Reply first, then act. The reload reads a file, so it finishes after
			// the reply.
			callback(0);
			MB_editor.reloadLibrary(params[0]);
			break;
		case 'library.showDefs':
		case 'library.showInfoDialog':
		case 'locale.loadCustomFile':
		case 'locale.setLanguage':
		case 'project.copyURL':
		case 'project.exportBlocksLibrary':
		case 'project.hideAllMyBlocks':
			callback();
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
		case 'project.showAllMyBlocks':
		case 'scripts.copyToClipboard':
		case 'scripts.copyToClipboardAsURL':
		case 'scripts.paste':
		case 'scripts.restoreZoom':
		case 'scripts.saveImage':
		case 'scripts.setExportedScriptScale':
		case 'scripts.setZoom':
		case 'scripts.zoomIn':
		case 'scripts.zoomOut':
		default:
			callback();
	}
};

// menus.js reads the clipboard through these, which gpSupport.js defines in the wasm build.
// Nothing here fills clipboardBytes yet, so the chrome's paste items stay hidden.
GP.clipboardBytes = [];
function clipboardText() {
	return new TextDecoder().decode(new Uint8Array(GP.clipboardBytes));
}

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
