# MicroBlocks Float32 and Float64 implementation

This document describes the optional floating-point profiles implemented by the small VM. The VM no longer exposes signed 64-bit integers; the only language integer representation is the original tagged integer.

## Executive summary

The firmware has three mutually exclusive numeric profiles:

| Build flags | Language numbers | Float storage | VM version |
| --- | --- | ---: | --- |
| neither | original tagged integers only | none | `v421` |
| `USE_32BIT_FLOAT` | tagged integers and IEEE-754 binary32 | one 32-bit payload word | unchanged from upstream |
| `USE_64BIT_FLOAT` | tagged integers and IEEE-754 binary64 | two 32-bit payload words | unchanged from upstream |

Defining both float flags is a compile-time error. `USE_64BIT`, boxed `Int64`, and every Int64 constructor and operation have been removed.

Both float profiles keep runtime value cells, object references, executable instructions, and persistent-store record headers at their existing widths. A Float value is stored in the existing heap and referenced by the normal four-byte `OBJ` cell; this is a floating-point extension, not a native eight-byte value-cell VM.

## Unchanged integer representation

An `OBJ` is an `int *` on firmware targets. Odd bit patterns are immediate integers, `0` is false, `4` is true, and other even values are heap-object references. Integers use:

```c
#define int2obj(n) ((OBJ) (((n) << 1) | 1))
#define obj2int(obj) ((int) (obj) >> 1)
```

One of the 32 bits is the tag, so the language integer range remains:

```text
-2^30 .. 2^30 - 1
-1,073,741,824 .. 1,073,741,823
```

No float profile widens that range. Integer-only `+`, `-`, `*`, `/`, `%`, bitwise operations, shifts, timer values, indexes, list counts, pins, and other hardware parameters retain the original behavior and representation.

`isInt()` and `isInteger()` therefore mean the same thing in every profile. `isNumber()` includes Float objects only when one of the float flags is selected.

## Float representation

`FloatType` uses heap type ID 5, which is one of the reserved pointer-free type IDs below `BinaryObjectTypes`.

- A Float32 object has one payload word and occupies three heap words including its forwarding and header words.
- A Float64 object has two payload words and occupies four heap words including its forwarding and header words.

Payloads are copied with `memcpy` instead of dereferencing a `float *` or `double *`. This avoids strict-aliasing and alignment assumptions. Float objects are marked and moved by the existing garbage collector, but their payload bits are never treated as references.

The constructors and readers selected by the profile are:

```text
USE_32BIT_FLOAT: float32obj(), obj2float32(), VMFloat = float
USE_64BIT_FLOAT: float64obj(), obj2float64(), VMFloat = double
```

Both readers convert an immediate integer to the selected C floating-point type when a mixed operation requires it.

Float64 requires `sizeof(double) == 8`. `float64obj()` reports `primitiveNotImplemented` on a target whose Arduino toolchain represents `double` with four bytes. The profile should only be offered for verified binary64 targets.

## Libraries and named primitives

The stock MicroBlocks compiler does not emit Float literals, so importable UBL libraries create typed values through named primitives and string input. No IDE, compiler, decompiler, or bytecode-opcode change is required. Import exactly the UBL library matching the firmware profile:

- [32-bit Floats.ubl](<Libraries/Other/32-bit Floats.ubl>) version 1.2 requires `USE_32BIT_FLOAT`.
- [64-bit Floats.ubl](<Libraries/Other/64-bit Floats.ubl>) version 2.2 requires `USE_64BIT_FLOAT`.

The [Float32 UBL library](<Libraries/Other/32-bit Floats.ubl>) provides:

- Float32 construction from text and a Float32 predicate;
- square root, power, sine, cosine, tangent, arctangent, and two-argument arctangent;
- explicit rounding and truncation to a normal tagged integer;
- Float32 rescale and text conversion.

The [Float64 UBL library](<Libraries/Other/64-bit Floats.ubl>) provides the equivalent Float64 operations. It contains no integer constructor, integer predicate, hexadecimal/binary Int64 parser, or narrowing operation.

All trigonometric functions use radians. Rounding uses halfway-away-from-zero behavior. Rounding or truncating NaN, Infinity, or a value outside the tagged integer range reports `cannotConvertToInteger`.

The Float64 primitive names are explicitly suffixed with `64`, matching the Float32 profile and avoiding dependencies on the removed `USE_64BIT` API.

## Common operator behavior

When a float profile is enabled, the interpreter handles numbers as follows:

