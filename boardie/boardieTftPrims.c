/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Copyright 2022 John Maloney, Bernat Romagosa, and Jens Mönig

// boardieTftPrims.cpp - Microblocks TFT primitives simulated on JS Canvas
// Bernat Romagosa, November 2022

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <emscripten.h>

#include "mem.h"
#include "interp.h"

#define TFT_WIDTH 240
#define TFT_HEIGHT 240

static int touchEnabled = false;
static int tftEnabled = false;
static int tftShouldUpdate = false;

void tftChanged() { tftShouldUpdate = true; }

void tftClear() {
	tftInit();
	EM_ASM_({
		window.ctx.fillStyle = "#000";
		window.ctx.fillRect(0, 0, $0, $1);
	}, TFT_WIDTH, TFT_HEIGHT);
	tftChanged();
}

void tftInit() {
	if (!tftEnabled) {
		tftEnabled = true;
		EM_ASM_({
			// initialize an offscreen canvas
			window.offscreenCanvas = document.createElement('canvas');
			window.offscreenCanvas.width = $0;
			window.offscreenCanvas.height = $1;
			window.ctx = window.offscreenCanvas.getContext('2d', { alpha: false });
			window.ctx.imageSmoothingEnabled = false;

			var adafruitFont = new FontFace('adafruit', 'url(adafruit_font.ttf)');

			adafruitFont.load().then((font) => { document.fonts.add(font); });

			window.rgbFrom24b = function (color24b) {
				return 'rgb(' + ((color24b >> 16) & 255) + ',' +
					((color24b >> 8) & 255) + ',' + (color24b & 255) + ')';
			};

			window.tftPlot = function (x, y) {
				window.ctx.fillRect(x | 0, y | 0, 1, 1);
			};

			window.tftLine = function (x0, y0, x1, y1, color24b) {
				x0 |= 0;
				y0 |= 0;
				x1 |= 0;
				y1 |= 0;
				window.ctx.fillStyle = window.rgbFrom24b(color24b);

				if (x0 === x1) {
					window.ctx.fillRect(x0, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1);
					return;
				}
				if (y0 === y1) {
					window.ctx.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0) + 1, 1);
					return;
				}

				var dx = Math.abs(x1 - x0);
				var sx = (x0 < x1) ? 1 : -1;
				var dy = -Math.abs(y1 - y0);
				var sy = (y0 < y1) ? 1 : -1;
				var err = dx + dy;
				while (true) {
					window.tftPlot(x0, y0);
					if ((x0 === x1) && (y0 === y1)) return;
					var e2 = 2 * err;
					if (e2 >= dy) {
						err += dy;
						x0 += sx;
					}
					if (e2 <= dx) {
						err += dx;
						y0 += sy;
					}
				}
			};

			window.tftRect = function (x, y, w, h, color24b) {
				x |= 0;
				y |= 0;
				w |= 0;
				h |= 0;
				if ((w <= 0) || (h <= 0)) return;
				window.ctx.fillStyle = window.rgbFrom24b(color24b);
				window.ctx.fillRect(x, y, w, 1);
				window.ctx.fillRect(x, y + h - 1, w, 1);
				window.ctx.fillRect(x, y, 1, h);
				window.ctx.fillRect(x + w - 1, y, 1, h);
			};

			window.tftCircle = function (cx, cy, r, color24b) {
				cx |= 0;
				cy |= 0;
				r |= 0;
				if (r < 0) return;
				window.ctx.fillStyle = window.rgbFrom24b(color24b);
				var x = 0;
				var y = r;
				var d = 3 - (2 * r);
				while (y >= x) {
					window.tftPlot(cx + x, cy + y);
					window.tftPlot(cx - x, cy + y);
					window.tftPlot(cx + x, cy - y);
					window.tftPlot(cx - x, cy - y);
					window.tftPlot(cx + y, cy + x);
					window.tftPlot(cx - y, cy + x);
					window.tftPlot(cx + y, cy - x);
					window.tftPlot(cx - y, cy - x);
					if (d < 0) {
						d += (4 * x) + 6;
					} else {
						d += (4 * (x - y)) + 10;
						y--;
					}
					x++;
				}
			};

			window.tftRoundRect = function (x, y, w, h, r, color24b) {
				x |= 0;
				y |= 0;
				w |= 0;
				h |= 0;
				r |= 0;
				if ((w <= 0) || (h <= 0)) return;
				if (r < 0) r = 0;
				if ((2 * r) >= h) r = (h >> 1) - 1;
				if ((2 * r) >= w) r = (w >> 1) - 1;
				if (r < 0) r = 0;

				window.ctx.fillStyle = window.rgbFrom24b(color24b);
				window.ctx.fillRect(x + r, y, w - (2 * r), 1);
				window.ctx.fillRect(x + r, y + h - 1, w - (2 * r), 1);
				window.ctx.fillRect(x, y + r, 1, h - (2 * r));
				window.ctx.fillRect(x + w - 1, y + r, 1, h - (2 * r));

				var left = x + r;
				var right = x + w - r - 1;
				var top = y + r;
				var bottom = y + h - r - 1;
				var px = 0;
				var py = r;
				var d = 3 - (2 * r);
				while (py >= px) {
					window.tftPlot(left - px, top - py);
					window.tftPlot(left - py, top - px);
					window.tftPlot(right + px, top - py);
					window.tftPlot(right + py, top - px);
					window.tftPlot(right + px, bottom + py);
					window.tftPlot(right + py, bottom + px);
					window.tftPlot(left - px, bottom + py);
					window.tftPlot(left - py, bottom + px);
					if (d < 0) {
						d += (4 * px) + 6;
					} else {
						d += (4 * (px - py)) + 10;
						py--;
					}
					px++;
				}
			};
		}, TFT_WIDTH, TFT_HEIGHT);
	}
}

