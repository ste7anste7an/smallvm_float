/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Copyright 2026 John Maloney, Bernat Romagosa, and Jens Mönig

// soundPrims.c - Sound and signal processing primitives: FFT, pitch detection, and tone levels
// Sam McHardy, October 2026
//
// Samples are a list of integers (-32768..32767) or a ByteArray of signed 16-bit
// little-endian values. All arithmetic is integer, so results are the same on every board.
// Amplitudes are in sample units: a sine of amplitude A reads A in the fft bin it is
// centred in, and in goertzel at its own frequency.

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "mem.h"
#include "interp.h"

// I2S Primitives

#if defined(ESP32)

#include <driver/i2s.h>

#define HAS_I2S 1
#define DEFAULT_BUFFER_SIZE 512 // in samples; min = 8; max = 1023 (DMA descriptor limit)

// NOTE: I2S_PORT 0 is also used by the microphone primitive in sensorPrims.cpp.
// However, only I2S_NUM_0 supports I2S_MODE_PDM so we have to use it here.
// TODO: Make the microphone code use this code to avoid an I2S device conflict.
#define I2S_PORT I2S_NUM_0

static int i2sRunning = false;

static void stopI2S() {
	if (i2sRunning) {
		i2s_stop(I2S_PORT);
		i2s_driver_uninstall(I2S_PORT);
		i2sRunning = false;
	}
}

static void startI2S(
	int sampleRate, int bufferSize, int isPDM,
	int bitClockPin, int wordClockPin, int inputPin, int outputPin) {

	if (i2sRunning) stopI2S(); // if running, stop the I2S driver

	int mode = I2S_MODE_MASTER;
	if (inputPin >= 0) mode |= I2S_MODE_RX;
	if (outputPin >= 0) mode |= I2S_MODE_TX;
	if (isPDM) mode |= I2S_MODE_PDM;

	// configure I2S driver
	const i2s_config_t i2s_config = {
		.mode = i2s_mode_t(mode),
		.sample_rate = (uint32_t) sampleRate,
		.bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
		.channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT, // I2S device always captures stereo
		.communication_format = I2S_COMM_FORMAT_STAND_I2S,
		.intr_alloc_flags = 0,
		.dma_buf_count = 3, // minimum is 3
		.dma_buf_len = bufferSize,
		.use_apll = false,
		.tx_desc_auto_clear = true,
	};
	i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
	i2s_pin_config_t pin_config = {
		.bck_io_num = bitClockPin,
		.ws_io_num = wordClockPin,
		.data_out_num = outputPin,
		.data_in_num = inputPin
	};
	i2s_set_pin(I2S_PORT, &pin_config);

	// start I2S driver
	i2s_start(I2S_PORT);
	i2sRunning = true;
}

static int i2sReadBytes(uint8_t *buffer, int maxBytes) {
	// Read I2S input data into the given buffer and return the number of bytes read.

	if (!i2sRunning) return 0;
	size_t bytesRead = 0;
    esp_err_t err = i2s_read(I2S_NUM_0, buffer, maxBytes, &bytesRead, 0);
    return (int) bytesRead;
}

static int i2sWriteBytes(const uint8_t *buffer, int byteCount) {
	// Write the given buffer to the I2S output device and return the number of bytes written.

	if (!i2sRunning) return 0;
	size_t bytesWritten = 0;
	esp_err_t err = i2s_write(I2S_NUM_0, buffer, byteCount, &bytesWritten, 0);
	return bytesWritten;
}

#elif defined(ARDUINO_ARCH_RP2040)

#include <I2S.h>

#define HAS_I2S 1
#define DEFAULT_BUFFER_SIZE 512 // buffer size in samples

I2S i2s(INPUT_PULLUP); // bidirectional capable mode
static int i2sRunning = false;

static void stopI2S() {
	if (i2sRunning) {
		i2s.end();
		i2sRunning = false;
	}
}

