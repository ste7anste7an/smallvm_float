#include <assert.h>
#include <string.h>

#include "../vm/floatFormat.h"

int main() {
	char s[FLOAT_FORMAT_BUFFER_SIZE];

	assert(formatFloatText(s, sizeof(s), 12.3456, 0, 10, 2, 0) == 10);
	assert(0 == strcmp(s, "     12.35"));
	assert(formatFloatText(s, sizeof(s), 12.3456, 0, -10, 2, 0) == 10);
	assert(0 == strcmp(s, "12.35     "));

	assert(formatFloatText(s, sizeof(s), 123.4, 1, 12, 2, 4) == 12);
	assert(0 == strcmp(s, "  1.23e+0002"));
	assert(formatFloatText(s, sizeof(s), 123.4, 1, -12, 2, 4) == 12);
	assert(0 == strcmp(s, "1.23e+0002  "));

	formatFloatText(s, sizeof(s), 12.3456, 0, 2, 2, 0);
	assert(0 == strcmp(s, "12.35")); // width is a minimum, not truncation
	formatFloatText(s, sizeof(s), 1.0, 0, 0, 99, 0);
	assert(strlen(s) == 32); // precision clamps to 30 decimal digits
	formatFloatText(s, sizeof(s), 1.0, 0, 999, 0, 0);
	assert(strlen(s) == 360); // field width is bounded

	return 0;
}
