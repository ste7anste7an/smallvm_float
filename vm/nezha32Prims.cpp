/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// nezha32Prims.cpp - Primitives to support the Elecfreaks Nezha ESP32 board
// (These primitives are not implemented on other boards; they require Nezha ESP32 hardware.)
// John Maloney, September 2026

#include <Arduino.h>
#include <stdio.h>
#include <stdlib.h>

#include "mem.h"
#include "interp.h"

#if defined(NEZHA_ESP32)
	#include <NezhaMicroBlocks.h> // nezha_microblocks library (lib_deps)
#endif

// How the Elecfreaks library connects to MicroBlocks
//
// Board support for the Nezha ESP32 is a prebuilt library, nezha_microblocks, the same
// arrangement as CoCubeSensor (see vm/cocubePrims.cpp). This file is the only place
// MicroBlocks calls it, through the board hooks in boardHooks.h and the C entry points in
// the library's NezhaMicroBlocks.h.
//
// The library registers its own primitive tables from boardAddPrims(): the two Elecfreaks
// sets. The tft set is the MicroBlocks one, drawing through the library's canvas calls
// (see NezhaDisplay in tftPrims.cpp).
//
// Code on the library's own tasks talks to the VM only through the VM thread requests in
// boardHooks.h: vmRequestStopAll(), vmCallOnVMThread() and vmIDEConnected().

// Elecfreaks Primitives

// These two primitive sets are registered empty, then replaced by the library's tables in boardAddPrims().

static PrimEntry noPrimEntries[] = { };

void addElecfreaksPrims() {
	addPrimitiveSet(EFPrims, "elfreaks", 0, noPrimEntries);
}

void addElecfreaksSensorPrims() {
	addPrimitiveSet(EFDevSensorPrims, "elfreaks_dev_sensor", 0, noPrimEntries);
}

#if defined(NEZHA_ESP32)

// Nezha ESP32 board hooks (see boardHooks.h). All run on the VM thread.

void nezhaTFTClose();
void nezhaTFTInit();

void boardInit() {
	nezhaTFTClose();
	nezhaMB_BoardInit(); // start the board before the VM initializes
	tftInit(); // the display canvas exists only once the board has started
}

void boardAddPrims() {
	nezhaMB_RegisterPrims(); // the library's elfreaks and elfreaks_dev_sensor sets
}

void boardPoll() {
	taskYIELD(); // prevents watchdog timer from tripping
	nezhaMB_UserProgramsPoll(); // the library's saved program operations run on this thread
}

void boardStopAll() {
	nezhaMB_StopAll(); // stop the robot and all motors
}

void boardIDEConnectionChanged(int isConnected) {
	nezhaMB_IDEConnectionChanged(isConnected);
}

int boardStartAtBoot() {
	// The library's Program page decides what runs: it starts the default saved program, or
	// shows the program list when there isn't one. Starting the code store here would pre-empt it.
	return false;
}

#endif
