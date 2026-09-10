#!/usr/bin/env python3
"""Check a board's reservedPin[] map and analog pin range against the silicon.

Every board in ioPrims.cpp carries a hand-written reservedPin[] table saying
which pins MicroBlocks refuses to touch, usually because they are the SPI Flash,
the USB lines, or on-board hardware. Nothing checks that table against the real
board, so an error in it is invisible until a user drives a Flash pin.

This runs the check on hardware. It needs only pyserial and a board running
MicroBlocks; it stores one scratch chunk, runs it, and deletes it again.

    python3 pinMapProbe.py /dev/cu.usbmodem1101
    python3 pinMapProbe.py COM3 --reserved=1,3,6,7,8,9,10,11

Without --reserved it reports what the board does, to compare against the table
by eye. With it, the exit code is non-zero if any DECLARED RESERVED pin turned
out to be drivable.

HOW IT DECIDES, and why it is not simpler
-----------------------------------------
Per pin: digitalSet(p) then digitalRead(p), and digitalClear(p) then
digitalRead(p). A pin under our control follows in both directions.

Both directions are needed. A floating input reads high or low by luck, so a
one-way test invents connections: on an ESP32 devkit, pins 35 and 39 gave
opposite answers on two consecutive runs of the one-way version.

A pin that will NOT drive is not necessarily a reserved pin. There are three
cases, and conflating them produces false alarms:

    follows set and clear ............ drivable, not reserved
    will not drive, analogRead > 0 ... provably NOT refused, because RESERVED()
                                       makes analogRead return exactly 0. So it
                                       is input-only or held by on-board
                                       hardware.
    will not drive, analogRead == 0 .. ambiguous: refused, or an input-only pin
                                       sitting at 0

Only one finding is both provable and worth failing on: a pin the table
declares RESERVED that the board nonetheless drives. That means the guard is
not doing its job, and on a Flash pin it is how a board gets bricked.

Verifying a map exactly is not possible from outside, because the VM does not
report reservedPin[]. If it ever did, this could check the table directly
instead of inferring it.

The analog range is checked the same way: drive a pin high, then read it with
the ADC. Pins inside ANALOG_PINS report near full scale; pins outside report
exactly 0 because the range guard refuses them. A plain analogRead could not
tell that apart from a grounded pin.
"""

import sys
import time

try:
    import serial
except ImportError:
    sys.exit('pinMapProbe needs pyserial:  pip3 install pyserial')

# Serial protocol (misc/SERIAL_PROTOCOL.md)
SHORT_MSG, LONG_MSG = 0xFA, 0xFB
CHUNK_CODE_16_MSG, DELETE_CHUNK_MSG, START_CHUNK_MSG = 32, 2, 3
GET_VERSION_MSG, CHUNK_CRC_MSG = 12, 23
TASK_RETURNED_VALUE_MSG, TASK_DONE_MSG, TASK_ERROR_MSG = 18, 17, 19
VERSION_MSG = 22

SCRATCH_CHUNK = 90          # high ID, to avoid colliding with a user's project
REPORTER_CHUNK_TYPE = 2

# Opcodes, in jumpTable order (vm/interp.c)
OP_INIT_LOCALS, OP_PUSH_IMMEDIATE, OP_RETURN_RESULT = 9, 2, 35
OP_ANALOG_PINS, OP_DIGITAL_PINS, OP_ANALOG_READ = 84, 85, 86
OP_DIGITAL_READ, OP_DIGITAL_SET, OP_DIGITAL_CLEAR = 88, 90, 91
OP_CODE_END = 240


def word(op, arg):
    """One instruction: low byte opcode, high byte arg (vm/interp.h OP())."""
    return bytes([op & 0xFF, arg & 0xFF])


def reporter(body):
    """Wrap instructions as a reporter chunk that returns the top of stack."""
    code = word(OP_INIT_LOCALS, 0) + body + word(OP_RETURN_RESULT, 0) \
        + word(OP_CODE_END, 0) + b'\x00\x00\x00'
    return code + b'\x00' * (-len(code) % 4)


