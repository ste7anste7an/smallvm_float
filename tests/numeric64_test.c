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

	OBJ f = float64obj(0.1);
	assert(isFloat(f));
	assert(objWords(f) == 2);
	assert(obj2float64(f) == 0.1);
	assert(obj2float64(int2obj(123)) == 123.0);
	assert(signbit(obj2float64(float64obj(-0.0))));
	assert(isnan(obj2float64(float64obj(NAN))));

	// Float64 objects must survive the existing moving GC.
	newStringFromBytes("unreachable prefix", 18);
	vars[0] = f;
	vars[1] = float64obj(3.141592653589793);
	for (int i = 0; i < 4000; i++) newStringFromBytes("garbage", 7);
	gc();
	assert(obj2float64(vars[0]) == 0.1);
	assert(obj2float64(vars[1]) == 3.141592653589793);

	return 0;
}
