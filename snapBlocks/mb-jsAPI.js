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

GP = {}
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
		case 'board.vmVersion':
			// The version number the board reported, or null before it has.
			callback(MB_connection.vmVersion);
			break;
		case 'ide.startAll':
			// GP's startAll (MicroBlocksRuntime.gp) also refuses with a dialog when no
			// board is connected or the code store is full; the port only logs.
			MB_editor.startAll();
			callback(0);
			break;
		case 'ide.stopAll':
			// GP's stopAndSyncScripts (MicroBlocksRuntime.gp) also soft-resets the board.
			MB_editor.stopAll();
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
		case 'board.disconnect':
		case 'board.downloadFile':
		case 'board.installVM':
		case 'board.installVMfromRepo':
		case 'board.installVMfromURL':
		case 'board.retrieveProject':
		case 'board.toggleBLE':
		case 'board.uploadFile':
		case 'edit.redo':
		case 'edit.undo':
		case 'ide.applyUserPreferences':
		case 'ide.resize':
			break; // do nothing for now
			// the following code does not work:
			if ((params != '') && (world != undefined)) {
				const worldLeft = 192;
				const worldTop = 48;
				const cnv = document.getElementById('world-canvas');
				cnv.width = params[0] - worldLeft;
				cnv.height = params[1] - worldTop;
				world.setExtent(new Point(cnv.width, cnv.height));
				mbEditor.fixLayout();
			}
			break;
		case 'ide.selectCategory':
		case 'ide.selectLibrary':
		case 'ide.setSerialDelay':
		case 'ide.showLibraryDialog':
		case 'ide.spinnerCancelled':
		case 'ide.updateConnection':
		case 'ide.version':
		case 'library.delete':
		case 'library.export':
		case 'library.hideDefs':
		case 'library.reload':
		case 'library.showDefs':
		case 'library.showInfoDialog':
		case 'locale.loadCustomFile':
		case 'locale.setLanguage':
		case 'project.copyURL':
		case 'project.exportBlocksLibrary':
		case 'project.hideAllMyBlocks':
		case 'project.new':
		case 'project.open':
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
