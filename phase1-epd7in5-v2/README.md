# Phase 1 - Waveshare 7.5 inch black/white e-Paper smoke test

This project is the first hardware stage: use Waveshare's official ESP32
driver and the official epd7in5_V2-demo to prove that the ESP32-S3 can
initialize and refresh the 800x480 black/white panel.

The vendor archive is kept unchanged in ../vendor. The files under
lib/esp32-waveshare-epd and src/ are the project copy used by PlatformIO.

## Hardware assumption

This targets the ordinary black/white 7.5inch e-Paper V2 panel
(epd7in5_V2), not the B, H, or HD variants.

The copied official ESP32 driver uses this direct-wiring map:

| e-Paper signal | ESP32-S3 GPIO |
| --- | ---: |
| DIN / MOSI | GPIO14 |
| CLK / SCLK | GPIO13 |
| CS | GPIO15 |
| DC | GPIO17 |
| RST | GPIO16 |
| BUSY | GPIO18 |
| PWR (if present) | GPIO21 |
| VCC | 3.3V |
| GND | GND |

These pins are selected for the ESP32-S3 N8R8. GPIO25 is not a valid ESP32-S3
GPIO, so the classic ESP32 driver defaults must not be used unchanged.

If the panel cable has a PWR signal, connect it to GPIO21; the project drives
it HIGH during initialization. If the cable has only the standard 8 signals,
leave PWR unconnected. In both cases connect VCC to 3.3V and GND to GND with
a stable supply; do not power the panel from an unverified pin.

## Build and upload

From this directory:

    source ../.venv/bin/activate
    pio run
    pio device list
    pio run -t upload --upload-port /dev/cu.usbmodem211101
    pio device monitor --port /dev/cu.usbmodem211101 --baud 115200

The second usbmodem port may be the usable console/upload port on this board.
Use the port shown by pio device list and replace the example above.

Expected serial markers include:

- EPD_7IN5_V2_test Demo
- e-Paper Init and Clear...
- EPD_Display
- Goto Sleep...

A successful compile/upload is not by itself visual acceptance: the physical
panel must visibly clear and show the Waveshare bitmap/test drawing. The V2
refresh can take several minutes.

## Next stage

After this smoke test is visually confirmed, replace the bitmap/drawing path
with an 800x480 render target suitable for the TRMNL display protocol. Wi-Fi
and TRMNL integration are intentionally outside this phase.
