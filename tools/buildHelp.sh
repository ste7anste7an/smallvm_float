#!/bin/bash

# buildHelp.sh - Generate mb-help-strings.js from ide/MicroBlocksHelp.gp.
#
# The help table is 363 entries of data and twenty lines of mechanism, so the
# data is taken from GP rather than kept twice by hand. Run this after the GP
# table changes and commit the result.
#
# Anything it cannot parse is an error, not a warning: a generator that drops an
# entry and exits 0 loses it silently, and re-running it to check reproduces the
# loss.
#
# Usage:
#   ./buildHelp.sh                 # write ../snapBlocks/mb-help-strings.js
#   ./buildHelp.sh path/to/out.js  # write somewhere else, to compare

set -e
cd "$(dirname "$0")"

SRC="../ide/MicroBlocksHelp.gp"
OUT="${1:-mb-help-strings.js}"

if [ ! -f "$SRC" ]; then
    echo "$SRC not found; run this from a smallvm checkout" >&2
    exit 1
fi

# Built in a temp file and moved into place, so a run that fails leaves the
# committed table alone rather than truncating it.
TMP="$OUT.tmp.$$"
trap 'rm -f "$TMP"' EXIT

# The program is fed on stdin so its regexes can hold plain apostrophes.
# Escaping those through a shell-quoted awk program is what hid the GP
# quote-doubling below.
awk -f /dev/stdin "$SRC" > "$TMP" <<'AWK'
function jsString(s) {
    gsub(/\\/, "\\\\", s);
    gsub(/"/, "\\\"", s);
    return "\"" s "\"";
}
BEGIN {
    print "// This Source Code Form is subject to the terms of the Mozilla Public";
    print "// License, v. 2.0. If a copy of the MPL was not distributed with this";
    print "// file, You can obtain one at http://mozilla.org/MPL/2.0/.";
    print "//";
    print "// Copyright 2026 John Maloney and Bernat Romagosa";
    print "";
    print "// mb-help-strings.js - help text for each block, by op name.";
    print "//";
    print "// GENERATED FILE. Do not edit: run snapBlocks/buildHelp.sh, which reads";
    print "// ide/MicroBlocksHelp.gp, and commit what it writes.";
    print "";
    print "MB_HelpStrings = {";
    count = 0;
}
# An entry is one line: (array <op> <wiki path> <description>), each a GP
# single-quoted string in which an internal apostrophe is written twice. That
# same '' is an empty string where it stands alone, as one description does,
# and awk's leftmost-longest match reads both correctly.
/^[ \t]*\(array / {
    line = $0;
    sub(/^[ \t]*\(array /, "", line);
    sub(/\)[ \t]*(\/\/.*)?$/, "", line);
    n = 0;
    while (match(line, /'([^']|'')*'/)) {
        n++;
        f = substr(line, RSTART + 1, RLENGTH - 2);
        gsub(/''/, "'", f);
        field[n] = f;
        line = substr(line, RSTART + RLENGTH);
    }
    if (n != 3) {
        printf "buildHelp.sh: line %d: expected 3 quoted fields, found %d: %s\n",
            NR, n, $0 > "/dev/stderr";
        bad = 1;
        next;
    }
    # In a JS object literal "__proto__" sets the prototype rather than a key,
    # so such an entry would vanish from the table while still being counted.
    if (field[1] == "__proto__") {
        printf "buildHelp.sh: line %d: an op named __proto__ cannot be a key: %s\n",
            NR, $0 > "/dev/stderr";
        bad = 1;
        next;
    }
    printf "\t%s: [%s, %s],\n", jsString(field[1]), jsString(field[2]), jsString(field[3]);
    # Counted per key, not per line. A repeated op name overwrites, as GP's
    # atPut does, so counting lines would claim more entries than the table has.
    if (!(field[1] in seen)) { seen[field[1]] = 1; count++; }
}
END {
    print "};";
    print "";
    printf "// %d entries.\n", count;
    printf "buildHelp.sh: %d entries\n", count > "/dev/stderr";
    if (bad) exit 1;
}
AWK

mv "$TMP" "$OUT"
echo "Wrote $OUT"
