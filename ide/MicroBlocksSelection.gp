// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2023 John Maloney, Bernat Romagosa, and Jens Mönig

// MicroBlocksSelection.gp - Selection rectangle, to deal with several scripts
//							 at the same time

// Bernat Romagosa, February, 2023

// MicroBlocksSelection

to startSelecting aScripter aHand {
	(initialize (new 'MicroBlocksSelection' aScripter (rect (x aHand) (y aHand))) aHand)
	savePosition aHand
}

to cancelSelection {
	notify (api (smallRuntime)) 'dragend'
	editor = (findMicroBlocksEditor)
	if (isNil editor) { return }
	scripter = (scripter editor)
	for p (allMorphs (morph (scriptEditor scripter))) {
		if (isClass (handler p) 'Block') { unselect (handler p) }
	}
	for p (parts (morph scripter)) {
		if (isClass (handler p) 'MicroBlocksSelection') { destroy (handler p) }
	}
	setSelection scripter nil
}

defineClass MicroBlocksSelection scripter rectangle morph blocks selecting

method initialize MicroBlocksSelection aHand {
	cancelSelection
	setSelection scripter this
	selecting = true

	blocks = (list)
	morph = (newMorph this)
	addPart (morph scripter) morph

	focusOn aHand this

	notify (api (smallRuntime)) 'dragstart'

	return this
}

method destroy MicroBlocksSelection {
	selecting = false
	notify (api (smallRuntime)) 'dragend'
	destroy morph
}

// mouse events

method handMoveFocus MicroBlocksSelection aHand {
	updateSelection this aHand
	return true
}

method handUpOn MicroBlocksSelection aHand {
	endSelection this
	return true
}

method handMoveOver MicroBlocksSelection aHand {
	updateSelection this aHand
	return true
}

// selecting

method updateSelection MicroBlocksSelection aHand {
	if selecting {
		setLeft rectangle (min (oldX aHand) (x aHand))
		setTop rectangle (min (oldY aHand) (y aHand))
		setWidth rectangle (abs ((x aHand) - (oldX aHand)))
		setHeight rectangle (abs ((y aHand) - (oldY aHand)))
		intersect rectangle (bounds (morph (scriptsFrame scripter)))
		highlightBlocksInside this
	}
	fixLayout this
}

method highlightBlocksInside MicroBlocksSelection {
	if ((area rectangle) > 1) {
		for p (allMorphs (morph (scriptEditor scripter))) {
			if (isClass (handler p) 'Block') {
				tb = (topBlock (handler p))
				if (intersects rectangle (bounds p)) {
					select tb
				} else {
					unselect tb
				}
			}
		}
	}
}

method endSelection MicroBlocksSelection {
	if ((area rectangle) > 1) {
		for p (allMorphs (morph (scriptEditor scripter))) {
			if (isClass (handler p) 'Block') {
				if (intersects rectangle (bounds p)) {
					tb = (topBlock (handler p))
					if (not (contains blocks tb)) {
						add blocks tb
						select tb
					}
				}
			}
		}
	}
	selecting = false
	destroy this
}

method toggleAddBlock MicroBlocksSelection aBlock {
	tb = (topBlock aBlock)
	if (contains blocks tb) {
		removeBlock this tb
	} else {
		addBlock this tb
	}
}

method addBlock MicroBlocksSelection aBlock {
	add blocks aBlock
	select aBlock
}

method removeBlock MicroBlocksSelection aBlock {
	remove blocks aBlock
	unselect aBlock
}

// debugging

method toString MicroBlocksSelection {
	return (join 'selection: ' (toString blocks))
}

// drawing

method fixLayout MicroBlocksSelection {
	setExtent morph (width rectangle) (height rectangle)
	setPosition morph (left rectangle) (top rectangle)
}

method drawOn MicroBlocksSelection ctx {
	fillRect ctx (color 0 128 0 50) (left rectangle) (top rectangle) (width rectangle) (height rectangle) 1
}

// testing

method notEmpty MicroBlocksSelection { return (notEmpty blocks) }

method contains MicroBlocksSelection aBlock {
	return (contains blocks (topBlock aBlock))
}

method containsDefinitions MicroBlocksSelection {
	for block blocks { if (isPrototypeHat block) { return true } }
	return false
}

