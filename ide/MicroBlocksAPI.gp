// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2025 John Maloney, Bernat Romagosa, and Jens Mönig

// MicroBlocksAPI.gp - API for the JS/HTML world to interact with MicroBlocks
// Bernat Romagosa, July 2025

defineClass MicroBlocksAPI

method processLastCall MicroBlocksAPI {
	request = (browserLastAPIRequest)
	if (notNil request) { dispatchCall this request }
}

method dispatchCall MicroBlocksAPI callObject {
	editor = (findMicroBlocksEditor)
	if (notNil editor) {
		scripter = (scripter editor)
	}
	runtime = (smallRuntime)

	// retrieve call properties
	id = (at callObject 1)
	endPoint = (at callObject 2)
	params = (jsonParse (at callObject 3))

	// dispatch API call
	// IDE
	if (endPoint == 'ide.setSerialDelay') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		setSerialDelay runtime (at params 1)
	} (endPoint == 'ide.applyUserPreferences') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		applyUserPreferences editor
	} (endPoint == 'ide.startAll') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		startAll runtime
	} (endPoint == 'ide.stopAll') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		stopAndSyncScripts runtime
	} (endPoint == 'ide.updateConnection') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		updateConnection runtime
	} (endPoint == 'ide.selectCategory') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		selectCategory scripter (at params 1)
	} (endPoint == 'ide.selectLibrary') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		selectLibrary scripter (at params 1)
	} (endPoint == 'ide.showLibraryDialog') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		importLibrary scripter
	} (endPoint == 'ide.resize') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		browserResize editor (at params 1) (at params 2)
	} (endPoint == 'ide.version') {
		respondAPIRequest this id (ideVersion runtime)
	} (endPoint == 'ide.spinnerCancelled') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		spinner = (partThatIs (morph (global 'page')) 'MicroBlocksSpinner')
		if (notNil spinner) { destroy spinner }

	// Project
	} (endPoint == 'project.save') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		saveProjectToFile editor
	} (endPoint == 'project.new') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		newProject editor
	} (endPoint == 'project.open') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		openProjectMenu editor
	} (endPoint == 'project.copyURL') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		copyProjectURLToClipboard editor
	} (endPoint == 'project.exportBlocksLibrary') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		exportAsLibrary scripter
	} (endPoint == 'project.showAllMyBlocks') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		showAllMyBlocks scripter
	} (endPoint == 'project.hideAllMyBlocks') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		hideAllMyBlocks scripter

	// Board
	} (endPoint == 'board.installVM') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		// params: wipeFlash (bool), downloadFromServer (bool)
		installVM (new 'MicroBlocksFirmwareInstaller') (at params 1) (at params 2)
	} (endPoint == 'board.installVMfromURL') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		installESPFirmwareFromURL (new 'MicroBlocksFirmwareInstaller')
	} (endPoint == 'board.installVMfromRepo') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		installESPFirmwareFromRepo (new 'MicroBlocksFirmwareInstaller')
	} (endPoint == 'board.compactStorage') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		sendMsg runtime 'systemResetMsg' 2 nil
	} (endPoint == 'board.toggleBLE') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		sendMsg runtime 'setBLEFlag'
	} (endPoint == 'board.uploadFile') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		putFileOnBoard runtime
	} (endPoint == 'board.downloadFile') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		getFileFromBoard runtime
	} (endPoint == 'board.retrieveProject') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		openFromBoard editor
	} (endPoint == 'board.canDoBLE') {
		respondAPIRequest this id (boardIsBLECapable runtime)
	} (endPoint == 'board.hasFS') {
		respondAPIRequest this id (boardHasFileSystem runtime)
	} (endPoint == 'board.connect') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		webSerialConnect runtime (at params 1)
	} (endPoint == 'board.disconnect') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		closePort runtime
	} (endPoint == 'board.vmVersion') {
		respondAPIRequest this id (vmVersion runtime)

	// Localization
	} (endPoint == 'locale.setLanguage') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		setLanguage editor (at params 1)
	} (endPoint == 'locale.loadCustomFile') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		readCustomTranslationFile editor

	// Script edition
	} (endPoint == 'edit.undo') {
		undo scripter
		respondAPIRequest this id 0
	} (endPoint == 'edit.redo') {
		redo scripter
		respondAPIRequest this id 0

	// Scripting area
	} (endPoint == 'scripts.selectBlockSize') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		setBlockSize (scriptEditor scripter)
	} (endPoint == 'scripts.cleanUp') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		cleanUp (scriptEditor scripter)
	} (endPoint == 'scripts.copyToClipboard') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		copyScriptsToClipboard (scriptEditor scripter)
	} (endPoint == 'scripts.copyToClipboardAsURL') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		copyScriptsToClipboardAsURL (scriptEditor scripter)
	} (endPoint == 'scripts.paste') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		pasteScripts (scriptEditor scripter)
	} (endPoint == 'scripts.paste') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		pasteScripts (scriptEditor scripter)
	} (endPoint == 'scripts.saveImage') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		saveScriptsImage (scriptEditor scripter)
	} (endPoint == 'scripts.setExportedScriptScale') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		setExportScale (scriptEditor scripter) (at params 1)
	} (endPoint == 'scripts.zoomIn') {
		zoomIn editor
		respondAPIRequest this id 0
	} (endPoint == 'scripts.zoomOut') {
		zoomOut editor
		respondAPIRequest this id 0
	} (endPoint == 'scripts.restoreZoom') {
		restoreZoom editor
		respondAPIRequest this id 0
	} (endPoint == 'scripts.setZoom') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		setBlockScalePercent editor (at params 1)

	// Library
	} (endPoint == 'library.showInfoDialog') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		showLibraryInfo scripter (at params 1)
	} (endPoint == 'library.showDefs') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		showAllLibraryDefinitions scripter (at params 1)
	} (endPoint == 'library.hideDefs') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		hideAllLibraryDefinitions scripter (at params 1)
	} (endPoint == 'library.export') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		exportLibrary scripter (at params 1)
	} (endPoint == 'library.delete') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		removeLibraryNamed scripter (at params 1)
	} (endPoint == 'library.reload') {
		respondAPIRequest this id 0 // respond first so the request is deleted
		libName = (at params 1)
		library = (libraryNamed (project scripter) libName)
		if (and (notNil (path library)) (not (beginsWith (path library) '/'))) {
			importEmbeddedLibrary scripter libName
		}

	// Testing
	} (endPoint == 'test.getBinary') {
		respondAPIRequest this id (toBinaryData (toArray (list 4 5 6 7 8 9)))

	// API endpoint not found
	} else {
		respondAPIRequest this id 'Unknown API endpoint'
		print 'unknown API endpoint' endPoint
	}
}

