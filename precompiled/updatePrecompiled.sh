#!/bin/bash
# Rebuild and update the precompiled binaries.

# Check that npm and node installed
if ! command -v node > /dev/null; then
	echo "node is not installed."
	echo "Please read DEVELOPMENT.md"
	exit
fi

if ! command -v npm > /dev/null; then
	echo "npm is not installed."
	echo "Please read DEVELOPMENT.md"
	exit
fi

if ! command -v python > /dev/null; then
	echo "python is not installed."
	echo "Please read DEVELOPMENT.md"
	exit
fi

rm -f *.hex *.bin *.uf2
cd ..
pio run -e microbit
cp .pio/build/microbit/firmware.hex precompiled/vm_microbitV1.hex
pio run -e microbitV2-ble
cp .pio/build/microbitV2-ble/firmware.hex precompiled/vm_microbitV2.hex
pio run -e calliope
cp .pio/build/calliope/firmware.hex precompiled/vm_calliope.hex
pio run -e calliopeV3-ble
cp .pio/build/calliopeV3-ble/firmware.hex precompiled/vm_calliopeV3-ble.hex
pio run -e ed1
cp .pio/build/ed1/firmware.bin precompiled/vm_citilab-ed1.bin

pio run -e cocube
esptool.py --chip ESP32 merge_bin -o precompiled/vm_cocube.bin --flash_mode dio --flash_size 4MB 0x1000 esp32/bootloader_dio_40m.bin 0xe000 esp32/boot_app0.bin 0x8000 esp32/partitionsMicroBlocks.bin 0x10000 .pio/build/cocube/firmware.bin 0x1e8000 .pio/libdeps/cocube/CoCube-Assets/firmware/mbcode.bin 0x210000 .pio/libdeps/cocube/CoCube-Assets/firmware/littlefs.bin

pio run -e springbot
cp .pio/build/springbot/firmware.bin precompiled/vm_springbot.bin

pio run -e duelink
cp .pio/build/duelink/firmware.bin precompiled/vm_duelink.bin
chmod 644 precompiled/vm_duelink.bin

pio run -e esp32
cp .pio/build/esp32/firmware.bin precompiled/vm_esp32.bin
pio run -e pico-w
cp .pio/build/pico-w/firmware.uf2 precompiled/vm_pico_w.uf2
pio run -e databot
cp .pio/build/databot/firmware.bin precompiled/vm_databot.bin
pio run -e databot-v3
cp .pio/build/databot-v3/firmware.bin precompiled/vm_databot_v3.bin
pio run -e steamaker-ai
cp .pio/build/steamaker-ai/firmware.bin precompiled/vm_steamakers_ai.bin
pio run -e steam-maker
cp .pio/build/steam-maker/firmware.bin precompiled/vm_micro_steamakers.bin
pio run -e esp32-steamakers
cp .pio/build/esp32-steamakers/firmware.bin precompiled/vm_esp32_steamakers.bin
pio run -e kids-bits
cp .pio/build/kids-bits/firmware.bin precompiled/vm_kids_bits.bin
pio run -e makerportV3
python precompiled/uf2conv.py -c .pio/build/makerportV3/firmware.bin -o precompiled/vm_makerport.uf2

pio run -e weact_h743vitx
cp .pio/build/weact_h743vitx/firmware.bin precompiled/vm_weact_stm32.bin

# Copy Linux VMs
# cp linux+pi/vm_* precompiled/

# Create micro:bit and Calliope universal hex files
# Make sure we have the proper dep(s) installed
cd precompiled
npm install
node buildUniversalHex.js
rm vm_microbitV1.hex vm_microbitV2.hex
rm vm_calliope.hex vm_calliopeV3-ble.hex