method containsBlocks MicroBlocksSelection {
	for block blocks { if (not (isPrototypeHat block)) { return true } }
	return false
}

// actions

method contextMenu MicroBlocksSelection isBlockDefinition {
	items = (list)
	if (isNil isBlockDefinition) { isBlockDefinition = false }
	if isBlockDefinition {
		add items (array 'drag selection' (action 'dragBlocks' this))
		add items (array 'hide block definition' (action 'hideBlockDefinitions' this))
	} else {
		add items (array 'run selected' (action 'startProcesses' this))
		add items (array 'stop selected' (action 'stopProcesses' this))
		add items (array 'toggle selected' (action 'toggleProcesses' this))
		add items '-'
		add items (array 'copy selection' (action 'copyBlocks' this))
		add items (array 'duplicate selection' (action 'duplicateBlocks' this))
		add items (array 'drag selection' (action 'dragBlocks' this))
		add items '-'
		add items (array 'delete selection' (action 'deleteBlocks' this))
	}
	menuFor (api (smallRuntime)) items
	return nil
}

method copyBlocks MicroBlocksSelection {
	morphs = (list)
	for block blocks { add morphs (morph block) }
	setClipboard (join
		'GP Scripts' (newline)
		(exportScripts
			(newMicroBlocksExchange)
			scripter
			morphs
			(left rectangle)
			(top rectangle)
		)
	)
	cancelSelection
}

method deleteBlocks MicroBlocksSelection {
	for block blocks {
		removeFromOwner (morph block)
		destroy (morph block)
	}
	scriptChanged scripter
	cancelSelection
}

method stopProcesses MicroBlocksSelection {
	runtime = (smallRuntime)
	for block blocks {
		if (isRunning runtime block) {
			stopRunningChunk runtime (lookupChunkID runtime block)
		}
	}
	cancelSelection
}

method startProcesses MicroBlocksSelection {
	runtime = (smallRuntime)
	for block blocks {
		if (not (isRunning runtime block)) {
			evalOnBoard runtime block
		}
	}
	cancelSelection
}

method toggleProcesses MicroBlocksSelection {
	runtime = (smallRuntime)
	for block blocks {
		if (isRunning runtime block) {
			stopRunningChunk runtime (lookupChunkID runtime block)
		} else {
			evalOnBoard runtime block
		}
	}
	cancelSelection
}

method duplicateBlocks MicroBlocksSelection {
	cancelSelection
	contents = (initialize (new 'MicroBlocksSelectionContents') blocks true scripter)
	grab (hand (global 'page')) contents
}

method dragBlocks MicroBlocksSelection {
	cancelSelection
	if ((count blocks) == 1) {
		grab (hand (global 'page')) (first blocks)
	} else {
		contents = (initialize (new 'MicroBlocksSelectionContents') blocks false scripter)
		grab (hand (global 'page')) contents
	}
}

method hideBlockDefinitions MicroBlocksSelection {
	cancelSelection
	pe = (findProjectEditor)
	if (isNil pe) { return }
	for b blocks {
		proto = (editedPrototype b)
		if (notNil proto) { hideDefinition (scripter pe) (functionName (function proto)) }
	}
}

defineClass MicroBlocksSelectionContents morph

method initialize MicroBlocksSelectionContents someBlocks duplicating aScripter {
	morph = (newMorph this)
	for block someBlocks {
		// prevent block definition header parameters from being duplicated as rogue variables
		if (not (isClass (handler (owner (morph block))) 'BlockSectionDefinition')) {
			if duplicating {
				addPart morph (morph (duplicate block))
			} else {
				addPart morph (morph block)
			}
		}
	}
	addPart (morph (scriptEditor aScripter)) morph // just so it can be animated back to its owner
	return this
}

method justDropped MicroBlocksSelectionContents aHand {
	droppedInto = (owner morph)
	if (isClass (handler droppedInto) 'ScriptEditor') {
		for blockMorph (parts morph) {
			addPart droppedInto blockMorph
		}
		removeFromOwner morph
		scripter = (scripter (findProjectEditor))
		saveScripts scripter
		restoreScripts scripter
		scriptChanged scripter
	}
}

method destroy MicroBlocksSelectionContents {
	removeFromOwner morph
	destroy morph
}

method morph MicroBlocksSelectionContents { return morph }