void updateMicrobitDisplay() {
	// transfer the offscreen canvas image to the main canvas
	if (tftEnabled && tftShouldUpdate) {
		EM_ASM_({
			if (!window.mainCtx) {
				window.mainCtx =
					document.querySelector('#screen').getContext(
						'2d',
						{ alpha: false }
					);
				window.mainCtx.imageSmoothingEnabled = false;
			}
			window.mainCtx.drawImage(window.offscreenCanvas, 0, 0);
		});
		tftShouldUpdate = false;
	}
}

// TFT Primitives

static OBJ primSetBacklight(int argCount, OBJ *args) {
	return falseObj; // noop in Boardie
}

static OBJ primGetWidth(int argCount, OBJ *args) {
	return int2obj(TFT_WIDTH);
}

static OBJ primGetHeight(int argCount, OBJ *args) {
	return int2obj(TFT_HEIGHT);
}

static OBJ primSetPixel(int argCount, OBJ *args) {
	tftInit();
	EM_ASM_({
			window.ctx.fillStyle = window.rgbFrom24b($2);
			window.ctx.fillRect($0, $1, 1, 1);
		},
		obj2int(args[0]), // x
		obj2int(args[1]), // y
		obj2int(args[2]) // color
	);
	tftChanged();
	return falseObj;
}

