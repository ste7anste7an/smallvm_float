// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2019 John Maloney, Bernat Romagosa, and Jens Mönig

// MicroBlocksScripter.gp - MicroBlocks script editor w/ built-in palette

defineClass MicroBlocksScripter morph mbProject projectEditor saveNeeded categorySelector catResizer libHeader libSelector categoryFrame categoryPane libAddButton libAddIcons lastLibraryFolder blocksFrame blocksResizer scriptsFrame nextX nextY embeddedLibraries selection cornerIcon trashcanIcon spacer topGradient topGradientBitmap bottomGradient bottomGradientBitmap lastLibraryButtonStyle lastLibraryHeaderStyle undoStack redoStack searchRecents searchLibIndex searchBuiltinIndex

method blockPalette MicroBlocksScripter { return (contents blocksFrame) }
method scriptEditor MicroBlocksScripter { return (contents scriptsFrame) }
method scriptsFrame MicroBlocksScripter { return scriptsFrame }
method blocksFrame MicroBlocksScripter { return blocksFrame }
method project MicroBlocksScripter { return mbProject }

method selection MicroBlocksScripter { return selection }
method setSelection MicroBlocksScripter aSelection { selection = aSelection }

// initialization

method initialize MicroBlocksScripter aProjectEditor {
	mbProject = (newMicroBlocksProject)
	projectEditor = aProjectEditor

	undoStack = (list)
	redoStack = (list)

	scale = (global 'scale')
	morph = (newMorph this)
	listColor = (gray 240)
	fontName = 'Arial Bold'
	fontSize = 14
	nextX = 0
	nextY = 0

	// how often to check for script changes
	setFPS morph 4
	saveNeeded = false

	categorySelector = (newCategorySelector (categories this) (action 'categorySelected' this))
	libSelector = (newCategorySelector (array) (action 'librarySelected' this))

	blocksPane = (newBlocksPalette)
	setSortingOrder (alignment blocksPane) nil
	setPadding (alignment blocksPane) (15 * scale) // inter-column space
	setFramePadding (alignment blocksPane) (10 * scale) (10 * scale)
	blocksFrame = (scrollFrame blocksPane (transparent) false (4 * scale) (4 * scale))
	setVerticalScrollOnly blocksFrame true
	setHideWhenNotScrolling blocksFrame true
	setAutoScroll blocksFrame false
	setExtent (morph blocksFrame) (260 * scale) (100 * scale)
	setMinExtent (morph blocksFrame) (90 * scale) (60 * scale)
	setMaxExtent (morph blocksFrame) (600 * scale) 0 // y is ignored
	addPart morph (morph blocksFrame)
	addRoundedCorner this
	addTrashcan this

	scriptsPane = (newScriptEditor 10 10 nil)
	scriptsFrame = (scrollFrame scriptsPane (transparent) false (4 * scale) (4 * scale))
	setHideWhenNotScrolling scriptsFrame true
	addPart morph (morph scriptsFrame)

	// add resizers last so they are in front
	blocksResizer = (newPaneResizer (morph blocksFrame) 'horizontal')
	addPart morph (morph blocksResizer)

	setGrabRule morph 'ignore'
	for m (parts morph) { setGrabRule m 'ignore' }

	setMinExtent morph (scale * 235) (scale * 200)
	setExtent morph (scale * 600) (scale * 700)
	restoreScripts this

	smallRuntime this // create a SmallRuntime instance
	if (isNil projectEditor) { select categorySelector 'cat;Control' }
	return this
}

method addRoundedCorner MicroBlocksScripter {
	scale = (global 'scale')
	cornerIcon = (newMorph)
	setCostume cornerIcon (readSVGIcon 'rounded-corner')
	setPosition cornerIcon (left (morph blocksFrame)) ((height (morph blocksFrame)) - (8 * scale))
	addPart morph cornerIcon
}

method addTrashcan MicroBlocksScripter {
	scale = (global 'scale')
	trashcanIcon = (newMorph)
	if (darkModeEnabled projectEditor) {
		setCostume trashcanIcon (readSVGIcon 'trashcan-dark')
	} else {
		setCostume trashcanIcon (readSVGIcon 'trashcan-light')
	}
	setPosition trashcanIcon ((right (morph blocksFrame)) - ((32 + 8) * scale)) ((height (morph blocksFrame)) + (8 * scale))
	addPart morph trashcanIcon
}

method darkModeChanged MicroBlocksScripter {
	changed morph // report damage
	libWasSelected = (notNil (currentLibrary this))
	sliderBGColor = (transparent)
	if (darkModeEnabled projectEditor) {
		scriptsFrameColor = (microBlocksColor 'blueGray' 800)
		blocksFrameColor = (microBlocksColor 'blueGray' 750)
		sliderFGColor = (microBlocksColor 'blueGray' 300)
	} else {
		scriptsFrameColor = (lighter (microBlocksColor 'blueGray' 50) 40)
		blocksFrameColor = (microBlocksColor 'blueGray' 50)
		sliderFGColor = (microBlocksColor 'blueGray' 200)
	}

	setColor scriptsFrame scriptsFrameColor
	setColor blocksFrame blocksFrameColor
	setSliderColors scriptsFrame sliderBGColor sliderFGColor
	setSliderColors blocksFrame sliderBGColor sliderFGColor
	if libWasSelected {
		librarySelected this
	} else {
		categorySelected this
	}

	removePart morph trashcanIcon
	addTrashcan this
}

method languageChanged MicroBlocksScripter {
	fixLayout this

	// update the scripts
	saveScripts this nil true
	restoreScripts this // calls updateBlocks
	scriptChanged this true
}

// library item menu

method handleListContextRequest MicroBlocksScripter anArray {
	if (and ((first anArray) == categorySelector) ('cat;My Blocks' == (last anArray))) {
		menu = (menu)
		addItem menu 'show all block definitions' (action 'showAllMyBlocks' this)
		addItem menu 'hide all block definitions' (action 'hideAllMyBlocks' this)
		popUpAtHand menu (global 'page')
		return
	}
	if ((first anArray) != libSelector) { return } // not a library list entry; ignore
	libName = (last anArray)
	menu = (menu)
	addItem menu 'library information' (action 'showLibraryInfo' this libName)
	libPath = (path (libraryNamed mbProject libName))
	if (or (isNil libPath) (not (beginsWith libPath '/'))) {
		addItem menu 'reload library' (action 'importEmbeddedLibrary' this libName)
	}
	if (devMode) {
		addItem menu 'show all block definitions' (action 'showAllLibraryDefinitions' this libName)
		addItem menu 'hide all block definitions' (action 'hideAllLibraryDefinitions' this libName)
		addItem menu 'export this library' (action 'exportLibrary' this libName)
	}
	addLine menu
	addItem menu 'delete library' (action 'removeLibraryNamed' this libName)
	popUpAtHand menu (global 'page')
}

method showAllMyBlocks MicroBlocksScripter libName {
	newY = (height (morph (contents scriptsFrame))) // current bottom
	for f (functions (main mbProject)) {
		internalShowDefinition this (functionName f)
	}
	saveScripts this
	updateSliders scriptsFrame
	scrollToY scriptsFrame newY
}

method scrollToXY MicroBlocksScripter x y {
	scrollToX scriptsFrame (x + (left (morph scriptsFrame)))
	scrollToY scriptsFrame (y + (top (morph scriptsFrame)))
}

method hideAllMyBlocks MicroBlocksScripter {
	for f (functions (main mbProject)) {
		internalHideDefinition this (functionName f)
	}
	saveScripts this
	scrollToX scriptsFrame 0
	scrollToY scriptsFrame 0
	updateSliders scriptsFrame
}

method removeLibraryNamed MicroBlocksScripter libName {
	removeLibraryNamed mbProject libName
	closeAllDialogs projectEditor
	librariesChanged (smallRuntime)
	updateLibraryList this
	languageChanged this
}

method showLibraryInfo MicroBlocksScripter libName {
	library = (libraryNamed mbProject libName)
	showLibraryInfo library (devMode)
}

method showAllLibraryDefinitions MicroBlocksScripter libName {
	lib = (libraryNamed mbProject libName)
	if (isNil lib) { return }
		newY = (height (morph (contents scriptsFrame))) // current bottom
	for f (functions lib) {
		internalShowDefinition this (functionName f)
	}
	saveScripts this
	updateSliders scriptsFrame
	scrollToY scriptsFrame newY
}

method hideAllLibraryDefinitions MicroBlocksScripter libName {
	lib = (libraryNamed mbProject libName)
	if (isNil lib) { return }
	for f (functions lib) {
		internalHideDefinition this (functionName f)
	}
	saveScripts this
	scrollToX scriptsFrame 0
	scrollToY scriptsFrame 0
	updateSliders scriptsFrame
}

method exportLibrary MicroBlocksScripter libName {
	lib = (libraryNamed mbProject libName)
	if (isNil lib) { return }
	fName = (join (moduleName lib) '.ubl')
	browserWriteFile (codeString lib mbProject) fName 'library'
}

// layout

method fixLayout MicroBlocksScripter {
	scale = (global 'scale')

	blocksWidth = (max (width (morph blocksFrame)) (40 * scale))

	// prevent pane dividers from going off right side
	blocksWidth = (min blocksWidth (width morph))

	// resize parts
	totalHeight = (height morph)
	totalWidth = (width morph)
	setExtent (morph blocksFrame) blocksWidth totalHeight
	setExtent (morph scriptsFrame) (totalWidth - blocksWidth) totalHeight

	// position parts
	leftEdge = (left morph)
	topEdge = (top morph)
	fastSetPosition (morph blocksFrame) leftEdge topEdge
	fastSetPosition (morph scriptsFrame) (right (morph blocksFrame)) topEdge

	changed morph // report damage

	fixResizerLayout this
	fixScrollbars this

	// rounded corner at bottom left of palette
	setPosition cornerIcon ((left (morph blocksFrame)) - (2 * scale)) ((bottom (morph blocksFrame)) - (8 * scale))
}

method updateTrashcanPosition MicroBlocksScripter {
	// trashcan at bottom right of palette, offset by sliders if visible
	scale = (global 'scale')
	vOffset = (8 * scale)
	hOffset = ((32 + 8) * scale)
	if (isVisible (morph (getField blocksFrame 'hSlider'))) {
		hOffset += 8
	}
	if (isVisible (morph (getField blocksFrame 'vSlider'))) {
		vOffset += -8
	}
	setPosition trashcanIcon ((right (morph blocksFrame)) - hOffset) ((height (morph blocksFrame)) + vOffset)
}

method fixResizerLayout MicroBlocksScripter {
	resizerWidth = (15 * (global 'scale'))

	// blocks pane resizer
	setLeft (morph blocksResizer) (right (morph blocksFrame))
	setTop (morph blocksResizer) (top morph)
	setExtent (morph blocksResizer) resizerWidth (height morph)
}

method fixScrollbars MicroBlocksScripter {
	fixSliderLayout blocksFrame
	updateSliders scriptsFrame false true // shows sliders but also adjust contents extent
	updateTrashcanPosition this
}

// drawing

method drawOn MicroBlocksScripter ctx {
	scale = (global 'scale')
	borderWidth = (2 * scale)
	paneColor = (microBlocksColor 'blueGray' 850)
	// border between palette and scripting area
	if (darkModeEnabled projectEditor) {
		borderColor = (microBlocksColor 'blueGray' 600)
	} else {
		borderColor = (microBlocksColor 'blueGray' 100)
	}
	fillRect ctx borderColor 0 (top morph) borderWidth (height morph)
}

