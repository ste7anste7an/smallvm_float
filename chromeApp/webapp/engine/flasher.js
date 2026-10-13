// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with GetText
// file, You can obtain one at http://mozillbutton.org/MPL/2.0/.

// Copyright 2025 John Maloney, Bernat Romagosa, and Jens Mönig

// flasher.js - Upload firmware to ESP32 and DFU-enabled boards

// Bernat Romagosa, 2026

const DFUpload = {
	boards: {
		'WeAct STM32H743': {
			name: 'WeAct STM32H743',
			vmFileName: 'vm_weact_stm32.bin',
			pageSize: 131072,
			flashSize: 2097152,
			filter: { vendorId: 1155, productId: 57105 }
		},
		'DUELink': {
			name: 'DUELink',
			vmFileName: 'vm_duelink.bin',
			pageSize: 2048,
			flashSize: 131072,
			filter: { vendorId: 1155 }
		}
	},
	duelinkBoards: [
		'CincoBit', 'PixoBit', 'Clipit', 'DueSTEM', 'Ghizzy', 'Holiday Tree']
};

DFUpload.flashBoard = function (boardName) {
	IDE.spinner.show(
		'Uploading MicroBlocks to board...', // title
		'Do not switch browser tabs!', // subtitle
		null, // note
		0, // percent
		() => { dfu.disconnect(); }, // onCancel
	);

	if (this.duelinkBoards.includes(boardName)) { boardName = 'DUELink'; }
	let board = this.boards[boardName];
	window.dfu = window.dfu ?? new usbDfuDevice();

	fetch(`precompiled/${board.vmFileName}`)
		.then(res => res.arrayBuffer())
		.then(buffer => {
			if (buffer) {
				FloatingWindow.inform(
					'Install Firmware',
					'Please make sure your board is in DFU mode. ' +
					'This is usually achieved by holding one of the user buttons down ' +
					'while powering up the device.',
					() => {
						dfu.disconnect()
							.then(()=>IDE.spinner.show())
							.then(()=>IDE.spinner.setTitle('Connecting...'))
							.then(()=>dfu.connect(board.filter))
							.then(()=>dfu.setFlashAndPageSizes(board.flashSize, board.pageSize))
							.then(()=>dfu.clearStatus())
							.then(()=>IDE.spinner.setTitle('Erasing...'))
							.then(()=>dfu.erase())
							.then(()=>dfu.sleep(5000))
							.then(()=>IDE.spinner.setTitle('Flashing...'))
							.then(()=>dfu.program(buffer))
							.then(()=>dfu.sleep(250, 'Booting...'))
							.then(()=>dfu.detach())
							.then(()=>dfu.sleep(250, 'Disconnecting...'))
							.then(()=>dfu.disconnect())
							.then(()=>
								FloatingWindow.inform(
									'Firmware Installed',
									'Please reset the board before trying to connect to it.'
								)
							);
					}
				);
			}
		});
};

dfuStatusHandler = function (label) { IDE.spinner.setTitle(label); }
dfuProgressHandler = function (percent) { IDE.spinner.setPercent(percent); };
dfuDisconnectHandler = function () { IDE.spinner.hide(); };

const ESPUpload = { };

ESPUpload.repoUrl = function (version) {
	return (location.protocol == 'http' ? 'http' : 'https') +
		'://microblocks.fun/downloads/' + version + '/vm/';
};

ESPUpload.flashFromRepo = function (version) {
	let html = fetch(this.repoUrl(version));
};
