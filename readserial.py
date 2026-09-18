import sys
import time

import serial

port = sys.argv[1]
seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 30.0
ser = serial.Serial(port, 115200, timeout=0.2)
data = bytearray()
deadline = time.monotonic() + seconds
while time.monotonic() < deadline:
    data.extend(ser.read(4096))
ser.close()
sys.stdout.buffer.write(data)