// MicroBlocksScripter UI support

method developerModeChanged MicroBlocksScripter {
	catList = categorySelector
	setCollection catList (categories this)
	updateLibraryList this
	if (not (or (contains (collection catList) (selection catList))
				(notNil (selection libSelector)))
	) {
		select catList 'cat;Output'
	} else {
		updateBlocks this
	}
}

method categories MicroBlocksScripter {
	initMicroBlocksSpecs (new 'SmallCompiler')
	result = (list 'cat;Output' 'cat;Input' 'cat;Pins' 'cat;Comm' 'cat;Control' 'cat;Operators' 'cat;Variables' 'cat;Data' 'cat;My Blocks')
	if (not (devMode)) {
		removeAll result (list 'cat;Comm')
	}
	return result
}

method selectCategory MicroBlocksScripter aCategory {
	select categorySelector aCategory
	categorySelected this
}

method currentCategory MicroBlocksScripter {
	return (selection categorySelector)
}

method categorySelected MicroBlocksScripter {
	setProperty (api (smallRuntime)) 'currentCategory' (selection categorySelector)
	select libSelector nil // deselect library
	updateBlocks this
}

method selectLibrary MicroBlocksScripter aLibrary {
	select libSelector aLibrary
	librarySelected this
}

method currentLibrary MicroBlocksScripter {
	return (selection libSelector)
}

method librarySelected MicroBlocksScripter {
	select categorySelector nil // deselect category
	setProperty (api (smallRuntime)) 'currentCategory' (currentLibrary this)
	updateBlocks this
}

method updateBlocks MicroBlocksScripter {
	scale = (global 'scale')
	blocksPane = (contents blocksFrame)
	hide (morph blocksPane) // suppress damage reports while adding blocks
	removeAllParts (morph blocksPane)
	setRule (alignment blocksPane) 'none'

	nextX = ((left (morph (contents blocksFrame))) + (16 * scale))
	nextY = ((top (morph (contents blocksFrame))) + (16 * scale))

	cat = (selection categorySelector)
	if (isNil cat) {
		addBlocksForLibrary this (selection libSelector)
	} ('cat;Variables' == cat) {
		addVariableBlocks this
		addAdvancedBlocksForCategory this cat
	} ('cat;My Blocks' == cat) {
		addMyBlocks this
	} else {
		addBlocksForCategory this cat
	}
	cleanUp blocksPane
	show (morph blocksPane) // show after adding blocks
	updateSliders blocksFrame
}

method addBlocksForCategory MicroBlocksScripter cat {
	addBlocksForSpecs this (specsFor (authoringSpecs) cat)
	addAdvancedBlocksForCategory this cat
}

method addAdvancedBlocksForCategory MicroBlocksScripter cat {
	advancedSpecs = (specsFor (authoringSpecs) (join cat '-Advanced'))
	if (and (devMode) (not (isEmpty advancedSpecs))) {
		addSectionLabel this (localized 'cat;Advanced:')
		addBlocksForSpecs this advancedSpecs
	}
}

method addBlocksForSpecs MicroBlocksScripter specList {
	for spec specList {
		if ('-' == spec) {
			// add some vertical space
			nextY += (20 * (blockScale))
		} else {
			addBlock this (blockForSpec spec) spec
		}
	}
}

method addBlocksForLibrary MicroBlocksScripter libName {
	if (isNil libName) { return }
	lib = (at (libraries mbProject) libName)
	if (isNil lib) { return }

	for op (blockList lib) {
		if ('-' == op) {
			// add some vertical space
			nextY += (20 * (global 'scale'))
		} (and ('advanced' == op) (devMode)) {
			addSectionLabel this (localized 'cat;Advanced:')
		} (and ('advanced' == op) (not (devMode))) {
			// stop here if next blocks are advanced and we're not in devMode
			return
		} (or (showHiddenBlocksEnabled projectEditor) (not (beginsWith op '_'))) {
			spec = (specForOp (authoringSpecs) op)
			if (notNil spec) {
				addBlock this (blockForSpec spec) spec
			}
		}
	}
}

to caseInsensitiveLessThan s1 s2 {
	return ((toUpperCase s1) < (toUpperCase s2))
}

method addVariableBlocks MicroBlocksScripter {
	scale = (global 'scale')

	addButton this (localized 'Add a variable') (action 'createVariable' this)
	visibleVars = (visibleVars this)
	if (notEmpty visibleVars) {
		addButton this (localized 'Delete a variable') (action 'deleteVariableMenu' this)
	}

	// add set/change variable
	nextY += (20 * scale)
	defaultVarName = ''
	if (notEmpty visibleVars) { defaultVarName = (first visibleVars) }

	addBlock this (toBlock (newCommand '=' defaultVarName 0)) nil false
	addBlock this (toBlock (newCommand '+=' defaultVarName 1)) nil false
	if (or (devMode) (contains (commandLine) '--allowMorphMenu')) {
		nextY += (10 * scale)
		addBlock this (toBlock (newCommand 'local' 'var' 0)) nil false
	}

	nextY += (20 * scale)

	if (notEmpty visibleVars) {
		visibleVars = (sorted (toArray visibleVars) 'caseInsensitiveLessThan')
		for varName visibleVars {
			lastY = nextY
			b = (toBlock (newReporter 'v' varName))
			addBlock this b nil // true xxx
//			readout = (makeMonitor b)
//			setGrabRule (morph readout) 'ignore'
//			setStyle readout 'varPane'
//			setPosition (morph readout) nextX lastY
//			addPart (morph (contents blocksFrame)) (morph readout)
//			step readout
		}
		nextY += (5 * scale)
	}

}

method addMyBlocks MicroBlocksScripter {
	scale = (global 'scale')

	addButton this (localized 'Add a command block') (action 'createFunction' this false)
	addButton this (localized 'Add a reporter block') (action 'createFunction' this true)
	nextY += (8 * scale)

	for f (functions (main mbProject)) {
		if (or (showHiddenBlocksEnabled projectEditor) (not (beginsWith (functionName f) '_'))) {
			spec = (specForOp (authoringSpecs) (functionName f))
			if (isNil spec) { spec = (blockSpecFor f) }
			addBlock this (blockForSpec spec) spec
		}
	}
}

method addButton MicroBlocksScripter label action hint {
	scale = (global 'scale')
	btn = (pushButton label action nil (26 * scale) false (darkModeEnabled projectEditor))
	if (notNil hint) { setHint btn hint }
	setPosition (morph btn) nextX nextY
	addPart (morph (contents blocksFrame)) (morph btn)
	nextY += ((height (morph btn)) + (7 * scale))
}

method addBlock MicroBlocksScripter b spec isVarReporter {
	// install a 'morph' variable reporter for any slot that has 'morph' or 'Morph' as a hint

	if (isNil spec) { spec = (blockSpec b) }
	if (isNil isVarReporter) { isVarReporter = false }
	scale = (global 'scale')
	if (notNil spec) {
		inputs = (inputs b)
		for i (slotCount spec) {
			hint = (hintAt spec i)
			if (and (isClass hint 'String') (endsWith hint 'orph')) {
				replaceInput b (at inputs i) (toBlock (newReporter 'v' 'morph'))
			}
			if ('page' == hint) {
				replaceInput b (at inputs i) (toBlock (newReporter 'v' 'page'))
			}
		}
	}
	fixLayout b
	setGrabRule (morph b) 'template'
	setPosition (morph b) nextX nextY
	if isVarReporter { setLeft (morph b) (nextX + (135 * scale)) }
	addPart (morph (contents blocksFrame)) (morph b)
	nextY += ((height (morph b)) + (8 * (global 'scale')))
}

// Palette Section Labels

method addSectionLabel MicroBlocksScripter label {
	scale = (global 'scale')
	if (darkModeEnabled projectEditor) {
		labelColor = (microBlocksColor 'blueGray' 300)
	} else {
		labelColor = (microBlocksColor 'blueGray' 600)
	}
	fontSize = (14 * scale)
	label = (newText label 'Arial Bold' fontSize labelColor)
	nextY += (12 * scale)
	setPosition (morph label) (nextX - (10 * scale)) nextY
	addPart (morph (contents blocksFrame)) (morph label)
	nextY += ((height (morph label)) + (12 * scale))
}

// project creation and loading

method createEmptyProject MicroBlocksScripter fromInitialize {
	mbProject = (newMicroBlocksProject)
	clearBoardIfConnected (smallRuntime) true
	if (notNil scriptsFrame) {
		removeAllParts (morph (contents scriptsFrame))
		restoreScripts this
		saveScripts this nil fromInitialize
	}
}

method loadOldProjectFromClass MicroBlocksScripter aClass specs {
	// Load an old-style (GP-format) MicroBlocks project from the given class and spec list.

	mbProject = (newMicroBlocksProject)
	clearBoardIfConnected (smallRuntime) true
	if (notNil aClass) {
		loadFromOldProjectClassAndSpecs mbProject aClass specs
	}
	restoreScripts this
}

method loadNewProjectFromData MicroBlocksScripter aString updateLibraries {
	// Load an new-style MicroBlocks project from the given string.
	mbProject = (newMicroBlocksProject)
	clearBoardIfConnected (smallRuntime) true
	saveNeeded = false // don't save scripts while project is loading
	loadFromString mbProject aString updateLibraries
	restoreScripts this
}

method reportFunctionsInSeveralLibraries MicroBlocksScripter {
	duplicates = (functionsInSeveralLibraries mbProject)
	if (notEmpty duplicates) {
		inform (global 'page') (join
			(localized 'These functions are defined in more than one library, so only one of each is used:')
			' ' (joinStrings duplicates '; ') '.')
	}
}

method setProject MicroBlocksScripter aMicroBlocksProject {
	mbProject = aMicroBlocksProject
	restoreScripts this
}

// variable operations

method visibleVars MicroBlocksScripter {
	// Include vars that start with underscore only in dev mode.

	allVars = (allVariableNames mbProject)
	if (showHiddenBlocksEnabled projectEditor) {
		return allVars
	} else {
		return (filter
			(function each { return (not (beginsWith each '_')) })
			allVars)
	}
}

method createVariable MicroBlocksScripter srcObj {
	varName = (trim (freshPrompt (global 'page') 'New variable name?' ''))
	if (varName != '') {
		addVariable (main mbProject) (uniqueVarName this varName)
		updateBlocks this
		if (isClass srcObj 'InputSlot') {
			setContents srcObj varName
		}
	}
}

method uniqueVarName MicroBlocksScripter varName forScriptVar {
	// If varName matches global variable, return a unique variant of it.
	// Otherwise, return varName unchanged.

	if (isNil forScriptVar) { forScriptVar = false }
	existingVars = (toList (allVariableNames mbProject))
	scripts = (scripts (main mbProject))
	if (and (notNil scripts) (not forScriptVar)) {
		for entry scripts {
			for b (allBlocks (at entry 3)) {
				if (isOneOf (primName b) 'local' 'for') {
					add existingVars (first (argList b))
				}
			}
		}
	}
	return (uniqueNameNotIn existingVars varName)
}

method deleteVariableMenu MicroBlocksScripter {
	if (isEmpty (visibleVars this)) { return }
	items = (list)
	for v (visibleVars this) {
		add items (array v)
	}
	menuFor (api (smallRuntime)) items (action 'deleteVariable' this)
}

method deleteVariable MicroBlocksScripter varName {
	deleteVariable mbProject varName
	updateBlocks this
}

