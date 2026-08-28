// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-connection.js - Implements MicroBlocks communication protocol.

/* globals MB_CommPort, waitMSecs, isMobile, localized */

class MB_Connection {
	constructor() {
		this.msgDict = null;
		this.port = null;
		this.portName = null;
		this.connectionStartTime = null;
		this.portOpenedTime = null;
		this.pingSentMSecs = 0;
		this.lastPingRecvMSecs = null;
		this.recvBuf = new Uint8Array(0);
		this.vmVersion = null;
		this.boardType = null;
		this.codeManager = null;
	}

	// --- Process Messages Every Animation Frame (for now) ---

	startMessageProcessing() {
		let commPort = this.port;
		function processMsgCB() {
			if (commPort.isConnected()) {
				MB_connection.updateConnection();
			}
			requestAnimationFrame(processMsgCB);
		}
		requestAnimationFrame(processMsgCB);
	}

	// --- Helpers ---

	joinBytes(a, b) {
		const result = new Uint8Array(a.length + b.length);
		result.set(a);
		result.set(b, a.length);
		return result;
	}

	bytesToString(bytes) {
		return new TextDecoder().decode(bytes);
	}

	// --- Startup Actions ---

	clearBoardIfConnected() {
		this.sendMsg('systemResetMsg'); // send the reset message
		// chunkID 1: the VM's deleteAllCodeMsg and clearVarsMsg cases both ignore
		// chunkIndex 0, reading it as a message from a 32-bit IDE. GP sends 1.
		this.sendMsgSync('deleteAllCodeMsg', 1); // delete all code from board
		this.sendMsgSync('clearVarsMsg', 1); // delete all variable names from board
	}

	// --- Decompiler ---

	readCodeFromBoard() {
		// XXX TODO
	}

	// --- Feature detection ---

	hasWebSerial() {
		return typeof navigator !== 'undefined' && typeof navigator.serial !== 'undefined';
	}

	hasWebBluetooth() {
		return typeof navigator !== 'undefined' && typeof navigator.bluetooth !== 'undefined';
	}

	// --- Connection Handling ---

	async connect(portType = 'serial', boardieIFrame = null) {
		this.port = new MB_CommPort();
		// Each transport needs its own API and no other. Boardie needs neither.
		if ((portType == 'serial') && !this.hasWebSerial()) {
			// running in a browser w/o WebSerial (or it is not enabled)
			alert(localized('This browser does not support WebSerial.'));
			return;
		}
		if ((portType == 'BLE') && !this.hasWebBluetooth()) {
			// running in a browser w/o WebBluetooth (or it is not enabled)
			alert(localized('This browser does not support WebBluetooth.'));
			return;
		}
		this.portName = portType;
		this.port.connect(portType, boardieIFrame);
		if (portType == 'boardie') {
			await waitMSecs(100); // make sure Boardie is ready to receive messages
		}
		this.connectionStartTime = Date.now();
		this.portOpenedTime = null;
		this.lastPingRecvMSecs = 0;
		this.sendMsg('pingMsg');
		this.startMessageProcessing();
	}

	disconnect() {
// XXX TODO These actions should be done by the editor before calling disconnect()
// 		MB_editor.stopAndSyncScripts();
// 		MB_editor.startAll();

		this.port.disconnect();
		this.portName = null;
		this.vmVersion = null;
		this.boardType = null;

		// remove running highlights and result bubbles when disconnected
		MB_editor.clearRunningHighlights();
	}

	isConnected() {
		return (this.port != null) && (this.port.isConnected());
	}

	connectedToBoard() {
		const pingTimeout = 8000;
		if (!this.isConnected()) return false;
		if (this.lastPingRecvMSecs == null || this.lastPingRecvMSecs === 0) return false;
		return (Date.now() - this.lastPingRecvMSecs) < pingTimeout;
	}

	connectedViaBLE() {
		return this.portName === 'BLE';
	}

