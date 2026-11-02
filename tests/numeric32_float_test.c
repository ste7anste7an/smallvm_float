#include <assert.h>
#include <math.h>
#include <stdlib.h>

#include "../vm/mem.h"
#include "../vm/interp.h"

OBJ vars[MAX_VARS];
Task tasks[MAX_TASKS];
int taskCount = 0;
OBJ lastBroadcast;

static uint8 testError = 0;

OBJ fail(uint8 errorCode) {
	testError = errorCode;
	return falseObj;
}

int failure() { return testError != 0; }
void outputString(const char *s) { (void) s; }
void processMessage() {}
void captureIncomingBytes() {}
void updateMicrobitDisplay() {}
uint32 microsecs() { return 0; }

int main() {
	memInit();

	OBJ f = float32obj(3.1415927f);
	assert(isFloat(f));
	assert(objWords(f) == 1);
	assert(obj2float32(f) == 3.1415927f);
	assert(obj2float32(int2obj(123)) == 123.0f);
	assert(signbit(obj2float32(float32obj(-0.0f))));
	assert(isnan(obj2float32(float32obj(NAN))));

	newStringFromBytes("unreachable prefix", 18);
	vars[0] = f;
	for (int i = 0; i < 4000; i++) newStringFromBytes("garbage", 7);
	gc();
	assert(isFloat(vars[0]));
	assert(obj2float32(vars[0]) == 3.1415927f);

	return 0;
}