static void startI2S(
	int sampleRate, int bufferSize, int isPDM,
	int bitClockPin, int wordClockPin, int inputPin, int outputPin) {

	// sanity checks
	if ((inputPin < 0) && (outputPin < 0)) return;
	if (wordClockPin != (bitClockPin + 1)) {
		outputString("word clock pin is always bitClockPin + 1 on Pico/Pico2");
	}

	if (sampleRate < 8000) sampleRate = 8000;
	i2s.setFrequency(sampleRate);
	i2s.setBitsPerSample(16);
	i2s.setBuffers(3, bufferSize);
	i2s.setBCLK(bitClockPin); // note: word clock pin is always bitClockPin + 1
	if (inputPin < 0) {
		i2s.setDATA(outputPin);
	} else if (outputPin < 0) {
		i2s.setDATA(inputPin);
	} else {
		i2s.setDIN(inputPin);
		i2s.setDOUT(outputPin);
	}
	i2s.begin();
}

static int i2sReadBytes(uint8_t *buffer, int maxBytes) {
	// Read I2S input data into the given buffer and return the number of bytes read.

	if (!i2sRunning) return 0;
	return i2s.read(buffer, maxBytes);
}

static int i2sWriteBytes(const uint8_t *buffer, int byteCount) {
	// Write the given buffer to the I2S output device and return the number of bytes written.

	if (!i2sRunning) return 0;
	return i2s.write(buffer, byteCount);
}

#endif

#if defined(HAS_I2S)

static OBJ primI2SBegin(int argCount, OBJ *args) {
	// I2S needs two clock pins pins and either an input pin, and output pin, or both.
	// args[0]: sample rate
	// args[1]: bit clock (BCK / SCK / CLK)
	// args[2]: left/right word clock (LRCK / WS)
	// args[3]: input pin (DATA / SD)
	// args[4]: output pin (DATA / SD)
	// args[5] (optional): true if device uses PDM (pulse density modulation
	// Note: PDM decoding is available on ESP32 only
	// args[6] (optional): buffer size in samples (range: 8-1023)

	if (!isInt(args[0])) fail(needsIntegerError);

	// optional pin args
	if ((argCount > 4) &&
		!(isInt(args[1]) && isInt(args[2]) && isInt(args[3]) && isInt(args[4]))) {
			fail(needsIntegerError);
	}

	int sampleRate = obj2int(args[0]);
	int clockPin = mapDigitalPinNum(obj2int(args[1]));
	int wordClockPin = mapDigitalPinNum(obj2int(args[2]));
	int inputPin = mapDigitalPinNum(obj2int(args[3]));
	int outputPin = mapDigitalPinNum(obj2int(args[4]));
	int isPDM = (argCount > 5) && args[5] == trueObj;
	int bufferSize = ((argCount > 6) && isInt(args[6])) ? obj2int(args[6]) : DEFAULT_BUFFER_SIZE;

	if (inputOnlyPin(clockPin) || inputOnlyPin(wordClockPin)) {
		outputString("Pin is input only");
		return fail(badPinError);
	}

	if (sampleRate < 10000) sampleRate = sampleRate; // minimum sample rates on ESP32 is 10000!
	if (bufferSize < 8) bufferSize = 8; // minimum on ESP32
	if (bufferSize > 1023) bufferSize = 1023; // limit on ESP32

	startI2S(sampleRate, bufferSize, isPDM, clockPin, wordClockPin, inputPin, outputPin);
	return falseObj;
}

static OBJ primI2SEnd(int argCount, OBJ *args) {
	stopI2S();
	return falseObj;
}