- If both arguments to `+`, `-`, or `*` are integers, the existing tagged-integer fast path is used.
- If either argument is a Float, both arguments are evaluated as the selected `VMFloat`, and the result is a new Float object.
- Integer/integer `/` keeps the existing truncating integer division.
- Division involving a Float returns the selected Float type; positive and negative zero report `zeroDivide`.
- `%`, bitwise operations, and shifts remain integer-only.
- Absolute value returns a Float only for a Float argument.
- `sum`, minimum, and maximum accept tagged integers and Float objects.
- Equality compares mixed integer/Float values numerically. NaN is unequal to every value, including itself.
- Ordering NaN reports `nonComparableError`.
- A Float is reported as the language type `number`, like a tagged integer.

Mixed comparisons first check NaN, then compare a tagged integer with the Float's integral and fractional portions. This avoids unnecessary loss of integer identity. Float32 still cannot distinguish every adjacent integer near the upper end of the tagged range; that is an inherent binary32 limitation.

The `incrementGlobal`, `incrementArg`, and `incrementLocal` bytecode operations follow the same promotion rule: they remain allocation-free for integer/integer increments and create a Float result when either value is Float.

## Conversion and formatting

Printing, `say`, `graph`, `join`, list-to-string conversion, JSON's local text helper, and the main type-conversion paths recognize the selected Float type.

- Float32 uses `%.9g`, sufficient to round-trip an IEEE-754 binary32 value through decimal text.
- Float64 uses `%.17g`, sufficient to round-trip an IEEE-754 binary64 value through decimal text.

Each Float library also exposes one bounded printf-style formatting reporter with an `f`/`e` format menu. Fixed notation implements `%*.*f`. Scientific notation implements `%*.*e`; its optional final argument sets a minimum exponent-digit count and defaults to two. Width is a minimum rather than a truncation limit; a negative width left-aligns. Decimal and exponent digit counts are clamped to 0-30 and field width to -360 through 360.

The explicit constructor accepts syntax handled by `strtof` or `strtod`, including negative zero and conventional Infinity/NaN spellings when provided by the target C library. Trailing non-whitespace text is rejected.

Converting a Float to the generic MicroBlocks `number` type preserves the Float object. A list-to-number conversion accepts a single tagged integer; it does not implicitly truncate a Float.

## Wire protocol and persistence

No wire types are added. Tagged integers still use wire type 1. Float results use wire type 2 and their exact decimal text, allowing an existing IDE to display them without interpreting raw Float payloads. Float list items use the same compatibility representation and the existing 20-character list-summary limit.

This is display-only. Editing such a variable in an unmodified IDE sends a String back to the board. Programs should use the profile's constructor block when they need to restore a typed Float.

No bytecode opcodes were allocated. Named primitive calls use the existing `reporterPrimitive` instruction. Existing chunk layout, code-store records, CRC handling, and retrieval messages are unchanged. Firmware without the requested Float profile can store and decompile those chunks but reports `primitiveNotImplemented` when a Float primitive executes.

## Timing and scheduling

Timers continue to return original tagged integers. The resettable timer and `millis`, `micros`, `seconds`, `millis since`, and `micros since` retain their existing wrap and range behavior. Removing Int64 therefore also removes the earlier experimental long-duration timer results.

Every Float arithmetic result allocates an object. In a float-heavy loop, transient results are reclaimed by the moving garbage collector. Integer-only fast paths remain allocation-free. Float64 allocates one more heap word per result than Float32 and is software-emulated on classic ESP32 because its FPU accelerates single precision only.

## Changed-file responsibilities

| File | Float-profile responsibility |
| --- | --- |
| `vm/mem.h`, `vm/mem.c` | mutually exclusive profile selection, Float object layout, constructors, and readers |
| `vm/interp.h` | selected Float evaluation and numeric error |
| `vm/interp.c` | mixed arithmetic, comparisons, aggregate operators, and formatting |
| `vm/dataPrims.c` | joining, conversion, and Float text output |
| `vm/floatFormat.h`, `vm/floatFormat.c` | bounded fixed/scientific formatting and exponent padding |
| `vm/miscPrims.c` | constructors, predicates, Float math, explicit integer conversion, and rescale |
| `vm/runtime.c` | legacy-protocol Float text fallback |
| `vm/version.h` | original upstream firmware version retained for every profile |
| [Libraries/Other/32-bit Floats.ubl](<Libraries/Other/32-bit Floats.ubl>) | user-facing Float32 blocks for `USE_32BIT_FLOAT` |
| [Libraries/Other/64-bit Floats.ubl](<Libraries/Other/64-bit Floats.ubl>) | user-facing Float64 blocks for `USE_64BIT_FLOAT` |
| [Examples/Other/FLOAT_BENCHMARK.md](Examples/Other/FLOAT_BENCHMARK.md) | benchmark procedure and interpretation guide |
| [Examples/Other/Float32 Performance Benchmark.ubp](<Examples/Other/Float32 Performance Benchmark.ubp>) | ready-to-run Float32 and integer benchmark project |
| [Examples/Other/Float64 Performance Benchmark.ubp](<Examples/Other/Float64 Performance Benchmark.ubp>) | ready-to-run Float64 and integer benchmark project |

