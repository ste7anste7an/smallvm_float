/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// m5stickS3Prims.cpp - StickS3 M5PM1 power management
// Register definitions: https://github.com/m5stack/M5PM1

#include "mem.h"
#include "interp.h"

#if defined(M5Stick_S3)

#include <Arduino.h>

// Internal I2C helpers are implemented in sensorPrims.cpp.
int stickS3StartWire();
int stickS3ReadReg(int deviceID, int reg);
void stickS3WriteReg(int deviceID, int reg, int value);

#define PM1_ADDR 0x6E
#define PM1_POWER_CONFIG 0x06
#define PM1_I2C_CONFIG 0x09
#define PM1_GPIO_MODE 0x10
#define PM1_GPIO_OUTPUT 0x11
#define PM1_GPIO_DRIVE 0x13
#define PM1_GPIO_FUNCTION 0x16

static int powerStarted = false;

static int updatePM1(int reg, int mask, int value) {
	int oldValue = stickS3ReadReg(PM1_ADDR, reg);
	if (oldValue < 0) return false;
	int newValue = (oldValue & ~mask) | (value & mask);
	stickS3WriteReg(PM1_ADDR, reg, newValue);
	return stickS3ReadReg(PM1_ADDR, reg) == newValue;
}

void stickS3PowerInit() {
	if (powerStarted) return;
	if (!stickS3StartWire()) {
		outputString("StickS3 internal i2c initialization failed");
		return;
	}
	// The first transaction wakes a sleeping PM1 and may fail.
	stickS3ReadReg(PM1_ADDR, 0);
	delay(10);
	if (stickS3ReadReg(PM1_ADDR, 0) < 0) {
		outputString("StickS3 M5PM1 not found");
		return;
	}
	stickS3WriteReg(PM1_ADDR, PM1_I2C_CONFIG, 0); // disable idle sleep, keep 100 kHz
	int ok = updatePM1(PM1_POWER_CONFIG, 0x0D, 0x05); // charging and IMU LDO; EXT_5V input
	ok &= updatePM1(PM1_GPIO_FUNCTION, 0xF0, 0); // PYG2 (LCD power) and PYG3 (speaker) as GPIO
	ok &= updatePM1(PM1_GPIO_DRIVE, 0x0C, 0); // push-pull
	ok &= updatePM1(PM1_GPIO_OUTPUT, 0x0C, 0x04); // LCD rail on, speaker amplifier off
	ok &= updatePM1(PM1_GPIO_MODE, 0x0C, 0x0C); // outputs
	if (!ok) {
		outputString("StickS3 power initialization failed");
		return;
	}
	delay(100); // allow the LCD power rail to settle
	powerStarted = true;
}

#endif