static OBJ primI2SRead(int argCount, OBJ *args) {
	// Read samples into the given list and set the list size to the number of samples read.
	// The result is always a monophonic list of 16-bit integers.
	// The optional second argument allows the caller to select the stereo channel
	// to read: 1 - left, 2 - right, 0 (the default) - both channels mixed.
	// The optional third argument allows the caller to limit the number of samples to read.
	// args[0] - list in which samples will be stored
	// args[1] (optional) - which channel to return 0 (default) - both (mixed), 1 - left, 2 - right
	// args[2] (optional) - maximum samples to read (default is the capacity of the list)

	if (argCount < 1) return fail(notEnoughArguments);
	if (!IS_TYPE(args[0], ListType)) return fail(needsListError);
	OBJ list = args[0];
	int listCapacity = objWords(list) - 1; // maximum capacity of list
	FIELD(list, 0) = zeroObj; // clear the list

	int whichChannel = ((argCount > 1) && isInt(args[1])) ? obj2int(args[1]) : 0;
	if (whichChannel > 2) whichChannel = 2; // whichChannel is 0 (mix), 1 (left), or 2 (right)

	int samplesToRead = ((argCount > 2) && isInt(args[2])) ? obj2int(args[2]) : listCapacity;
	if (samplesToRead <= 0) return falseObj;
	if (samplesToRead > listCapacity) samplesToRead = listCapacity;

	uint8_t buf[1024];
	size_t maxBytes = 4 * samplesToRead;
	if (maxBytes > sizeof(buf)) maxBytes = sizeof(buf);

	size_t bytesRead = i2sReadBytes(buf, maxBytes);
	int count = bytesRead / 4;
	for (int i = 0; i < count; i++) {
		int16_t *sample = (int16_t *) &buf[4 * i];
		int out;
		if (1 == whichChannel) out = sample[0];
		else if (2 == whichChannel) out = sample[1];
		else out = (sample[0] + sample[1]) / 2;  // mix left and right channels
		FIELD(list, i + 1) = int2obj(out);
	}
	FIELD(list, 0) = int2obj(count);
	return falseObj;
}

#define I2S_OUT_BUF_SAMPLES 128 // number of samples in temporary output buffer

static OBJ primI2SWrite(int argCount, OBJ *args) {
	// Write samples from the given list to the I2S output device and return the
	// number of samples written. Each sample will be written to both stereo channels.
	// args[0] - list of samples to write
	// args[1] - index (1-based) of the first sample to write

	if (argCount < 1) return fail(notEnoughArguments);
	if (!IS_TYPE(args[0], ListType)) return fail(needsListError);
	OBJ list = args[0];
	int listSize = obj2int(FIELD(list, 0)); // number of samples in the list

	int startIndex =  ((argCount > 1) && isInt(args[1])) ? obj2int(args[1]) : 1;
	if (startIndex < 1) startIndex = 1;
	if (startIndex > listSize) return zeroObj;

	int sampleCount = (listSize - startIndex) + 1;
	if (sampleCount < 0) return zeroObj;

	int16_t buf[2 * I2S_OUT_BUF_SAMPLES]; // buf is stereo; two 16-bit integers per sample
	if (sampleCount > I2S_OUT_BUF_SAMPLES) sampleCount = I2S_OUT_BUF_SAMPLES;

	for (int i = 0; i < sampleCount; i++) {
		int sample = obj2int(FIELD(list, i + startIndex));
		if (sample > 32767) sample = 32767;
		if (sample < -32768) sample = -32768;
		buf[2 * i] = sample; // left
		buf[(2 * i) + 1] = sample; // right
	}
	int written = i2sWriteBytes((const uint8_t *) buf, 4 * sampleCount);
	return int2obj(written / 4); // return the number of samples written (4 bytes per sample)
}

#else

static OBJ primI2SBegin(int argCount, OBJ *args) { return fail(primitiveNotImplemented); }
static OBJ primI2SEnd(int argCount, OBJ *args) { return fail(primitiveNotImplemented); }
static OBJ primI2SRead(int argCount, OBJ *args) { return fail(primitiveNotImplemented); }
static OBJ primI2SWrite(int argCount, OBJ *args) { return fail(primitiveNotImplemented); }

#endif

// DSP Primitives

#if defined(NRF51) // not enough RAM

