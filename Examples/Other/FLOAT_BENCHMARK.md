# MicroBlocks Float Performance Benchmarks

This directory contains two matched MicroBlocks performance tests:

- `Float32 Performance Benchmark.ubp` for firmware built with `USE_32BIT_FLOAT`
- `Float64 Performance Benchmark.ubp` for firmware built with `USE_64BIT_FLOAT`

Both projects also benchmark the normal MicroBlocks integer path. This allows integer and floating-point results to be compared on the same board, clock configuration, firmware family, and IDE connection.

## Running the benchmark

1. Flash firmware built with the matching flag. Do not use the normal integer-only firmware.
2. Open the corresponding `.ubp` project in MicroBlocks.
3. Start or restart the project and wait for the three progress messages:
   - `Measuring arithmetic...`
   - `Measuring comparisons...`
   - `Measuring library math...`
4. Wait for the completion message.
5. Click the three result stacks on the right side of the scripting area to display the saved arithmetic, comparison, and library results.

The project stores the summaries in the `arithmetic results`, `comparison results`, and `library results` variables. Results therefore remain available after the benchmark completes. Keeping the Data Graph open while the test runs is optional; it displays one row per result with the following columns:

```text
test gross_us/op net_us/op
```

The benchmark should be the only project running. Stop unrelated scripts, disconnect unnecessary peripherals, use the same USB/IDE connection for all boards being compared, and keep each board at its normal clock frequency.

## Measurements

Each displayed number is in microseconds per operation. Every test is run three times and the median elapsed time is used. Taking the median reduces the effect of an occasional communication interrupt or other unusually slow sample without selecting an unrealistically fast outlier.

The project uses the `microseconds since` block, so normal timer wrap is handled. Input values are prepared before the timer starts. Saving results, converting timing values to text, and sending rows to the IDE are also outside the timed interval.

There are two reported values:

- `gross` is the measured elapsed time divided by the number of tested operations. It includes normal bytecode dispatch, operand loading, the final store, floating-point object allocation, and any garbage collections that occur naturally during the test.
- `net` subtracts a structurally related baseline before dividing by the operation count. It is an estimate of the additional work introduced by the tested expression.

`gross` is generally the best number for predicting the time a real MicroBlocks loop will take. `net` is useful when comparing the implementation costs of operators, but it is more sensitive to differences between the benchmark and its baseline.

## Built-in arithmetic tests

The built-in tests cover integer and Float operations for:

| Label | Operation |
| --- | --- |
| `I+`, `F32+`, `F64+` | Addition |
| `I-`, `F32-`, `F64-` | Subtraction |
| `I*`, `F32*`, `F64*` | Multiplication |
| `I/`, `F32/`, `F64/` | Division |
| `Iabs`, `F32abs`, `F64abs` | Absolute value |

Binary arithmetic uses a dependent chain of eight operations inside each loop iteration. For example, the Float multiply test performs the equivalent of:

```text
x = x * y * y * y * y * y * y * y * y
```

The next operation cannot start with an independent value, so the chain avoids reporting only throughput from independent or reordered operations. It also reduces loop and assignment overhead to one loop step and one store for every eight measured operators.

Each binary sample uses 10,000 loop iterations, or 80,000 tested operators. The arithmetic baseline performs the same loop and final assignment without the eight arithmetic operators. Absolute value uses four operations per iteration and a four-assignment baseline.

Values are selected to remain in a safe numeric range. The integer multiplier is applied to zero to prevent overflow while still executing the multiplication path. Integer division uses a divisor variable containing one. Float multiplication and division use a factor close to one so their dependent values remain finite and normal. These choices avoid accidentally benchmarking overflow, infinity, underflow, or error handling.

## Comparison tests

The projects compare Integer and same-representation Float values with `<`, `=`, and `>`. Four complete comparison expressions are executed per loop iteration for 10,000 iterations, or 40,000 comparisons per sample.

The comparison baseline performs four local value assignments. Thus the `net` value still includes loading the second operand and storing the Boolean result, which are normal costs of using a comparison expression. Float comparisons do not create a new Float object.

## Library-function tests

Each library-function sample performs four calls per loop iteration for 1,000 iterations, or 4,000 calls. The tested functions are:

- text-to-Float parsing
- square root
- power
- sine, cosine, and tangent
- arctangent and two-argument arctangent
- round-to-integer and truncate-to-integer
- Float rescale
- Float-to-text conversion

For functions that return a Float, `net` subtracts the time of a Float clone call. The clone is implemented by giving an existing Float to the matching `float32FromString` or `float64FromString` primitive. It performs named-primitive dispatch, Float validation, extraction, and one Float object allocation without parsing text. Subtracting it estimates the additional cost of parsing or the mathematical calculation.

For round and truncate, which return an immediate integer and do not allocate a Float, `net` subtracts an `isFloat32` or `isFloat64` named-primitive call instead. Multi-argument functions still have additional operand-loading and argument-validation costs in their `net` result.

## Float allocation and garbage collection

MicroBlocks integers are immediate values and do not use object memory. Float32 and Float64 values are boxed objects in the current VM. A Float-producing operator therefore allocates a result object:

- Float32 consumes three 32-bit object-store words: forwarding word, header, and payload.
- Float64 consumes four 32-bit object-store words: forwarding word, header, and two-word payload.

The long Float arithmetic samples intentionally allocate enough results to cross the object-store boundary multiple times. Their `gross` results therefore include amortized allocation and garbage-collection costs as they affect ordinary MicroBlocks code. A test intended to measure only the processor's raw arithmetic instruction would require a different native primitive that performs many calculations without returning a boxed value after every operation.

Garbage collection may print diagnostic messages while the benchmark runs. Those collections are expected. Because the messages and other VM background work can vary with the board connection, repeat the complete benchmark if two runs differ materially.

## Interpreting comparisons

Compare Float32 and Float64 on separate firmware builds using the same board and environment settings. Compare the integer rows from both projects first. Similar integer times indicate that both complete runs had comparable background load.

When comparing boards, record the board, CPU clock, build environment, firmware version, and connection type. For example, the standard `esp32doit-devkit-v1` environment runs at 240 MHz, while a Raspberry Pi Pico RP2040 normally runs at 133 MHz. The RP2040 has no hardware floating-point unit, so its floating-point arithmetic is implemented in software.

The default arithmetic rows show total VM-level performance, not just one CPU instruction. In particular, the Float32-versus-Float64 difference includes representation size, allocation, garbage collection, conversions, and library implementation in addition to the numerical operation itself.