	updateConnection() {
		const pingSendInterval = 2000; // msecs between pings
		const pingTimeout = 8000;
		if (this.lastPingRecvMSecs == null) this.lastPingRecvMSecs = 0;

		if (this.portName == null) return 'not connected';

		this.sendPeriodicPing();
		this.processMessages();

		// handle connection attempt in progress
		if (this.connectionStartTime != null) {
			return this.tryToConnect();
		}

		// if port is not open, disconnect
		if (!this.isConnected()) {
			MB_editor.clearRunningHighlights();
			this.disconnect();
			this.portName = null;
			return 'not connected';
		}

		// if the port is open and it is time, send a ping
		const now = Date.now();
		if ((now - this.pingSentMSecs) > pingSendInterval) {
			if ((now - this.pingSentMSecs) > 5000) {
				// it's been a long time since we sent a ping; laptop may have been asleep
				// set lastPingRecvMSecs to now to suppress warnings
				this.lastPingRecvMSecs = now;
			}
			this.sendMsg('pingMsg');
			this.pingSentMSecs = now;
			return 'connected';
		}

		const msecsSinceLastPing = now - this.lastPingRecvMSecs;
		if (msecsSinceLastPing < pingTimeout) {
			// got a ping recently: we're connected
			return 'connected';
		} else {
			// ping timeout: close port to force reconnection
			console.log('Lost communication to the board');
			MB_editor.clearRunningHighlights();
			this.disconnect();
			return 'not connected';
		}
	}

	sendPeriodicPing() {
		// If the port is open and it is time, send a ping
		const pingSendInterval = 2000; // msecs between pings

		const now = Date.now();
		if ((now - this.pingSentMSecs) > pingSendInterval) {
			this.sendMsg('pingMsg');
			this.pingSentMSecs = now;
		}
	}

	tryToConnect() {
		// Called when connectionStartTime is not null, indicating that we are trying
		// to establish a connection to a board.

		if (!this.isConnected()) return 'not connected'; // Port is not yet connected...

		// Time the board's silence from the moment the port opened, not from
		// connect(): connect() returns before the user has answered the browser's
		// port chooser, so connectionStartTime can already be many seconds old.
		if (this.portOpenedTime == null) this.portOpenedTime = Date.now();

		this.sendMsg('pingMsg');

		// process any incoming messages
		this.processMessages();
		if (this.lastPingRecvMSecs !== 0) { // got a ping; we're connected!
			this.justConnected();
			return 'connected';
		}

		const connectionAttemptTimeout = 10000; // milliseconds
		if ((Date.now() - this.portOpenedTime) > connectionAttemptTimeout) {
			// give up and disconnect if no response from board after connectionAttemptTimeout
			this.disconnect();
			this.connectionStartTime = null;
		}

		return 'not connected';
	}

	justConnected() {
		// Called when a board has just connected (browser or stand-alone).
		console.log('Connected (' + this.portName + ')');
		this.connectionStartTime = null;
		this.vmVersion = null;
		this.sendMsgSync('getVersionMsg');
		this.sendMsg('stopAllMsg');
		this.processMessages(); // process incoming version message
		MB_editor.justConnected();
	}

	// --- Message handling ---

	setCodeManager(codeManager) {
		// Register a code manager to receive certain message responses.

		this.codeManager = codeManager;
	}

	msgNameToID(msgName) {
		if (Number.isInteger(msgName)) return msgName;
		if (this.msgDict == null) {
			this.msgDict = {
				'chunkCodeMsg': 1,
				'deleteChunkMsg': 2,
				'startChunkMsg': 3,
				'stopChunkMsg': 4,
				'startAllMsg': 5,
				'stopAllMsg': 6,
				'getVarMsg': 7,
				'setVarMsg': 8,
				'getVarNamesMsg': 9,
				'clearVarsMsg': 10,
				'getChunkCRCMsg': 11,
				'getVersionMsg': 12,
				'getAllCodeMsg': 13,
				'deleteAllCodeMsg': 14,
				'systemResetMsg': 15,
				'taskStartedMsg': 16,
				'taskDoneMsg': 17,
				'taskReturnedValueMsg': 18,
				'taskErrorMsg': 19,
				'outputValueMsg': 20,
				'varValueMsg': 21,
				'versionMsg': 22,
				'chunkCRCMsg': 23,
				'clearGraphMsg': 24,
				'codeStoreFullMsg': 25,
				'pingMsg': 26,
				'broadcastMsg': 27,
				'chunkAttributeMsg': 28,
				'varNameMsg': 29,
				'extendedMsg': 30,
				'enableBLEMsg': 31,
				'chunkCode16Msg': 32,
				'codeStoreUsedMsg': 33,
				'snapshotCodeToFileMsg': 34,
				'getAllCRCsMsg': 38,
				'allCRCsMsg': 39,
				'deleteFile': 200,
				'listFiles': 201,
				'fileInfo': 202,
				'startReadingFile': 203,
				'startWritingFile': 204,
				'fileChunk': 205,
			};
		}
		const msgType = this.msgDict[msgName];
		if (msgType == null) throw new Error('Unknown message: ' + msgName);
		return msgType;
	}