// save and restore scripts in class

method scriptChanged MicroBlocksScripter cosmetically {
	runtime = (smallRuntime)
	updateHighlights runtime
	if (cosmetically != true) { saveNeeded = true }
// Check whether the block has just been moved.
// Commented out for now, since it seems to not be reliable enough, causing some
// changes to fail to propagate to the board.
//	for m (parts (morph (contents scriptsFrame))) {
//		b = (handler m)
//		if (isClass b 'Block') {
//			entry = (chunkEntryForBlock runtime b)
//			saveNeeded = (or (isNil entry) ((sourceForChunk runtime b) != (at entry 4)))
//		}
//	}
}

method functionBodyChanged MicroBlocksScripter { saveNeeded = true }

method step MicroBlocksScripter {
	// Note: Sometimes get bursts of multiple 'changed' events, but those
	// events merely set the saveNeeded flag. This method does the actual
	// saveScripts if the saveNeeded flag is true.

	if saveNeeded {
		saveScripts this
		syncScripts (smallRuntime)
		saveNeeded = false
	}
	updateStopping (smallRuntime)
}

method saveScripts MicroBlocksScripter oldScale skipUndoStore {
	scale = (blockScale)
	if (notNil oldScale) { scale = oldScale }
	scriptsPane = (contents scriptsFrame)
	paneX = (left (morph scriptsPane))
	paneY = (top (morph scriptsPane))
	scriptsCopy = (list)
	for m (parts (morph scriptsPane)) {
		if (isClass (handler m) 'Block') {
			x = (((left m) - paneX) / scale)
			y = (((top m) - paneY) / scale)
			script = (expression (handler m) 'main')
			if ('to' == (primName script)) {
				updateFunctionOrMethod this script
				args = (argList script)
				// only store the stub for a function in scripts
				script = (newCommand (primName script) (first args))
			}
			add scriptsCopy (array x y script)
		}
	}
	setScripts (main mbProject) scriptsCopy
	if (skipUndoStore != true) { storeUndoState this }
}

method storeUndoState MicroBlocksScripter {
	if ((count undoStack) > 50) { removeFirst undoStack }
	add undoStack (codeString mbProject)
	redoStack = (list)
	setProperty (api (smallRuntime)) 'scripts.undoAvailable' (undoAvailable this)
	setProperty (api (smallRuntime)) 'scripts.redoAvailable' (redoAvailable this)
}

method undo MicroBlocksScripter {
	saveNeeded = false
	if (notEmpty undoStack) {
		add redoStack (removeLast undoStack)
	}
	if (notEmpty undoStack) {
		loadFromString mbProject (last undoStack) false
	} else {
		mbProject = (newMicroBlocksProject)
		if (notNil scriptsFrame) {
			removeAllParts (morph (contents scriptsFrame))
		}
	}
	restoreScripts this
	syncScripts (smallRuntime)
	setProperty (api (smallRuntime)) 'scripts.undoAvailable' (undoAvailable this)
	setProperty (api (smallRuntime)) 'scripts.redoAvailable' (redoAvailable this)
}

method redo MicroBlocksScripter {
	saveNeeded = false
	if (notEmpty redoStack) {
		lastState = (removeLast redoStack)
		add undoStack lastState
		loadFromString mbProject lastState false
		restoreScripts this
		syncScripts (smallRuntime)
	}
	setProperty (api (smallRuntime)) 'scripts.undoAvailable' (undoAvailable this)
	setProperty (api (smallRuntime)) 'scripts.redoAvailable' (redoAvailable this)
}

method undoAvailable MicroBlocksScripter { return (notEmpty undoStack) }
method redoAvailable MicroBlocksScripter { return (notEmpty redoStack) }

method updateFunctionOrMethod MicroBlocksScripter script {
	args = (argList script)
	functionName = (first args)
	newCmdList = (last args)
	if ('to' == (primName script)) {
		f = (functionNamed mbProject functionName)
	}
	if (notNil f) {
		updateCmdList f newCmdList
		removeFieldsFromLocals f (allVariableNames mbProject)
	}
}

method restoreScripts MicroBlocksScripter {
	scale = (blockScale)
	scriptsPane = (contents scriptsFrame)
	removeAllParts (morph scriptsPane)

	scripts = (scripts (main mbProject))
	if (notNil scripts) {
		editor = (findMicroBlocksEditor)
		scriptCount = (count scripts)
		paneX = (left (morph scriptsPane))
		paneY = (top (morph scriptsPane))
		for i scriptCount {
			entry = (at scripts i)
			dta = (last entry)
			if ('to' == (primName dta)) {
				func = (functionNamed mbProject (first (argList dta)))
				if (notNil func) {
					block = (scriptForFunction func)
				} else {
					// can arise when viewing a class from an imported module; just skip it for now
					block = nil
				}
			} else {
				isReporter = ('r' == (blockType (specForOp (authoringSpecs) (primName dta))))
				if (and isReporter (isClass dta 'Command')) { dta = (toReporter dta) }
				if (and (not isReporter) (isClass dta 'Reporter')) { dta = (toCommand dta) }
				block = (toBlock dta)
			}
			if (notNil block) {
				x = (paneX + ((at entry 1) * scale))
				y = (paneY + ((at entry 2) * scale))
				fastMoveBy (morph block) x y
				addPart (morph scriptsPane) (morph block)
				fixBlockColor block
			}
		}
	}
	updateSliders scriptsFrame
	updateBlocks this
}

method updateScriptAfterOperatorChange MicroBlocksScripter aBlock {
	// Rebuild the script containing aBlock after switching operators.

	topBlock = (topBlock aBlock)
	expr = (expression topBlock 'main')
	if ('to' == (primName expr)) {
		updateFunctionOrMethod this expr
		func = (functionNamed mbProject (first (argList expr)))
		newBlock = (scriptForFunction func)
	} else {
		newBlock = (toBlock expr)
	}
	removeFromOwner (morph topBlock)
	fastMoveBy (morph newBlock) (left (morph topBlock)) (top (morph topBlock))
	addPart (morph (contents scriptsFrame)) (morph newBlock)
	scriptChanged this
}

// hide/show block definition

method hideDefinition MicroBlocksScripter funcName {
	// Hide the given method/function definition.
	internalHideDefinition this funcName
	saveScripts this
	updateSliders scriptsFrame
}

method internalHideDefinition MicroBlocksScripter funcName {
	// Internal helper method.
	// Hide the given method/function definition but does not save the scripts.
	scriptsPaneM = (morph (contents scriptsFrame))
	for m (parts scriptsPaneM) {
		b = (handler m)
		if (isClass b 'Block') {
			proto = (editedPrototype b)
			if (and (notNil proto)
					(funcName == (functionName (function proto)))
			) {
				removeFromOwner m
			}
		}
	}
}

method showDefinition MicroBlocksScripter funcName {
	if (not (isShowingDefinition this funcName)) {
		internalShowDefinition this funcName
		saveScripts this
		updateSliders scriptsFrame
	}
	scrollToDefinitionOf this funcName
}

method internalShowDefinition MicroBlocksScripter funcName {
	// Internal helper method.
	// Adds function definition to scripts pane but does not save the scripts.

	if (isShowingDefinition this funcName) { return } // already showing
	f = (functionNamed mbProject funcName)
	if (isNil f) { return }
	scale = (blockScale)
	scriptsPaneM = (morph (contents scriptsFrame))

	// find a position for the defintion below all other scripts
	x = ((left scriptsPaneM) + (50 * scale))
	y = ((top scriptsPaneM) + (50 * scale))
	for m (parts scriptsPaneM) {
		if (isClass (handler m) 'Block') {
			mBnds = (fullBounds m)
			if ((left mBnds) < x) { x = (left mBnds) }
			if ((bottom mBnds) > y) { y = (bottom mBnds) }
		}
	}

	// add the definition and save the scripts
	block = (scriptForFunction f)
	fastSetPosition (morph block) x y
	addPart scriptsPaneM (morph block)
}

method isShowingDefinition MicroBlocksScripter funcName {
	for entry (scripts (main mbProject)) {
		cmd = (at entry 3) // third item of entry is command
		if ('to' == (primName cmd)) {
			if (funcName == (first (argList cmd))) { return true }
		}
	}
	return false // not found
}

method findDefinitionOf MicroBlocksScripter funcName {
	for m (parts (morph (contents scriptsFrame))) {
		if (isClass (handler m) 'Block') {
			def = (editedDefinition (handler m))
			if (notNil def) {
				if ((op def) == funcName) {
					return m
				}
			}
		}
	}
	return nil
}

method scrollToDefinitionOf MicroBlocksScripter funcName {
	m = (findDefinitionOf this funcName)
	if (notNil m) {
		scrollIntoView scriptsFrame (fullBounds m) true
	}
}

// Build Your Own Blocks

method createFunction MicroBlocksScripter isReporter {
	name = (freshPrompt (global 'page') 'Enter function name:' 'myBlock')
	if (name == '') {return}
	opName = (uniqueFunctionName this name)
	func = (defineFunctionInModule (main mbProject) opName (array) nil)
	blockType = ' '
	if isReporter { blockType = 'r' }
	spec = (blockSpecFromStrings opName blockType opName '')
	recordBlockSpec mbProject opName spec
	script = (scriptForFunction func)
	if isReporter {
		// append an empty return block to reporters
		setNext script (toBlock (newReporter 'return' 0))
	}
	// store whether the project has any custom blocks. For project menu purposes.
	setProperty (api (smallRuntime)) 'project.hasCustomBlocks' true
	addToBottom this script
	updateBlocks this
}

method copyFunction MicroBlocksScripter definition {
	primName = (primName definition)
	args = (argList definition)
	body = (last args)
	if (notNil body) { body = (copy body) }
	oldOp = (first args)
	oldSpec = (specForOp (authoringSpecs) oldOp)
	if ('to' == primName) {
		newOp = (uniqueFunctionName this oldOp)
		parameterNames = (copyFromTo args 2 ((count args) - 1))
		defineFunctionInModule (main mbProject) newOp parameterNames body
		if (notNil oldSpec) {
			oldLabel = (first (specs oldSpec))
			newLabel = (uniqueFunctionName this oldLabel)
			newSpec = (copyWithOp oldSpec newOp oldLabel newLabel)
		} else {
			newSpec = (blockSpecFor (functionNamed mbProject newOp))
		}
	}
	recordBlockSpec mbProject newOp newSpec
	return (newCommand primName newOp)
}

method uniqueFunctionName MicroBlocksScripter baseSpec {
	existingNames = (list)
	addAll existingNames (allOpNames (authoringSpecs))
	addAll existingNames (keys (blockSpecs (project projectEditor)))
	specWords = (words baseSpec)
	firstWord = (first specWords)
	if ('_' == firstWord) {
		firstWord = 'f'
		specWords = (join (array 'f') specWords)
	}
	atPut specWords 1 (uniqueNameNotIn existingNames firstWord)
	return (joinStrings specWords ' ')
}

// function deleting

method deleteFunction MicroBlocksScripter funcName {
	if (isShowingDefinition this funcName) { hideDefinition this funcName }
	f = (functionNamed mbProject funcName)
	if (notNil f) { removedUserDefinedBlock this f }
}

method removedUserDefinedBlock MicroBlocksScripter function {
	// Remove the given user-defined function.
	removeFunction (module function) function // in MicroBlocks the function "module" is its library
	deleteBlockSpecFor (project projectEditor) (functionName function)
	updateBlocks this
	saveNeeded = true
	// store whether the project has any custom blocks. For project menu purposes.
	setProperty (api (smallRuntime)) 'project.hasCustomBlocks' ((count (functions (main mbProject))) > 0)
}

