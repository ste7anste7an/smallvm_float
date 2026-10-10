// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// MicroBlocksFirmwareInstaller.gp - Support for installing MicroBlocks firmware
// John Maloney, June, 2026

defineClass MicroBlocksFirmwareInstaller boardType boardMenu espBoards dfuBoards

method initialize MicroBlocksFirmwareInstaller {
	boardType = (checkBoardType (smallRuntime))
	boardMenu = (array
		'micro:bit'
		'Calliope'
		'-'
		'Citilab ED1'
		'CoCube'
		'Databot'
		'Databot v3'
		'ESP32 STEAMakers'
		'KidsBits'
		'micro:STEAMakers'
		'STEAMakers AI'
		'Springbot'
		'-'
		'RP2040 (Pico or Pico W)'
		'MakerPort'
		'-'
		'WeAct STM32H743'
		'DUELink'
		'-'
		'ESP32')
	espBoards = (array
		'Citilab ED1' 'CoCube' 'Databot' 'Databot v3' 'ESP32' 'micro:STEAMakers'
		'ESP32 STEAMakers' 'STEAMakers AI' 'KidsBits' 'CodingBox' 'KidsIOT'
		'Springbot' 'Springbot Green' 'Springbot Gold')
	dfuBoards = (array
		'WeAct STM32H743' 'DUELink' 'CincoBit' 'PixoBit' 'Clipit' 'DueSTEM' 'Ghizzy' 'Holiday Tree')
}

// Helper Functions

method closePort MicroBlocksFirmwareInstaller {
	setPort (smallRuntime) 'disconnect'
}

method isUpdatableBoard MicroBlocksFirmwareInstaller boardName {
	initialize this
	if (isOneOf boardName 'micro:bit v2' 'Calliope v3' 'RP2040') { return true } // variants
	return (or
		(contains boardMenu boardName)
		(contains espBoards boardName)
		(contains dfuBoards boardName))
}

method presentBoardTypeMenu MicroBlocksFirmwareInstaller eraseFlashFlag {
	items = (list)
	for item boardMenu {
		if (or (not eraseFlashFlag) (contains espBoards item)) {
			add items (array item)
		}
	}
	menuFor (api (smallRuntime)) items (action 'installBoardFromMenu' this eraseFlashFlag)
}

// Browser Virtual Machine Intaller

method installVM MicroBlocksFirmwareInstaller eraseFlashFlag {
	initialize this
	closeAllDialogs (findMicroBlocksEditor)
	if (isOneOf boardType 'micro:bit' 'micro:bit v2') {
		installHexOrUF2File this 'micro:bit' false
	} (isOneOf boardType 'Calliope' 'Calliope v3') {
		installHexOrUF2File this 'Calliope' false
	} ('MakerPort' == boardType) {
		installHexOrUF2File this 'MakerPort' false
	} (isOneOf boardType 'RP2040' 'Pico W') {
		installHexOrUF2File this 'RP2040 (Pico or Pico W)' false
	} (contains dfuBoards boardType) {
		installDFUFirmware this boardType
	} (and
		(contains espBoards boardType)
		(confirm (global 'page') nil (join (localized 'Use board type ') boardType '?'))) {
			flashVM this boardType eraseFlashFlag
	} else {
		presentBoardTypeMenu this eraseFlashFlag
	}
}

method installDFUFirmware MicroBlocksFirmwareInstaller boardName {
		closePort this
		browserDfuUpload boardName
}

method installBoardFromMenu MicroBlocksFirmwareInstaller eraseFlashFlag boardName {
	if (beginsWith 'Springbot' boardName) {
		flashVM this 'Springbot' eraseFlashFlag
	} (contains espBoards boardName) {
		flashVM this boardName eraseFlashFlag
	} (contains dfuBoards boardName) {
		installDFUFirmware this boardName
	} else {
		installHexOrUF2File this boardName true
	}
}

