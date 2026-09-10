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

#if defined(BOARD_NEZHA_FOR_ESP32)

static OBJ primNezhaButtonA(int argCount, OBJ *args) {
	// Elecfreaks TODO: insert implementation or call Elecfreaks library here
	// This primitive should return trueObj or falseObj.
	return falseObj;
}

// Elecfreaks TODO: Add other Elecfreaks and Elecfreaks Sensor primitives here...

#endif

// Elecfreaks Primitives

static PrimEntry elfreaksPrimEntries[] = {
	#if defined(BOARD_NEZHA_FOR_ESP32)
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
	#if defined(BOARD_NEZHA_FOR_ESP32)
		// Elecfreaks TODO: Add entries for Elecfreaks Sensor primitives here...
	#endif
};

void addElecfreaksSensorPrims() {
	addPrimitiveSet(EFDevSensorPrims, "elfreaks_dev_sensor",
		sizeof(elfreaksSensorPrimEntries) / sizeof(PrimEntry), elfreaksSensorPrimEntries);
}
