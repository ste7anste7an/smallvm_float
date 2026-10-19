// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// mb-firmware.js - Installing the MicroBlocks firmware (the VM) on a board
// Sam McHardy, September 2026

const MB_Firmware = {
	boardMenu: [
		'micro:bit', 'Calliope', '-',
		'Citilab ED1', 'CoCube', 'Databot', 'Databot v3', 'Springbot', '-',
		'KidsBits', 'ESP32 STEAMakers', 'micro:STEAMakers', 'STEAMakers AI', '-',
		'RP2040 (Pico or Pico W)', 'MakerPort', '-',
		'WeAct STM32H743', 'DUELink', '-',
		'ESP32'],
	espBoards: [
		'Citilab ED1', 'CoCube', 'Databot', 'Databot v3', 'ESP32', 'micro:STEAMakers',
		'ESP32 STEAMakers', 'STEAMakers AI', 'KidsBits', 'CodingBox', 'KidsIOT',
		'Springbot', 'Springbot Green', 'Springbot Gold'],
	dfuBoards: [
		'WeAct STM32H743', 'DUELink', 'CincoBit', 'PixoBit', 'Clipit', 'DueSTEM', 'Ghizzy', 'Holiday Tree'],

	// Boards installed by saving a file for the user to drag to the board's drive.
	hexOrUF2Files: {
		'micro:bit': ['vm_microbit-universal.hex', 'MICROBIT'],
		'Calliope': ['vm_calliope-universal.hex', 'MINI'],
		'Circuit Playground Express': ['vm_circuitplay.uf2', 'CPLAYBOOT'],
		'Circuit Playground Bluefruit': ['vm_cplay52.uf2', 'CPLAYBTBOOT'],
		'Clue': ['vm_clue.uf2', 'CLUEBOOT'],
		'MakerPort': ['vm_makerport.uf2', 'MAKERBOOT'],
		'RP2040 (Pico or Pico W)': ['vm_pico_w.uf2', 'RPI-RP2'],
	},
	// Board types a connected board reports that share a firmware file with another board.
	boardVariants: {
		'micro:bit v2': 'micro:bit',
		'Calliope v3': 'Calliope',
		'RP2040': 'RP2040 (Pico or Pico W)',
		'Pico W': 'RP2040 (Pico or Pico W)',
	},
};

// Board model

MB_Firmware.hexOrUF2File = function (boardName) {
	// Return [firmware file, drive name] for a board installed by file download, or null.
	const name = this.boardVariants[boardName] || boardName;
	return this.hexOrUF2Files[name] || null;
}

MB_Firmware.installMethod = function (boardType) {
	// Return how installVM installs a connected board of the given type:
	// { method: 'hexOrUF2' | 'dfu' | 'esp' | 'menu', board: name or null }.
	// The Adafruit boards are reached only from the menu.
	const name = this.boardVariants[boardType] || boardType;
	if (['micro:bit', 'Calliope', 'MakerPort', 'RP2040 (Pico or Pico W)'].includes(name)) {
		return { method: 'hexOrUF2', board: name };
	}
	if (this.dfuBoards.includes(boardType)) return { method: 'dfu', board: boardType };
	if (this.espBoards.includes(boardType)) return { method: 'esp', board: boardType };
	return { method: 'menu', board: null };
}

// Firmware files

MB_Firmware.fetchVM = async function (vmFileName) {
	// Answer the bytes of the named firmware file from the precompiled folder beside the page, or null.
	try {
		const response = await fetch('precompiled/' + vmFileName);
		if (response.ok) return new Uint8Array(await response.arrayBuffer());
	} catch (error) {
		// a page that cannot reach the file rejects rather than answering 404
	}
	return null;
}