method addToBottom MicroBlocksScripter aBlock noScroll {
	if (isNil noScroll) {noScroll = false}
	space = ((global 'scale') * 10)
	bottom = (top (morph (contents scriptsFrame)))
	left = ((left (morph (contents scriptsFrame))) + (50 * (global 'scale')))
	for script (parts (morph (contents scriptsFrame))) {
		left = (min left (left (fullBounds script)))
		bottom = (max bottom (bottom (fullBounds script)))
	}
	setPosition (morph aBlock) left (bottom + space)
	addPart (morph (contents scriptsFrame)) (morph aBlock)
	if (not noScroll) {
		scrollIntoView scriptsFrame (fullBounds (morph aBlock))
	}
	scriptChanged this
}

method blockPrototypeChanged MicroBlocksScripter aBlock {
	saveScripts this
	scriptsPane = (contents scriptsFrame)
	op = (primName (function aBlock))

	// update the definition body
	block = (handler (owner (morph aBlock)))
	nxt = (next block)
	if (and (notNil nxt) (containsPrim nxt op)) {
		body = (toBlock (cmdList (function aBlock)))
		setNext block nil
		setNext block body
		fixBlockColor block
	}

	// update the palette template
	updateBlocks this

	// update all calls
	if ('initialize' != op) {
		updateCallsOf this op
		updateCallsInScriptingArea this op
	}
	updateSliders scriptsFrame
}

method updateCallsOf MicroBlocksScripter op {
	// Update calls of the give operation to ensure that they have the minimum number
	// of arguments specified by the prototype and that the types of any constant
	// parameters match those of the the prototype.

	// get spec and extract arg types and default values
	spec = (specForOp (authoringSpecs) op)
	if (isNil spec) { return } // should not happen
	minArgs = (countInputSlots spec (first (specs spec)))
	isReporter = (isReporter spec)
	isVariadic = (or ((count (specs spec)) > 1) (repeatLastSpec spec))
	argTypes = (list)
	argDefaults = (list)
	for i (slotCount spec) {
		info = (slotInfoForIndex spec i)
		typeStr = (at info 1)
		defaultValue = (at info 2)
		if (and ('color' == typeStr) (isNil defaultValue)) {
				defaultValue = (color 35 190 30)
		}
		if (and ('auto' == typeStr) (isClass defaultValue 'String') (representsANumber defaultValue)) {
			defaultValue = (toNumber defaultValue defaultValue)
		}
		add argTypes typeStr
		add argDefaults defaultValue
	}

	// update all calls
	s = (first (specs spec))
	origCmds = (list)
	newCmds = (list)
	gc
	for cmd (allCmdsInProject this) {
		if ((primName cmd) == op) {
			add origCmds cmd
			add newCmds (fixedCmd this cmd minArgs argTypes argDefaults isReporter isVariadic)
		}
	}
	// replace command/reporter objects with new versions
	replaceObjects (toArray origCmds) (toArray newCmds)
}

method allCmdsInProject MicroBlocksScripter {
	main = (main (project projectEditor))
	result = (dictionary)
	for f (functions main) {
		addAll result (allBlocks (cmdList f))
	}
	for s (scripts main) {
		addAll result (allBlocks (at s 3))
	}
	return (keys result)
}

method fixedCmd MicroBlocksScripter oldCmd minArgs argTypes argDefaults isReporter isVariadic {
	// Return an updated Command or Reporter.

	args = (toList (argList oldCmd))

	// add new arguments with default values
	while ((count args) < minArgs) {
		add args (at argDefaults ((count args) + 1))
	}

	// if not variadic, remove extra arguments
	if (not isVariadic) {
		while ((count args) > minArgs) {
			removeLast args
		}
	}

	// fix type inconsistencies for non-expression arguments
	for i (min minArgs (count args) (count argTypes) (count argDefaults)) {
		arg = (at args i)
		if (not (isClass arg 'Reporter')) {
			desiredType = (at argTypes i)
			if (and ('auto' == desiredType) (not (or (isNumber arg) (isClass arg 'String')))) {
				atPut args i (at argDefaults i)
			}
			if (and ('bool' == desiredType) (not (isClass arg 'Boolean'))) {
				atPut args i (at argDefaults i)
			}
			if (and ('color' == desiredType) (not (isClass arg 'Color'))) {
				atPut args i (at argDefaults i)
			}
		}
	}

	// create a new command/reporter with new args list
	if isReporter {
		result = (newIndexable 'Reporter' (count args))
	} else {
		result = (newIndexable 'Command' (count args))
		setField result 'nextBlock' (nextBlock oldCmd)
	}
	fixedFields = (fieldNameCount (classOf result))
	setField result 'primName' (primName oldCmd)
	for i (count args) {
		setField result (fixedFields + i) (at args i)
	}
	return result
}

method updateCallsInScriptingArea MicroBlocksScripter op {
	// Update scripts in the scripting pane that contain calls to the give op.

	// collect top-level scripts that call the given function
	scriptsPane = (contents scriptsFrame)
	affectedScripts = (list)
	for m (parts (morph scriptsPane)) {
		b = (handler m)
		if (isClass b 'Block') {
			if (containsPrim b op) {
				add affectedScripts b
			}
			if ('to' == (primName (expression b))) {
				add affectedScripts b
			}
		}
	}

	// update each top-level script that is affected
	for each affectedScripts {
		expr = (expression each)
		if ('to' == (primName expr)) {
			func = (functionNamed mbProject (first (argList expr)))
			newScript = (scriptForFunction func)
		} else {
			newScript = (toBlock expr)
		}

		// update the function definition block and any calls in the scripting area
		wasHighlighted = (notNil (getHighlight (morph each)))
		x = (left (morph each))
		y = (top (morph each))
		destroy (morph each)
		setPosition (morph newScript) x y
		addPart (morph scriptsPane) (morph newScript)
		fixBlockColor newScript
		if wasHighlighted { addHighlight (morph newScript) }
	}
}

// Library import/export

method importLibrary MicroBlocksScripter {
	if (downloadInProgress (findProjectEditor)) { return }
	libraryWindow = (findMorph 'MicroBlocksLibraryImportDialog')
	if (notNil libraryWindow) { destroy libraryWindow }
	if (isNil lastLibraryFolder) { lastLibraryFolder = 'Libraries' }
	pickLibraryToOpen (action 'openLibraryFile' this) lastLibraryFolder (array '.ubl')
}

method openLibraryFile MicroBlocksScripter fileName {
	importLibraryFromFile this fileName
	saveAllChunksAfterLoad (smallRuntime)
}

method allFilesInDir MicroBlocksScripter rootDir {
	// Return a list of all files below the given directory.

	result = (list)
	todo = (list rootDir)
	while (notEmpty todo) {
		dir = (removeFirst todo)
		for fName (listFiles dir) {
			add result (join dir '/' fName)
		}
		for dirName (listDirectories dir) {
			add todo (join dir '/' dirName)
		}
	}
	return result
}

method importEmbeddedLibrary MicroBlocksScripter libName {
	asImplementation = ((at libName 1) == '_')
	if asImplementation { libName = (substring libName 2) }
	libFileName = (join libName '.ubl')
	for filePath (allFilesInDir this 'Libraries') {
		if (endsWith filePath libFileName) {
			importLibraryFromFile this filePath nil false asImplementation
			return
		}
	}
}

method importLocalizedLibraryFromFile MicroBlocksScripter fileName {
	zip = (read (new 'ZipFile') (readFile fileName true))
	translations = (dictionary)
	libName = ''
	for fileName (fileNames zip) {
		data = (toString (extractFile zip fileName))
		if (endsWith fileName '.ubl') {
			importLibraryFromFile this fileName data
		} (endsWith fileName '.po') {
			langCode = (withoutExtension fileName)
			if (langCode == (languageCode (authoringSpecs))) {
				updateTranslation (authoringSpecs) data
			}
			atPut translations langCode data
		} else {
			print 'Library contains unrecognized file format:' fileName
		}
	}
	libName = (withoutExtension (filePart fileName))
	library = (libraryNamed mbProject libName)
	setTranslations library translations
}

method importLibraryFromFile MicroBlocksScripter fileName data updateLastLibFolder asImplementation {
	// Import a library with the given file path. If data is not nil, it came from
	// a browser upload or file drop. Use it rather than attempting to read the file.

	if (isNil updateLastLibFolder) { updateLastLibFolder = true }
	if (isNil data) {
		if (beginsWith fileName '//') {
			data = (readEmbeddedFile (substring fileName 3))
			if updateLastLibFolder { lastLibraryFolder = 'Libraries' }
		} else {
			data = (readFile fileName)
			if updateLastLibFolder { lastLibraryFolder = (directoryPart fileName) }
		}
		if (isNil data) { return } // could not read file
	}

	libName = (withoutExtension (filePart fileName))
	existingLib = (libraryNamed mbProject libName)
	if (notNil existingLib) {
		// replacing library; first hide its block definitions
		hideAllLibraryDefinitions this libName
	}
	asImplementation = (and
		(asImplementation == true)
		(or (isNil existingLib) (isImplementationLib existingLib))
	)
	importLibraryFromString this (toString data) libName fileName asImplementation
}

to codebergFileURL fullUrl {
	// If fullUrl is a Codeberg link to a file, return the equivalent Codeberg API URL.
	// Return nil if it is not one.
	//
	// Codeberg's web routes do not send CORS headers, so the browser cannot let the IDE
	// read them, and its /src/ routes return the repository's web page for the file (or,
	// for requests its anti-scraper filter does not recognise, a decoy page) rather than
	// the file itself. Codeberg's API route returns the file and does send CORS headers.
	//   https://codeberg.org/OWNER/REPO/{src|raw}/{branch|commit|tag}/REF/PATH
	//     becomes
	//   https://codeberg.org/api/v1/repos/OWNER/REPO/raw/PATH?ref=REF

	prefix = 'https://codeberg.org/'
	if (not (beginsWith fullUrl prefix)) {
		prefix = 'http://codeberg.org/'
		if (not (beginsWith fullUrl prefix)) { return nil }
	}
	rest = (substring fullUrl ((count prefix) + 1))
	queryStart = (findFirst rest '?')
	if (notNil queryStart) { rest = (substring rest 1 (queryStart - 1)) }

	parts = (splitWith rest '/')
	if ((count parts) < 6) { return nil }
	route = (at parts 3)
	if (and ('src' != route) ('raw' != route)) { return nil }
	refKind = (at parts 4)
	if (and ('branch' != refKind) (and ('commit' != refKind) ('tag' != refKind))) { return nil }

	filePath = (joinStrings (copyFromTo parts 6) '/')
	if (isEmpty filePath) { return nil }
	return (join
		'https://codeberg.org/api/v1/repos/' (at parts 1) '/' (at parts 2)
		'/raw/' filePath '?ref=' (at parts 5))
}

