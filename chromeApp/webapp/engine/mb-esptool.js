// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// mb-esptool.js - Installing the firmware on ESP8266 and ESP32 boards through the chip's ROM boot loader
// Sam McHardy, October 2026

// About SLIP:
// Each SLIP packet begins and ends with 0xC0 (192). Within the packet, all occurrences of
// 0xC0 and 0xDB are replaced with 0xDB 0xDC (219 220) and 0xDB 0xDD (219 221), respectively.

class MB_ESPTool {
	constructor(port) {
		this.port = port; // an open MB_CommPort
		this.recvBuf = new Uint8Array(0);
		this.status = ''; // a status/progress string
		this.success = false;
		this.allInOneBinary = false;
		this.chipType = null;
		this.fileChip = null; // the chip the firmware image was built for
		this.failure = null; // after a failed install: 'noResponse', 'notFirmware', 'unsupportedChip', 'wrongChip' or 'failed'
	}

	// --- Connecting ---

	async connect() {
		// Enter boot mode and connect to the ROM boot loader.
		this.status = 'Connecting...';
		for (let i = 1; i <= 30; i++) {
			if (0 == (i & 1)) {
				await this.enterBootMode();
			} else {
				await this.enterBootModeUSB();
			}
			await waitMSecs(30);
			this.recvBuf = new Uint8Array(0);
			for (let j = 0; j < 10; j++) {
				this.sendSyncMsg();
				await waitMSecs(30);
				if (this.nextSLIPMsg() != null) {
					await this.clearReceiveBuffer();
					return true;
				}
			}
		}
		console.log('Could not connect. Board did not respond.');
		return false;
	}

	sendSyncMsg() {
		// 0x07 0x07 0x12 0x20, then 32 x 0x55 to let the chip detect the baud rate
		this.sendCmd(8, [7, 7, 18, 32].concat(Array(32).fill(0x55)));
	}

	// --- Chip Control ---
	// RTS and DTR are inverted by transistors on the board: RTS true holds EN low
	// (chip in reset), DTR true holds IO0 low (boot loader on reset).

	async enterBootMode() {
		await this.port.setDTR(false);
		await this.port.setRTS(true);
		await waitMSecs(250);
		await this.port.setDTR(true);
		await this.port.setRTS(false);
		await waitMSecs(500);
		await this.port.setDTR(false);
	}

	async enterBootModeUSB() {
		// for newer chips with a built-in USB-JTAG controller (ESP32-S3, ESP32-C3, ESP32-C6)
		await this.port.setRTS(false);
		await this.port.setDTR(false);
		await waitMSecs(100);
		await this.port.setDTR(true);
		await this.port.setRTS(false);
		await waitMSecs(100);
		await this.port.setRTS(true);
		await this.port.setDTR(false);
		await this.port.setRTS(true);
		await waitMSecs(100);
		await this.port.setRTS(false);
		await this.port.setDTR(false);
	}

	async exitBootMode() {
		// Reset the chip in normal mode so that it runs the MicroBlocks virtual machine.
		await this.port.setDTR(false);
		await this.port.setRTS(true);
		await waitMSecs(100);
		await this.port.setRTS(false);
	}

	// --- SLIP Message Receiving ---

	async waitForMsg(timeout = 10000) {
		const startTime = Date.now();
		while ((Date.now() - startTime) < timeout) {
			const msg = this.nextSLIPMsg();
			if (msg != null) return msg;
			// A hidden tab slows even short timers, so also wake when serial data arrives.
			await new Promise(resolve => {
				this.port.dataArrived = resolve;
				waitMSecs(10).then(resolve);
			});
			this.port.dataArrived = null;
		}
		return null;
	}

	nextSLIPMsg() {
		// Return the next complete SLIP message without its frame bytes and with
		// escaped byte pairs replaced, or null.
		const data = this.port.read();
		if (data.length > 0) this.recvBuf = MB_ESPTool.join(this.recvBuf, data);
		const start = this.recvBuf.indexOf(0xC0);
		if (start < 0) {
			this.recvBuf = new Uint8Array(0);
			return null;
		}
		const end = this.recvBuf.indexOf(0xC0, start + 1);
		if (end < 0) {
			this.recvBuf = this.recvBuf.slice(start);
			return null;
		}
		const result = [];
		for (let i = start + 1; i < end; i++) {
			const b = this.recvBuf[i];
			if (0xDB == b) {
				const nextB = this.recvBuf[i + 1];
				if (0xDC == nextB) result.push(0xC0);
				if (0xDD == nextB) result.push(0xDB);
				i++;
			} else {
				result.push(b);
			}
		}
		this.recvBuf = this.recvBuf.slice(end + 1);
		return result;
	}

