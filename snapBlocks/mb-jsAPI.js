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
		// The following entry points are not yet implemented (noops):
		case 'board.compactStorage':
		case 'board.connect':
		case 'board.disconnect':
		case 'board.downloadFile':
		case 'board.installVM':
		case 'board.installVMfromRepo':
		case 'board.installVMfromURL':
		case 'board.retrieveProject':
		case 'board.toggleBLE':
		case 'board.uploadFile':
		case 'board.vmVersion':
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
		case 'ide.startAll':
		case 'ide.stopAll':
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
		case 'project.save':
		case 'project.showAllMyBlocks':
		case 'scripts.cleanUp':
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
