// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright 2026 John Maloney and Bernat Romagosa

// mb-specs.js - MicroBlocks block spec operations and specs for built-in blocks.

/* global CommandBlockMorph, ReporterBlockMorph, HatBlockMorph, MB_editor */

MB_Specs = {
	selectorToSpec: {}, // cached Map for looking up specs by selector
	selectorToCategory: {}, // cached Map for looking up block category by selector
}

MB_Specs.initialize = function () {
	if (this.selectorToSpec instanceof Map) return; // already initialized
	this.selectorToSpec = new Map();
	this.selectorToCategory = new Map();
	let mbSpecs = this.mbBlockSpecs();
	let category = '';
	for (let i = 0; i < mbSpecs.length; i++) {
		let item = mbSpecs[i];
		if (Array.isArray(item)) { // block spec (i.e. not a label or separator string)
			let selector = item[1];
			this.selectorToSpec.set(selector, item);
			if (category != '') {
				this.selectorToCategory.set(selector, category);
			}
		} else if ((typeof item === 'string') && (item != '-')) {
			category = item;
			if (category.startsWith('cat;')) {
				category = category.slice(4);
			}
			if (category.endsWith('-Advanced')) {
				category = category.slice(0, -9);
			}
		}
	}
}

MB_Specs.specArrayForSelector = function (selector, isReporter, argCount) {
	// Return a spec array for the given selector, or undefined. A spec defined
	// by the project is the first candidate and the built-in table's the second.
	// Pass the type and argument count of the call being built to choose
	// between them.

	this.initialize();
	let projectSpec = this.projectSpecArrayForSelector(selector);
	let tableSpec = this.selectorToSpec.get(selector);
	let spec = projectSpec || tableSpec;
	if (undefined === isReporter) return spec; // nothing to match, so no filtering

	if (projectSpec && tableSpec) {
		// Two candidates: narrow by block type, then by slot count, keeping the
		// first survivor of each.
		let candidates = [projectSpec, tableSpec];
		let byType = candidates.filter(each => (isReporter == ('r' == each[0])));
		if (0 == byType.length) byType = candidates; // revert if no matches
		let byArgs = byType.filter(each => (argCount == this.slotCountForSpecArray(each)));
		spec = (byArgs.length > 0) ? byArgs[0] : byType[0];
	}
	// A spec that cannot hold every argument is not used at all; the block is
	// built from the call instead.
	if (spec && (argCount > this.slotCountForSpecArray(spec))) return undefined;
	return spec;
}

MB_Specs.slotCountForSpecArray = function (specArray) {
	// Return the number of input slots the given spec array declares: optional
	// sections included, and unlimited when the last one repeats.

	let parts = specArray[2].split(/\s+/);
	if ('...' == parts[parts.length - 1]) return Infinity;
	let slots = parts.filter(each => ('_' == each)).length;
	let types = (specArray.length > 3) ? specArray[3].split(/\s+/).length : 0;
	return Math.max(slots, types, specArray.length - 4); // slots, types, defaults
}

MB_Specs.projectSpecArrayForSelector = function (selector) {
	// Return a spec array for the current project's own 'spec' line for the
	// given selector, or undefined.

	if ((typeof MB_editor === 'undefined') || !MB_editor.project) return undefined;
	let spec = MB_editor.project.blockSpecs.get(selector);
	if (!spec) return undefined;
	let result = [spec.blockType || ' ', selector, spec.specString || selector];
	if (spec.slotTypes) result.push(spec.slotTypes, ...(spec.defaults || []));
	return result;
}

MB_Specs.categoryForSelector = function (selector) {
	this.initialize();
	let result = this.selectorToCategory.get(selector);
	return (result === undefined) ? 'other' : result;
}

MB_Specs.blockTypeForSelector = function (selector, isReporter, argCount) {
	let spec = this.specArrayForSelector(selector, isReporter, argCount);
	return spec ? spec[0] : ' ';
}

