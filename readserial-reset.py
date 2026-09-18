import sys
import time

import serial

port = sys.argv[1]
seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
ser = serial.Serial(port, 115200, timeout=0.2)
ser.dtr = False
ser.rts = False
time.sleep(0.2)
ser.dtr = True
ser.rts = True
data = bytearray()
deadline = time.monotonic() + seconds
while time.monotonic() < deadline:
    data.extend(ser.read(4096))
ser.close()
sys.stdout.buffer.write(data)