method respondAPIRequest MicroBlocksAPI id params {
	// just stringify params before responding to the request
	browserRespondAPIRequest id (jsonStringify params)
}

method setProperty MicroBlocksAPI path value {
	// just cast value into a string before storing it in the browser IDE object
	if (isClass value 'String') {
		value = (join '"' value '"')
	} else {
		value = (jsonStringify value)
	}
	browserStoreIDEProperty path (toString value)
}

method notify MicroBlocksAPI event value {
	if (isClass value 'String') {
		value = (join '"' value '"')
	} else {
		value = (jsonStringify value)
	}
	browserNotify event (toString value)
}

method electronOS MicroBlocksAPI {
	return (at (array 'windows' 'mac' 'linux' 'web') (browserElectronOS))
}

// Windows

method nextId MicroBlocksAPI { return (browserNextCallId) }
method browserResponse MicroBlocksAPI id {
	json = (browserResponse id)
	if (notNil json) {
		return (jsonParse json)
	} else {
		return nil
	}
}

// Menus

method contextMenu MicroBlocksAPI selector aHand {
	scale = (global 'scale')
	options = (dictionary)
	atPut options 'selector' selector
	atPut options 'x' (/ (x aHand) scale)
	atPut options 'y' (/ (y aHand) scale)
	notify (api (smallRuntime)) 'context' options
}

method menuFor MicroBlocksAPI items callback class {
	// callback is an action that gets called with the chosen item as a param

	page = (global 'page')
	scale = (global 'scale')
	id = (nextId this)

	options = (dictionary)
	atPut options 'id' id
	atPut options 'x' (/ (x (hand page)) scale)
	atPut options 'y' (/ (y (hand page)) scale)
	atPut options 'class' class
	atPut options 'items' (list)

	fields = (array 'label' 'callback' 'tip' 'image' 'class' 'checked')

	for item items {
		dict = (dictionary)
		add (at options 'items') dict
		for i (count item) {
			field = (at fields i)
			if (field != 'callback') { // callback isn't encoded into the JSON
				value = (at item i)
				if (and (field == 'image') (isClass value 'Bitmap')) {
					value = (join
						'data:image/png;base64,'
						(base64Encode (encodePNG value))
					)
				}
				if (field == 'label') {
					value = (toString value) // make sure the label is always a string
				}
				atPut dict field value
			}
		}
	}

	notify this 'menu' options

	response = (browserResponse this id)
	while (response == nil) {
		response = (browserResponse this id)
		doOneCycle page
	}

	if (isClass callback 'Action') {
		call callback response
	} else {
		// let's find the selected item label (index 1) and run its action (index 2)
		for item items {
			if ((toString (at item 1)) == (toString response)) {
				call (at item 2)
				return
			}
		}
	}
}