MB_Specs.specFor = function (selector, args, isReporter) {
	// Return a block spec for the command or reporter the given selector and arguments.
	// Use the MicroBlocks spec for the given selector, if possible.
	// Otherwise, generate a spec based on the argument types.

	let spec = '';
	let specArray = this.specArrayForSelector(selector, isReporter, args.length);
	if (specArray) { // selector is known; use existing spec
		if (specArray.length > 2) {
			let specParts = specArray[2].split(/\s+/);
			let mbTypes = (specArray.length > 3) ? specArray[3].split(/\s+/) : [];
			let typeIndex = 0;
			for (let i = 0; i < specParts.length; i++) {
				if (i > 0) spec += ' ';
				let p = specParts[i];
				if (p == '_') {
					spec += this.snapTypeForMBType(mbTypes[typeIndex++]);
				} else if (p.startsWith('#')) {
					spec += p;
				} else {
					spec += p;
				}
			}
		}
	} else { // unknown selector; generate a spec based on its arguments
		spec = selector;
		for (let i = 0; i < args.length; i++) {
			spec += ' ' + this.specForArg(args[i]);
		}
	}
	spec = this.extendSpecForArgs(spec, args);
	if (spec == '') return 'unknown'; // shouldn't happen
	return spec;
}

// What the parser puts in an argument that holds an empty command list, `{}`
// in the source. An empty body has no first block, so this is the only thing
// left to tell it from an argument that is simply absent.
MB_Specs.emptyCommandList = { isEmptyCommandList: true };

MB_Specs.specForArg = function (arg) {
	if ((typeof arg) == 'number') {
		return '%num';
	} else if (((typeof arg) == 'string') || (arg == null)) {
		return '%auto';
	} else if ((arg == true) || (arg == false)) {
		return '%bool';
	} else if ((arg instanceof CommandBlockMorph) || (this.emptyCommandList === arg)) {
		return '%cmd';
	}
	return '%auto';
}

MB_Specs.isSlotSpec = function (word) {
	// A bare '%' is the per cent sign a block displays, not a slot: labelPart
	// builds a label for it. Counting it as a slot leaves canExpand() true for a
	// block that cannot grow, and the expansion loop in MB_Parser.makeBlock
	// never ends.

	return ('%' == word.at(0)) && (word.length > 1);
}

MB_Specs.slotCountForSpec = function (spec) {
	// The number of input slots a spec string declares.

	let count = 0;
	for (let p of spec.split(/\s+/)) {
		if (this.isSlotSpec(p)) count += 1;
	}
	return count;
}

MB_Specs.extendSpecForArgs = function (spec, args) {
	if (spec.endsWith('...')) return spec; // variadic; expand() already grows it to fit
	let specSlotCount = this.slotCountForSpec(spec);
	let extraSlotCount = args.length - specSlotCount;

	if (extraSlotCount <= 0) return spec; // no extra slots needed
	for (let i = 0; i < extraSlotCount; i++) {
		spec += ' ' + this.specForArg(args[specSlotCount + i]); // add a number/string slot
	}
	return spec;
}

// ***** Creating Blocks from Specs *****

MB_Specs.blockForSpec = function (spec, category) {
	// Create a block in the given category from the given MicroBlocks spec array.
	// Used to populate the block palette.

	if (Array.isArray(spec)) {
		let b;
		let type = spec[0];
		if (' ' == type) {
			b = new CommandBlockMorph();
		} else if ('r' == type) {
			b = new ReporterBlockMorph();
		} else if ('h' == type) {
			b = new HatBlockMorph();
		}
		b.selector = spec[1];
		b.setSpec(this.snapSpecForSelector(b.selector));
		b.setCategory(category);
		let defaults = spec.slice(4);
		if ('v' == b.selector) {
			// set name (spec) for a variable block
			if (defaults.length > 0) b.setSpec(defaults[0]);
		} else {
			// set default values
			let inputs = b.inputs();
			for (let i = 0; i < defaults.length; i++) {
				if (i >= inputs.length) break;
				inputs[i].setContents(defaults[i]);
			}
		}
		return b;
	}
	return undefined; // error; spec should be an array
}

MB_Specs.snapSpecForSelector = function (selector, isReporter, argCount) {
	// Return a Snap! block spec string for given selector or null if not found.

	let specArray = this.specArrayForSelector(selector, isReporter, argCount);
	if (!specArray) return null; // not found

	let mbSpec = specArray[2];
	let mbArgTypes = (specArray.length > 3) ? specArray[3].split(/\s+/) : [];
	let parts = mbSpec.split(/\s+/);

	let argIndex = 0;
	for (let i = 0; i < parts.length; i++) {
		let p = parts[i];
		if (p == '_') {
			parts[i] = this.snapTypeForMBType(mbArgTypes[argIndex++]);
		} else if (p.startsWith('#')) {
			parts[i] = p;
		}
	}
	return parts.join(' ');
}