method importLibraryFromUrl MicroBlocksScripter fullUrl {
	// A Codeberg web URL cannot be read by the browser-based IDE, so fetch it via
	// Codeberg's API instead. Other URLs are used unchanged.
	fetchUrl = (codebergFileURL fullUrl)
	if (isNil fetchUrl) { fetchUrl = fullUrl }

	if (beginsWith fetchUrl 'http://') {
		url = (substring fetchUrl 8)
	} (beginsWith fetchUrl 'https://') {
		// HTTPS is not supported, but we'll try to fetch the lib via HTTP, just
		// in case the remote server supports both SSL and plain HTTP
		url = (substring fetchUrl 9)
	} else {
		url = fetchUrl
	}
	host = (substring url 1 ((findFirst url '/') - 1))
	libPath = (substring url (findFirst url '/'))

	// Ignore any query string when deriving the library name, so that a path ending in
	// '/Telegram.ubl?ref=v1.2' yields 'Telegram' rather than 'Telegram.ubl?ref=v1'.
	namePath = libPath
	queryStart = (findFirst namePath '?')
	if (notNil queryStart) { namePath = (substring namePath 1 (queryStart - 1)) }
	libName = (substring namePath ((findLast namePath '/') + 1) ((findLast namePath '.') - 1))

	libSource = (httpGet host libPath)

	// Check if response is valid
	if (isEmpty libSource) {
		(inform (global 'page')
			(localized 'Host does not exist or is currently down.')
			'Could not fetch library')
		return false
	} ((findSubstring '404' (first (lines libSource))) > 0) {
		// 404 not found. Host seems okay, but file can't be fetched.
		(inform (global 'page')
			(localized 'File not found in server.')
			'Could not fetch library')
		return false
	} ((findSubstring '301' (first (lines libSource))) > 0) {
		// Moved permanently. Normally returned when we try to access a URL by
		// HTTP and are redirected to the HTTPS equivalent
		(inform (global 'page')
			(localized 'Server expects HTTPS, and MicroBlocks doesn''t currently support it.')
			'Could not fetch library')
		return false
	}

	if (not (beginsWith libSource 'module ')) {
		// Something was fetched, but it is not a library. This happens when the URL
		// points at a repository's web page for a file rather than at the file itself.
		(inform (global 'page')
			(localized 'That URL does not return a MicroBlocks library.')
			'Could not fetch library')
		return false
	}

	importLibraryFromString this libSource libName fullUrl
	return true
}

method importLibraryFromString MicroBlocksScripter data libName fileName asImplementation {
	oldLibs = (values (libraries mbProject))
	moduleName = (addLibraryFromString mbProject (toString data) libName fileName)
	if asImplementation { beImplementation (libraryNamed mbProject libName) }
	librariesChanged (smallRuntime)

	// update library list and select the new library
	updateLibraryList this
	select categorySelector nil
	select libSelector moduleName
	updateBlocks this
	saveScripts this
	restoreScripts this

	// last, since closing the dialog with its X skips anything after it in the browser
	reportReplacedLibraries this (libraryNamed mbProject moduleName) oldLibs
}

method reportReplacedLibraries MicroBlocksScripter lib oldLibs {
	// Tell the user which libraries lib replaced. For the author of lib, also list the functions
	// of each library it implements that it lacks or defines with a different block.
	if (isNil lib) { return }
	msg = (list)
	for oldLib oldLibs {
		oldName = (moduleName oldLib)
		if (and (oldName != (moduleName lib)) (isNil (libraryNamed mbProject oldName)) (replaces lib oldLib)) {
			add msg (join (localized '%1 replaces %2' (array (moduleName lib) oldName)) '.')
		}
	}
	for libName (implementedLibs lib) {
		embeddedLib = (embeddedLibraryNamed lib libName)
		if (notNil embeddedLib) {
			missing = (missingFunctionsOf lib embeddedLib)
			if (notEmpty missing) {
				add msg (join (localized 'Blocks and functions of %1 that this library does not define:' libName)
					' ' (joinStrings missing ', ') '.')
			}
			mismatched = (mismatchedFunctionsOf lib embeddedLib)
			if (notEmpty mismatched) {
				add msg (join (localized 'Blocks and functions of %1 that differ in this library:' libName)
					' ' (joinStrings mismatched ', ') '.')
			}
		}
	}
	if (notEmpty msg) { inform (global 'page') (joinStrings msg (newline)) }
}

method updateLibraryList MicroBlocksScripter {
	libDescriptors = (list)
	libNames = (list)
	for libName (sorted (keys (libraries mbProject))) {
		lib = (at (libraries mbProject) libName)
		if (or
			(not (isImplementationLib lib))
			(showHiddenBlocksEnabled projectEditor)
		) {
			add libNames (moduleName lib)
			dict = (dictionary)
			atPut dict 'label' (moduleName lib)
			atPut dict 'category' (moduleCategory lib)
			add libDescriptors dict
		}
	}
	setProperty (api (smallRuntime)) 'libraryList' libDescriptors
	setCollection libSelector libNames
	oldSelection = (selection libSelector)
	if (not (contains libNames oldSelection)) {
		selectCategory this 'cat;Control'
	}
	scale = (global 'scale')
}

method justGrabbedPart MicroBlocksScripter part {
	print 'scripter part grabbed'
	print part
}

method setLibsDraggable MicroBlocksScripter flag {
	// deprecated; do nothing
}

method exportAsLibrary MicroBlocksScripter defaultFileName {
	if (or (isNil defaultFileName) ('' == defaultFileName)) {
		defaultFileName = (localized 'my library')
	}
	libName = (freshPrompt (global 'page') (localized 'Library name?') defaultFileName)
	fName = (join libName '.ubl')
	browserWriteFile (codeString (main mbProject) mbProject libName) fName 'library'
}

// importing libraries for dropped scripts

method installLibraryNamed MicroBlocksScripter libName {
	if (notNil (libraryNamed mbProject libName)) { return } // library already installed
	fileName = (fileNameForLibraryNamed this libName)
	if (isNil fileName) {
		print 'Unknown library:' libName 'fileName:' fileName
		return
	}
	if (not (endsWith fileName '.ubl')) { fileName = (join fileName '.ubl') }
	importLibraryFromFile this fileName
}

method fileNameForLibraryNamed MicroBlocksScripter libName {
	if (isNil embeddedLibraries) {
		// build a dictionary mapping libName -> fileName
		embeddedLibraries = (dictionary)
		for filePath (allFilesInDir this 'Libraries') {
			if (endsWith filePath '.ubl') {
				name = (extractLibraryName this (readFile filePath))
				if (notNil name) {
					atPut embeddedLibraries name filePath
				}
			}
		}
	}
	// renamed libraries
	if ('HSV Colors' == libName) { libName = 'Color' }
	if ('VL53L0X' == libName) { libName = 'Distance (VL53L0X)' }
	if ('CutebotPRO' == libName) { libName = 'Cutebot Pro' }
	return (at embeddedLibraries libName)
}