static OBJ primFFT(int argCount, OBJ *args) { return fail(primitiveNotImplemented); }
static OBJ primPitch(int argCount, OBJ *args) { return fail(primitiveNotImplemented); }
static OBJ primGoertzel(int argCount, OBJ *args) { return fail(primitiveNotImplemented); }

#else

#define MIN_SAMPLES 64
#define MAX_SAMPLES 1024
#define MAX_PITCH_SAMPLES 512 // pitch work grows with both window and lag range

// Quarter wave of sin(2 * pi * i / 1024) in Q15
static const int16 sineTable[257] = {
	0, 201, 402, 603, 804, 1005, 1206, 1407, 1608, 1809, 2009, 2210, 2410, 2611, 2811, 3012,
	3212, 3412, 3612, 3811, 4011, 4210, 4410, 4609, 4808, 5007, 5205, 5404, 5602, 5800, 5998, 6195,
	6393, 6590, 6786, 6983, 7179, 7375, 7571, 7767, 7962, 8157, 8351, 8545, 8739, 8933, 9126, 9319,
	9512, 9704, 9896, 10087, 10278, 10469, 10659, 10849, 11039, 11228, 11417, 11605, 11793, 11980, 12167, 12353,
	12539, 12725, 12910, 13094, 13279, 13462, 13645, 13828, 14010, 14191, 14372, 14553, 14732, 14912, 15090, 15269,
	15446, 15623, 15800, 15976, 16151, 16325, 16499, 16673, 16846, 17018, 17189, 17360, 17530, 17700, 17869, 18037,
	18204, 18371, 18537, 18703, 18868, 19032, 19195, 19357, 19519, 19680, 19841, 20000, 20159, 20317, 20475, 20631,
	20787, 20942, 21096, 21250, 21403, 21554, 21705, 21856, 22005, 22154, 22301, 22448, 22594, 22739, 22884, 23027,
	23170, 23311, 23452, 23592, 23731, 23870, 24007, 24143, 24279, 24413, 24547, 24680, 24811, 24942, 25072, 25201,
	25329, 25456, 25582, 25708, 25832, 25955, 26077, 26198, 26319, 26438, 26556, 26674, 26790, 26905, 27019, 27133,
	27245, 27356, 27466, 27575, 27683, 27790, 27896, 28001, 28105, 28208, 28310, 28411, 28510, 28609, 28706, 28803,
	28898, 28992, 29085, 29177, 29268, 29358, 29447, 29534, 29621, 29706, 29791, 29874, 29956, 30037, 30117, 30195,
	30273, 30349, 30424, 30498, 30571, 30643, 30714, 30783, 30852, 30919, 30985, 31050, 31113, 31176, 31237, 31297,
	31356, 31414, 31470, 31526, 31580, 31633, 31685, 31736, 31785, 31833, 31880, 31926, 31971, 32014, 32057, 32098,
	32137, 32176, 32213, 32250, 32285, 32318, 32351, 32382, 32412, 32441, 32469, 32495, 32521, 32545, 32567, 32589,
	32609, 32628, 32646, 32663, 32678, 32692, 32705, 32717, 32728, 32737, 32745, 32752, 32757, 32761, 32765, 32766,
	32767
};

static int sinQ15(int i) {
	// Sine of i / 1024ths of a circle in Q15.
	i &= 1023;
	if (i < 256) return sineTable[i];
	if (i < 512) return sineTable[512 - i];
	if (i < 768) return -sineTable[i - 512];
	return -sineTable[1024 - i];
}

static int cosQ15(int i) { return sinQ15(i + 256); }

static int phaseIndex(uint32 phase) { return (phase + (1 << 21)) >> 22; } // round to 1/1024ths

static int cosInterpolated(uint32 phase) {
	// Cosine of phase (2^32 is a full circle) in Q15, interpolated between table entries.
	int i = phase >> 22;
	int frac = (phase >> 6) & 0xFFFF;
	int a = cosQ15(i);
	return a + (((cosQ15(i + 1) - a) * frac) >> 16);
}

