// floatFormat.c - bounded printf-style floating-point formatting

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "floatFormat.h"

#define MAX_FLOAT_FORMAT_WIDTH 360
#define MAX_FLOAT_FORMAT_PRECISION 30
#define MAX_FLOAT_EXPONENT_DIGITS 30

static int clamped(int value, int minimum, int maximum) {
	if (value < minimum) return minimum;
	if (value > maximum) return maximum;
	return value;
}

static void padExponent(char *s, int dstSize, int exponentDigits) {
	// Pad the exponent with zeroes to the requested minimum number of digits.

	char *exponent = strrchr(s, 'e');
	if (!exponent) return;
	char *digits = exponent + 1;
	if ((*digits == '+') || (*digits == '-')) digits++;

	int digitCount = strlen(digits);
	int zeroCount = exponentDigits - digitCount;
	int byteCount = strlen(s);
	if (zeroCount <= 0) return;
	if ((byteCount + zeroCount) >= dstSize) zeroCount = (dstSize - 1) - byteCount;
	if (zeroCount <= 0) return;

	memmove(digits + zeroCount, digits, digitCount + 1);
	memset(digits, '0', zeroCount);
}

static void applyFieldWidth(char *s, int dstSize, int width) {
	int byteCount = strlen(s);
	int requestedWidth = abs(width);
	int spaceCount = requestedWidth - byteCount;
	if (spaceCount <= 0) return; // printf width is a minimum, not a limit
	if ((byteCount + spaceCount) >= dstSize) spaceCount = (dstSize - 1) - byteCount;
	if (spaceCount <= 0) return;

	if (width < 0) {
		memset(s + byteCount, ' ', spaceCount);
		s[byteCount + spaceCount] = 0;
	} else {
		memmove(s + spaceCount, s, byteCount + 1);
		memset(s, ' ', spaceCount);
	}
}

int formatFloatText(char *dst, int dstSize, double value, int scientific,
	int width, int precision, int exponentDigits) {

	if (!dst || (dstSize <= 0)) return 0;
	dst[0] = 0;
	width = clamped(width, -MAX_FLOAT_FORMAT_WIDTH, MAX_FLOAT_FORMAT_WIDTH);
	precision = clamped(precision, 0, MAX_FLOAT_FORMAT_PRECISION);
	exponentDigits = clamped(exponentDigits, 0, MAX_FLOAT_EXPONENT_DIGITS);

	if (scientific) {
		snprintf(dst, dstSize, "%.*e", precision, value);
		padExponent(dst, dstSize, exponentDigits);
	} else {
		snprintf(dst, dstSize, "%.*f", precision, value);
	}
	dst[dstSize - 1] = 0;
	applyFieldWidth(dst, dstSize, width);
	return strlen(dst);
}
