/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// boardHooks.c - Default board hooks and the VM thread request queue

#include <stdio.h>

#include "mem.h"
#include "interp.h"

// Default board hooks for boards without a glue file

#if !defined(HAS_BOARD_HOOKS)

void boardInit() { }
void boardAddPrims() { }
void boardPoll() { }
void boardStopAll() { }
void boardIDEConnectionChanged(int isConnected) { }
int boardStartAtBoot() { return true; }

#endif

// VM thread requests

#define MAX_VM_REQUESTS 4

typedef struct {
	VMThreadFunction fn;
	void *arg;
} VMRequest;

static VMRequest vmRequests[MAX_VM_REQUESTS];
static int vmRequestFirst = 0;
static int vmRequestCount = 0;

#if defined(ARDUINO_ARCH_ESP32)
	// Board tasks may run on the other core, so masking interrupts is not enough.
	#include "freertos/FreeRTOS.h"
	static portMUX_TYPE vmRequestMux = portMUX_INITIALIZER_UNLOCKED;
	#define VM_REQUEST_LOCK() portENTER_CRITICAL(&vmRequestMux)
	#define VM_REQUEST_UNLOCK() portEXIT_CRITICAL(&vmRequestMux)
#else
	// No board calls in from another task or core on these platforms yet.
	// Add a lock here (see blePrims.cpp) before one does.
	#define VM_REQUEST_LOCK()
	#define VM_REQUEST_UNLOCK()
#endif

int vmCallOnVMThread(VMThreadFunction fn, void *arg) {
	int ok = false;
	VM_REQUEST_LOCK();
		if (fn && (vmRequestCount < MAX_VM_REQUESTS)) {
			int i = (vmRequestFirst + vmRequestCount) % MAX_VM_REQUESTS;
			vmRequests[i].fn = fn;
			vmRequests[i].arg = arg;
			vmRequestCount++;
			ok = true;
		}
	VM_REQUEST_UNLOCK();
	return ok;
}

void processVMRequests() {
	// Run queued requests. Called from vmLoop() between tasks.

	while (true) {
		VMRequest request = { NULL, NULL };
		VM_REQUEST_LOCK();
			if (vmRequestCount > 0) {
				request = vmRequests[vmRequestFirst];
				vmRequestFirst = (vmRequestFirst + 1) % MAX_VM_REQUESTS;
				vmRequestCount--;
			}
		VM_REQUEST_UNLOCK();
		if (!request.fn) return;
		request.fn(request.arg); // run outside the lock; it may queue another request
	}
}

static void stopAllRequest(void *arg) {
	stopAllAndSoftReset();
}

int vmRequestStopAll() {
	return vmCallOnVMThread(stopAllRequest, NULL);
}

int vmIDEConnected() {
	return ideConnected();
}