static uint32 isqrt64(uint64 n) {
	uint64 result = 0;
	uint64 bit = 1ULL << 62;
	while (bit > n) bit >>= 2;
	while (bit) {
		if (n >= (result + bit)) {
			n -= result + bit;
			result = (result >> 1) + bit;
		} else {
			result >>= 1;
		}
		bit >>= 2;
	}
	return (uint32) result;
}

static int atan2Degrees(int y, int x) {
	// Angle of (x, y) in degrees, -180..180.
	if ((0 == x) && (0 == y)) return 0;
	int ax = abs(x);
	int ay = abs(y);
	int z = (ax >= ay) ? ((ay << 15) / ax) : ((ax << 15) / ay); // Q15, 0..1
	// atan(z) ~= z * pi/4 + z * (1 - z) * (0.2447 + 0.0663 * z), in hundredths of a degree
	int deg100 = ((4500 * z) >> 15) + (((z * (32768 - z)) >> 15) * (1402 + ((380 * z) >> 15)) >> 15);
	if (ay > ax) deg100 = 9000 - deg100;
	if (x < 0) deg100 = 18000 - deg100;
	if (y < 0) deg100 = -deg100;
	return (deg100 >= 0) ? ((deg100 + 50) / 100) : -((50 - deg100) / 100);
}

// Samples

static int sampleCount(OBJ samples) {
	// Return the number of samples in a list or ByteArray, or -1 if it is neither.
	if (IS_TYPE(samples, ListType)) return obj2int(FIELD(samples, 0));
	if (IS_TYPE(samples, ByteArrayType)) return BYTES(samples) / 2;
	return -1;
}

static int loadSamples(OBJ samples, int16 *dst, int n) {
	// Copy n samples into dst, clipped to 16 bits. Return false if a list item is not an integer.
	if (IS_TYPE(samples, ByteArrayType)) {
		uint8 *bytes = (uint8 *) &FIELD(samples, 0);
		for (int i = 0; i < n; i++) dst[i] = (int16) (bytes[2 * i] | (bytes[(2 * i) + 1] << 8));
		return true;
	}
	for (int i = 0; i < n; i++) {
		OBJ item = FIELD(samples, i + 1);
		if (!isInt(item)) return false;
		int v = obj2int(item);
		if (v > 32767) v = 32767;
		if (v < -32768) v = -32768;
		dst[i] = v;
	}
	return true;
}

static int scaleAndWindow(int16 *x, int n) {
	// Scale samples so the largest is 8192..16384, then apply a Hann window.
	// Return the scale shift, so the scaled samples are x * 2^shift.

	int max = 0;
	for (int i = 0; i < n; i++) {
		int v = abs(x[i]);
		if (v > max) max = v;
	}
	int shift = 0;
	if (max > 16383) {
		shift = -1;
	} else if (max > 0) {
		while ((max << (shift + 1)) < 16384) shift++;
	}
	uint32 step = 0xFFFFFFFF / n; // one cycle of the window over n samples
	for (int i = 0; i < n; i++) {
		int v = (shift < 0) ? (x[i] >> 1) : (x[i] << shift);
		int w = (32768 - cosInterpolated(i * step)) >> 1; // 0.5 - 0.5 * cos, in Q15
		x[i] = (v * w) >> 15;
	}
	return shift;
}

static int amplitude(uint32 magnitudeQ8, int scaleShift, int n) {
	// Convert the magnitude of a windowed DFT term (with 8 fraction bits) of n samples
	// scaled by 2^scaleShift to an amplitude. The Hann window halves the gain: A = 4|X|/n.
	uint64 num = (uint64) magnitudeQ8 << 2;
	uint64 den = (uint64) n << 8;
	if (scaleShift >= 0) den <<= scaleShift; else num <<= -scaleShift;
	return (int) ((num + (den / 2)) / den);
}

static int16 *scratch(int byteCount) {
	// Allocate a scratch buffer from the object heap. Returns NULL if memory is short.
	// The heap may be compacted, so callers must re-read args[] after this.
	OBJ buf = newObj(ByteArrayType, (byteCount + 3) / 4, falseObj);
	return buf ? (int16 *) &FIELD(buf, 0) : NULL;
}