static OBJ primPixelRow(int argCount, OBJ *args) {
	// Draw a single row of pixels (a list or byte array) at the given y.
	// If a byte array is provided the optional argument bytesPerPixel
	// determines the pixel size: 2, 3 or 4 bytes.
	// 2 means 16-bit RGB565 pixels; -2 means 16-bit RGB555 pixels.
	// 32 and 24 bit pixels are RGB(A) byte order. (Alpha of 32-bit pixels is ignored).
	// Used to accelerate BMP file display and other bitmap operations.

	tftInit();

	OBJ pixelDataObj = args[0];
	int x = obj2int(args[1]);
	if (x >= TFT_WIDTH) return falseObj;
	int y = obj2int(args[2]);
	if ((y < 0) || (y >= TFT_HEIGHT)) return falseObj;
	int bytesPerPixel = ((argCount > 3) && isInt(args[3])) ? obj2int(args[3]) : 4;

	uint32 palette[256];
	if ((argCount > 4) && IS_TYPE(args[4], ListType)) {
		// paletteObj is a list of Integers representingRGB colors
		// palette is a C array of TFT display pixel values (e.g. 16-bit colors)
		OBJ paletteObj = args[4];
		int colorCount = obj2int(FIELD(paletteObj, 0)); // list size
		if (colorCount > 256) colorCount = 256;
		memset(palette, 0, sizeof(palette));
		for (int i = 0; i < colorCount; i++) {
			OBJ rgbObj = FIELD(paletteObj, i + 1);
			palette[i] = isInt(rgbObj) ? obj2int(rgbObj) : 0;
		}
	}

	if (IS_TYPE(pixelDataObj, ListType)) {
		int pixelCount = obj2int(FIELD(pixelDataObj, 0));
		if (pixelCount > (TFT_WIDTH - x)) pixelCount = TFT_WIDTH - x;
		for (int i = 0; i < pixelCount; i++) {
			OBJ pixelObj = FIELD(pixelDataObj, (i + 1));
			int rgb = (isInt(pixelObj)) ? obj2int(pixelObj) : 0;
			EM_ASM_({
					window.ctx.fillStyle = window.rgbFrom24b($2);
					window.ctx.fillRect($0, $1, 1, 1);
				},
				x + i, y, rgb
			);
		}
	} else if (IS_TYPE(pixelDataObj, ByteArrayType)) {
		int isRGB565 = true;
		if (bytesPerPixel < 0) {
			isRGB565 = false; // -2 means 16-bit RGB555 (vs. RGB565)
			bytesPerPixel = -bytesPerPixel;
		}
		if ((bytesPerPixel < 1) || (bytesPerPixel > 4)) return falseObj;

		int pixelCount = BYTES(pixelDataObj) / bytesPerPixel;
		if (pixelCount > (TFT_WIDTH - x)) pixelCount = TFT_WIDTH - x;
		uint8 *byte = (uint8 *) &FIELD(pixelDataObj, 0);
		if (1 == bytesPerPixel) {
			for (int i = 0; i < pixelCount; i++) {
				EM_ASM_({
						window.ctx.fillStyle = window.rgbFrom24b($2);
						window.ctx.fillRect($0, $1, 1, 1);
					},
					x + i, y, palette[*byte++]
				);
			}
		} else if (2 == bytesPerPixel) {
			for (int i = 0; i < pixelCount; i++) {
				int pixel = (byte[1] << 8) | byte[0];
				int r = isRGB565 ? ((pixel >> 8) & 248) : ((pixel >> 7) & 248);
				int g = isRGB565 ? ((pixel >> 3) & 252) : ((pixel >> 2) & 248);
				int b = (pixel << 3) & 248;
				EM_ASM_({
						window.ctx.fillStyle = window.rgbFrom24b($2);
						window.ctx.fillRect($0, $1, 1, 1);
					},
					x + i, y, ((r << 16) | (g << 8) | b)
				);
				byte += bytesPerPixel;
			}
		} else { // 24-bit or 32-bit pixels
			for (int i = 0; i < pixelCount; i++) {
				EM_ASM_({
						window.ctx.fillStyle = window.rgbFrom24b($2);
						window.ctx.fillRect($0, $1, 1, 1);
					},
					x + i, y, ((byte[2] << 16) | (byte[1] << 8) | byte[0])
				);
				byte += bytesPerPixel;
			}
		}
	}
	tftChanged();
	return falseObj;
}

static OBJ primLine(int argCount, OBJ *args) {
	tftInit();
	EM_ASM_({
			window.tftLine($0, $1, $2, $3, $4);
		},
		obj2int(args[0]), // x0
		obj2int(args[1]), // y0
		obj2int(args[2]), // x1
		obj2int(args[3]), // y1
		obj2int(args[4]) // color
	);
	tftChanged();
	return falseObj;
}

static OBJ primRect(int argCount, OBJ *args) {
	tftInit();
	EM_ASM_({
			if ($5) {
				window.ctx.fillStyle = window.rgbFrom24b($4);
				window.ctx.fillRect($0, $1, $2, $3);
			} else {
				window.tftRect($0, $1, $2, $3, $4);
			}
		},
		obj2int(args[0]), // x
		obj2int(args[1]), // y
		obj2int(args[2]), // width
		obj2int(args[3]), // height
		obj2int(args[4]), // color
		(argCount > 5) ? (trueObj == args[5]) : true // fill
	);
	tftChanged();
	return falseObj;
}