MB_Specs.snapTypeForMBType = function (mbType) {
	// Return the Snap! slot type for the given MicroBlocks slot type or '%auto' if mbType is null.
	// The Snap! types are the MicroBlocks types prefixed by '%'.
	// MicroBlocks types: 'num' 'str' 'auto' 'bool' 'color' 'cmd' 'var' 'menu' 'microbitDisplay'

	if (mbType == null) return '%auto'; // default

	let typeParts = mbType.split('.');
	if (typeParts.length > 1) { // this is a menu (e.g. menu.buttonMenu)
		return ('%menu.' + typeParts[0] + '.' + typeParts[1]);
	}

	return ('%' + mbType)
}

// ***** MicroBlocks built-in block specs *****

MB_Specs.mbBlockSpecs = function () {
	// These specs are generated automatically by running:
	//	setClipboard (exportSpecsAsJavascript (initialize (new 'SmallCompiler')))
	// in the GP command line, then pasting the result into the returned list.

	return [
		"cat;Output",
			[" ", "setUserLED", "set user LED _", "bool", true],
			[" ", "sayIt", "say _ : _ : ...", "str str str str str str str str str str str str", 123, "", ""],
			[" ", "graphIt", "graph _ : _ : ...", "auto auto auto auto auto auto auto auto auto auto", 100],
			[" ", "[misc:clearGraph]", "clear graph"],
		"cat;Input",
			["r", "buttonA", "button A"],
			["r", "buttonB", "button B"],
		"-",
			["r", "timer", "timer"],
			[" ", "resetTimer", "reset timer"],
		"-",
			["r", "secsOp", "seconds"],
			["r", "millisOp", "milliseconds"],
			["r", "microsOp", "microseconds"],
		"-",
			["r", "boardType", "board type"],
			["r", "[misc:version]", "version"],
		"-",
			["r", "[misc:bleID]", "BLE id"],
			["r", "[ble:bleConnected]", "BLE connected"],
		"cat;Input-Advanced",
			["r", "millisSince", "milliseconds since _ : end time _", "num auto", 0, "now"],
			["r", "microsSince", "microseconds since _ : end time _", "num auto", 0, "now"],
		"-",
			["r", "[misc:connectedToIDE]", "connected to IDE"],
		"cat;Pins",
			["r", "digitalReadOp", "read digital pin _ : pull _", "num menu.pullMenu", 1, "none"],
			["r", "analogReadOp", "read analog pin _ : pull _", "num menu.pullMenu", 1, "none"],
		"-",
			[" ", "digitalWriteOp", "set digital pin _ to _", "num bool", 1, true],
			[" ", "analogWriteOp", "set pin _ to _", "num num", 1, 1023],
		"-",
			["r", "analogPins", "analog pins"],
			["r", "digitalPins", "digital pins"],
		"cat;Comm",
			["r", "i2cGet", "i2c get device _ register _", "num num"],
			[" ", "i2cSet", "i2c set device _ register _ to _", "num num num"],
		"-",
			[" ", "[sensors:i2cRead]", "i2c device _ read list _", "num auto"],
			[" ", "[sensors:i2cWrite]", "i2c device _ write list _ : stop _", "num auto bool"],
		"-",
			["r", "[sensors:i2cExists]", "i2c device _ exists?", "num"],
		"-",
			[" ", "spiSend", "spi send _", "num", 0],
			["r", "spiRecv", "spi receive"],
			[" ", "[sensors:spiSetup]", "spi setup speed _ : mode _ : rpi channel _ : bit order _", "num num num str", 1000000, 0, 0, "MSB"],
			[" ", "[sensors:spiExchange]", "spi exchange bytes _", "auto", "aByteArray"],
		"-",
			[" ", "[serial:open]", "serial open _ baud : rx pin _ tx pin _", "num num num", 9600, 0, 1],
			[" ", "[serial:close]", "serial close"],
			["r", "[serial:read]", "serial read"],
			[" ", "[serial:write]", "serial write _", "auto", "anIntegerStringListOrByteArray"],
			["r", "[serial:writeBytes]", "serial write _ starting at _", "auto num", "aStringListOrByteArray", 1],
		"-",
			[" ", "[io:softWriteByte]", "soft serial write byte _ pin _ baud _", "num num num", "85", 2, 9600],
		"-",
			["r", "[serial:dueRecv]", "duelink receive"],
			["r", "[serial:dueSend]", "duelink send _ starting at _", "auto num", "aStringListOrByteArray", 1],
		"cat;Control",
			["h", "whenStarted", "when started"],
			["h", "whenButtonPressed", "when button _ pressed", "menu.buttonMenu", "A"],
			[" ", "forever", "forever _", "cmd"],
			[" ", "repeat", "repeat _ _", "num cmd", 10],
			[" ", "waitMillis", "wait _ millisecs", "num", 500],
		"-",
			[" ", "if", "if _ _ : else if _ _ : ...", "bool cmd bool cmd"],
		"-",
			["h", "whenCondition", "when _", "bool"],
			[" ", "waitUntil", "wait until _", "bool"],
		"-",
			[" ", "return", "return _", "auto", 0],
		"-",
			["h", "whenBroadcastReceived", "when _ received", "str.broadcastMenu", "go!"],
			[" ", "sendBroadcast", "broadcast _", "str.broadcastMenu", "go!", ""],
		"-",
			[" ", "comment", "comment _", "str", "How this works..."],
			["r", "[data:range]", "range _ to _ : by _", "num num num", 1, 10, 2],
			[" ", "for", "for _ in _ _", "var num cmd", "i", 10],
			[" ", "repeatUntil", "repeat until _ _", "bool cmd", false],
		"-",
			[" ", "stopTask", "stop this task"],
			[" ", "stopAll", "stop other tasks"],
		"cat;Control-Advanced",
			[" ", "exitLoop", "exit loop"],
		"-",
			[" ", "waitMicros", "wait _ microsecs", "num", 1000],
		"-",
			["r", "getLastBroadcast", "last message"],
			["r", "argOrDefault", "arg _ default _", "num auto", 1, "default"],
		"-",
			[" ", "callCustomCommand", "call _ : with _", "str.functionNameMenu str", "function name", "parameter list"],
			["r", "callCustomReporter", "call _ : with _", "str.functionNameMenu str", "function name", "parameter list"],
		"cat;Operators",
			["r", "+", "_ + _", "num num", 10, 2],
			["r", "-", "_ − _", "num num", 10, 2],
			["r", "*", "_ × _", "num num", 10, 2],
			["r", "/", "_ / _", "num num", 10, 2],
			["r", "%", "_ mod _", "num num", 10, 2],
		"-",
			["r", "absoluteValue", "abs _ ", "num", -10],
			["r", "minimum", "min _ _ : _ : ...", "num num num", 1, 2],
			["r", "maximum", "max _ _ : _ : ...", "num num num", 1, 2],
			["r", "random", "random _ to _", "num num", 1, 10],
			["r", "sum", "sum _ : #BR# + _ : ...", "num num num", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
		"-",
			["r", "<", "_ < _", "num num", 3, 4],
			["r", "<=", "_ <= _", "num num", 3, 4],
			["r", "==", "_ = _", "auto auto", 3, 4],
			["r", "!=", "_ ≠ _", "auto auto", 3, 4],
			["r", ">=", "_ >= _", "num num", 3, 4],
			["r", ">", "_ > _", "num num", 3, 4],
		"-",
			["r", "booleanConstant", "_", "bool", true],
			["r", "not", "not _", "bool", true],
			["r", "and", "_ and _", "bool bool", true, false],
			["r", "or", "_ or _ ", "bool bool", true, false],
		"-",
			["r", "[data:toString]", "“ _ ”", "str", "123"],
			["r", "isType", "_ is a _", "auto menu.typesMenu", 123, "number"],
			["r", "[data:convertType]", "convert _ to _", "auto menu.typesMenu", 123, "number"],
		"cat;Operators-Advanced",
			["r", "ifExpression", "if _ then _ else _", "bool auto auto", true, 1, 0],
			["r", "hexToInt", "hex _", "str", "3F"],
		"-",
			["r", "[misc:rescale]", "rescale _ from ( _ , _ ) to ( _ , _ )", "num num num num num", 3, 0, 10, 0, 100],
			["r", "[misc:sqrt]", "sqrt _", "num", 9],
			["r", "[misc:atan2]", "arctan x _ y _", "num num", 1, 1],
		"-",
			["r", "&", "_ & _", "num num", 1, 3],
			["r", "|", "_ | _", "num num", 1, 2],
			["r", "^", "_ ^ _", "num num", 1, 3],
			["r", "~", "~ _", "num", 1, 3],
			["r", "<<", "_ << _", "num num", 3, 2],
			["r", ">>", "_ >> _", "num num", -100, 2],
		"cat;Variables",
			["r", "v", "_", "menu.allVarsMenu", "n"],
			[" ", "=", "set _ to _", "menu.allVarsMenu auto", "n", 0],
			[" ", "+=", "change _ by _", "menu.allVarsMenu num", "n", 1],
			[" ", "local", "initialize local _ to _", "var auto", "var", 0],
		"cat;Data",
			["r", "at", "item _ of _", "auto.itemOfMenu str", 1, "Rosa"],
			["r", "size", "length of _", "str", "Rosa"],
			["r", "[data:join]", "join _ _ : _ : ...", "str str str", "micro", "blocks"],
		"-",
			["r", "[data:makeList]", "list : _ : ...", "auto auto auto", "cat", "dog", "bird"],
			[" ", "[data:addLast]", "add _ to list _", "auto auto", "fish"],
		"-",
			[" ", "atPut", "replace item _ of list _ with _", "auto.replaceItemMenu str auto", 1, "aList", 10],
			[" ", "[data:delete]", "delete item _ of list _", "auto.replaceItemMenu str", 1],
		"-",
			["r", "[data:find]", "find _ in _ : starting at _", "auto str num", "a", "cat", 1],
			["r", "[data:copyFromTo]", "copy _ from _ : to _", "str num num", "smiles", 2, 5],
		"-",
			["r", "[data:split]", "split _ by _ : convert numbers _", "str str bool", "A,B,123", ",", false],
			["r", "[data:joinStrings]", "join items of list _ : separator _", "auto str", "a list of strings", " "],
		"cat;Data-Advanced",
			["r", "newList", "new list length _ : with all _", "num auto", 10, 0],
			["r", "[data:newByteArray]", "new byte array _ : with all _", "num num", 5, 0],
		"-",
			["r", "[data:unicodeAt]", "unicode _ of _", "num str", 2, "cat"],
			["r", "[data:unicodeString]", "string from unicode _", "num", 65],
		"-",
			["r", "[data:asByteArray]", "as byte array _", "auto", "aByteListOrString"],
		"-",
			["r", "[data:freeMemory]", "free memory"],

		"--- Testing ---",
["r", "[misc:hue]", "hue _", "color"], // xxx test color input slot
		"cat;Output",
[" ", "[display:mbDisplay]", "display #BR# _", "microbitDisplay"], // xxx test microbitDisplay input slot
[" ", "script", "script x _ y _ _", "num num cmd"], // template for pasted scripts

		"Prims-Deprecated (not in palette)",
			["r", "newArray", "new list length _", "num", 10],
			[" ", "fillArray", "fill list _ with _", "str auto", "aList", 0],
			[" ", "fillList", "fill list _ with _", "str auto", "aList", 0],
		"Prims-Display (not in palette)",
			[" ", "[display:mbDisplay]", "display #BR# _", "microbitDisplay"],
			[" ", "[display:mbDisplayOff]", "clear display"],
			[" ", "[display:mbPlot]", "plot x _ y _", "num num", 3, 3],
			[" ", "[display:mbUnplot]", "unplot x _ y _", "num num", 3, 3],
			[" ", "[display:mbDrawShape]", "draw shape _ at x _ y _", "num num num", 31, 1, 1],
			["r", "[display:mbShapeForLetter]", "shape for letter _", "str", "A"],
			[" ", "[display:mbEnableDisplay]", "enable LED display _", "bool", false],
			[" ", "[display:neoPixelSetPin]", "set NeoPixel pin _ is RGBW _", "auto bool", "", false],
			[" ", "[display:neoPixelSend]", "send NeoPixel rgb _", "num", 5],
			[" ", "[display:neoPixelSetMaxBrightness]", "set NeoPixel max brightness _ (10-255)", "num", 40],
			[" ", "[display:neoPixelSetRGB]", "NeoPixel is RGB _", "bool", false],
		"Prims-Sensing (not in palette)",
			["r", "[sensors:acceleration]", "acceleration"],
			[" ", "[sensors:setAccelerometerRange]", "set accelerometer range _", "num", 1],
			["r", "[display:lightLevel]", "light level"],
			["r", "[sensors:temperature]", "temperature (°C)"],
			["r", "[sensors:tiltX]", "tilt x"],
			["r", "[sensors:tiltY]", "tilt y"],
			["r", "[sensors:tiltZ]", "tilt z"],
			["r", "[sensors:magneticField]", "magnetic field"],
			["r", "[sensors:microphone]", "microphone"],
			[" ", "[sensors:i2cSetClockSpeed]", "set i2c clock speed _", "num", 400000],
			[" ", "[sensors:i2cSetPins]", "set i2c pins SDA _ SCL _", "num num", 4, 5],
		"Prims-Variables (not in palette)",
			["r", "[vars:varExists]", "variable named _ exists?", "str", "var"],
			["r", "[vars:varNamed]", "value of variable named _", "str", "var"],
			[" ", "[vars:setVarNamed]", "set variable named _ to _", "str auto", "var", 0],
		"Prims-JSON (not in palette)",
			["r", "[misc:jsonGet]", "json _ . _", "str str", "{ \"x\": 1, \"y\": [41, 42, 43] }", "y.2"],
			["r", "[misc:jsonCount]", "json count _ . _", "str str", "[1, [4, 5, 6, 7], 3]", ""],
			["r", "[misc:jsonValueAt]", "json value _ . _ at _", "str str num", "{ \"x\": 1, \"y\": 42 }", "", 2],
			["r", "[misc:jsonKeyAt]", "json key _ . _ at _", "str str num", "{ \"x\": 1, \"y\": 42 }", "", 2],
		"Prims-Advanced (not in palette)",
			[" ", "noop", "no op"],
			[" ", "ignoreArgs", "ignore : _ : ...", "auto", 0],
			["r", "pushArgCount", "arg count"],
			["r", "getArg", "arg _", "num", 0],
			["r", "longMult", "( _ * _ ) >> _", "num num num", 1024, 2048, 10],
			["r", "[misc:sin]", "fixed sine _", "num", 9000],
			["r", "[misc:hexToInt]", "hex _", "str", "3F"],
			[" ", "[misc:broadcastToIDE]", "broadcast _ to IDE only", "str", ""],
			["r", "[misc:shapeforChar]", "shape for character _", "num", 65],
			["r", "[misc:pressureToAltitude]", "altitude diff for pressure change from _ to _", "num num", 30, 29],
			["r", "[misc:bme680GasResistance]", "bme680 gas resistance adc _ range _ calibration range error _", "num num num", 500, 0, 0],
			["r", "[misc:hsvColor]", "color hue _ (0-360) saturation _ % brightness _ %", "num num num", 0, 90, 100],
			["r", "[misc:hue]", "hue _", "color"],
			["r", "[misc:saturation]", "saturation _", "color"],
			["r", "[misc:brightness]", "brightness _", "color"],
			["r", "[sensors:touchRead]", "capacitive sensor _", "num", 1],
			["r", "[sensors:readDHT]", "read DHT data pin _", "num", 1],
			[" ", "[sensors:captureStart]", "start pulse capture pin _", "num", 0],
			["r", "[sensors:captureCount]", "pulse capture count"],
			["r", "[sensors:captureEnd]", "end pulse capture"],
			["r", "[io:hasTone]", "has tone support"],
			[" ", "[io:playTone]", "play tone pin _ frequency _", "num num", 0, 440],
			[" ", "[io:dacInit]", "init DAC pin _ sample rate _", "num num", 25, 11025],
			["r", "[io:dacWrite]", "DAC write _ : starting at _", "num num", 128, 1],
			["r", "[io:hasServo]", "has servo support"],
			[" ", "[io:setServo]", "set servo pin _ to _ usecs", "num num", 0, 1500],
			["r", "[net:hasWiFi]", "has WiFi support"],
			[" ", "[net:startWiFi]", "start WiFi _ password _ : be hotspot _ : IP _ gateway _ subnet _", "auto auto bool auto auto auto", "SSID", "MyPassword", true, "192.168.1.42", "192.168.1.1", "255.255.255.0"],
			[" ", "[net:stopWiFi]", "stop WiFi"],
			["r", "[net:wifiStatus]", "WiFi status"],
			["r", "[net:myIPAddress]", "my IP address"],
			["r", "[net:myMAC]", "my MAC address"],
			["r", "[net:startSSIDscan]", "scan SSID list"],
			["r", "[net:getSSID]", "get SSID number _", "num", 1],
			[" ", "[net:httpConnect]", "connect to http܃// _ : port _", "auto num", "microblocks.fun", 80],
			["r", "[net:httpIsConnected]", "is HTTP connected?"],
			[" ", "[net:httpRequest]", "_ request http܃// _ / _ : body _", "menu.requestTypes auto auto str", "GET", "microblocks.fun", "example.txt", ""],
			["r", "[net:httpResponse]", "HTTP response"],
			[" ", "[net:httpClose]", "close HTTP connection"],
			[" ", "[net:startHttpServer]", "start HTTP server"],
			[" ", "[net:stopHttpServer]", "stop HTTP server"],
			["r", "[net:httpServerGetRequest]", "HTTP server request : binary data _ : port _", "bool num", false, 8080],
			[" ", "[net:respondToHttpRequest]", "respond _ to HTTP server request : with body _ : and headers _", "auto str str", "200 OK", "Welcome to the MicroBlocks HTTP server", "Content-Type: text/plain"],
			[" ", "[net:udpStart]", "UDP start port _", "auto", 5000],
			[" ", "[net:udpStop]", "UDP stop"],
			[" ", "[net:udpSendPacket]", "UDP send packet _ to ip _ port _", "auto auto num", "Hello!", "255.255.255.255", 5000],
			["r", "[net:udpReceivePacket]", "UDP receive packet : binary data _", "bool", false],
			["r", "[net:udpRemoteIPAddress]", "UDP remote IP address"],
			["r", "[net:udpRemotePort]", "UDP remote port"],
			[" ", "[tft:setBacklight]", "set TFT backlight _ (0-10)", "num", 10],
			[" ", "[tft:getWidth]", "TFT width"],
			[" ", "[tft:getHeight]", "TFT height"],
			[" ", "[tft:setPixel]", "set TFT pixel x _ y _ to _", "num num num", 50, 32, 16711680],
			[" ", "[tft:pixelRow]", "draw pixel row _ x _ y _ : bytesPerPixel _ : palette _", "auto num num num str", "aList", 0, 0, 4],
			[" ", "[tft:line]", "draw line on TFT from x _ y _ to x _ y _ color _", "num num num num num", 12, 8, 25, 15, 255],
			[" ", "[tft:rect]", "draw rectangle on TFT at x _ y _ width _ height _ color _ : filled _", "num num num num num bool", 10, 10, 40, 30, 65280, false],
			[" ", "[tft:roundedRect]", "draw rounded rectangle on TFT at x _ y _ width _ height _ radius _ color _ : filled _", "num num num num num num bool", 10, 10, 40, 30, 8, 12255317, false],
			[" ", "[tft:circle]", "draw circle on TFT at x _ y _ radius _ color _ : filled _", "num num num num bool", 60, 100, 30, 65535, false],
			[" ", "[tft:triangle]", "draw triangle on TFT at x _ y _ , x _ y _ , x _ y _ color _ : filled _", "num num num num num num num bool", 20, 20, 30, 80, 60, 5, 5592354, false],
			[" ", "[tft:text]", "write _ on TFT at x _ y _ color _ : scale _ wrap _ : bg color _", "str num num color num bool color", "Hello World!", 0, 80, 16777215, 1, false, 16777215],
			[" ", "[tft:drawBitmap]", "draw bitmap _ palette _ on TFT at x _ y _", "str str num num", "aBitmap", "a list of colors", 10, 10],
			[" ", "[tft:deferUpdates]", "defer TFT display updates"],
			[" ", "[tft:resumeUpdates]", "resume TFT display updates"],
			[" ", "[tft:mergeBitmap]", "mergeBitmap _ width _ buffer _ scale _ alphaIndex _ destX _ destY _", "auto num auto num num num num"],
			[" ", "[tft:drawBuffer]", "drawBuffer _ palette _ scale _ : srcX _ srcY _ copyWidth _ copyHeight _", "auto auto num num num num num"],
			["r", "[tft:tftTouched]", "TFT touched"],
			["r", "[tft:tftTouchX]", "TFT touch X position"],
			["r", "[tft:tftTouchY]", "TFT touch Y position"],
			["r", "[tft:tftTouchPressure]", "TFT touch pressure"],
			[" ", "[file:open]", "open file _", "str"],
			[" ", "[file:close]", "close file _", "str"],
			[" ", "[file:delete]", "delete file _", "str"],
			["r", "[file:endOfFile]", "end of file _", "str"],
			["r", "[file:readLine]", "next line of file _", "str"],
			["r", "[file:readBytes]", "next _ bytes of file _ : starting at _", "num str num", 100, "", 0],
			["r", "[file:readInto]", "read into _ from file _", "str str", "a ByteArray", ""],
			["r", "[file:readPosition]", "read position of file _", "str"],
			[" ", "[file:setReadPosition]", "set read position _ of file _", "num str"],
			[" ", "[file:appendLine]", "append line _ to file _", "str str"],
			[" ", "[file:appendBytes]", "append bytes _ to file _", "str str"],
			["r", "[file:fileSize]", "size of file _", "str"],
			[" ", "[file:startList]", "start file list _", "str", "dir"],
			["r", "[file:nextInList]", "next file in list"],
			["r", "[file:systemInfo]", "file system info"],
			[" ", "[radio:sendInteger]", "radio send number _", "num", 123],
			[" ", "[radio:sendString]", "radio send string _", "str", "Hello!"],
			[" ", "[radio:sendPair]", "radio send pair _ = _", "str num", "light", 10],
			["r", "[radio:messageReceived]", "radio message received?"],
			["r", "[radio:receivedInteger]", "radio last number"],
			["r", "[radio:receivedString]", "radio last string"],
			["r", "[radio:receivedMessageType]", "radio last message type"],
			[" ", "[radio:setGroup]", "radio set group _", "num", 0],
			[" ", "[radio:setChannel]", "radio set channel (0-83) _", "num", 7],
			[" ", "[radio:setPower]", "radio set power (0-7) _", "num", 4],
			["r", "[radio:signalStrength]", "radio last signal strength"],
			["r", "[radio:packetReceive]", "radio receive packet _", "str", "32-element list"],
			[" ", "[radio:packetSend]", "radio send packet _", "str", "32-element list"],
			[" ", "[radio:disableRadio]", "disable radio"],
			[" ", "[1wire:init]", "oneWire init pin _", "num", 0],
			[" ", "[1wire:scanStart]", "oneWire scan start"],
			["r", "[1wire:scanNext]", "oneWire scan next _", "str", "addressByteArray"],
			[" ", "[1wire:select]", "oneWire select address _", "str", "addressByteArray"],
			[" ", "[1wire:selectAll]", "oneWire select all"],
			[" ", "[1wire:writeByte]", "oneWire write byte _ : power _", "num bool", 0, false],
			["r", "[1wire:readByte]", "oneWire read byte"],
			["r", "[1wire:crc8]", "oneWire crc8 _ : byte count _", "str num", "aByteArray", 8],
			["r", "[1wire:crc16]", "oneWire crc16 _ : byte count _", "str num", "aByteArray", 8],
			[" ", "[ble:octoStartBeam]", "octo start beam _", "str"],
			[" ", "[ble:octoStopBeam]", "octo stop beam"],
			["r", "[ble:octoReceive]", "octo receive"],
			["r", "[ble:scanReceive]", "ble receive scan"],
			[" ", "[ble:stopScanning]", "ble stop scanning"],
			[" ", "[ble:radioSetGroup]", "ble radio set group _ (0-255)", "num", 0],
			[" ", "[ble:radioStartBeam]", "ble radio start beam _", "str"],
			[" ", "[ble:radioStopBeam]", "ble radio stop beam"],
			["r", "[ble:radioReceive]", "ble radio receive"],
			["r", "[ble:uartConnected]", "BLE serial connected?"],
			["r", "[ble:uartRead]", "_BLE serial read as bytes _", "bool", false],
			[" ", "[ble:uartWrite]", "_BLE serial write _ (max 240) starting at _", "str num", "aStringOrByteArray", 1],
	];
}