static int isListOfSize(OBJ obj, int minCount) {
	return IS_TYPE(obj, ListType) && (obj2int(FIELD(obj, 0)) >= minCount);
}

// FFT

static void fft(int16 *re, int16 *im, int n, int *exponent) {
	// In-place radix-2 FFT in Q15. Each stage halves its inputs when they are large enough
	// to overflow, and adds the halvings to exponent, so the result is X * 2^-exponent.

	for (int i = 1, j = 0; i < n; i++) { // bit-reversal permutation
		int bit = n >> 1;
		while (j & bit) { j ^= bit; bit >>= 1; }
		j |= bit;
		if (i < j) {
			int16 t = re[i]; re[i] = re[j]; re[j] = t;
			t = im[i]; im[i] = im[j]; im[j] = t;
		}
	}

	int max = 0;
	for (int i = 0; i < n; i++) {
		if (abs(re[i]) > max) max = abs(re[i]);
	}
	for (int len = 2; len <= n; len <<= 1) {
		captureIncomingBytes();
		// a butterfly can grow a component by 1 + sqrt(2), so keep inputs under 13000
		int shift = (max < 13000) ? 0 : ((max < 26000) ? 1 : 2);
		int round = shift ? (1 << (shift - 1)) : 0;
		*exponent += shift;
		max = 0;
		int half = len >> 1;
		int step = MAX_SAMPLES / len;
		for (int k = 0; k < half; k++) {
			int wr = cosQ15(k * step);
			int wi = -sinQ15(k * step);
			for (int i = k; i < n; i += len) {
				int j = i + half;
				int ar = (re[i] + round) >> shift;
				int ai = (im[i] + round) >> shift;
				int br = (re[j] + round) >> shift;
				int bi = (im[j] + round) >> shift;
				int tr = ((br * wr) - (bi * wi) + 16384) >> 15;
				int ti = ((br * wi) + (bi * wr) + 16384) >> 15;
				re[i] = ar + tr; im[i] = ai + ti;
				re[j] = ar - tr; im[j] = ai - ti;
				int m = abs(ar) + abs(tr);
				if (abs(ai) + abs(ti) > m) m = abs(ai) + abs(ti);
				if (m > max) max = m;
			}
		}
	}
}

static OBJ primFFT(int argCount, OBJ *args) {
	// Fill magnitudes (and optionally phases, in degrees) with the spectrum of samples.
	// Bins above n/2 mirror the lower half, as for any real input.

	if (argCount < 2) return fail(notEnoughArguments);
	int n = sampleCount(args[0]);
	if (n < 0) return fail(needsListError);
	if ((n < MIN_SAMPLES) || (n > MAX_SAMPLES) || (n & (n - 1))) return fail(arraySizeError);
	if (!isListOfSize(args[1], n)) return fail(needsListError);
	int hasPhases = (argCount > 2) && (args[2] != falseObj);
	if (hasPhases && !isListOfSize(args[2], n)) return fail(needsListError);

	int16 *re = scratch(4 * n);
	if (!re) return fail(insufficientMemoryError);
	int16 *im = re + n;
	if (!loadSamples(args[0], re, n)) return fail(needsListOfIntegers);
	memset(im, 0, 2 * n);

	int exponent = -scaleAndWindow(re, n);
	fft(re, im, n, &exponent);

	OBJ magnitudes = args[1];
	OBJ phases = hasPhases ? args[2] : falseObj;
	int half = n / 2;
	for (int i = 0; i <= half; i++) {
		uint32 m2 = (uint32) (re[i] * re[i]) + (uint32) (im[i] * im[i]);
		uint32 magQ8 = isqrt64((uint64) m2 << 16);
		if ((0 == i) || (half == i)) magQ8 >>= 1; // DC and n/2 have no mirror image
		int mag = amplitude(magQ8, -exponent, n);
		int mirror = (0 < i) && (i < half);
		FIELD(magnitudes, i + 1) = int2obj(mag);
		if (mirror) FIELD(magnitudes, n - i + 1) = int2obj(mag);
		if (hasPhases) {
			int deg = atan2Degrees(im[i], re[i]);
			FIELD(phases, i + 1) = int2obj(deg);
			if (mirror) FIELD(phases, n - i + 1) = int2obj(-deg);
		}
	}
	return falseObj;
}

