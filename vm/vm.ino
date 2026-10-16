/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Copyright 2018 John Maloney, Bernat Romagosa, and Jens Mönig

#include "mem.h"
#include "interp.h"
#include "persist.h"

int resetDoubleTap = false;

#if defined(SPRINGBOT)
	#define RED_LED_PIN 40
	#define DOUBLE_TAP_PIN 42

	void checkForDoubleTap() {
		// read the remembered pin state as early as possible
		pinMode(DOUBLE_TAP_PIN, INPUT);
		resetDoubleTap = digitalRead(DOUBLE_TAP_PIN);
		if (resetDoubleTap) {
			beep(784, 200); // G
			beep(659, 200); // E
			return;
		}

		// arm DOUBLE_TAP_PIN for the next reset
		pinMode(DOUBLE_TAP_PIN, OUTPUT);
		pinMode(RED_LED_PIN, OUTPUT);
		digitalWrite(DOUBLE_TAP_PIN, HIGH);
		digitalWrite(RED_LED_PIN, HIGH); // turn on red LED to tell user they can click again
		delay(1000); // second tap must occur during this delay

		// External 1 MΩ discharges the 1 µF capacitor
		// This holds the pin high for about 450 msecs, during
		// which time the ESP32 is rebooting (200-400 msecs).
		// The pin is checked as soon as setup() is called.
		// If it is high, then the reset button was pressed
		// during the double-tap delay above.

		pinMode(RED_LED_PIN, INPUT); // turn off red LED
		pinMode(DOUBLE_TAP_PIN, INPUT); // release DOUBLE_TAP_PIN
	}
#endif

void setup() {
#ifdef ARDUINO_NRF52_PRIMO
	sd_softdevice_disable();
#elif defined(SPRINGBOT)
	checkForDoubleTap();
#endif

	memInit();
	primsInit();
	hardwareInit();
	outputString((char *) "Welcome to MicroBlocks!");
	restoreScripts();
	if (BLE_isEnabled()) BLE_start();
	if (resetDoubleTap) loadStartCodeOrClear();
	if (boardStartAtBoot()) startAll();
}

void loop() {
	vmLoop();
}
