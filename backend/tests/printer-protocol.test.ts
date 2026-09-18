import { describe, expect, it } from 'vitest';
import { decodeEm5823Status, MockSerialTransport, sendBitmap } from '../src/printer-protocol.js';

describe('mock printer bitmap protocol', () => {
  it('writes exactly one 384px-wide 1bpp payload to the mock transport', async () => {
    const transport = new MockSerialTransport();
    const bytes = Buffer.alloc(48 * 2, 0xa5);
    await sendBitmap(transport, { format: 'MONO_1BPP_MSB_FIRST', widthPx: 384, heightPx: 2, bytesPerRow: 48, bitmapB64: bytes.toString('base64') });
    expect(transport.writes).toHaveLength(1);
    expect(transport.writes[0].subarray(0, 8)).toEqual(Buffer.from([0x1d, 0x76, 0x30, 0x00, 48, 0, 2, 0]));
    expect(transport.writes[0].subarray(8)).toEqual(bytes);
  });

  it('rejects a payload whose byte length does not match its dimensions', async () => {
    const transport = new MockSerialTransport();
    await expect(sendBitmap(transport, { format: 'MONO_1BPP_MSB_FIRST', widthPx: 384, heightPx: 2, bytesPerRow: 48, bitmapB64: Buffer.alloc(48).toString('base64') })).rejects.toThrow('bitmap byte length');
    expect(transport.writes).toHaveLength(0);
  });

  it('decodes the documented DLE EOT 2/3/4 status bits', () => {
    expect(decodeEm5823Status(0, 0, 0)).toEqual({ paperStatus: 'ok', coverOpen: false, printerError: false });
    expect(decodeEm5823Status(0x04, 0, 0x0c)).toEqual({ paperStatus: 'near_end', coverOpen: true, printerError: false });
    expect(decodeEm5823Status(0x20, 0x40, 0x40)).toEqual({ paperStatus: 'out', coverOpen: false, printerError: true });
    expect(decodeEm5823Status(0, 0, 0, 0x0c)).toEqual({ paperStatus: 'out', coverOpen: false, printerError: false });
  });
});