static OBJ primCircle(int argCount, OBJ *args) {
	tftInit();
	EM_ASM_({
			var x = $0;
			var y = $1;
			var r = $2;
			var fill = $4;
			if (fill) {
				window.ctx.fillStyle = window.rgbFrom24b($3);
				window.ctx.beginPath();
				window.ctx.arc(x, y, r, 0, 2 * Math.PI);
				window.ctx.fill();
			} else {
				window.tftCircle(x, y, r, $3);
			}
		},
		obj2int(args[0]), // x
		obj2int(args[1]), // y
		obj2int(args[2]), // radius
		obj2int(args[3]), // color
		(argCount > 4) ? (trueObj == args[4]) : true // fill
	);
	tftChanged();
	return falseObj;
}

static OBJ primRoundedRect(int argCount, OBJ *args) {
	tftInit();
	int width = obj2int(args[2]);
	int height = obj2int(args[3]);
	int radius = obj2int(args[4]);

	if (2 * radius >= height) {
		radius = (height / 2) - 1;
	}
	if (2 * radius >= width) {
		radius = (width / 2) - 1;
	}
	if (radius < 0) radius = 0;

	EM_ASM_({
			if ($6) {
				window.ctx.fillStyle = window.rgbFrom24b($5);
			} else {
				window.ctx.strokeStyle = window.rgbFrom24b($5);
			}
			var x = $0;
			var y = $1;
			var w = $2;
			var h = $3;
			var r = $4;

			window.ctx.beginPath();
			window.ctx.moveTo(x + r, y);

			window.ctx.lineTo(x + w - r, y); // top
			window.ctx.arc(x + w - r, y + r, r, 3 * Math.PI / 2, 0, false); // t-r

			window.ctx.lineTo(x + w, y + h - r); // right
			window.ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2, false); // b-r

			window.ctx.lineTo(x + r, y + h); // bottom
			window.ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false); // b-l

			window.ctx.lineTo(x, y + r); // left
			window.ctx.arc(x + r, y + r, r, Math.PI , 3 * Math.PI / 2, false); // t-l

			if ($6) {
				window.ctx.fill();
			} else {
				window.tftRoundRect($0, $1, $2, $3, $4, $5);
			}
		},
		obj2int(args[0]), // x
		obj2int(args[1]), // y
		width, // (2)
		height, // (3)
		radius, // (4)
		obj2int(args[5]), // color
		(argCount > 6) ? (trueObj == args[6]) : true // fill (6)
	);
	tftChanged();
	return falseObj;
}

static OBJ primTriangle(int argCount, OBJ *args) {
	tftInit();

	// draw triangle
	EM_ASM_({
			if ($7) {
				window.ctx.fillStyle = window.rgbFrom24b($6);
			} else {
				window.ctx.strokeStyle = window.rgbFrom24b($6);
			}
			window.ctx.beginPath();
			window.ctx.moveTo($0, $1);
			window.ctx.lineTo($2, $3);
			window.ctx.lineTo($4, $5);
			window.ctx.closePath();
			if ($7) {
				window.ctx.fill();
			} else {
				window.tftLine($0, $1, $2, $3, $6);
				window.tftLine($2, $3, $4, $5, $6);
				window.tftLine($4, $5, $0, $1, $6);
			}
		},
		obj2int(args[0]), // x0
		obj2int(args[1]), // y0
		obj2int(args[2]), // x1
		obj2int(args[3]), // y1
		obj2int(args[4]), // x2
		obj2int(args[5]), // y2
		obj2int(args[6]), // color
		(argCount > 7) ? (trueObj == args[7]) : true // fill
	);
	tftChanged();
	return falseObj;
}