	errorString(errID) {
		// Return an error string for the given errID from error definitions copied and pasted from interp.h
		const defsFromHeaderFile = `
#define noError					0	// No error
#define unspecifiedError		1	// Unknown error
#define badChunkIndexError		2	// Unknown chunk index

#define insufficientMemoryError 10	// Insufficient memory to allocate object
#define needsListError			11	// Needs a list
#define needsBooleanError		12	// Needs a boolean
#define needsIntegerError		13	// Needs an integer
#define needsStringError		14	// Needs a string
#define nonComparableError		15	// Those objects cannot be compared for equality
#define arraySizeError			16	// List size must be a non-negative integer
#define needsIntegerIndexError	17	// List or string index must be an integer
#define indexOutOfRangeError	18	// List or string index out of range
#define byteArrayStoreError		19	// A ByteArray can only store integer values between 0 and 255
#define hexRangeError			20	// Hexadecimal input must between between -40000000 and 3FFFFFFF
#define i2cDeviceIDOutOfRange	21	// I2C device ID must be between 0 and 127
#define i2cRegisterIDOutOfRange 22	// I2C register must be between 0 and 255
#define i2cValueOutOfRange		23	// I2C value must be between 0 and 255
#define notInFunction			24	// Attempt to access an argument outside of a function
#define badForLoopArg			25	// for-loop argument must be a positive integer or list
#define stackOverflow			26	// Insufficient stack space
#define primitiveNotImplemented 27	// Primitive not implemented in this virtual machine
#define notEnoughArguments		28	// Not enough arguments passed to primitive
#define waitTooLong				29	// The maximum wait time is 3600000 milliseconds (one hour)
#define noWiFi					30	// This board does not support WiFi
#define zeroDivide				31	// Division (or modulo) by zero is not defined
#define argIndexOutOfRange		32	// Argument index out of range
#define needsIndexable			33	// Needs an indexable type such as a string or list
#define joinArgsNotSameType		34	// All arguments to join must be the same type (e.g. lists)
#define i2cTransferFailed		35	// I2C transfer failed
#define needsByteArray			36	// Needs a byte array
#define serialPortNotOpen		37	// Serial port not open
#define serialWriteTooBig		38	// Serial port write is limited to 128 bytes
#define needsListOfIntegers		39	// Needs a list of integers
#define byteOutOfRange			40	// Needs a value between 0 and 255
#define needsPositiveIncrement	41	// Range increment must be a positive integer
#define needsIntOrListOfInts	42	// Needs an integer or a list of integers
#define wifiNotConnected		43	// Not connected to a WiFi network
#define cannotConvertToInteger	44	// Cannot convert that to an integer
#define cannotConvertToBoolean	45	// Cannot convert that to a boolean
#define cannotConvertToList		46	// Cannot convert that to a list
#define cannotConvertToByteArray 47 // Cannot convert that to a byte array
#define unknownDatatype			48	// Unknown datatype
#define invalidUnicodeValue		49	// Unicode values must be between 0 and 1114111 (0x10FFFF)
#define cannotUseWithBLE		50	// Cannot use this feature when board is connected to IDE via Bluetooth
#define bad8BitBitmap			51	// Needs an 8-bit bitmap: a list containing the bitmap width and contents (a byte array)
#define badColorPalette			52	// Needs a color palette: a list of positive 24-bit integers representing RGB values
#define encoderNotStarted		53	// Encoder not started; pin may not support interrupts
#define scriptTooLarge			54	// Script too large
#define udpPortNotOpen			55	// UDP port not open
#define cannotUseWhileIDEConnected 56 // This primitive cannot be used while connected to the IDE
`;
		for (const line of defsFromHeaderFile.split('\n')) {
			const words = line.trim().split(/\s+/);
			if (words.length > 2 && words[0] === '#define') {
				if (errID === parseInt(words[2])) {
					return 'Error: ' + words.slice(4).join(' ');
				}
			}
		}
		return 'Unknown error: ' + errID;
	}

