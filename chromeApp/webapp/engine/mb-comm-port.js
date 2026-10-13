// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-comm-port.js — Unified serial/BLE/Boardie communication port

// MicroBlocks BLE UUIDs
const MICROBLOCKS_SERVICE_UUID = 'bb37a001-b922-4018-8e74-e14824b3a638';
const MICROBLOCKS_RX_CHAR_UUID = 'bb37a002-b922-4018-8e74-e14824b3a638'; // board receive characteristic
const MICROBLOCKS_TX_CHAR_UUID = 'bb37a003-b922-4018-8e74-e14824b3a638'; // board transmit characteristic

const BLE_PACKET_LEN = 240; // Max BLE attribute length is 512 but 240 gives best performance

const SERIAL_VENDOR_IDS = [
	{ usbVendorId: 0x0403 },						// FTDI
	{ usbVendorId: 0x0d28 },						// micro:bit, Calliope
	{ usbVendorId: 0x10c4 },						// Silicon Laboratories (CP210x)
	{ usbVendorId: 0x1a86 },						// CH340
	{ usbVendorId: 0x239a },						// AdaFruit
	{ usbVendorId: 0x2a03 },						// Arduino
	{ usbVendorId: 0x2341 },						// Arduino MKR Zero
	{ usbVendorId: 0x03eb },						// Atmel Corporation
	{ usbVendorId: 0x1366 },						// SEGGER Calliope mini
	{ usbVendorId: 0x16c0 },						// Teensy
	{ usbVendorId: 0x2E8A },						// Raspberry Pi Pico RP2040
	{ usbVendorId: 0x303a },						// Espressif USB JTAG/serial debug unit
	{ usbVendorId: 0x0483 },						// STMicroelectronics
	{ usbVendorId: 0x1B9F, usbProductId: 0xF301 },	// GHI/DUELink, MicroBlocks PID
	{ usbVendorId: 0x1B4F },						// XRP
	{ usbVendorId: 0x2886 },						// Seeed
	{ usbVendorId: 0x0005 },						// HC-05
];

class MB_CommPort {
	constructor() {
		this.inputBuffers = []; // list of Uint8Array chunks waiting to be read

		// WebSerial state
		this.serialPort = null;
		this.serialReader = null;

		// WebBluetooth state
		this.bleDevice = null;
		this.bleRxChar = null;
		this.bleSendInProgress = false;

		// Boardie state
		this.boardieFrame = null;
		this.boardieListener = null;
	}

	// --- API ---

	isConnected() {
		if (this.boardieIsConnected()) return true;
		if (this.bleIsConnected()) return true;
		return this.serialPort != null && this.serialReader != null;
	}

	connect(type = 'serial', boardieIFrame = null) {
		if (type === 'serial') {
			this.serialConnect();
		} else if (type === 'BLE') {
			this.bleConnect();
		} else if (type === 'boardie') {
			this.boardieConnect(boardieIFrame);
		}
	}

	disconnect() {
		if (this.boardieIsConnected()) {
			this.boardieDisconnect();
		} else if (this.bleIsConnected()) {
			this.bleDisconnect();
		} else {
			this.serialDisconnect();
		}
		this.inputBuffers = [];
	}

	read() {
		// Return all buffered input as a single Uint8Array and clear the buffer.
		if (this.inputBuffers.length === 0) return new Uint8Array(0);
		const totalBytes = this.inputBuffers.reduce((sum, b) => sum + b.byteLength, 0);
		const result = new Uint8Array(totalBytes);
		let offset = 0;
		for (const buf of this.inputBuffers) {
			result.set(buf, offset);
			offset += buf.byteLength;
		}
		this.inputBuffers = [];
		return result;
	}

	write(data) {
		// Write data (Uint8Array) and return the number of bytes written.
		if (this.boardieIsConnected()) {
			if (this.boardieFrame) {
				this.boardieFrame.contentWindow.postMessage(data, '*');
			}
			return data.byteLength;
		} else if (this.bleIsConnected()) {
			return this.bleWrite(data);
		} else {
			return this.serialWrite(data);
		}
	}

	// --- WebSerial ---

	async serialConnect() {
		if (this.serialPort || this.serialReader) {
			await this.serialDisconnect(); // ensure any previous port is closed
		}
		this.serialPort = await navigator.serial
			.requestPort({ filters: SERIAL_VENDOR_IDS })
			.catch((e) => { console.log(e); return null; });
		if (!this.serialPort) return; // user cancelled
		const opened = await this.serialPort.open({ baudRate: 115200 })
			.then(() => true)
			.catch((e) => { window.alert(e); return false; });
		if (!opened) { this.serialPort = null; return; }
		this.serialReader = this.serialPort.readable.getReader();
		this.serialReadLoop();
	}

	async serialDisconnect() {
		if (this.serialReader) await this.serialReader.cancel().catch(() => {});
		if (this.serialPort) await this.serialPort.close().catch(() => {});
		this.serialReader = null;
		this.serialPort = null;
		console.log('serial disconnected');
	}