MB_Firmware.saveFile = async function (data, fileName) {
	// Save through the browser's save dialog, which can save straight to the board's drive,
	// or as a download where there is no dialog. Answer false if the user cancelled.
	let handle = null;
	if (this.hasSaveDialog()) {
		const ext = fileName.slice(fileName.lastIndexOf('.'));
		try {
			handle = await window.showSaveFilePicker({
				suggestedName: fileName, id: 'vmInstall',
				types: [{ accept: { 'application/octet-stream': [ext] } }] });
		} catch (error) {
			if ('AbortError' == error.name) return false;
			// otherwise the dialog was refused, e.g. for want of a user gesture: download instead
		}
	}
	if (handle) {
		const writable = await handle.createWritable();
		await writable.write(new Blob([data]));
		await writable.close().catch(() => {});
		return true;
	}
	MB_editor.saveDataAsFile(data, fileName);
	return true;
}

MB_Firmware.hasSaveDialog = function () {
	return (typeof window !== 'undefined') && (typeof window.showSaveFilePicker === 'function');
}

// Installing

MB_Firmware.isUpdatableBoard = function (boardType) {
	// Whether the IDE may offer to update this board's firmware.
	if (['micro:bit v2', 'Calliope v3', 'RP2040'].includes(boardType)) return true; // variants
	return this.boardMenu.includes(boardType) || this.espBoards.includes(boardType) ||
		this.dfuBoards.includes(boardType);
}

MB_Firmware.installVM = async function (eraseFlashFlag) {
	// Install the firmware for the connected board, or ask which board it is.
	const boardType = MB_connection.boardType;
	const install = this.installMethod(boardType);
	if ('hexOrUF2' == install.method) {
		await this.installHexOrUF2File(install.board, false);
	} else if ('dfu' == install.method) {
		this.installDFUFirmware(boardType);
	} else if (('esp' == install.method) &&
			(await MB_editor.confirm(localized('Use board type ') + boardType + '?'))) {
		await this.flashVM(boardType, eraseFlashFlag);
	} else {
		this.presentBoardTypeMenu(eraseFlashFlag);
	}
}

MB_Firmware.presentBoardTypeMenu = function (eraseFlashFlag) {
	// Erasing Flash is for ESP boards, so the erase menu offers only those.
	const items = [];
	for (const item of this.boardMenu) {
		if (!eraseFlashFlag || this.espBoards.includes(item)) {
			items.push(('-' == item) ? '-' : [item, () => this.installBoardFromMenu(item, eraseFlashFlag)]);
		}
	}
	chromeMenuFor(world, items);
}

MB_Firmware.installBoardFromMenu = function (boardName, eraseFlashFlag) {
	if (boardName.startsWith('Springbot')) {
		this.flashVM('Springbot', eraseFlashFlag);
	} else if (this.espBoards.includes(boardName)) {
		this.flashVM(boardName, eraseFlashFlag);
	} else if (this.dfuBoards.includes(boardName)) {
		this.installDFUFirmware(boardName);
	} else if (this.hexOrUF2File(boardName)) {
		this.installHexOrUF2File(boardName, true);
	} else {
		this.notSupportedYet(boardName);
	}
}

MB_Firmware.notSupportedYet = function (boardName) {
	MB_editor.inform(localized('Installing firmware on this board is not supported yet in this version of MicroBlocks') +
		(boardName ? ': ' + boardName : '') + '.');
}