method installHexOrUF2File MicroBlocksFirmwareInstaller boardName fromMenu {
	if (not fromMenu) {
		if (not (confirm (global 'page') nil (join (localized 'Use board type ') boardType '?'))) {
			presentBoardTypeMenu this false
			return
		}
	}
	if (or ('micro:bit' == boardName) ('micro:bit v2' == boardName)) {
		vmFileName = 'vm_microbit-universal.hex'
		driveName = 'MICROBIT'
	} (or ('Calliope' == boardName) ('Calliope v3' == boardName)) {
		vmFileName = 'vm_calliope-universal.hex'
		driveName = 'MINI'
	} ('Circuit Playground Express' == boardName) {
		vmFileName = 'vm_circuitplay.uf2'
		driveName = 'CPLAYBOOT'
	} ('Circuit Playground Bluefruit' == boardName) {
		vmFileName = 'vm_cplay52.uf2'
		driveName = 'CPLAYBTBOOT'
	} ('Clue' == boardName) {
		vmFileName = 'vm_clue.uf2'
		driveName = 'CLUEBOOT'
	} ('MakerPort' == boardName) {
		vmFileName = 'vm_makerport.uf2'
		driveName = 'MAKERBOOT'
	} ('RP2040 (Pico or Pico W)' == boardName) {
		vmFileName = 'vm_pico_w.uf2'
		driveName = 'RPI-RP2'
	} else {
		return // unknown board
	}

	prefix = ''
	if (endsWith vmFileName '.uf2') {
		if ('RPI-RP2' == driveName) {
			// Extra instruction for RP2040 Pico
			prefix = (join
				prefix
				(localized 'Connect USB cable while holding down the white BOOTSEL button before proceeding.')
				(newline) (newline))
		} ('MAKERBOOT' == driveName) {
			// Extra instruction for MakerPort
			prefix = (join
				prefix
				(localized 'Press the reset button on the board twice before proceeding.')
				(newline) (newline))
		} else {
			// Extra instruction for Adafruit boards
			prefix = (join
				prefix
				(localized 'Press the reset button on the board twice before proceeding. The NeoPixels should turn green.')
				(newline) (newline))
		}
	}

	vmData = (readFile (join 'precompiled/' vmFileName) true)
	if (isNil vmData) { return } // could not read file

	// disconnect before updating VM; avoids micro:bit autoconnect issue on Chromebooks
	closePort this
	updateIndicator (findMicroBlocksEditor)

	if (endsWith vmFileName '.hex') {
		// for micro:bit & calliope, filename must be less than 9 letter before the extension
		filePart = (filePart vmFileName)
		vmFileName = (join (substring filePart 1 (min 9 (count filePart))) '.hex')
	}

	msg = (join prefix (localized 'Save the firmware file when prompted.'))
	response = (inform msg (localized 'Firmware Install'))
	if (isNil response) { return } // user aborted

	browserWriteFile vmData vmFileName 'vmInstall'
	waitMSecs 1000 // leave time for file to get written before showing next prompt

	inform (localized 'Drag the firmware file you just saved to the %1 drive.' driveName)
	waitMSecs 1000 // leave time for file dialog box to appear before showing next prompt

	if (endsWith vmFileName '.uf2') {
		if (or ('MAKERBOOT' == driveName) ('RPI-RP2' == driveName)) {
			reconnectMessage this
		} else {
			adaFruitReconnectMessage this
		}
	} else {
		reconnectMessage this
	}
}

method adaFruitReconnectMessage MicroBlocksFirmwareInstaller {
	msg = (join
		(localized 'When the NeoPixels turn off') ', '
		(localized 'reconnect to the board by clicking the "Connect" button.'))
	inform msg
}

method reconnectMessage MicroBlocksFirmwareInstaller {
	title = (localized 'Firmware Installed')
	msg = (localized 'Reconnect to the board by clicking the "Connect" button.')
	inform (global 'page') msg title nil true
}

// Espressif board flashing

method flashVM MicroBlocksFirmwareInstaller boardName eraseFlashFlag {
	portName = 'webserial'
	closePort this // close serial port to avoid interaction with install process
	flasher = (newFlasher boardName portName eraseFlashFlag false)
	installBuiltinFirmware flasher boardName
}

// Install ESP firmware from file

method installESPFirmwareFromFile MicroBlocksFirmwareInstaller fileName data {
	portName = (getField (smallRuntime) 'portName')
	closePort this // close serial port to avoid interaction with install process
	flasher = (newFlasher fileName portName false false)
	installFromData flasher fileName data
}

// Install ESP firmware from URL

method installESPFirmwareFromURL MicroBlocksFirmwareInstaller {
	defaultURL = ''
	if ('Databot' == boardType) {
		defaultURL = 'http://microblocks.fun/downloads/databot/databot2.0_V2.18.bin'
	}
	url = (trim (freshPrompt (global 'page') 'ESP32 firmware URL?' defaultURL))
	if ('' == url) { return }
	flashESPFirmwareFromURL this boardName url
}

method installESPFirmwareFromRepo MicroBlocksFirmwareInstaller {
	if (isPilot (findMicroBlocksEditor)) {
		version = 'pilot'
	} else {
		ideVersion = (ideVersion (smallRuntime))
		version = (join 'v' ideVersion)
	}
	if (endsWith version '-pilot') {
		version = (substring version 1 ((count version) - 6))
	}

	// get list firmware files
	setCursor 'wait'
	html = (basicHTTPGet 'microblocks.fun' (join '/downloads/' version '/vm/'))
	setCursor 'normal'

	items = (list)
	for line (lines html) {
		if (beginsWith line '<a href="vm_') {
			binIndex = (findSubstring '.bin' line)
			if (binIndex > 0) { // it is an ESP firmware
				boardName = (substring line 13 (binIndex - 1))
				url = (join 'http://microblocks.fun/downloads/' version '/vm/vm_' boardName '.bin')
				add items (array boardName (action 'flashESPFirmwareFromURL' this boardName url))
			}
		}
	}
	menuFor (api (smallRuntime)) items
}

method flashESPFirmwareFromURL MicroBlocksFirmwareInstaller boardName url {
	portName = (getField (smallRuntime) 'portName')
	closePort this // close serial port to avoid interaction with install process
	flasher = (newFlasher boardName portName false false)
	installFromURL flasher url
}