def push_int(n):
    """pushImmediate takes the TAGGED integer, (n << 1) | 1, in its arg byte."""
    return word(OP_PUSH_IMMEDIATE, ((n << 1) | 1) & 0xFF)


# For reporter primitives the arg field is the ARGUMENT COUNT, not the pin.
# digitalSet and digitalClear are the exception: they take the pin in arg, which
# is the compiler optimisation they exist for.
def set_then_read(pin):
    return reporter(word(OP_DIGITAL_SET, pin) + push_int(pin) + word(OP_DIGITAL_READ, 1))


def clear_then_read(pin):
    return reporter(word(OP_DIGITAL_CLEAR, pin) + push_int(pin) + word(OP_DIGITAL_READ, 1))


def set_then_analog(pin):
    return reporter(word(OP_DIGITAL_SET, pin) + push_int(pin) + word(OP_ANALOG_READ, 1))


def count_reporter(opcode):
    return reporter(word(opcode, 0))


def crc32_of(code):
    import zlib
    return zlib.crc32(code) & 0xFFFFFFFF


class Board:
    def __init__(self, port):
        self.ser = serial.Serial()
        self.ser.port = port
        self.ser.baudrate = 115200
        self.ser.timeout = 0.2
        self.ser.dtr = False        # do not trip the auto-reset circuit
        self.ser.rts = False
        self.ser.open()
        self.buf = bytearray()

    def send_short(self, op, chunk_id=0):
        self.ser.write(bytes([SHORT_MSG, op, chunk_id]))

    def send_long(self, op, chunk_id, data):
        n = len(data) + 1                       # size includes the 0xFE terminator
        self.ser.write(bytes([LONG_MSG, op, chunk_id, n & 255, n >> 8]) + data + b'\xfe')

    def messages(self, deadline):
        while time.time() < deadline:
            chunk = self.ser.read(4096)
            if chunk:
                self.buf.extend(chunk)
            while True:
                i = 0
                while i < len(self.buf) and self.buf[i] not in (SHORT_MSG, LONG_MSG):
                    i += 1
                del self.buf[:i]
                if len(self.buf) < 3:
                    break
                if self.buf[0] == SHORT_MSG:
                    op, cid = self.buf[1], self.buf[2]
                    del self.buf[:3]
                    yield (op, cid, b'')
                else:
                    if len(self.buf) < 5:
                        break
                    size = self.buf[3] | (self.buf[4] << 8)
                    if len(self.buf) < 5 + size:
                        break
                    op, cid = self.buf[1], self.buf[2]
                    data = bytes(self.buf[5:5 + size])
                    del self.buf[:5 + size]
                    yield (op, cid, data)

    def version(self, timeout=2.0):
        self.send_short(GET_VERSION_MSG)
        for op, _, data in self.messages(time.time() + timeout):
            if op == VERSION_MSG:
                # body is <typeByte 2><" vNNN BoardType">, per sendVersionString
                return decode_value(data).strip() if decode_value(data) else None
        return None

    def connect(self, boot_timeout=15.0):
        """Poll for a version. Opening the port resets some boards, so a board
        that is merely still booting must not be mistaken for a silent one."""
        deadline = time.time() + boot_timeout
        while time.time() < deadline:
            v = self.version(timeout=1.0)
            if v:
                return v
            time.sleep(0.4)
        return None

    def run(self, code, timeout=4.0):
        """Store, run and collect. Returns the reported value, or None."""
        self.send_long(CHUNK_CODE_16_MSG, SCRATCH_CHUNK, bytes([REPORTER_CHUNK_TYPE]) + code)
        got_crc = None
        for op, cid, data in self.messages(time.time() + 3.0):
            if op == CHUNK_CRC_MSG and cid == SCRATCH_CHUNK:
                got_crc = int.from_bytes(data[:4], 'little')
                break
        if got_crc is None:
            return ('no-ack', None)
        self.send_short(START_CHUNK_MSG, SCRATCH_CHUNK)
        for op, cid, data in self.messages(time.time() + timeout):
            if op == TASK_RETURNED_VALUE_MSG and cid == SCRATCH_CHUNK:
                return ('ok', decode_value(data))
            if op == TASK_DONE_MSG and cid == SCRATCH_CHUNK:
                return ('no-value', None)
            if op == TASK_ERROR_MSG and cid == SCRATCH_CHUNK:
                return ('error', data[0] if data else None)
        return ('timeout', None)

    def delete_scratch(self):
        self.send_short(DELETE_CHUNK_MSG, SCRATCH_CHUNK)
        time.sleep(0.3)