	async readAvailableSerialData() {
		// Read any available data into recvBuf so that waitForResponse will await fresh data.
		if (!this.isConnected()) return;
		await waitMSecs(20); // leave some time for queued data to arrive
		if (this.recvBuf == null) this.recvBuf = new Uint8Array(0);
		const s = this.port.read();
		if (s != null && s.length > 0) this.recvBuf = this.joinBytes(this.recvBuf, s);
	}

	async waitForResponse() {
		// Wait for some data to arrive from the board. This is taken to mean that the
		// previous operation has completed. Return true if a response was received.
		this.sendMsg('pingMsg');
		const timeout = 10000; // must be less than ping timeout
		let iter = 1;
		const start = Date.now();
		while ((Date.now() - start) < timeout) {
			if (!this.isConnected()) return false;
			const s = this.port.read();
			if (s != null && s.length > 0) { // read() returns an EMPTY array, not null
				this.recvBuf = this.joinBytes(this.recvBuf, s);
				return true;
			}
			if ((iter % 50) === 0) this.sendMsg('pingMsg');
			iter += 1;
			await waitMSecs(5);
		}
		return false;
	}

	processMessages() {
		if (this.recvBuf == null) this.recvBuf = new Uint8Array(0);
		for (let i = 0; i < 100; i++) { // process up to N messages
			if (!this.processNextMessage()) return; // done!
		}
	}

	processNextMessage() {
		// Process the next message, if any. Return false when there are no more messages.
		if (!this.isConnected()) return false;

		// Read any available bytes and append to recvBuf
		const s = this.port.read();
		if (s != null && s.length > 0) this.recvBuf = this.joinBytes(this.recvBuf, s);
		if (this.recvBuf.length < 3) return false; // not enough bytes for even a short message

		// Parse and dispatch messages
		const firstByte = this.recvBuf[0];
		const byteTwo = this.recvBuf[1];
		if (byteTwo < 1 || (40 <= byteTwo && byteTwo < 200) || byteTwo > 205) {
			console.log('Serial error, opcode:', this.recvBuf[1]);
			this.discardMessage();
			return true;
		}
		if (firstByte === 250) { // short message
			const msg = this.recvBuf.slice(0, 3);
			this.recvBuf = this.recvBuf.slice(3); // remove message
			this.handleMessage(msg);
		} else if (firstByte === 251) { // long message
			if (this.recvBuf.length < 5) return false; // incomplete length field
			const bodyBytes = (this.recvBuf[4] << 8) | this.recvBuf[3];
			if (bodyBytes >= 1024) {
				console.log('Serial error, length:', bodyBytes);
				this.discardMessage();
				return true;
			}
			if (this.recvBuf.length < (5 + bodyBytes)) return false; // incomplete body
			const msg = this.recvBuf.slice(0, bodyBytes + 5);
			this.recvBuf = this.recvBuf.slice(bodyBytes + 5); // remove message
			this.handleMessage(msg);
		} else {
			console.log('Serial error, start byte:', firstByte);
			console.log(this.bytesToString(this.recvBuf)); // show the string (could be an ESP error message)
			this.discardMessage();
		}
		return true;
	}