static void drawText(OBJ value, int x, int y, int textColor, int scale, int wrap, int bgColor, int unicodeFont) {
	char text[32] = {0};
	char *s = text;

	if (IS_TYPE(value, StringType)) {
		s = obj2str(value);
	} else if (isInt(value)) {
		sprintf(text, "%d", obj2int(value));
	} else if (trueObj == value) {
		sprintf(text, "true");
	} else if (falseObj == value) {
		sprintf(text, "false");
	} else if (IS_TYPE(value, ListType)) {
		sprintf(text, "[%d item list]", obj2int(FIELD(value, 0)));
	} else if (IS_TYPE(value, ByteArrayType)) {
		sprintf(text, "(%d bytes)", BYTES(value));
	}

	// draw text
	EM_ASM_({
		var text = UTF8ToString($0);
		// subtract a little bit from x, proportional to font scale, to make
		// it match the font on physical boards
		var textColor = $3;
		var scale = $4;
		var wrap = $5;
		var bgColor = $6;
		var x = $1 - scale;
		var y = $2 - scale;
		var lines = text.split("\n");
		if (bgColor >= 0) {
			var w = scale * 6 * Math.max(...lines.map((l) => l.length));
			var h = scale * 8 * lines.length; // text height on boards is scale * 8 per line
			window.ctx.fillStyle = window.rgbFrom24b(bgColor);
			window.ctx.fillRect(x + scale, y + scale, w, h);
		}
		// there is a weird rounding artifact at scale 3
		var fontSize = (scale == 3) ? (scale * 10.5) : (scale * 11);
		window.ctx.fillStyle = window.rgbFrom24b(textColor);
		window.ctx.textBaseline = 'top';
		if ($7) { // Unicode
			// Approximate the same font size and top-left position as the Adafruit font
			fontSize = (scale * 10);
			window.ctx.font = fontSize + 'px monospace';
			lines.forEach((line, i) => {
				window.ctx.fillText(line, x + (scale * 0.9), y + (scale * 2.45) + (i * scale * 8));
			});
		} else {
			window.ctx.font = fontSize + 'px adafruit';
			var justWrapped = false;
			text.split("").forEach(
				(c) => {
					if (c == "\n") { // newline: back to the starting x, down one line
						x = $1 - scale;
						if (!justWrapped) y += scale * 8; // a wrap already moved down
						justWrapped = false;
						return;
					}
					window.ctx.fillText(c, x, y);
					x += scale * 6;
					justWrapped = false;
					if (wrap && (x + scale * 6 >= window.ctx.canvas.width)) {
						// wrap
						x = 0 - scale;
						y += fontSize * 3 / 4;
						justWrapped = true;
					}
				}
			);
		}
	},
	s, x, y, textColor, scale, wrap, bgColor, unicodeFont);
}

static OBJ primText(int argCount, OBJ *args) {
	tftInit();

	int x = obj2int(args[1]); // x
	int y = obj2int(args[2]); // y
	int textColor = obj2int(args[3]); // text color
	int scale = (argCount > 4) ? obj2int(args[4]) : 2; // scale
	int wrap = (argCount > 5) ? (trueObj == args[5]) : true; // wrap
	int bgColor = (argCount > 6) ? obj2int(args[6]) : -1; // background color

	drawText(args[0], x, y, textColor, scale, wrap, bgColor, false);

	tftChanged();
	return falseObj;
}

static OBJ primUnicode(int argCount, OBJ *args) {
	tftInit();

	int x = obj2int(args[1]); // x
	int y = obj2int(args[2]); // y
	int textColor = obj2int(args[3]); // text color
	int scale = (argCount > 4) ? obj2int(args[4]) : 2; // scale
	int wrap = (argCount > 5) ? (trueObj == args[5]) : true; // wrap
	int bgColor = (argCount > 6) ? obj2int(args[6]) : -1; // background color

	drawText(args[0], x, y, textColor, scale, wrap, bgColor, true);

	tftChanged();
	return falseObj;
}

static OBJ primClear(int argCount, OBJ *args) {
	tftClear();
	return falseObj;
}

// defer/force update

OBJ primDeferUpdates(int argCount, OBJ *args) {
	return falseObj; // noop; Boardie always defers updates
}

OBJ primResumeUpdates(int argCount, OBJ *args) {
	// Return control to the browser to allow display update.

	taskSleep(0); // ends the current interpreter step
	return falseObj;
}

// 8-bit primitives