	async serialReadLoop() {
		try {
			while (true) {
				const { value, done } = await this.serialReader.read();
				if (value) this.inputBuffers.push(value);
				if (done) { // happens when serialReader.cancel() is called by disconnect
					this.serialReader.releaseLock();
					return;
				}
			}
		} catch (e) { // happens when board is unplugged
			console.log(e);
			if (this.serialPort) await this.serialPort.close().catch(() => {});
			this.serialPort = null;
			this.serialReader = null;
			console.log('Serial connection closed.');
		}
	}

	serialWrite(data) {
		if (!this.serialPort || !this.serialPort.writable) return 0;
		const writer = this.serialPort.writable.getWriter();
		writer.write(data.buffer);
		writer.releaseLock();
		return data.byteLength;
	}

	// --- Serial Handshaking Control (WebSerial only) ---

	async setDTR(flag) {
		if (!this.serialPort) return;
		await this.serialPort.setSignals({ dtr: flag, dataTerminalReady: flag }).catch(() => {});
	}

	async setRTS(flag) {
		if (!this.serialPort) return;
		await this.serialPort.setSignals({ rts: flag, requestToSend: flag }).catch(() => {});
	}

	async setDTRandRTS(dtrFlag, rtsFlag) {
		if (!this.serialPort) return;
		await this.serialPort.setSignals({
			dtr: dtrFlag, dataTerminalReady: dtrFlag,
			rts: rtsFlag, requestToSend: rtsFlag,
		}).catch(() => {});
	}

	// --- WebBluetooth ---

	bleIsConnected() {
		// Check both: bleDevice is non-null AND bleRxChar is set (GATT fully connected).
		// bleDevice can be truthy but bleRxChar null if GATT setup failed partway through.
		return this.bleDevice != null && this.bleRxChar != null;
	}

	async bleConnect() {
		this.bleDevice = await navigator.bluetooth.requestDevice({
			filters: [{ services: [MICROBLOCKS_SERVICE_UUID] }],
		}).catch((e) => { console.log(e); return null; });
		if (this.bleDevice == null) return; // user cancelled or error
		try {
			this.bleDevice.addEventListener('gattserverdisconnected', this.bleHandleDisconnected.bind(this));
			const server = await this.bleDevice.gatt.connect();
			const bleService = await server.getPrimaryService(MICROBLOCKS_SERVICE_UUID);
			const txChar = await bleService.getCharacteristic(MICROBLOCKS_TX_CHAR_UUID);
			this.bleRxChar = await bleService.getCharacteristic(MICROBLOCKS_RX_CHAR_UUID);
			await txChar.startNotifications();
			txChar.addEventListener('characteristicvaluechanged', this.bleHandleRead.bind(this));
			this.bleSendInProgress = false;
		} catch (e) {
			console.log('BLE connection failed:', e);
			this.bleDevice = null;
			this.bleRxChar = null;
		}
	}

	bleDisconnect() {
		if (this.bleDevice) this.bleDevice.gatt.disconnect();
		// bleHandleDisconnected will fire and clean up state
	}

	bleHandleDisconnected() {
		console.log('BLE disconnected');
		this.bleRxChar = null;
		this.bleSendInProgress = false;
		this.bleDevice = null;
	}

	bleHandleRead(event) {
		this.inputBuffers.push(new Uint8Array(event.target.value.buffer));
	}

	bleWrite(data) {
		if (this.bleSendInProgress) return 0;
		if (!this.bleDevice || !this.bleRxChar) {
			console.log('BLE not connected');
			return 0;
		}
		const byteCount = Math.min(data.length, BLE_PACKET_LEN);
		this.bleWriteAsync(data.subarray(0, byteCount));
		return byteCount;
	}

	async bleWriteAsync(data) {
		if (!this.bleRxChar) return;
		this.bleSendInProgress = true;
		try {
			await this.bleRxChar.writeValueWithoutResponse(data);
		} catch (e) {
			console.log('BLE write failed:\n', e);
		}
		this.bleSendInProgress = false;
	}

	// --- Boardie ---

	boardieConnect(iframe) {
		this.boardieFrame = iframe;
		// Boardie posts its bytes to the parent window (boardie.c sendBytes),
		// and in the emscripten build gpSupport.js is what hears them. That
		// file is not in the all-Javascript page, so without this listener the
		// port can send to Boardie and never receive one byte back.
		// `window` on purpose, and guarded: Boardie is a browser-only transport
		// and the bare-Node seam connects to it with no DOM at all.
		if ((this.boardieListener == null) && ('undefined' != typeof window)) {
			this.boardieListener = (event) => {
				// Only the frame this port connected to, and only a frame that
				// has a message in it: gpSupport.js handleMessage gates on the
				// same first byte, and every MicroBlocks message starts with
				// one that is not zero.
				const frame = this.boardieFrame;
				if (frame == null) return;
				if (event.source && frame.contentWindow &&
					(event.source !== frame.contentWindow)) return;
				const msg = event.data;
				if ((msg instanceof Uint8Array) && msg.length && msg[0]) {
					this.inputBuffers.push(msg);
				}
			};
			window.addEventListener('message', this.boardieListener, false);
		}
	}

	boardieIsConnected() {
		return this.boardieFrame != null;
	}

	boardieDisconnect() {
		this.boardieFrame = null;
		if (this.boardieListener && ('undefined' != typeof window)) {
			window.removeEventListener('message', this.boardieListener, false);
			this.boardieListener = null;
		}
	}
}