// Pitch

static uint64 difference(int16 *x, int tau, int windowSize) {
	// Sum of squared differences between x and x shifted by tau.
	uint64 sum = 0;
	for (int j = 0; j < windowSize; j++) {
		uint32 diff = (uint32) (x[j] - x[j + tau]); // squares fit in uint32
		sum += diff * diff;
	}
	return sum;
}

static int yinPitch(int16 *x, uint32 *d, int n, int sampleRate, int minHz, int maxHz) {
	// Return the pitch of x in hundredths of Hz, or 0 if there is no clear pitch.
	// YIN: cumulative mean normalized difference function, threshold 0.12, and parabolic
	// interpolation of the raw difference function. d holds the normalized difference in
	// Q15 and needs maxLag + 1 entries.

	// search one lag beyond each end, so a narrow range still has lags to compare
	int maxLag = (sampleRate / minHz) + 1;
	int minLag = (sampleRate / maxHz) - 1;
	if (maxLag > (n / 2)) maxLag = n / 2;
	if (minLag < 2) minLag = 2;
	if (minLag >= maxLag) return 0;
	int windowSize = n - maxLag;

	uint64 runningSum = 0;
	d[0] = 32768;
	for (int tau = 1; tau <= maxLag; tau++) {
		if (0 == (tau & 15)) captureIncomingBytes();
		uint64 sum = difference(x, tau, windowSize);
		runningSum += sum;
		if (0 == runningSum) {
			d[tau] = 32768;
		} else {
			// d[tau] = sum * tau / runningSum, with both terms cut to 32 bits
			int shift = 0;
			while ((runningSum >> shift) > 0xFFFFFFFF) shift++;
			uint64 num = (sum >> shift) * tau;
			d[tau] = (uint32) ((num << 15) / (runningSum >> shift));
		}
	}

	const uint32 threshold = 3932; // 0.12 in Q15
	int best = -1;
	for (int tau = minLag; tau <= maxLag; tau++) {
		if (d[tau] < threshold) {
			while ((tau < maxLag) && (d[tau + 1] < d[tau])) tau++;
			best = tau;
			break;
		}
	}
	if (best < 0) { // no dip under the threshold; take the deepest one
		best = minLag;
		for (int tau = minLag; tau <= maxLag; tau++) {
			if (d[tau] < d[best]) best = tau;
		}
	}
	if (d[best] > 22938) return 0; // clarity (1 - d) under 0.3

	long long tauQ16 = (long long) best << 16;
	if ((best > minLag) && (best < maxLag)) {
		long long s0 = difference(x, best - 1, windowSize);
		long long s1 = difference(x, best, windowSize);
		long long s2 = difference(x, best + 1, windowSize);
		long long denom = 2 * ((2 * s1) - s2 - s0);
		if (denom < 0) tauQ16 += ((s0 - s2) << 16) / -denom;
	}
	if (tauQ16 <= 0) return 0;
	uint64 hz100 = ((((uint64) sampleRate * 100) << 16) + (tauQ16 / 2)) / tauQ16;
	return (hz100 > 0x3FFFFFFF) ? 0x3FFFFFFF : (int) hz100; // largest VM integer
}

