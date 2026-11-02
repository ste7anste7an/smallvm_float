// floatFormat.h - bounded printf-style floating-point formatting

#ifndef FLOAT_FORMAT_H
#define FLOAT_FORMAT_H

#define FLOAT_FORMAT_BUFFER_SIZE 384

// Format value using printf-style f/e notation. Width is a minimum field width;
// a negative width left-aligns. Precision is the number of digits after the
// decimal point. exponentDigits is a minimum and is ignored in fixed notation.
// Parameters are clamped to bounded values. Returns the number of output bytes.
int formatFloatText(char *dst, int dstSize, double value, int scientific,
	int width, int precision, int exponentDigits);

#endif