static OBJ primMergeBitmap(int argCount, OBJ *args) {
	tftInit();
	EM_ASM_({
			var bufferWidth = window.ctx.canvas.width / $4;
			var bufferHeight = window.ctx.canvas.height / $4;
			var bitmapHeight = $2 / $1;
			for (var y = 0; y < bitmapHeight; y++) {
				if ((y + $7) < bufferHeight && (y + $7) >= 0) {
					for (var x = 0; x < $1; x++) {
						if ((x + $6) < bufferWidth && (x + $6) >= 0) {
							var pixelValue = HEAPU8[$0 + y * $1 + x];
							if (pixelValue !== $5) {
								var bufIndex = ($7 + y) * bufferWidth + x + $6;
								HEAPU8[$3 + bufIndex] = pixelValue;
							}
						}
					}
				}
			}
		},
		(uint8 *) &FIELD(args[0], 0),	// $0, bitmap
		obj2int(args[1]),				// $1, bitmap width
		BYTES(args[0]),					// $2, bitmap byte size
		(uint8 *) &FIELD(args[2], 0),	// $3, buffer
		obj2int(args[3]),				// $4, scale
		obj2int(args[4]),				// $5, transparent color index
		obj2int(args[5]),				// $6, destination x
		obj2int(args[6])				// $7, destination y
	);
	return falseObj;
}

static OBJ primDrawBuffer(int argCount, OBJ *args) {
	tftInit();

	int originX = 0;
	int originY = 0;
	int copyWidth = -1;
	int copyHeight = -1;

	if (argCount > 6) {
		originX = obj2int(args[3]);
		originY = obj2int(args[4]);
		copyWidth = obj2int(args[5]);
		copyHeight = obj2int(args[6]);
	}

	// read palette into a JS object first
	for (int i = 0; i < obj2int(FIELD(args[1], 0)); i ++) {
		EM_ASM_({
				if (!window.palette) { window.palette = []; }
				window.palette[$1] = $0;
			},
			obj2int(FIELD(args[1], i + 1)),
			i
		);
	}

	EM_ASM_({
			var scale = $1 || 1;
			var originX = $2;
			var originY = $3;
			var bufferWidth = Math.ceil(window.ctx.canvas.width / scale);
			var bufferHeight = Math.ceil(window.ctx.canvas.height / scale);
			var originWidth = $4 >= 0 ? $4 : bufferWidth;
			var originHeight = $5 >= 0 ? $5 : bufferHeight;

			var imgData = window.ctx.createImageData(originWidth, originHeight);
			var pixelIndex = 0;

			// Make an extra canvas where we'll draw the buffer first, so we can
			// later scale it up to the offscreen canvas.
			var canvas = document.createElement('canvas');
			canvas.width = originWidth;
			canvas.height = originHeight;

			// Read the indices from the buffer and turn them into color values
			// from the palette, and transfer them into the imgData object.
			for (var y = originY; y < (originY + originHeight); y ++) {
				for (var x = originX; x < (originX + originWidth); x ++) {
					var color =
						window.palette[HEAPU8[$0 + y * bufferWidth + x]];
					imgData.data[pixelIndex] = color >> 16; // R
					imgData.data[pixelIndex + 1] = (color >> 8) & 255; // G
					imgData.data[pixelIndex + 2] = color & 255; // B
					imgData.data[pixelIndex + 3] = 255; // A
					pixelIndex += 4;
				}
			}

			// Draw the image data into the canvas, then draw it scaled to the
			// offscreen canvas.
			// Note: we could do the same without an extra canvas by using
			// createImageBitmap, but that returns a promise and we need this
			// operation to be synchronous. Additionally, we've measured this
			// method to be pretty much as fast as the other one.
			canvas.getContext('2d').putImageData(imgData, 0, 0);
			window.ctx.drawImage(
				canvas,
				originX * scale,
				originY * scale,
				originWidth * scale,
				originHeight * scale
			);
		},
		(uint8 *) &FIELD(args[0], 0),	// $0, buffer
		obj2int(args[2]),				// $1, scale
		originX,						// $2
		originY,						// $3
		copyWidth,						// $4
		copyHeight						// $5
	);
	tftChanged();
	return falseObj;
}

// Simulating a 5x5 LED Matrix