	discardMessage() {
		// Discard bytes in recvBuf until the start of the next message, if any.
		const end = this.recvBuf.length;
		for (let i = 1; i < end; i++) { // start at index 1 to skip the current (bad) start byte
			const byte = this.recvBuf[i];
			if (byte === 250 || byte === 251) {
				console.log('	   ', this.bytesToString(this.recvBuf.slice(0, i)));
				this.recvBuf = this.recvBuf.slice(i);
				return;
			}
		}
		console.log('	   ', this.bytesToString(this.recvBuf));
		this.recvBuf = new Uint8Array(0); // no message start found; discard entire buffer
	}

	// --- Message handling ---

	handleMessage(msg) {
		this.lastPingRecvMSecs = Date.now(); // reset ping timer when any valid message is received
		const op = msg[1];
		if (op === this.msgNameToID('taskStartedMsg')) {
			MB_editor.updateRunning(msg[2], true);
		} else if (op === this.msgNameToID('taskDoneMsg')) {
			MB_editor.updateRunning(msg[2], false);
		} else if (op === this.msgNameToID('taskReturnedValueMsg')) {
			const chunkID = msg[2];
			MB_editor.showResult(chunkID, this.returnedValue(msg));
			MB_editor.updateRunning(chunkID, false);
		} else if (op === this.msgNameToID('taskErrorMsg')) {
			const chunkID = msg[2];
			MB_editor.showChunkError(chunkID, this.errorString(msg[5]));
			MB_editor.updateRunning(chunkID, false);
		} else if (op === this.msgNameToID('outputValueMsg')) {
			const chunkID = msg[2];
			if (chunkID === 255) {
				console.log(this.returnedValue(msg)); // OutputString (used for debugging)
			} else if (chunkID === 254) {
				MB_editor.addLoggedData(String(this.returnedValue(msg))); // used for debugging
			} else {
				MB_editor.showResult(chunkID, this.returnedValue(msg));
			}
		} else if (op === this.msgNameToID('varValueMsg')) {
			// not currently used
			// const varID = msg[2];
			// const varValue = this.returnedValue(msg);
		} else if (op === this.msgNameToID('versionMsg')) {
			this.versionReceived(this.returnedValue(msg));
		} else if (op === this.msgNameToID('chunkCRCMsg')) {
			this.crcReceived(msg[2], Array.from(msg).slice(5));
		} else if (op === this.msgNameToID('allCRCsMsg')) {
			this.allCRCsReceived(Array.from(msg).slice(5));
		} else if (op === this.msgNameToID('pingMsg')) {
			this.lastPingRecvMSecs = Date.now();
		} else if (op === this.msgNameToID('codeStoreFullMsg')) {
			// inform code store manager that code store is full
			// codeStoreFull = true
		} else if (op === this.msgNameToID('broadcastMsg')) {
			// not currently used
			// const broadcastMsg = this.bytesToString(msg.slice(5));
		} else if (op === this.msgNameToID('chunkCode16Msg')) {
			this.receivedChunk(msg[2], msg[5], Array.from(msg.slice(6)));
		} else if (op === this.msgNameToID('codeStoreUsedMsg')) {
			this.receivedCodeStoreUsed(Array.from(msg.slice(5)));
		} else if (op === this.msgNameToID('varNameMsg')) {
			this.receivedVarName(msg[2], this.bytesToString(msg.slice(5)), msg.length - 5);
		} else if (op === this.msgNameToID('fileInfo')) {
			this.recordFileTransferMsg(msg.slice(5));
		} else if (op === this.msgNameToID('fileChunk')) {
			this.recordFileTransferMsg(msg.slice(5));
		} else if (op === this.msgNameToID('clearGraphMsg')) {
			this.clearLoggedData();
		} else {
			console.log('msg:', Array.from(msg));
		}
	}