static OBJ primPitch(int argCount, OBJ *args) {
	// Return the pitch of samples in hundredths of Hz, or 0 if there is no clear pitch.
	// Optional args set the lowest and highest pitch to look for (default 60 to 1100 Hz).

	if (argCount < 2) return fail(notEnoughArguments);
	int n = sampleCount(args[0]);
	if (n < 0) return fail(needsListError);
	if ((n < MIN_SAMPLES) || (n > MAX_PITCH_SAMPLES)) return fail(arraySizeError);
	for (int i = 1; (i < argCount) && (i < 4); i++) {
		if (!isInt(args[i])) return fail(needsIntegerError);
	}
	int sampleRate = obj2int(args[1]);
	int minHz = (argCount > 2) ? obj2int(args[2]) : 60;
	int maxHz = (argCount > 3) ? obj2int(args[3]) : 1100;
	if ((sampleRate < 1) || (minHz < 1) || (maxHz < 1)) return int2obj(0);

	int evenN = (n + 1) & ~1; // keep d word aligned
	int16 *x = scratch((2 * evenN) + (4 * ((n / 2) + 1)));
	if (!x) return fail(insufficientMemoryError);
	uint32 *d = (uint32 *) (x + evenN);
	if (!loadSamples(args[0], x, n)) return fail(needsListOfIntegers);

	return int2obj(yinPitch(x, d, n, sampleRate, minHz, maxHz));
}

// Goertzel

static int toneLevel(int16 *x, int n, int scaleShift, int freq, int sampleRate) {
	// Return the amplitude of freq in the windowed, scaled samples x.
	// This evaluates the single DFT term that the Goertzel algorithm computes.

	uint32 step = (uint32) (((long long) freq << 32) / sampleRate);
	uint32 phase = 0;
	long long sumRe = 0, sumIm = 0;
	for (int i = 0; i < n; i++) {
		int k = phaseIndex(phase);
		sumRe += x[i] * cosQ15(k);
		sumIm -= x[i] * sinQ15(k);
		phase += step;
	}
	long long re = sumRe >> 11; // keep 4 fraction bits; the square still fits 64 bits
	long long im = sumIm >> 11;
	uint32 magQ8 = isqrt64((uint64) ((re * re) + (im * im))) << 4;
	return amplitude(magQ8, scaleShift, n);
}

static OBJ primGoertzel(int argCount, OBJ *args) {
	// Fill results with the amplitude of each frequency (in Hz) in freqs.

	if (argCount < 4) return fail(notEnoughArguments);
	int n = sampleCount(args[0]);
	if (n < 0) return fail(needsListError);
	if ((n < MIN_SAMPLES) || (n > MAX_SAMPLES)) return fail(arraySizeError);
	if (!isInt(args[1])) return fail(needsIntegerError);
	if (!IS_TYPE(args[2], ListType)) return fail(needsListError);
	int freqCount = obj2int(FIELD(args[2], 0));
	if (!isListOfSize(args[3], freqCount)) return fail(needsListError);
	for (int i = 1; i <= freqCount; i++) {
		if (!isInt(FIELD(args[2], i))) return fail(needsListOfIntegers);
	}

	int16 *x = scratch(2 * n);
	if (!x) return fail(insufficientMemoryError);
	if (!loadSamples(args[0], x, n)) return fail(needsListOfIntegers);
	int scaleShift = scaleAndWindow(x, n);

	int sampleRate = obj2int(args[1]);
	for (int i = 1; i <= freqCount; i++) {
		captureIncomingBytes();
		int freq = obj2int(FIELD(args[2], i));
		int level = (sampleRate > 0) ? toneLevel(x, n, scaleShift, freq, sampleRate) : 0;
		FIELD(args[3], i) = int2obj(level);
	}
	return falseObj;
}

#endif // ! defined(NRF51)

// Primitives

static PrimEntry entries[] = {
	{"i2sBegin", primI2SBegin},
	{"i2sEnd", primI2SEnd},
	{"i2sRead", primI2SRead},
	{"i2sWrite", primI2SWrite},
	{"fft", primFFT},
	{"pitch", primPitch},
	{"goertzel", primGoertzel},
};

void addSoundPrims() {
	addPrimitiveSet(SoundPrims, "sound", sizeof(entries) / sizeof(PrimEntry), entries);
}