	async clearReceiveBuffer() {
		// Discard any data that is still arriving.
		do {
			await waitMSecs(10);
		} while (this.port.read().length > 0);
		this.recvBuf = new Uint8Array(0);
	}

	async errorResponse() {
		// Return true if the board reported an error or did not answer.
		const msg = await this.waitForMsg();
		if (msg == null) {
			console.log('No response from board');
			return true;
		}
		if (msg.length < 10) {
			console.log('Incomplete response from board');
			return true;
		}
		// The status byte follows the 8-byte header. ESP32 ROM loaders send two
		// reserved bytes after it, so it is not the last byte.
		if (0 != msg[8]) {
			console.log('Board reported error; msg:', msg);
			return true;
		}
		return false;
	}

	// --- SLIP Message Sending ---

	sendCmd(cmd, data = [], checksum = 0) {
		const msg = [0, cmd, data.length & 255, (data.length >> 8) & 255];
		MB_ESPTool.add32Int(msg, checksum);
		for (const b of data) msg.push(b);
		const escaped = [0xC0];
		for (const b of msg) {
			if (0xC0 == b) {
				escaped.push(0xDB, 0xDC);
			} else if (0xDB == b) {
				escaped.push(0xDB, 0xDD);
			} else {
				escaped.push(b);
			}
		}
		escaped.push(0xC0);
		this.port.write(new Uint8Array(escaped));
	}

	static add32Int(msg, n) {
		// Append n to msg as four little-endian bytes.
		for (let i = 0; i < 4; i++) {
			msg.push(n & 255);
			n = n >>> 8;
		}
	}

	static join(a, b) {
		const result = new Uint8Array(a.length + b.length);
		result.set(a);
		result.set(b, a.length);
		return result;
	}

	// --- Utilities ---

	async readChipType() {
		const dateReg1 = await this.readRegister('60000078');
		if ('0x00062000' == dateReg1) return 'ESP8266';
		if ('0x15122500' == dateReg1) return 'ESP32';
		if ('0x00000500' == dateReg1) {
			if ('0x19031400' == (await this.readRegister('3f400074'))) return 'ESP32-S2';
		}
		if ('0x03700000' == dateReg1) {
			const magicReg = await this.readRegister('40001000');
			if ('0x00000009' == magicReg) return 'ESP32-S3';
			if ('0x1b31506f' == magicReg) return 'ESP32-C3';
		}
		return null;
	}

	async eraseFlash() {
		this.status = localized('Erasing Flash...');
		await this.clearReceiveBuffer();
		this.sendCmd(0xd0);
		const msg = await this.waitForMsg(30000); // erasing the whole Flash takes a while
		return (msg != null) && (msg.length > 9) && (0 == msg[8]);
	}

