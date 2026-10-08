/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Copyright 2022 John Maloney, Bernat Romagosa, and Jens Mönig

// boardie.c - Boardie - A Simulated MicroBlocks Board for Web Browsers
// John Maloney and Bernat Romagosa, October 2022

#include <stdio.h>
#include <stdlib.h>
#include <sys/time.h>

#include <emscripten.h>

#include "mem.h"
#include "interp.h"
#include "persist.h"

// Timing Functions

static int startSecs = 0;

static void initTimers() {
	struct timeval now;
	gettimeofday(&now, NULL);
	startSecs = now.tv_sec;
}

uint32 microsecs() {
	struct timeval now;
	gettimeofday(&now, NULL);

	return ((1000000 * (now.tv_sec - startSecs)) + now.tv_usec) & 0xFFFFFFFF;
}

uint32 millisecs() {
	return microsecs() / 1000;
}

uint64 totalMicrosecs() {
	// Returns a 64-bit integer containing microseconds since start.

	struct timeval now;
	gettimeofday(&now, NULL);

	uint64 secs = now.tv_sec - startSecs;
	return (1000000 * secs) + now.tv_usec;
}

// Communication/System Functions

char BLE_ThreeLetterID[4] = "";

void initMessageService() {
	EM_ASM_({
		window.recvBuffer = [];
		window.addEventListener('message', function (event) {
			if (event.data.constructor === Uint8Array) {
				window.recvBuffer.push(...event.data);
			} else if (event.data.constructor === Array) {
				switch (event.data[0]) {
					case 'putFile':
						// store file in Boardie's localStorage
						window.localStorage[event.data[1]] = event.data[2];
						return;
					case 'keyDown':
						// button pressed
						window.keys.set(event.data[1], true);
						return;
					case 'keyUp':
						// button released
						window.keys.set(event.data[1], false);
						return;
					default:
						console.log('unrecognized message:', event.data[0]);
						return;
				}
			}
		}, false);
	});
}

void syncFiles() {
	// update IDE file cache with all files from Boardie's [local/session]Storage
	EM_ASM_({
		var origin = window.useSessionStorage ? 'session' : 'local';
		Object.keys(window.localStorage).forEach(function (fileName) {
			window.parent.postMessage(
				[
					'boardieGetFile',
					fileName,
					window[origin + 'Storage'][fileName]
				],
				'*'
			);
		});
	});
}

int nextByte() {
	return EM_ASM_INT({
		// Returns first byte in the buffer, and removes it from the buffer
		return window.recvBuffer.splice(0, 1)[0];
	});
}

int canReadByte() {
	return EM_ASM_INT({
		if (!window.recvBuffer) { window.recvBuffer = []; }
		return window.recvBuffer.length > 0;
	});
}

int recvBytes(uint8 *buf, int count) {
	int total = 0;
	while (canReadByte() && total <= count) {
		buf[total] = nextByte();
		total++;
	}
	return total;
}

int sendBytes(uint8 *buf, int start, int end) {
	EM_ASM_({
		var bytes = new Uint8Array($2 - $1);
		for (var i = $1; i < $2; i++) {
			bytes[i - $1] = getValue($0 + i, 'i8');
		}
		window.parent.postMessage(bytes, '*');
	}, buf, start, end);
	return end - start;
}

// Keyboard support

void initKeyboardHandler() {
	EM_ASM_({
		window.keys = new Map();
		window.addEventListener('keydown', function (event) {
			window.parent.postMessage(['boardieKeyDown', event.keyCode], '*');
			window.keys.set(event.keyCode, true);
		}, false);
		window.addEventListener('keyup', function (event) {
			window.parent.postMessage(['boardieKeyUp', event.keyCode], '*');
			window.keys.set(event.keyCode, false);
		}, false);
	});
}

// Sound support

void initSound() {
	EM_ASM_({
		window.audioContext = new AudioContext();
		window.gainNode = window.audioContext.createGain();
		window.gainNode.gain.value = 0.1;
		window.oscillator = window.audioContext.createOscillator();
		window.oscillator.type = 'square';
		window.oscillator.start();
		window.gainNode.connect(window.audioContext.destination);
	});
};

// System Functions

const char * boardType() {
	return "Boardie";
}

// Grab ublockscode as a base64 URL
void EMSCRIPTEN_KEEPALIVE getScripts() {
	compactCodeStore(NULL, NULL);
	EM_ASM_({
		console.log(
			Module['base64Encode'](HEAP8.subarray($0, $0 + $1), true)
		);
		// could be new Uint8Array(HEAP8.subarray($0, $0 + $1))
	}, ramStart(), ramSize());
}

void readFilesFromURL() {
	EM_ASM_({
		var paramStart = window.location.hash.indexOf('&files');
		if (paramStart > 0) {
			window.useSessionStorage = true;
			// "&files=" is 7 chars
			var files = window.location.hash.substr(paramStart + 7);
			// split files by commas
			files.split(',').forEach(descriptor => {
				var fileStart = descriptor.indexOf(':');
				var fileName = decodeURIComponent(
						descriptor.substring(0, fileStart)
					);
				console.log('Loading', fileName);
				var contents = Module['base64Decode'](
						descriptor.substring(fileStart + 1),
						true // urlSafe
					);
				window.sessionStorage[fileName] = contents;
			});
		}
	});
}

void readScriptsFromURL() {
	EM_ASM_({
		if (window.location.hash.startsWith('#code=')) {
			// "#code=" is 6 chars
			var andIndex = window.location.hash.indexOf('&');
			var b64 = window.location.hash.substring(
					6,
					andIndex > -1 ? andIndex : window.location.hash.length
				);
			console.log('Loading code from URL');
			if (b64) {
				var bytes = Module['base64Decode'](b64, true);
				for (var i = 0; i < bytes.length; i++) {
					setValue($0, bytes[i], 'i8');
					$0++;
				}
			}
		}
	}, ramStart());
	readFilesFromURL();
	restoreScripts();
	startAll();
}

// Stubs for functions not used by Boardie

void addBLEPrims() {}
void addCameraPrims() {}
void addElecfreaksPrims() {}
void addElecfreaksSensorPrims() {}
void addEncoderPrims() {}
void addHIDPrims() {}
void addOneWirePrims() {}
void addRadioPrims() {}
void addSDCardPrims() {}
void addSoundPrims() {}

void delay(int msecs) {}
void processFileMessage(int msgType, int dataSize, char *data) {}
void resetRadio() {}

// Stubs for code file (persistence) not yet used by Boardie

int initCodeFile(uint8 *flash, int flashByteCount) { return 0; }
void writeCodeFile(uint8 *code, int byteCount) { }
void writeCodeFileWord(int word) { }
void clearCodeFile(int ignore) { }
void BLE_setEnabled(int enableFlag) { }

// Main loop

int main(int argc, char *argv[]) {
	printf("Starting Boardie\n");

	initMessageService();
	initKeyboardHandler();
	initSound();

	syncFiles();

	initTimers();
	memInit();
	primsInit();
	restoreScripts();
	startAll();
	readScriptsFromURL();

	printf("Starting interpreter\n");
	emscripten_set_main_loop(interpretStep, 60, true); // callback, fps, loopFlag
}
