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

static OBJ primNezhaButtonA(int argCount, OBJ *args) {
	// Elecfreaks TODO: insert implementation or call Elecfreaks library here
	// This primitive should return trueObj or falseObj.
	return falseObj;
}

// Elecfreaks TODO: Add other Elecfreaks and Elecfreaks Sensor primitives here...

#endif

// Elecfreaks Primitives

static PrimEntry elfreaksPrimEntries[] = {
	#if defined(NEZHA_ESP32)
		{"buttonA", primNezhaButtonA},
		// Elecfreaks TODO: Add entries for other Elecfreaks primitives here...
	#endif
};

void addElecfreaksPrims() {
	addPrimitiveSet(EFPrims, "elfreaks",
		sizeof(elfreaksPrimEntries) / sizeof(PrimEntry), elfreaksPrimEntries);
}

// Elecfreaks Sensor Primitives

static PrimEntry elfreaksSensorPrimEntries[] = {
	#if defined(NEZHA_ESP32)
		// Elecfreaks TODO: Add entries for Elecfreaks Sensor primitives here...
	#endif
};

void addElecfreaksSensorPrims() {
	addPrimitiveSet(EFDevSensorPrims, "elfreaks_dev_sensor",
		sizeof(elfreaksSensorPrimEntries) / sizeof(PrimEntry), elfreaksSensorPrimEntries);
}

#if defined(NEZHA_ESP32)

// Nezha ESP32 board hooks (see boardHooks.h)
// The VM calls these at fixed points, so the Elecfreaks library does not need to include
// vm.ino, patch the VM sources, or call VM functions from its own tasks.

void boardEarlyInit() {
	// Elecfreaks TODO: work that must happen before the VM starts, such as waiting for
	// power-on. (Currently BoardInit(), called from Arduino's initVariant().)
}

void boardInit() {
	// Elecfreaks TODO: start the board services once pins and the display are set up.
}

void boardAddPrims() {
	// Elecfreaks TODO: add or fill in the EFPrims and EFDevSensorPrims sets here if the
	// library provides its own tables. (Currently registerPrims(), called after setup().)
}

void boardPoll() {
	// Elecfreaks TODO: periodic work that must run on the VM thread.
	// (Currently userProgramsPoll().)
}

void boardStopAll() {
	// Elecfreaks TODO: stop the motors and other outputs the library owns.
	// To stop everything from another task, such as on power-off, call vmRequestStopAll().
	// (Currently StopPowerOutputs() calls stopPWM(), stopServos() and stopTone() directly.)
}

void boardIDEConnectionChanged(int isConnected) {
	// Elecfreaks TODO: update the UI when the IDE connects or disconnects.
	// (Currently a patch to processMessage() in runtime.c calls notifyIDEActivity().)
}

#endif