	returnedValue(msg) {
		if (msg.length < 7) return null; // incomplete msg

		const type = msg[5]; // byteAt msg 6 (1-based) = msg[5] (0-based)

		if (type === 1) { // integer (32-bit little-endian signed)
			if (msg.length < 10) return null;
			return (msg[9] << 24) | (msg[8] << 16) | (msg[7] << 8) | msg[6];
		} else if (type === 2) { // string
			return new TextDecoder().decode(msg.slice(6)); // bytes 7..end (1-based) = slice(6)
		} else if (type === 3) { // boolean
			return msg[6] !== 0; // byteAt msg 7 = msg[6]
		} else if (type === 4) { // list
			if (msg.length < 8) return null;
			const total = (msg[7] << 8) | msg[6]; // byteAt msg 8, 7
			if (total === 0) return '[empty list]';
			const sentItems = this.readItems(msg);
			const out = ['['];
			for (const item of sentItems) {
				out.push(String(item));
				out.push(', ');
			}
			if (out.length > 1) out.pop(); // remove trailing ', '
			if (total > sentItems.length) {
				out.push(' ... and ' + (total - sentItems.length) + ' more');
			}
			out.push(']');
			return out.join('');
		} else if (type === 5) { // byte array
			if (msg.length < 9) return null;
			const total = (msg[7] << 8) | msg[6]; // byteAt msg 8, 7
			if (total === 0) return '(empty byte array)';
			let sentCount = msg[8]; // byteAt msg 9 = msg[8]
			sentCount = Math.min(sentCount, msg.length - 9);
			const out = ['('];
			for (let i = 1; i <= sentCount; i++) {
				out.push(String(msg[8 + i])); // byteAt msg (9+i) with 1-based i → msg[8+i]
				out.push(', ');
			}
			if (out.length > 1) out.pop(); // remove trailing ', '
			if (total > sentCount) {
				out.push(' ... and ' + (total - sentCount) + ' more bytes');
			}
			out.push(')');
			return out.join('');
		} else {
			console.log('Serial error, type:', type);
			return null;
		}
	}

	readItems(msg) {
		// Read a sequence of list items from the given value message.
		const result = [];
		if (msg.length < 10) return result; // corrupted msg
		const count = msg[8]; // byteAt msg 9 (1-based) = msg[8] (0-based)
		let i = 10; // 1-based byte position, matching GP source

		for (let c = 0; c < count; c++) {
			if (msg.length < i + 1) return result; // corrupted msg
			const itemType = msg[i - 1]; // byteAt msg i (1-based) = msg[i-1] (0-based)

			if (itemType === 1) { // integer
				if (msg.length < i + 4) return result; // corrupted msg
				// byteAt msg (i+4..i+1) = msg[i+3..i] (1-based offset → 0-based offset - 1)
				const n = (msg[i + 3] << 24) | (msg[i + 2] << 16) | (msg[i + 1] << 8) | msg[i];
				result.push(n);
				i += 5;
			} else if (itemType === 2) { // string
				const len = msg[i]; // byteAt msg (i+1) = msg[i]
				if (msg.length < i + len + 1) return result; // corrupted msg
				// copyFromTo msg (i+2) (i+len+1): 1-based positions → 0-based slice(i+1, i+len+1)
				result.push(new TextDecoder().decode(msg.slice(i + 1, i + len + 1)));
				i += len + 2;
			} else if (itemType === 3) { // boolean
				result.push(msg[i] !== 0); // byteAt msg (i+1) = msg[i]
				i += 2;
			} else if (itemType === 4) { // sublist (nested list, only count shown)
				if (msg.length < i + 3) return result; // corrupted msg
				const n = (msg[i + 1] << 8) | msg[i]; // byteAt msg (i+2), (i+1)
				if (msg[i + 2] !== 0) { // byteAt msg (i+3) — non-zero sent items not supported here
					console.log('skipping sublist with non-zero sent items');
					return result;
				}
				result.push('[' + n + ' item list]');
				i += 4;
			} else if (itemType === 5) { // byte array (only count shown)
				if (msg.length < i + 3) return result; // corrupted msg
				const n = (msg[i + 1] << 8) | msg[i]; // byteAt msg (i+2), (i+1)
				if (msg[i + 2] !== 0) { // byteAt msg (i+3)
					console.log('skipping bytearray with non-zero sent items inside a list');
					return result;
				}
				result.push('(' + n + ' bytes)');
				i += 4;
			} else {
				console.log('unknown item type in value message:', itemType);
				return result;
			}
		}
		return result;
	}