method extractLibraryName MicroBlocksScripter libData {
	if (isNil libData) { return nil }
	for line (lines libData) {
		if (beginsWith line 'module') {
			libName = (at (words line) 2)
			if ('''' == (at libName 1)) { // quoted library name
				// Ends at the closing quote of the name, not at the last quote
				// on the line: a module line may carry a category after the
				// name, and findLast swallows it into the name.
				i = (findFirst line '''')
				rest = (substring line (i + 1))
				j = (findFirst rest '''')
				libName = (substring rest 1 (j - 1))
			}
			return libName
		}
	}
	return nil
}

// support for script copy-paste via clipboard or embedding in a PNG files

method scriptStringFor MicroBlocksScripter aBlock {
	// Return a script string for the given script.

	return (join
		'GP Script' (newline)
		(exportScripts (newMicroBlocksExchange) this (list (morph (topBlock aBlock)))))
}

method allScriptsString MicroBlocksScripter {
	// Return a string with all scripts in the scripting area.

	scriptsPaneM = (morph (contents scriptsFrame))
	paneX = (left scriptsPaneM)
	paneY = (top scriptsPaneM)
	return (join
		'GP Scripts' (newline)
		(exportScripts (newMicroBlocksExchange) this (parts scriptsPaneM) paneX paneY))
}

method pasteScripts MicroBlocksScripter scriptString atHand {
	// hide the definitions of functions that will be pasted
	scriptString = (normalizeLineEndings scriptString)
	for entry (parse scriptString) {
		args = (argList entry)
		if (and ('script' == (primName entry)) ((count args) >= 3) (notNil (last args))) {
			script = (last args)
			if ('to' == (primName script)) {
				funcName = (first (argList script))
				internalHideDefinition this funcName
				// store whether the project has any custom blocks. For project menu purposes.
				setProperty (api (smallRuntime)) 'project.hasCustomBlocks' true
			}
		}
	}

	// find destination position for scripts
	if (isNil atHand) { atHand = false }
	if atHand {
		// current hand position, adjusted for approximate menu offset
		hand = (hand (global 'page'))
		dstX = ((x hand) - (40 * (global 'scale')))
		dstY = ((y hand) - (90 * (global 'scale')))
	} else {
		dstX = ((left (morph (contents scriptsFrame))) + (100 * (global 'scale')))
		dstY = ((scriptsBottom this) + (30 * (blockScale)))
	}

	scriptsPane = (contents scriptsFrame)
	importScripts (newMicroBlocksExchange) this scriptString dstX dstY
	scriptChanged this
	updateBlocks this
	saveScripts this
	updateSliders scriptsFrame
	if (notNil block) {
		scrollIntoView scriptsFrame (fullBounds (morph block)) true // favorTopLeft
	}
}

method scriptsBottom MicroBlocksScripter {
	// Return the vertical position of the bottom-most script in the scripting area.

	scriptsM = (morph (contents scriptsFrame))
	result = (top scriptsM)
	for m (parts scriptsM) {
		if (isClass (handler m) 'Block') {
			mBnds = (fullBounds m)
			if ((bottom mBnds) > result) { result = (bottom mBnds) }
		}
	}
	return result
}

// category export

method exportPNGsForBuiltinBlocks MicroBlocksScripter {
	// Exports PNG's for all built-in blocks at 100% and 50% in one folder per blocks category.
	// To run:
	//		exportPNGsForBuiltinBlocks (scripter (first (allInstances 'MicroBlocksEditor')))

	allCategories = (list 'Output' 'Input' 'Pins' 'Comm' 'Control' 'Operators' 'Variables' 'Data')
	for category allCategories {
		cat = (join 'cat;' category)
		exportBlockPNGsForCategory (scripter (first (allInstances 'MicroBlocksEditor'))) cat 1.0
		exportBlockPNGsForCategory (scripter (first (allInstances 'MicroBlocksEditor'))) cat 0.5
	}
}

method exportBlockPNGsForCategory MicroBlocksScripter cat scale {
	makeDirectory 'block-pngs'
	folderName = (join './block-pngs/' (substring cat 5))
	makeDirectory folderName
	suffix = '.png'
	oldExportScale = (global 'blockExportScale')
	setGlobal 'blockExportScale' scale
	if (scale < 1) {
		n = (round (100 * scale))
		suffix = (join '_' n 'p.png')
	}
	specList = (specsFor (authoringSpecs) cat)
	addAll specList (specsFor (authoringSpecs) (join cat '-Advanced'))
	for spec specList {
		if (not (isOneOf spec '-')) {
			blockName = (blockOp spec)
			i = (findFirst blockName ':')
			if (and (beginsWith blockName '[') (notNil i)) {
				blockName = (join
					(substring blockName 2 (i - 1))
					'_'
					(substring blockName (i + 1) ((count blockName) - 1)))
			}
			block = (blockForSpec spec)
			addPart morph (morph block)
			if ('/' == blockName) { blockName = 'div' }
			filePath = (toLowerCase (join folderName '/' blockName suffix))
			print filePath
			exportAsImageScaled block nil nil filePath
			removePart morph (morph block)
		}
	}
	setGlobal 'blockExportScale' oldExportScale
}

// dropping

method wantsDropOf MicroBlocksScripter aHandler {
	return (isAnyClass aHandler 'Block' 'Monitor' 'MicroBlocksSelectionContents')
}

method justReceivedDrop MicroBlocksScripter aHandler {
	// let blockPalette handle this drop
	justReceivedDrop (blockPalette this) aHandler
	return
}

// gradient bitmap

method gradientBitmap MicroBlocksScripter {
	data = ' iVBORw0KGgoAAAANSUhEUgAAAAEAAAAeCAYAAADtlXTHAAAACXBIWXMAAA7DAAAOwwHHb
6hkAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAFh0RVh0Q29weXJpZ2h0AENDM
CBQdWJsaWMgRG9tYWluIERlZGljYXRpb24gaHR0cDovL2NyZWF0aXZlY29tbW9ucy5vcmcvcHVibGljZ
G9tYWluL3plcm8vMS4wL8bjvfkAAABaSURBVAiZPcixDYNQEETBvWcs3RK4pt9/I/Rg4NaRyUajtdbGc
Zxm3z/Nl9NsV5qLMS/ezdxjIM0ohqgZYUiaKRkqzQx/lUxFjVRGSaOSkdQoMapqpOf0XOQf/Voh10IMi
/kAAAAASUVORK5CYII='
	dataRetina = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAA8CAYAAACn8dD6AAAACXBIWXMAAA7DAAAO
wwHHb6hkAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAAFh0RVh0Q29weXJpZ2h0
AENDMCBQdWJsaWMgRG9tYWluIERlZGljYXRpb24gaHR0cDovL2NyZWF0aXZlY29tbW9ucy5vcmcvcHVi
bGljZG9tYWluL3plcm8vMS4wL8bjvfkAAACASURBVBiVbY1LbgJRDATLNf1yGS7JJTkIC7IJ2CxGw0fK
xmpVl9zAWU+nS9y263KtjrdtYn6J+lgq8U+i9ROhl96J95poEWGWVcR+EKu2L1YTCyI9a09dZG/BZTWx
mRfjy+uJlAd7e82xAccGs6SMzEQ4/u2piMzLwwj/eJ9nZ0/INycVXhY1IwAAAABJRU5ErkJggg=='
	if (2 == (global 'scale')) { data = dataRetina }
	return (readFrom (new 'PNGReader') (base64Decode data))
}

// block/variable search (ctrl-space)

method showSearchBox MicroBlocksScripter {
	existing = (findMorph 'MicroBlocksBlockSearchBox')
	if (notNil existing) {
		startEditing (handler existing)
		return
	}
	box = (newMicroBlocksBlockSearchBox this)
	pageM = (morph (global 'page'))
	// Sit just below the top bar rather than a third of the way down the page,
	// so the results menu has the whole window height below it to grow into.
	gap = (8 * (global 'scale'))
	setCenter (morph box) (hCenter (bounds pageM)) 0
	setTop (morph box) ((top pageM) + gap)
	addPart pageM (morph box)
	startEditing box
	showRecents box
	// building the embedded-library index reads every library file, so warm
	// the cache while the box opens rather than during the first search
	searchLibIndex this
}

method searchRecents MicroBlocksScripter {
	if (isNil searchRecents) { searchRecents = (list) }
	return searchRecents
}

method recordSearchRecent MicroBlocksScripter desc {
	if (isNil searchRecents) { searchRecents = (list) }
	// the set/change entries are variants of a single template row, so keep
	// only the most recent one of each kind, whatever variable it recorded
	prefix = nil
	if (beginsWith desc 'set ') { prefix = 'set ' }
	if (beginsWith desc 'chg ') { prefix = 'chg ' }
	if (notNil prefix) {
		remaining = (list)
		for d searchRecents {
			if (not (beginsWith d prefix)) { add remaining d }
		}
		searchRecents = remaining
	}
	remove searchRecents desc
	addFirst searchRecents desc
	if ((count searchRecents) > 6) { removeLast searchRecents }
}

method searchLibIndex MicroBlocksScripter {
	// Answer the search index covering ALL embedded libraries, building it on
	// first use and rebuilding it when the language changes. Each entry is
	// (array matchWords libraryName blockSpec).

	lang = (language (authoringSpecs))
	if (and (notNil searchLibIndex)
		(lang == (first searchLibIndex))
		((blockSearchIncludesTags) == (at searchLibIndex 2))
		((devMode) == (at searchLibIndex 4)) // advanced sections are indexed only in developer mode
	) {
		return (at searchLibIndex 3)
	}
	entries = (list)
	if ('Browser' == (platform)) {
		for filePath (allFilesInDir this 'Libraries') {
			if (and (endsWith filePath '.ubl') (isNil (findSubstring 'Other/System' filePath))) {
				addLibraryToSearchIndex this entries (readFile filePath) filePath
			}
		}
	} else {
		for filePath (listEmbeddedFiles) {
			if (and (endsWith filePath '.ubl') (isNil (findSubstring 'Other/System' filePath))) {
				addLibraryToSearchIndex this entries (readEmbeddedFile filePath) filePath
			}
		}
	}
	searchLibIndex = (array lang (blockSearchIncludesTags) entries (devMode))
	return entries
}

method addLibraryToSearchIndex MicroBlocksScripter entries data filePath {
	if (isNil data) { return }
	cmdList = (parse (toString data))
	if (isEmpty cmdList) { return }
	cmd = (first cmdList)
	if ('module' != (primName cmd)) { return }
	libName = (first (argList cmd))
	if (not (isClass libName 'String')) { // unquoted name: mapped to (v 'name') by the parser
		libName = (first (argList libName))
	}
	if (beginsWith libName '_') { return } // skip implementation libraries
	cat = nil // the library's declared category determines its block color
	if ((count (argList cmd)) > 1) {
		cat = (at (argList cmd) 2)
		if (isClass cat 'Reporter') { cat = (first (argList cat)) } // unquoted category
	}
	if (isNil cat) { cat = 'Library' }
	// kit/board libraries import many dependencies, so they rank below component libraries
	isKit = (notNil (findSubstring 'Kits and Boards' filePath))
	// the library name (and its curated tags, when enabled) are extra match words
	extraWords = libName
	if (blockSearchIncludesTags) {
		for tcmd cmdList {
			if ('tags' == (primName tcmd)) {
				for tag (argList tcmd) {
					if (isClass tag 'Reporter') { tag = (first (argList tag)) } // unquoted tag
					extraWords = (join extraWords ' ' (toString tag))
				}
			}
		}
	}
	// walk the spec commands in palette order so that, as in the palette,
	// blocks after an 'advanced' marker are omitted unless developer mode is on
	specs = (parsedSpecs mbProject cmdList)
	seenOps = (dictionary)
	cmdCount = (count cmdList)
	i = 1
	while (i <= cmdCount) {
		cmd = (at cmdList i)
		if (and ('advanced' == (primName cmd)) (not (devMode))) {
			i = (cmdCount + 1) // skip this library's advanced section
		} ('spec' == (primName cmd)) {
			op = (at (argList cmd) 2)
			spec = (at specs op nil)
			if (and (notNil spec) (not (beginsWith op '_')) (not (contains seenOps op))) {
				add seenOps op
				add entries (array (blockSearchWords spec extraWords) libName spec cat isKit)
			}
		}
		i += 1
	}
}

// MicroBlocksBlockSearchBox
// An incremental search box for blocks and variables, opened with ctrl-space.
// Based on the GP runtime's BlockSearchBox, extended to match project variables,
// My Blocks and loaded-library blocks as well as built-in block specs, and to
// match translated block labels. Transient: it dismisses itself when a block is
// grabbed, when escape is pressed, or when it loses the keyboard focus.

defineClass MicroBlocksBlockSearchBox morph scripter searchText hintText menu searchIndex matches pendingSearch lastEditMSecs lastEditText

method morph MicroBlocksBlockSearchBox { return morph }

to newMicroBlocksBlockSearchBox aScripter {
	return (initialize (new 'MicroBlocksBlockSearchBox') aScripter)
}

method initialize MicroBlocksBlockSearchBox aScripter {
	scale = (global 'scale')
	scripter = aScripter
	morph = (newMorph this)
	setFPS morph 10 // debounced search runs from step (see textEdited)
	lastEditText = ''

	if (darkModeEnabled (findProjectEditor)) {
		bgColor = (microBlocksColor 'blueGray' 700)
		outlineColor = (microBlocksColor 'blueGray' 500)
		textColor = (gray 230)
		hintColor = (microBlocksColor 'blueGray' 400)
	} else {
		bgColor = (gray 240)
		outlineColor = (gray 150)
		textColor = (gray 30)
		hintColor = (gray 150)
	}

	boxW = (min (440 * scale) ((width (morph (global 'page'))) - (20 * scale))) // fit narrow screens
	bm = (newBitmap boxW (40 * scale))
	fillRoundedRect (newShapeMaker bm) (rect 0 0 (width bm) (height bm)) (8 * scale) bgColor (1 * scale) outlineColor outlineColor
	drawBitmap bm (searchIcon this) (12 * scale) (12 * scale) 130
	setCostume morph bm
	costumeChanged morph

	searchText = (newText)
	setFont searchText nil (20 * scale)
	setColor searchText textColor
	setEditRule searchText 'editable' // 'line' does not work; shift key is inserted as character
	setGrabRule (morph searchText) 'ignore'
	setPosition (morph searchText) (40 * scale) (8 * scale)
	addPart morph (morph searchText)

	hintText = (newText (localized 'search blocks and variables...'))
	setFont hintText nil (20 * scale)
	setColor hintText hintColor
	setGrabRule (morph hintText) 'ignore'
	setPosition (morph hintText) (40 * scale) (8 * scale)
	addPart morph (morph hintText)

	matches = (list)
	buildIndex this
	return this
}

method startEditing MicroBlocksBlockSearchBox {
	edit (keyboard (global 'page')) searchText 1
}

method handDownOn MicroBlocksBlockSearchBox hand {
	edit searchText hand
	return true
}

// search index
// Entries are (array matchWords kind payload) where matchWords is an uppercased
// array of words to match against, kind is 'var', 'varSet' or 'spec', and payload
// is the variable name or BlockSpec. Entry order determines result ranking:
// variables, then My Blocks, then built-in palette blocks, then loaded libraries.
// (Blocks from not-yet-loaded libraries are ranked last, by findMatches.)

method buildIndex MicroBlocksBlockSearchBox {
	searchIndex = (list)
	seenOps = (dictionary)
	proj = (project scripter)
	showHidden = (showHiddenBlocksEnabled (findProjectEditor))
	authoringSpecs = (authoringSpecs)

	// project variables: a reporter for each variable, plus single 'set' and
	// 'change' templates (as in the palette). The templates also match on any
	// variable name, and preload the variable matched by the query.
	visibleVars = (sorted (toArray (visibleVars scripter)) 'caseInsensitiveLessThan')
	allVarWords = (list)
	for varName visibleVars {
		varWords = (words (toUpperCase varName))
		add searchIndex (array varWords 'var' varName)
		addAll allVarWords varWords
	}
	setSpec = (specForOp authoringSpecs '=')
	if (notNil setSpec) {
		add searchIndex (array (join (blockSearchWords setSpec) (toArray allVarWords)) 'varSet' visibleVars)
	}
	changeSpec = (specForOp authoringSpecs '+=')
	if (notNil changeSpec) {
		add searchIndex (array (join (blockSearchWords changeSpec) (toArray allVarWords)) 'varChange' visibleVars)
	}

	// My Blocks (functions defined in this project)
	projectSpecs = (blockSpecs proj)
	for f (functions (main proj)) {
		op = (functionName f)
		if (and (not (contains seenOps op)) (or showHidden (not (beginsWith op '_')))) {
			add seenOps op
			spec = (at projectSpecs op nil)
			if (isNil spec) { spec = (specForOp authoringSpecs op) }
			if (isNil spec) { spec = (blockSpecFor f) }
			add searchIndex (array (blockSearchWords spec) 'spec' spec)
		}
	}

	// built-in blocks, mirroring the palette's visibility rules; the entries
	// are cached on the scripter because they only change with the language,
	// developer mode, or the show-hidden-blocks setting
	for entry (builtinSearchIndex scripter) {
		op = (blockOp (at entry 3))
		if (not (contains seenOps op)) {
			add seenOps op
			add searchIndex entry
		}
	}

	// blocks from loaded libraries; the library name and tags are extra match
	// words. As in the palette, blocks after an 'advanced' marker are omitted
	// unless developer mode is on.
	for libName (sorted (keys (libraries proj))) {
		lib = (at (libraries proj) libName)
		libWords = (moduleName lib)
		if (blockSearchIncludesTags) {
			for tag (tags lib) { libWords = (join libWords ' ' tag) }
		}
		ops = (blockList lib)
		opCount = (count ops)
		i = 1
		while (i <= opCount) {
			op = (at ops i)
			if (and ('advanced' == op) (not (devMode))) {
				i = (opCount + 1) // skip this library's advanced section
			} (and ('-' != op) ('advanced' != op)
				(not (contains seenOps op))
				(or showHidden (not (beginsWith op '_')))
			) {
				add seenOps op
				spec = (at projectSpecs op nil)
				if (isNil spec) { spec = (specForOp authoringSpecs op) }
				if (notNil spec) {
					add searchIndex (array (blockSearchWords spec libWords) 'spec' spec)
				}
			}
			i += 1
		}
	}
}

to blockSearchMaxRowHeight {
	// Tallest a single result row may be. Most blocks are one row, but a block
	// with a grid slot ('LED image') or a multi-line string default ('image')
	// can be three or more, and a handful of those fill the whole list. A plain
	// command block is about 31 * blockScale tall.

	return (62 * (blockScale)) // two rows
}

to blockSearchIncludesTags {
	// When true, a library's curated tags (e.g. 'tags servo motor rotation')
	// are included as search match words for that library's blocks. Set to
	// false to match on block labels and library names only.

	return true
}

to blockSearchWords spec extraWords {
	// Answer an uppercased array of words to match a block spec against:
	// the translated spec words, the original English spec words (when a
	// translation is active), plus any extra words (e.g. a library name).

	s = (first (specs (translateToCurrentLanguage (authoringSpecs) spec)))
	englishS = (first (specs spec))
	if (s != englishS) { s = (join s ' ' englishS) }
	if (notNil extraWords) { s = (join s ' ' extraWords) }
	return (toArray (copyWithout (words (toUpperCase s)) '_'))
}

method isVisibleBuiltinCategory MicroBlocksScripter cat {
	if (isNil cat) { return false }
	if ('cat;Variables' == cat) { return false } // variable blocks are added per-variable
	if (endsWith cat '-Advanced') { return (devMode) }
	// deriving visibility from the palette's own category list keeps the two
	// in lockstep; it also excludes the 'Prims-* (not in palette)'
	// legacy-rendering specs and 'Obsolete', which are not palette categories
	return (contains (categories this) cat)
}

method builtinSearchIndex MicroBlocksScripter {
	// Answer the search index entries for the built-in palette blocks,
	// building them on first use and rebuilding when the language or developer
	// mode changes. (Built-in blocks have no hidden variants, so the
	// show-hidden-blocks setting does not affect this index.)

	lang = (language (authoringSpecs))
	dev = (devMode)
	if (and (notNil searchBuiltinIndex)
		(lang == (at searchBuiltinIndex 1))
		(dev == (at searchBuiltinIndex 2))
	) {
		return (at searchBuiltinIndex 3)
	}
	entries = (list)
	seenOps = (dictionary)
	for entry (allSpecs (authoringSpecs)) {
		op = (at entry 2)
		if (not (contains seenOps op)) {
			if (isVisibleBuiltinCategory this (categoryFor (authoringSpecs) op)) {
				add seenOps op
				spec = (specForEntry (authoringSpecs) entry)
				add entries (array (blockSearchWords spec) 'spec' spec)
			}
		}
	}
	searchBuiltinIndex = (array lang dev entries)
	return entries
}

// incremental search

method textEdited MicroBlocksBlockSearchBox {
	s = (text searchText)
	if ('' == s) {
		lastEditText = ''
		pendingSearch = nil
		show (morph hintText)
		showRecents this
		return
	}
	if (s == (join lastEditText (newline))) {
		// enter key ('line' editRule does not work): the only change since the
		// last edit is a newline at the end. A pasted string that happens to
		// end with a newline does not match this test and is searched instead.
		runPendingSearch this // search text typed within the debounce interval
		if (and (menuIsOpen this) (notEmpty matches)) {
			// add the selected match to the scripts pane (a hand grab would
			// attach it to the pointer, which may be anywhere during keyboard use)
			idx = (indexOf (triggers menu) (getField menu 'selection'))
			if (or (isNil idx) (idx < 1)) { idx = 1 }
			if (idx > (count matches)) { idx = (count matches) }
			placeMatch this (at matches idx)
			return
		}
		setText searchText lastEditText // strip the newline
		return
	}
	if (notNil (findSubstring (newline) s)) {
		// newlines from pasted text are not the enter key; fold them into spaces
		s = (joinStrings (lines s) ' ')
		setText searchText s
	}
	hide (morph hintText)
	// debounce: rescanning the block index and re-rendering the results menu on
	// every keystroke lags on slow hosts (e.g. the browser IDE), so the search
	// runs from step once the user pauses typing
	lastEditText = s
	pendingSearch = s
	lastEditMSecs = (msecsSinceStart)
}

method runPendingSearch MicroBlocksBlockSearchBox {
	if (isNil pendingSearch) { return }
	s = pendingSearch
	pendingSearch = nil
	matches = (findMatches this s)
	showMatchesMenu this true
}

method findMatches MicroBlocksBlockSearchBox searchString {
	// Answer a list of result entries: (array 'block' aBlock) for blocks
	// available in the project and (array 'lib' libName spec) for blocks from
	// embedded libraries that are not loaded yet (grabbing one imports the
	// library). Prefix matches rank above substring-only matches.

	maxMatches = 10
	soughtWords = (words (toUpperCase searchString))
	if (isEmpty soughtWords) { return (list) }
	prefixEntries = (list)
	substringEntries = (list)
	i = 1
	indexCount = (count searchIndex)
	// stop scanning once enough prefix matches are found; later substring-only
	// matches could not displace them
	while (and (i <= indexCount) ((count prefixEntries) < maxMatches)) {
		entry = (at searchIndex i)
		if (allWordsMatch this soughtWords (at entry 1)) {
			add prefixEntries entry
		} (allWordsContained this soughtWords (at entry 1)) {
			add substringEntries entry
		}
		i += 1
	}
	result = (list)
	for entry (join prefixEntries substringEntries) {
		if ((count result) < maxMatches) {
			addBlocksForEntry this entry result soughtWords
		}
	}

	// blocks from embedded libraries that are not loaded yet;
	// kit/board libraries rank below component libraries
	remaining = (maxMatches - (count result))
	if (remaining < 1) { return result } // skip the library scan when already full
	proj = (project scripter)
	libMatches = (list)
	kitMatches = (list)
	libIndex = (searchLibIndex scripter)
	i = 1
	indexCount = (count libIndex)
	// stop scanning once enough component-library matches are found; kit
	// matches only fill leftover slots
	while (and (i <= indexCount) ((count libMatches) < remaining)) {
		entry = (at libIndex i)
		libName = (at entry 2)
		if (and
			(isNil (libraryNamed proj libName))
			(or
				(allWordsMatch this soughtWords (at entry 1))
				(allWordsContained this soughtWords (at entry 1)))
		) {
			if (true == (at entry 5)) {
				add kitMatches (array 'lib' libName (at entry 3) (at entry 4))
			} else {
				add libMatches (array 'lib' libName (at entry 3) (at entry 4))
			}
		}
		i += 1
	}
	for m (join libMatches kitMatches) {
		if ((count result) < maxMatches) { add result m }
	}
	return result
}

method addBlocksForEntry MicroBlocksBlockSearchBox entry result soughtWords {
	kind = (at entry 2)
	if ('var' == kind) {
		add result (array 'block' (toBlock (newReporter 'v' (at entry 3))))
	} ('varSet' == kind) {
		add result (array 'block' (toBlock (newCommand '=' (varForQuery this (at entry 3) soughtWords) 0)))
	} ('varChange' == kind) {
		add result (array 'block' (toBlock (newCommand '+=' (varForQuery this (at entry 3) soughtWords) 1)))
	} else {
		add result (array 'block' (blockForSpec (at entry 3)))
	}
}

method varForQuery MicroBlocksBlockSearchBox varNames soughtWords {
	// Answer the variable best matched by the query, or the first
	// variable, or the empty string (an empty variable dropdown).
	// An exact word match beats a prefix match beats a substring match,
	// so 'set x' preloads variable 'x' even when another variable (such
	// as 'offset') contains one of the query words as a substring.

	best = nil
	bestScore = 0
	for varName varNames {
		for w (words (toUpperCase varName)) {
			for sought soughtWords {
				score = 0
				if (sought == w) {
					score = 3
				} (beginsWith w sought) {
					score = 2
				} (notNil (findSubstring sought w)) {
					score = 1
				}
				if (score > bestScore) {
					bestScore = score
					best = varName
				}
			}
		}
	}
	if (notNil best) { return best }
	if (notEmpty varNames) { return (first varNames) }
	return ''
}

method allWordsMatch MicroBlocksBlockSearchBox soughtWords specWords {
	// Answer true if every sought word is a prefix of some word in specWords.

	for sought soughtWords {
		match = false
		for w specWords {
			if (beginsWith w sought) { match = true }
		}
		if (not match) { return false }
	}
	return true
}

method allWordsContained MicroBlocksBlockSearchBox soughtWords specWords {
	// Answer true if every sought word appears within some word in specWords.

	for sought soughtWords {
		match = false
		for w specWords {
			if (notNil (findSubstring sought w)) { match = true }
		}
		if (not match) { return false }
	}
	return true
}

// block selection menu

method showMatchesMenu MicroBlocksBlockSearchBox showNoMatch {
	if (notNil menu) { destroy (morph menu) }
	if (isEmpty matches) {
		if (true != showNoMatch) { return }
		menu = (menu nil this)
		setField menu 'returnFocus' searchText
		addItem menu 'no matches' nil nil nil true true // disabled item
		popUp menu (page morph) (left morph) (bottom morph) true // suppress focus
		return
	}
	menu = (menu nil this)
	setField menu 'returnFocus' searchText
	scale = (global 'scale')
	itemW = ((width morph) - (12 * scale)) // menu items span the box width

	// Render every row before adding any of them, so they can share a single
	// width. A row sized to its own block would put its library name at its own
	// right edge, and a block wider than the search box would then push its name
	// out past the names above it.
	rows = (list)
	for m matches {
		kind = (first m)
		if ('block' == kind) {
			b = (at m 2)
			fixLayout b
			add rows (array kind (resultCostume this b) nil (action 'grabBlock' this b))
		} ('lib' == kind) {
			libName = (at m 2)
			spec = (at m 3)
			b = (blockForSpec spec)
			// show the block in the color it will have once its library is loaded
			setField b 'color' (blockColorForCategory (authoringSpecs) (at m 4))
			setField b 'pathCache' nil
			fixLayout b
			add rows (array kind (resultCostume this b) (libraryLabel this libName)
				(action 'grabLibraryBlock' this libName spec))
		}
	}

	rowW = itemW
	for row rows {
		w = (width (at row 2))
		if (notNil (at row 3)) { w = ((w + (width (at row 3))) + (16 * scale)) }
		rowW = (max rowW w)
	}

	lastKind = nil
	for row rows {
		kind = (at row 1)
		if (and ('lib' == kind) ('block' == lastKind)) {
			addLine menu // divider between project blocks and library blocks
		}
		lastKind = kind
		addItem menu (rowCostume this (at row 2) (at row 3) rowW) (at row 4)
	}
	limitMenuToSpaceBelow this
	popUp menu (page morph) (left morph) (bottom morph) true // suppress focus
	selectFirstItem menu // highlight the first match; enter grabs it, arrows move
}

method limitMenuToSpaceBelow MicroBlocksBlockSearchBox {
	// The results menu pops up below the search box, but Menu sizes itself
	// against the whole page, so a tall result list is slid back up by
	// keepWithin until it covers the box. Cap it to the space that is actually
	// below the box; Menu then scrolls the overflow as it already does when a
	// menu is taller than the page.

	scale = (global 'scale')
	pageM = (morph (global 'page'))
	// 10 for the inset Page.showMenu keeps menus within, 2 for the menu border
	setMaxHeight menu ((floor ((bottom pageM) - (bottom morph))) - (12 * scale))
}

method resultCostume MicroBlocksBlockSearchBox aBlock {
	// Answer the bitmap for one result row, shrinking blocks that are taller
	// than blockSearchMaxRowHeight so that a few tall results cannot crowd out
	// the rest of the list.

	bm = (fullCostume (morph aBlock))
	maxH = (blockSearchMaxRowHeight)
	if ((height bm) <= maxH) { return bm }

	// Rebuild the block at a smaller blockScale, the same way a block picture is
	// exported (see exportAsImageScaled in Block.gp); scaling the finished bitmap
	// instead leaves the text and grid slots blurry. Rebuild from the block's own
	// spec, not from its expression: an expression is resolved back through the
	// authoring specs, and a block from a library that is not loaded yet has no
	// spec there, so it would come back as its bare op name in the wrong color.
	spec = (blockSpec aBlock)
	if (isNil spec) { return bm }
	oldBlockScale = (global 'blockScale')
	setGlobal 'blockScale' (oldBlockScale * (maxH / (height bm)))
	smaller = (blockForSpec spec)
	setField smaller 'color' (color aBlock)
	setField smaller 'pathCache' nil
	fixLayout smaller
	smallBM = (fullCostume (morph smaller))
	setGlobal 'blockScale' oldBlockScale
	if ((height smallBM) <= maxH) { return smallBM }

	// block layout does not scale quite linearly, so trim any remainder
	return (thumbnail smallBM (((width smallBM) * maxH) / (height smallBM)) maxH)
}

method libraryLabel MicroBlocksBlockSearchBox libName {
	// The gray library name shown on a result from a not-yet-loaded library.

	scale = (global 'scale')
	label = (newText libName 'Arial' (11 * scale) (gray 120))
	fixLayout label
	return (fullCostume (morph label))
}

method rowCostume MicroBlocksBlockSearchBox blockBM labelBM rowW {
	// Pad the block costume to rowW so all menu items (and their selection
	// highlight) span the same width, with the library name, if any, against
	// the right edge. Every row shares rowW, so the names line up in a column.

	scale = (global 'scale')
	if (and (isNil labelBM) ((width blockBM) >= rowW)) { return blockBM }
	wide = (newBitmap rowW (height blockBM))
	drawBitmap wide blockBM 0 0
	if (notNil labelBM) {
		drawBitmap wide labelBM (rowW - ((width labelBM) + (4 * scale))) (half (max 0 ((height blockBM) - (height labelBM))))
	}
	return wide
}

method menuIsOpen MicroBlocksBlockSearchBox {
	return (and (notNil menu) (notNil (owner (morph menu))))
}

method selectNextMatch MicroBlocksBlockSearchBox {
	// down arrow or tab while editing the search text
	if (and (menuIsOpen this) (notEmpty matches)) { selectNextItem menu }
}

method selectPreviousMatch MicroBlocksBlockSearchBox {
	// up arrow or shift-tab while editing the search text
	if (and (menuIsOpen this) (notEmpty matches)) { selectPreviousItem menu }
}

// recently grabbed blocks (shown when the search is empty)

method showRecents MicroBlocksBlockSearchBox {
	matches = (wrapAsBlockEntries this (recentBlocks this))
	showMatchesMenu this
}

method recentBlocks MicroBlocksBlockSearchBox {
	// Rebuild blocks for the recents list, skipping any that no longer
	// exist in the current project (deleted variables, unloaded libraries).

	result = (list)
	vars = (visibleVars scripter)
	for desc (searchRecents scripter) {
		if (beginsWith desc 'var ') {
			varName = (substring desc 5)
			if (contains vars varName) { add result (toBlock (newReporter 'v' varName)) }
		} (beginsWith desc 'set ') {
			varName = (substring desc 5)
			if (not (contains vars varName)) { varName = '' } // deleted or never set: empty dropdown
			add result (toBlock (newCommand '=' varName 0))
		} (beginsWith desc 'chg ') {
			varName = (substring desc 5)
			if (not (contains vars varName)) { varName = '' }
			add result (toBlock (newCommand '+=' varName 1))
		} (beginsWith desc 'op ') {
			spec = (specForSearchOp this (substring desc 4))
			if (notNil spec) { add result (blockForSpec spec) }
		}
	}
	return result
}

method wrapAsBlockEntries MicroBlocksBlockSearchBox blocks {
	result = (list)
	for b blocks { add result (array 'block' b) }
	return result
}

method specForSearchOp MicroBlocksBlockSearchBox op {
	for entry searchIndex {
		if (and ('spec' == (at entry 2)) (op == (blockOp (at entry 3)))) {
			return (at entry 3)
		}
	}
	return nil
}

method recentDescriptorFor MicroBlocksBlockSearchBox aBlock {
	expr = (expression aBlock)
	op = (primName expr)
	if ('v' == op) { return (join 'var ' (first (argList expr))) }
	if ('=' == op) { return (join 'set ' (first (argList expr))) }
	if ('+=' == op) { return (join 'chg ' (first (argList expr))) }
	return (join 'op ' op)
}

method grabBlock MicroBlocksBlockSearchBox aBlock {
	recordSearchRecent scripter (recentDescriptorFor this aBlock)
	dismiss this
	grabNewBlock this aBlock
}

method importedLibraryBlock MicroBlocksBlockSearchBox libName spec {
	// Import the (not yet loaded) library, dismissing the box first, and
	// answer a fresh block for the given spec (preferring the spec that the
	// import added to the project).

	recordSearchRecent scripter (join 'op ' (blockOp spec))
	dismiss this
	installLibraryNamed scripter libName
	saveAllChunksAfterLoad (smallRuntime)
	return (blockForSpec (at (blockSpecs (project scripter)) (blockOp spec) spec))
}

method grabLibraryBlock MicroBlocksBlockSearchBox libName spec {
	grabNewBlock this (importedLibraryBlock this libName spec)
}

method grabNewBlock MicroBlocksBlockSearchBox aBlock {
	// Attach the block to the pointer. Fresh blocks are at (0,0) and
	// grab keeps a morph's position, so move it to the hand first.

	scale = (global 'scale')
	h = (hand (global 'page'))
	fixLayout aBlock
	setPosition (morph aBlock) ((x h) - (10 * scale)) ((y h) - (10 * scale))
	grab h aBlock
}

method placeMatch MicroBlocksBlockSearchBox m {
	// Enter key: add the selected match to the scripts pane.

	if ('lib' == (first m)) {
		placeInScriptsPane this (importedLibraryBlock this (at m 2) (at m 3))
	} else {
		b = (at m 2)
		recordSearchRecent scripter (recentDescriptorFor this b)
		dismiss this
		placeInScriptsPane this b
	}
}

method placeInScriptsPane MicroBlocksBlockSearchBox aBlock {
	// Add the block to the scripts pane below the existing scripts and
	// scroll it into view (same placement as pasted scripts).

	sf = (scriptsFrame scripter)
	fixLayout aBlock
	setPosition (morph aBlock) ((left (morph (contents sf))) + (100 * (global 'scale'))) ((scriptsBottom scripter) + (30 * (blockScale)))
	addPart (morph (contents sf)) (morph aBlock)
	if (implements (contents sf) 'recordDrop') {
		// as when dropping a block on the pane, so that undo removes it
		// (script editors with snapshot-based undo do not need this)
		recordDrop (contents sf) aBlock
	}
	scriptChanged scripter
	scrollIntoView sf (fullBounds (morph aBlock)) true
}

// lifecycle

method cancelled MicroBlocksBlockSearchBox anObject {
	// escape key was pressed while editing the search text
	dismiss this
}

method step MicroBlocksBlockSearchBox {
	// run the debounced search once the user has paused typing
	if (and (notNil pendingSearch) (((msecsSinceStart) - lastEditMSecs) >= 150)) {
		runPendingSearch this
	}

	f = (focus (keyboard (global 'page')))
	focusedOnMe = (or (f == searchText) (and (isClass f 'Caret') (searchText == (target f))))

	// reopen the results if the menu was closed while the box kept the focus
	// (clicking in the search text closes it as an "unclicked" menu)
	if (and focusedOnMe (isNil pendingSearch) (not (menuIsOpen this))) {
		s = (text searchText)
		if ('' != s) {
			matches = (findMatches this s)
			showMatchesMenu this true
		} (notEmpty (searchRecents scripter)) {
			showRecents this
		}
	}

	// dismiss when the keyboard focus has moved elsewhere and the menu is gone
	if (and (not focusedOnMe) (not (menuIsOpen this))) { dismiss this }
}

method dismiss MicroBlocksBlockSearchBox {
	destroy morph // destroyedMorph releases the keyboard and the results menu
}

method destroyedMorph MicroBlocksBlockSearchBox {
	// release the keyboard and the results menu; this also covers the box
	// being destroyed by other code, which would otherwise leave the keyboard
	// focus on a caret targeting the destroyed search text and so disable all
	// global keyboard shortcuts
	kb = (keyboard (global 'page'))
	f = (focus kb)
	if (or (f == searchText) (and (isClass f 'Caret') (searchText == (target f)))) {
		stopEditing kb
	}
	if (menuIsOpen this) { destroy (morph menu) }
	menu = nil
}

// magnifying glass icon

method searchIcon MicroBlocksBlockSearchBox {
	icon = (newBitmap 30 30)
	p = (newVectorPen icon)
	beginPath p 12 3
	turn p 360 9
	stroke p (gray 150) 3
	beginPath p 19 18
	setHeading p 45
	forward p 13
	stroke p (gray 150) 3
	if (2 != (global 'scale')) {
		icon = (scaleAndRotate icon ((global 'scale') / 2))
	}
	return icon
}