MB_Firmware.installHexOrUF2File = async function (boardName, fromMenu) {
	// Save the firmware file and tell the user to drag it to the board's drive.
	const boardType = MB_connection.boardType;
	if (!fromMenu && !(await MB_editor.confirm(localized('Use board type ') + boardType + '?'))) {
		this.presentBoardTypeMenu();
		return;
	}
	let [vmFileName, driveName] = this.hexOrUF2File(boardName);

	let prefix = '';
	if (vmFileName.endsWith('.uf2')) {
		if ('RPI-RP2' == driveName) {
			prefix = localized('Connect USB cable while holding down the white BOOTSEL button before proceeding.');
		} else if ('MAKERBOOT' == driveName) {
			prefix = localized('Press the reset button on the board twice before proceeding.');
		} else {
			prefix = localized('Press the reset button on the board twice before proceeding. The NeoPixels should turn green.');
		}
		prefix += '\n\n';
	}

	const vmData = await this.fetchVM(vmFileName);
	if (!vmData) {
		MB_editor.inform(localized('Could not find the firmware file %1.').replace('%1', 'precompiled/' + vmFileName));
		return;
	}

	// disconnect before updating the VM; avoids a micro:bit autoconnect issue on Chromebooks
	MB_connection.disconnect();

	if (vmFileName.endsWith('.hex')) {
		// the micro:bit and Calliope drives need a name of at most 9 letters before the extension
		vmFileName = vmFileName.slice(0, -4).slice(0, 9) + '.hex';
	}

	const title = localized('Firmware Install');
	const saveMsg = this.hasSaveDialog() ?
		localized('Save the firmware file when prompted.') :
		localized('The firmware file will be saved to your downloads folder.');
	if (!(await MB_editor.informAndWait(prefix + saveMsg, title))) return;
	if (!(await this.saveFile(vmData, vmFileName))) return;
	await MB_editor.informAndWait(localized('Drag the firmware file you just saved to the %1 drive.').replace('%1', driveName));

	if (vmFileName.endsWith('.uf2') && !['MAKERBOOT', 'RPI-RP2'].includes(driveName)) {
		await MB_editor.informAndWait(localized('When the NeoPixels turn off') + ', ' +
			localized('reconnect to the board by clicking the "Connect" button.'));
	} else {
		await MB_editor.informAndWait(localized('Reconnect to the board by clicking the "Connect" button.'),
			localized('Firmware Installed'));
	}
}

// DFU boards

MB_Firmware.installDFUFirmware = function (boardName) {
	// DFUpload asks the user to put the board in DFU mode and flashes it over WebUSB.
	MB_connection.disconnect();
	DFUpload.flashBoard(boardName);
}

// ESP boards

MB_Firmware.flashVM = async function (boardName, eraseFlashFlag) {
	// Install the firmware on an ESP board through the chip's ROM boot loader.
	MB_connection.disconnect(); // so the board's messages do not interfere with the install
	this.showSpinner();
	const port = await this.openESPPort();
	if (!port) {
		fireIDEEvent('spinner.hide');
		MB_editor.inform(localized('Could not open serial port'));
		return;
	}
	this.showSpinner();
	const espTool = new MB_ESPTool(port);
	// the spinner shows the install's progress twice a second
	const ticker = setInterval(() => fireIDEEvent('spinner.setTitle', espTool.status), 500);
	const vmData = await this.fetchVM(MB_ESPTool.vmNameForBoard(boardName));
	const ok = await espTool.installFirmware(boardName, eraseFlashFlag, vmData);
	clearInterval(ticker);
	// the board must be reconnected through the port chooser after an install
	await port.serialDisconnect();
	if (ok) {
		MB_editor.informAndWait(localized('Reconnect to the board by clicking the "Connect" button.'),
			localized('Firmware Installed'));
	} else if ('noResponse' == espTool.failure) {
		MB_editor.informAndWait(localized('The board is not responding.'), localized('Firmware Install'));
	} else {
		MB_editor.informAndWait(localized('The firmware install did not finish.'), localized('Firmware Install'));
	}
}

MB_Firmware.showSpinner = function () {
	fireIDEEvent('spinner.show', { title: '', subtitle: 'Do not switch browser tabs!',
		note: '(press ESC to cancel)', percent: 0 });
}

MB_Firmware.openESPPort = async function () {
	// Answer an open MB_CommPort for the install, or null. Opening a port needs a
	// user gesture, which the answer to this question provides.
	if (!(await MB_editor.confirm(localized('Open port?')))) return null;
	const port = new MB_CommPort();
	await port.serialConnect();
	return port.isConnected() ? port : null;
}
