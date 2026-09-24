/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// boardHooks.h - Hooks for boards whose support lives in a vendor library
//
// CoCube and the Elecfreaks Nezha ESP32 get most of their support from a library pulled in
// through lib_deps. Instead of adding #if blocks to the VM core for each one, the VM calls
// these hooks at fixed points and the board implements them in its glue file in vm/
// (cocubePrims.cpp, nezha32Prims.cpp), which calls into the library. Boards without a glue file
// get empty versions from boardHooks.c.
//
// The glue file makes ordinary calls into the library. That matters: PlatformIO links
// libraries as archives, and the linker only takes an archive member that something
// references, so a weak default in the VM with an override in the library would quietly
// keep the default.

#ifndef BOARD_HOOKS_H
#define BOARD_HOOKS_H

#ifdef __cplusplus
extern "C" {
#endif

// Boards that provide their own hooks. Add a board here when it gets a glue file.

#if defined(COCUBE) || defined(NEZHA_ESP32)
	#define HAS_BOARD_HOOKS 1
#endif

#if defined(COCUBE)
	#define BOARD_BLE_NAME "CoCube"
	#define STARTUP_GESTURE_ALWAYS 1 // the startup gesture works at any time, not just after boot
#endif

#ifndef BOARD_BLE_NAME
	#define BOARD_BLE_NAME "MicroBlocks"
#endif

// Board lifecycle hooks. All are called on the VM thread.

void boardInit();		// end of hardwareInit(), after pins and the display are set up
void boardAddPrims();	// end of primsInit(), to add or fill in the board's own primitive sets
void boardPoll();		// with the VM's other background work, about every 100 VM loop cycles
void boardStopAll();	// when the VM resets its outputs: the stop button, starting a program, reset
void boardIDEConnectionChanged(int isConnected); // when the IDE connects or disconnects
int boardStartAtBoot(); // true if the VM should start the user's program at the end of setup()

// VM thread requests, for board code running on its own task or core.
// VM state must only be changed on the VM thread. Board code queues the work here and
// the VM runs it between tasks, never in the middle of a primitive. The request functions
// return false if the queue is full.

typedef void (*VMThreadFunction)(void *arg);

int vmCallOnVMThread(VMThreadFunction fn, void *arg);
int vmRequestStopAll(); // same as the IDE stop button
int vmIDEConnected(); // true if the IDE sent a message in the last few seconds; safe from any task

// Used by the VM itself

void processVMRequests();
void stopAllAndSoftReset();

#ifdef __cplusplus
}
#endif

#endif // BOARD_HOOKS_H
