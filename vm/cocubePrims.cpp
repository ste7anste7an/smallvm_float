/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// cocubePrims.cpp - Board hooks and primitives for CoCube
// CoCube's position sensor support comes from the CoCubeSensor library (lib_deps).
// This file is the glue between that library and the VM: the board hooks (see boardHooks.h)
// and the position primitives, which are registered in the sensors primitive set in
// sensorPrims.cpp so existing CoCube libraries keep calling them by the same names.

#include <Arduino.h>

#include "mem.h"
#include "interp.h"

#if defined(COCUBE)

#include <CoCubeSensor.h>
#include "soc/rtc_cntl_reg.h" // for brownout control

CoCubeSensor cocube;

// Board Hooks

void boardInit() {
	WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // disable brownout detector
	cocube.Init();
}

void boardAddPrims() { }

void boardPoll() {
	cocube.Update();
	#if !defined(COCUBE_SOCCER)
		cocube.EncoderUpdate();
	#endif
}

void boardStopAll() { }

void boardIDEConnectionChanged(int isConnected) { }
int boardStartAtBoot() { return true; }

// Position Primitives

OBJ primCoCubePositionX(int argCount, OBJ *args) {
	return int2obj(cocube.GetX());
}

OBJ primCoCubePositionY(int argCount, OBJ *args) {
	return int2obj(cocube.GetY());
}

OBJ primCoCubePositionYaw(int argCount, OBJ *args) {
	return int2obj(cocube.GetAngle());
}

OBJ primCoCubeIndex(int argCount, OBJ *args) {
	return int2obj(cocube.GetIndex());
}

OBJ primCoCubeStatus(int argCount, OBJ *args) {
	return cocube.GetState() ? trueObj : falseObj;
}

OBJ primCoCubeSpeedLeft(int argCount, OBJ *args) {
	#if defined(COCUBE_SOCCER)
		return zeroObj;
	#else
		return int2obj((int) cocube.GetSpeedLeft());
	#endif
}

OBJ primCoCubeSpeedRight(int argCount, OBJ *args) {
	#if defined(COCUBE_SOCCER)
		return zeroObj;
	#else
		return int2obj((int) cocube.GetSpeedRight());
	#endif
}

#endif // COCUBE