## Compatibility and limitations

- Float values remain boxed references; this does not widen globals, task stacks, lists, or `OBJ`.
- Hardware and index primitives still normally call `evalInt()` and reject Float values unless specifically changed to accept them.
- The unmodified IDE does not provide native Float literal, raw-value protocol, variable-editing, or persistence semantics.
- Binary64 availability and math-library behavior are target dependent.
- The VM does not automatically select Float32 merely because an MCU has an FPU; the firmware profile is explicit.
- The two Float profiles intentionally cannot coexist in one firmware because `FloatType` has one profile-selected payload layout and the common arithmetic operators have one result type.

Supporting Float32 and Float64 simultaneously would require distinct heap type IDs, conversion/promotion rules, wire capabilities, and user-facing type APIs. That is outside this implementation.

## Performance benchmarks

The [Float benchmark guide](Examples/Other/FLOAT_BENCHMARK.md) explains the test method, how to run it, what each row measures, and how allocation and garbage collection affect the results. Use the program matching the selected firmware profile:

- [Float32 Performance Benchmark.ubp](<Examples/Other/Float32 Performance Benchmark.ubp>) with firmware built using `USE_32BIT_FLOAT`.
- [Float64 Performance Benchmark.ubp](<Examples/Other/Float64 Performance Benchmark.ubp>) with firmware built using `USE_64BIT_FLOAT`.

Each project embeds the matching UBL library and compares the standard integer path with Float arithmetic, comparisons, text conversion, and special math functions on the same board. The results are reported as gross and estimated net microseconds per operation.

## Testing

`tests/numeric32_float_test.c` checks the one-word representation, tagged-integer conversion, negative zero, NaN, and garbage-collector survival. `tests/numeric64_test.c` checks the equivalent two-word Float64 behavior and contains no Int64 cases. `tests/float_format_test.c` checks fixed/scientific formatting, alignment, exponent padding, minimum-width semantics, and formatting bounds.

A 32-bit host toolchain can run the focused heap tests:

```sh
gcc -m32 -std=gnu99 -O0 -ffunction-sections -fdata-sections \
  -DGNUBLOCKS -DUSE_32BIT_FLOAT -Ivm vm/mem.c tests/numeric32_float_test.c \
  -Wl,--gc-sections -o numeric32_float_test
./numeric32_float_test

gcc -m32 -std=gnu99 -O0 -ffunction-sections -fdata-sections \
  -DGNUBLOCKS -DUSE_64BIT_FLOAT -Ivm vm/mem.c tests/numeric64_test.c \
  -Wl,--gc-sections -o numeric64_test
./numeric64_test
```

Board integration should cover both profiles, normal integer boundary behavior, mixed operations, Float special values, repeated allocations under GC pressure, library-to-board execution, board-to-IDE display, Flash recovery, RAM/Flash growth, and runtime speed.

## Implementation status

- [x] Retain only the original tagged integer representation.
- [x] Remove `USE_64BIT`, `LargeIntegerType`, boxed Int64, Int64 primitives, Int64 arithmetic, and Int64 timing changes.
- [x] Provide mutually exclusive `USE_32BIT_FLOAT` and `USE_64BIT_FLOAT` profiles.
- [x] Share common mixed numeric behavior across Float32 and Float64.
- [x] Provide Float32 and Float64 UBL APIs without Int64 blocks.
- [x] Preserve existing bytecode, persistence, and IDE compatibility behavior.
- [ ] Run focused numeric tests with a runnable 32-bit toolchain.
- [ ] Complete hardware-board integration and performance tests.
- [ ] Define a formal protocol capability if typed Float editing becomes a requirement.
