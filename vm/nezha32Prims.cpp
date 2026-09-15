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

// How the Elecfreaks library connects to MicroBlocks
//
// This file is the only place MicroBlocks calls the Elecfreaks library (the same pattern as
// cocubePrims.cpp). The library should not include vm.ino, patch files in vm/, or call VM
// functions from its own FreeRTOS tasks. Instead:
//
//  1. Primitives go in the two Elecfreaks sets, EFPrims ("elfreaks") and EFDevSensorPrims
//     ("elfreaks_dev_sensor"). Either write them below, calling the library as buttonA shows,
//     or register the library's own tables from boardAddPrims(). Use one approach, not both,
//     and do not register over the MicroBlocks core sets such as tft.
//  2. Startup, periodic work, stop and IDE connection go in the board hooks at the end of
//     this file. Each has an example of the library call it replaces.
//  3. Code on the library's own tasks talks to the VM only through the functions in the
//     "VM thread requests" section of boardHooks.h: vmRequestStopAll() to stop everything,
//     vmCallOnVMThread() to run anything else on the VM thread, and vmIDEConnected() to read
//     the connection state.
//
// With that in place the library no longer needs its vm.cpp or the change to processMessage()
// in runtime.c.

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
// All hooks run on the VM thread. The examples are the calls the library makes today from its
// vm.cpp, runtime.c change and power-off code (nezha_for_esp32_microblocks 1.0.7).

void boardEarlyInit() {
	// Elecfreaks TODO: board setup that must happen before the VM starts.
	// Example: BoardInit();
	// BoardInit() currently runs from Arduino's initVariant(), just before setup().
	// This hook runs at the start of setup(). Please tell us if that is too late.
}

void boardInit() {
	// Elecfreaks TODO: setup that needs the MicroBlocks pins and display initialized first.
	// Nothing is needed here if all of the setup is in boardEarlyInit().
}

void boardAddPrims() {
	// Elecfreaks TODO: register the library's primitive tables, if you use that approach.
	// Example: Blocks::Instance().registerPrims();
	// Register only the EFPrims and EFDevSensorPrims sets here. In 1.0.7, registerPrims() also
	// registers a tft set, which would replace the MicroBlocks TFT primitives.
}

void boardPoll() {
	// Elecfreaks TODO: periodic work that must run on the VM thread.
	// Example: userProgramsPoll();
	// Code here may call VM functions directly, including stopAllAndSoftReset() to stop the
	// current program before loading another one.
}

void boardStopAll() {
	// Elecfreaks TODO: stop the motors and other outputs the library owns.
	// Example: NezhaRobot::Instance().Stop(); NezhaMotor::Instance().StopAll();
	// These run on the VM thread, so they must be safe to call alongside the library's tasks.
	// The VM calls this whenever it stops all tasks: the IDE stop button, starting a program,
	// and reset. To stop everything from the library's own task, such as on power-off, call
	// vmRequestStopAll() rather than stopPWM(), stopServos() and stopTone().
}

void boardIDEConnectionChanged(int isConnected) {
	// Elecfreaks TODO: update the UI when the IDE connects or disconnects.
	// Example: if (isConnected) smallmvUIOnIDEConnected();
	// isConnected becomes false a few seconds after the IDE stops sending messages.
}

#endif