	// --- Message sending ---

	async sendMsg(msgName, chunkID = 0, byteList = null) {
		if (!this.isConnected()) return;

		if (chunkID == null) chunkID = 0;
		const msgID = this.msgNameToID(msgName);
		let msgArr;
		if (byteList == null) { // short message
// if (msgID != this.msgNameToID('pingMsg')) console.log('send short', msgID, chunkID); // xxx
			msgArr = [250, msgID, chunkID];
		} else { // long message
// console.log('send long', msgID, chunkID, 'bytes', byteList.length); // xxx
			const bodyByteCount = byteList.length + 1;
			msgArr = [251, msgID, chunkID, bodyByteCount & 255, (bodyByteCount >> 8) & 255,
				...byteList, 254]; // 254 is terminator byte (helps board detect dropped bytes)
		}
		let dataToSend = new Uint8Array(msgArr);

		if (this.portName === 'boardie') { // send all data at once to boardie
			this.port.write(dataToSend);
			return;
		}

		while (dataToSend.length > 0) {
			if (!this.isConnected()) return; // connection lost
			let chunkSize = dataToSend.length;
			if (this.portName !== 'BLE' || isMobile()) {
				// Note: Serial receive buffer is only 63 bytes on many boards so limit chunkSize.
				// In addition, some mobile devices (e.g. iPhones 11-13 and some Android devices)
				// fail if over 63 bytes are written to BLE at a time due to a hardware/driver issue.
				chunkSize = Math.min(63, chunkSize);
			}
			const chunk = dataToSend.slice(0, chunkSize);
			const bytesSent = this.port.write(chunk);
			await waitMSecs(3); // limit throughput to avoid overrunning buffer when board is busy
			if (bytesSent < chunkSize) await waitMSecs(25); // output queue full; wait a bit
			dataToSend = dataToSend.slice(bytesSent);
		}
	}

	async sendMsgSync(msgName, chunkID = 0, byteList = null) {
		// Send a message followed by a 'pingMsg', then wait for a ping response from VM.
		await this.readAvailableSerialData();
		this.sendMsg(msgName, chunkID, byteList);
		if (this.portName === 'boardie') return true; // don't wait for a response

		if (!this.connectedToBoard()) return false;

		const ok = await this.waitForResponse();
		if (!ok) {
			console.log('Lost communication to the board in sendMsgSync');
			this.disconnect();
			return false;
		}
		return true;
	}

	// --- Version string parsing ---

	versionReceived(versionString) {
		if (versionString == null) return; // bad version message
		const justConnected = (this.vmVersion == null);
		this.vmVersion = this.extractVersionNumber(versionString);
		this.boardType = this.extractBoardType(versionString);
	}

	extractVersionNumber(versionString) {
		// Return the version number from the versionString.
		// Version string format: vNNN, where NNN is one or more decimal digits,
		// followed by non-digit characters that are ignored. Ex: 'v052a micro:bit'
		const words = versionString.substring(1).trim().split(/\s+/);
		if (words.length === 0 || words[0] === '') return -1;
		let result = 0;
		for (const ch of words[0]) {
			if (!/\d/.test(ch)) return result;
			result = (10 * result) + (ch.charCodeAt(0) - 48); // 48 = '0'.charCodeAt(0)
		}
		return result;
	}

	extractBoardType(versionString) {
		// Return the board type from the versionString.
		// Version string format: vNNN [boardType]
		const words = versionString.substring(1).trim().split(/\s+/);
		if (words.length === 0 || words[0] === '') return 'Unknown';
		return words.slice(1).join(' ');
	}

	// --- CRC Reception ---

	crcReceived(chunkID, crc) {
		if (this.codeManager) this.codeManager.crcReceived(chunkID, crc);
	}

	// --- Code File Updates ---

	suspendCodeFileUpdates() {
		this.sendMsgSync('extendedMsg', 2);
	}

	resumeCodeFileUpdates() {
		this.sendMsg('extendedMsg', 3);
	}
}

// Global singleton
const MB_connection = new MB_Connection();