void tftSetHugePixel(int x, int y, int state) {
	// simulate a 5x5 array of square pixels like the micro:bit LED array
	tftInit();
	int minDimension, xInset = 0, yInset = 0;
	if (TFT_WIDTH > TFT_HEIGHT) {
		minDimension = TFT_HEIGHT;
		xInset = (TFT_WIDTH - TFT_HEIGHT) / 2;
	} else {
		minDimension = TFT_WIDTH;
		yInset = (TFT_HEIGHT - TFT_WIDTH) / 2;
	}
	int lineWidth = (minDimension > 60) ? 3 : 1;
	int squareSize = (minDimension - (6 * lineWidth)) / 5;

	EM_ASM_({
			if (!window.mbDisplayColor) { window.mbDisplayColor = 0x00FF00; }
			window.ctx.fillStyle = $3 == 0 ?
				'#000' :
				window.rgbFrom24b(window.mbDisplayColor);
			window.ctx.fillRect($0, $1, $2, $2);
		},
		xInset + ((x - 1) * squareSize) + (x * lineWidth), // x
		yInset + ((y - 1) * squareSize) + (y * lineWidth), // y
		squareSize,
		state
	);

	tftChanged();
}

void tftSetHugePixelBits(int bits) {
	tftClear(); // erase any TFT graphics that might be on the screen
	for (int x = 1; x <= 5; x++) {
		for (int y = 1; y <= 5; y++) {
			tftSetHugePixel(x, y, bits & (1 << ((5 * (y - 1) + x) - 1)));
		}
	}
}

// TFT Touch Primitives

// Mouse support
void initMouseHandler() {
	if (!touchEnabled) {
		EM_ASM_({
			var screen = window.document.querySelector('#screen');
			window.mouseX = 0;
			window.mouseY = 0;
			window.mouseDown = false;
			window.mouseDownTime = 0;
			screen.addEventListener('pointermove', function (event) {
				window.mouseX = Math.floor(event.clientX - screen.offsetLeft);
				window.mouseY = Math.floor(event.clientY - screen.offsetTop);
			}, false);
			screen.addEventListener('pointerdown', function (event) {
				window.mouseDown = true;
				window.mouseDownTime = Date.now();
			}, false);
			screen.addEventListener('pointerup', function (event) {
				window.mouseDown = false;
				window.mouseDownTime = 0;
			}, false);
		});
	touchEnabled = true;
	}
}

static OBJ primTftTouched(int argCount, OBJ *args) {
	initMouseHandler();
	return EM_ASM_INT({ return window.mouseDown }) ? trueObj : falseObj;
}

static OBJ primTftTouchX(int argCount, OBJ *args) {
	initMouseHandler();
	return int2obj(EM_ASM_INT({
		return window.mouseX;
	}));
}

static OBJ primTftTouchY(int argCount, OBJ *args) {
	initMouseHandler();
	return int2obj(EM_ASM_INT({
		return window.mouseY;
	}));
}

static OBJ primTftTouchPressure(int argCount, OBJ *args) {
	initMouseHandler();
	return int2obj(EM_ASM_INT({
		if (window.mouseDown) {
			var mousePressure = (Date.now() - window.mouseDownTime);
			if (mousePressure > 4095) { mousePressure = 4095; }
		} else {
			mousePressure = -1;
		}
		return mousePressure;
	}));
}

// Primitives

static PrimEntry entries[] = {
	{"setBacklight", primSetBacklight},
	{"getWidth", primGetWidth},
	{"getHeight", primGetHeight},
	{"setPixel", primSetPixel},
	{"pixelRow", primPixelRow},
	{"line", primLine},
	{"rect", primRect},
	{"roundedRect", primRoundedRect},
	{"circle", primCircle},
	{"triangle", primTriangle},
	{"text", primText},
	{"unicode", primUnicode},
	{"clear", primClear},

	{"deferUpdates", primDeferUpdates},
	{"resumeUpdates", primResumeUpdates},

	{"mergeBitmap", primMergeBitmap},
	{"drawBuffer", primDrawBuffer},

	{"tftTouched", primTftTouched},
	{"tftTouchX", primTftTouchX},
	{"tftTouchY", primTftTouchY},
	{"tftTouchPressure", primTftTouchPressure},
};

void addTFTPrims() {
	addPrimitiveSet(TFTPrims, "tft", sizeof(entries) / sizeof(PrimEntry), entries);
}