	async readRegister(hexAddr) {
		// Answer the register at hexAddr (a hex string such as '3ff0005c') as a hex string.
		await this.clearReceiveBuffer();
		this.sendCmd(10, MB_ESPTool.hexToBytes(hexAddr));
		const msg = await this.waitForMsg();
		if ((msg == null) || (msg.length < 10)) return -1;
		if (0 != msg[8]) return -msg[9];
		return '0x' + msg.slice(4, 8).reverse().map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	static hexToBytes(s) {
		// Answer the bytes of a hex string in little-endian order.
		const n = parseInt(s, 16);
		const result = [];
		MB_ESPTool.add32Int(result, n);
		return result;
	}

	// --- Installing Firmware ---

	async installFirmware(boardName, eraseFlag, vmData) {
		// Install vmData, erasing Flash first if eraseFlag is true. Answer true on success.
		if (!vmData || (vmData.length < 10000)) {
			console.log('Could not fetch or read VM');
			return this.done(false);
		}
		this.fileChip = MB_ESPTool.imageChip(vmData);
		if (!this.fileChip) {
			this.failure = 'notFirmware';
			return this.done(false);
		}
		if (!MB_ESPToolStubs[this.fileChip]) {
			this.failure = 'unsupportedChip';
			return this.done(false);
		}
		const ok = ('ESP8266' == this.fileChip) ?
			await this.uploadESP8266VM(vmData, eraseFlag) :
			await this.uploadESP32VM(vmData, eraseFlag, boardName);
		if (!ok) return this.done(false);
		this.status = localized('Done');
		fireIDEEvent('spinner.hide');
		this.success = true;
		await waitMSecs(200); // allow time for the final Flash write to complete
		await this.exitBootMode();
		await waitMSecs(1500);
		return true;
	}

	done(ok) {
		if (!ok && !this.failure) this.failure = 'failed';
		this.status = localized(ok ? 'Done' : 'Failed');
		fireIDEEvent('spinner.hide');
		return ok;
	}

	async checkChip() {
		// Refuse firmware built for another chip before anything is written.
		this.chipType = await this.readChipType();
		if (!this.chipType || (this.chipType == this.fileChip)) return true;
		this.failure = 'wrongChip';
		await this.exitBootMode();
		return false;
	}

	// --- Uploading data to the board ---

	async uploadESP8266VM(vmData, eraseFlag) {
		if (!(await this.connect())) {
			this.failure = 'noResponse';
			return false;
		}
		if (!(await this.checkChip())) return false;
		if (!(await this.uploadStub())) return false;
		if (eraseFlag) await this.eraseFlash();
		// the image starts with its own boot loader and loads at address 0
		return this.uploadCompressed(0, vmData);
	}

	async uploadESP32VM(vmData, eraseFlag, boardName) {
		if (!(await this.connect())) {
			this.failure = 'noResponse';
			return false;
		}
		if (!(await this.checkChip())) return false;
		if (!(await this.uploadStub())) return false;
		if (boardName.toLowerCase().includes('nezha')) {
			if (!(await this.setFlashParameters(16))) return false;
			this.allInOneBinary = true;
		} else {
			if (!(await this.setFlashParameters(4))) return false;
		}
		if (eraseFlag) await this.eraseFlash();

		const vmFileName = MB_ESPTool.vmNameForBoard(boardName) || boardName;
		if (vmFileName.includes('databot2.0_')) this.allInOneBinary = true;
		if (vmFileName.toLowerCase().includes('cocube')) this.allInOneBinary = true;
		if (vmFileName.includes('waveshare_s3_matrix')) this.allInOneBinary = true;
		if (vmFileName.includes('_all.bin')) this.allInOneBinary = true;
		if (this.allInOneBinary) {
			// the binary includes all parts and loads at address 0
			return this.uploadCompressed(0, vmData);
		}

		const bootloaders = {
			'ESP32-S2': [0x1000, 'bootloader_s2.bin'],
			'ESP32-S3': [0, 'bootloader_s3.bin'],
			'ESP32-C3': [0, 'bootloader_c3.bin'],
		};
		const [bootloaderAddress, bootloaderFile] =
			bootloaders[this.chipType] || [0x1000, 'bootloader_dio_40m.bin'];
		const parts = [
			[bootloaderAddress, await MB_ESPTool.fetchFile('esp32/' + bootloaderFile)],
			[0xe000, await MB_ESPTool.fetchFile('esp32/boot_app0.bin')],
			[0x8000, await MB_ESPTool.fetchFile('esp32/partitionsMicroBlocks.bin')],
			[0x10000, vmData]];
		for (const [addr, data] of parts) {
			if (!data) return false;
			// stop at the first refused packet: the board's flash is incomplete
			if (!(await this.uploadCompressed(addr, data))) return false;
		}
		return true;
	}

	async uploadCompressed(startAddr, data) {
		// Write data to Flash at startAddr with deflate compression. Answer false on an error.
		// The packet size after SLIP escaping cannot exceed 1024 bytes; 800 leaves room
		// for the escapes in every current VM (900 works; 984 fails).
		const packetSize = 800;
		const compressedData = await MB_ESPTool.zlibEncode(data);
		const compressedByteCount = compressedData.length;
		const args = [];
		MB_ESPTool.add32Int(args, data.length); // uncompressed size
		MB_ESPTool.add32Int(args, Math.ceil(compressedByteCount / packetSize));
		MB_ESPTool.add32Int(args, packetSize);
		MB_ESPTool.add32Int(args, startAddr);
		this.sendCmd(0x10, args);
		if (await this.errorResponse()) return false;
		this.status = '';
		return this.sendPackets(0x11, compressedData, packetSize, true);
	}

	async sendPackets(cmd, data, packetSize, showProgress) {
		// Send data in numbered, checksummed packets of up to packetSize bytes.
		let sent = 0, seqNum = 0;
		while (sent < data.length) {
			const packet = data.subarray(sent, sent + packetSize);
			const args = [];
			MB_ESPTool.add32Int(args, packet.length);
			MB_ESPTool.add32Int(args, seqNum);
			for (let i = 0; i < 8; i++) args.push(0);
			let checksum = 0xEF;
			for (const b of packet) {
				checksum ^= b;
				args.push(b);
			}
			this.sendCmd(cmd, args, checksum);
			if (await this.errorResponse()) return false;
			sent += packet.length;
			seqNum++;
			if (showProgress) {
				const percentDone = Math.round((100 * sent) / data.length);
				this.status = percentDone + '%';
				fireIDEEvent('spinner.setPercent', percentDone);
			}
		}
		return true;
	}

	async setFlashParameters(flashSizeMB) {
		const args = [];
		MB_ESPTool.add32Int(args, 0); // Flash ID
		MB_ESPTool.add32Int(args, flashSizeMB * 1024 * 1024); // total Flash size
		MB_ESPTool.add32Int(args, 64 * 1024); // block size
		MB_ESPTool.add32Int(args, 4 * 1024); // sector size
		MB_ESPTool.add32Int(args, 256); // page size
		MB_ESPTool.add32Int(args, 0xffff); // status mask
		this.sendCmd(0x0b, args);
		return !(await this.errorResponse());
	}

	// --- Stub uploading ---

	async uploadStub() {
		// Upload and start the RAM loader stub, which adds compressed uploads and Flash erase.
		if (!this.chipType) this.chipType = await this.readChipType();
		const stub = MB_ESPToolStubs[this.chipType];
		if (!stub) {
			console.log('Error: Unknown chip type:', this.chipType);
			return false;
		}
		await this.uploadToRAM(stub.text_start, MB_ESPTool.base64Bytes(stub.text));
		await this.uploadToRAM(stub.data_start, MB_ESPTool.base64Bytes(stub.data));
		return this.startStub(stub.entry);
	}

	async uploadToRAM(hexStartAddr, ramData) {
		const packetSize = 900; // well under 1024 to allow for the header and SLIP escaping
		const args = [];
		MB_ESPTool.add32Int(args, ramData.length);
		MB_ESPTool.add32Int(args, Math.ceil(ramData.length / packetSize));
		MB_ESPTool.add32Int(args, packetSize);
		args.push(...MB_ESPTool.hexToBytes(hexStartAddr));
		this.sendCmd(5, args);
		if (await this.errorResponse()) return;
		await this.sendPackets(7, ramData, packetSize, false);
	}

	async startStub(hexStartAddr) {
		this.sendCmd(6, [0, 0, 0, 0].concat(MB_ESPTool.hexToBytes(hexStartAddr)));
		await this.waitForMsg(); // the answer to the start command
		const msg = await this.waitForMsg(); // then the stub says 'OHAI'
		if ((msg == null) || (msg.join() != [79, 72, 65, 73].join())) {
			console.log('Error: Stub did not respond');
			return false;
		}
		return true;
	}

	// --- Data ---

	static imageChip(data) {
		// Answer the chip a firmware image was built for, or null if data is not an image.
		// A merged image is blank up to its boot loader: 0x1000 on an ESP32, 0x2000 on a P4 or C5.
		if (0xea == data[0]) return 'ESP8266'; // the ESP8266's second image format
		let start = 0;
		while ((start < 0x2000) && (0xff == data[start])) start += 0x1000;
		if ((data.length < (start + 24)) || (0xe9 != data[start])) return null;
		const entry = (data[start + 4] | (data[start + 5] << 8) | (data[start + 6] << 16) | (data[start + 7] << 24)) >>> 0;
		if (0x4010 == (entry >>> 16)) return 'ESP8266'; // its images have no chip id; this is its IRAM
		const chipID = data[start + 12] | (data[start + 13] << 8);
		return {
			0: 'ESP32', 2: 'ESP32-S2', 5: 'ESP32-C3', 9: 'ESP32-S3', 12: 'ESP32-C2',
			13: 'ESP32-C6', 16: 'ESP32-H2', 18: 'ESP32-P4', 23: 'ESP32-C5',
		}[chipID] || null;
	}

	static vmNameForBoard(boardName) {
		return {
			'ESP32': 'vm_esp32.bin',
			'Citilab ED1': 'vm_citilab-ed1.bin',
			'micro:STEAMakers': 'vm_micro_steamakers.bin',
			'ESP32 STEAMakers': 'vm_esp32_steamakers.bin',
			'STEAMakers AI': 'vm_steamakers_ai.bin',
			'KidsBits': 'vm_kids_bits.bin',
			'KidsIOT': 'vm_kids_bits.bin',
			'CodingBox': 'vm_kids_bits.bin',
			'Foxbit': 'vm_foxbit.bin',
			'CoCube': 'vm_cocube.bin',
			'M5Stack-Core': 'vm_m5stack.bin',
			'M5StickC': 'vm_m5stick.bin',
			'M5StickC+': 'vm_m5stick+.bin',
			'M5Atom-Matrix': 'vm_m5atom.bin',
			'Databot': 'vm_databot.bin',
			'Databot v3': 'vm_databot_v3.bin',
			'Springbot': 'vm_springbot.bin',
			'Springbot Green': 'vm_springbot.bin',
			'Springbot Gold': 'vm_springbot.bin',
			'Mbits': 'vm_mbits.bin',
		}[boardName] || null;
	}

	static async fetchFile(path) {
		try {
			const response = await fetch(path);
			if (response.ok) return new Uint8Array(await response.arrayBuffer());
		} catch (error) {
			// a page that cannot reach the file rejects rather than answering 404
		}
		return null;
	}

	static base64Bytes(s) {
		return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
	}

	static async zlibEncode(data) {
		const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
		return new Uint8Array(await new Response(stream).arrayBuffer());
	}
}