def decode_value(body):
    """Value body: <typeByte><payload>. 1 int, 2 string, 3 boolean."""
    if not body:
        return None
    t = body[0]
    if t == 1 and len(body) >= 5:
        return int.from_bytes(body[1:5], 'little', signed=True)
    if t == 2:
        return body[1:].decode('utf-8', 'replace')
    if t == 3 and len(body) >= 2:
        return bool(body[1])
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opts = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    if not args:
        print(__doc__)
        return 2
    declared = set(int(x) for x in opts['reserved'].split(',')) if 'reserved' in opts else None

    board = Board(args[0])
    version = board.connect()
    if not version:
        print('No version message. That is not proof it is not a MicroBlocks board:')
        print('check nothing else holds the port, and that the board has finished booting.')
        return 1
    print('board: %s' % version)

    st, pin_count = board.run(count_reporter(OP_DIGITAL_PINS))
    _, analog_count = board.run(count_reporter(OP_ANALOG_PINS))
    if st != 'ok' or not isinstance(pin_count, int):
        print('board did not report digitalPins (%s); cannot continue' % st)
        return 1
    print('digitalPins %s   analogPins %s\n' % (pin_count, analog_count))

    drivable, wont_drive, unsafe, unknown = [], [], [], []
    print('%4s %9s %10s   %s' % ('pin', 'follows', 'adc(high)', 'reading'))
    for pin in range(pin_count):
        s_hi, v_hi = board.run(set_then_read(pin))
        s_lo, v_lo = board.run(clear_then_read(pin))
        s_ad, v_ad = board.run(set_then_analog(pin))
        if s_hi != 'ok' or s_lo != 'ok':
            unknown.append(pin)
            print('%4d %9s %10s   could not test' % (pin, '?', '?'))
            continue
        follows = (v_hi is True) and (v_lo is False)
        adc = v_ad if (s_ad == 'ok' and isinstance(v_ad, int)) else None
        if follows:
            drivable.append(pin)
            note = 'drivable'
        elif isinstance(adc, int) and adc > 0:
            wont_drive.append(pin)
            note = 'input-only or board-held (analogRead proves it was not refused)'
        else:
            wont_drive.append(pin)
            note = 'refused, or an input-only pin reading 0'
        if declared is not None and pin in declared and follows:
            unsafe.append(pin)
            note += '   *** DECLARED RESERVED BUT DRIVABLE ***'
        print('%4d %9s %10s   %s' % (pin, follows, adc, note))
        sys.stdout.flush()

    board.delete_scratch()

    print('\ntested %d pins: %d drivable, %d would not drive, %d untestable'
          % (pin_count, len(drivable), len(wont_drive), len(unknown)))
    if pin_count == 0:
        print('NOTHING TESTED')
        return 2
    if declared is not None:
        print('declared reserved : %s' % sorted(declared))
        print('would not drive   : %s' % sorted(wont_drive))
        print('UNSAFE (declared reserved yet drivable): %s' % (sorted(unsafe) or 'none'))
        print('\nPins that would not drive but are NOT declared reserved are input-only')
        print('or held by on-board hardware, not table errors.')
        return 1 if unsafe else 0
    return 0


if __name__ == '__main__':
    sys.exit(main())
