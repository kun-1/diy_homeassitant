import type { PrinterBitmapPayload } from './types.js';

export const PRINTER_WIDTH_PX = 384;
export const PRINTER_BYTES_PER_ROW = PRINTER_WIDTH_PX / 8;
export const MAX_PRINT_ATTEMPTS = 3;

export function validateBitmapPayload(payload: PrinterBitmapPayload): void {
  if (payload.format !== 'MONO_1BPP_MSB_FIRST') throw new Error('unsupported bitmap format');
  if (payload.widthPx !== PRINTER_WIDTH_PX || payload.bytesPerRow !== PRINTER_BYTES_PER_ROW) throw new Error('bitmap width must be 384px');
  if (!Number.isInteger(payload.heightPx) || payload.heightPx < 1) throw new Error('bitmap height must be a positive integer');
  const bytes = Buffer.from(payload.bitmapB64, 'base64');
  if (bytes.length !== payload.heightPx * PRINTER_BYTES_PER_ROW) throw new Error('bitmap byte length does not match dimensions');
}

export type SerialTransport = {write(data:Buffer):Promise<void>};

export class MockSerialTransport implements SerialTransport {
  readonly writes: Buffer[] = [];
  async write(data:Buffer) { this.writes.push(Buffer.from(data)); }
}

export type Em5823Status = {
  paperStatus:'ok'|'near_end'|'out';
  coverOpen:boolean;
  printerError:boolean;
};

export function buildGsV0Packet(payload:PrinterBitmapPayload):Buffer {
  validateBitmapPayload(payload);
  const header=Buffer.from([
    0x1d,0x76,0x30,0x00,
    payload.bytesPerRow&0xff,(payload.bytesPerRow>>8)&0xff,
    payload.heightPx&0xff,(payload.heightPx>>8)&0xff,
  ]);
  return Buffer.concat([header,Buffer.from(payload.bitmapB64,'base64')]);
}

export function decodeEm5823Status(offlineStatus:number,errorStatus:number,paperStatus:number,sensorStatus=0):Em5823Status {
  return {
    coverOpen:(offlineStatus&0x04)!==0,
    printerError:(offlineStatus&0x40)!==0||(errorStatus&0x68)!==0||(paperStatus&0x20)!==0,
    paperStatus:(paperStatus&0x40)!==0||(offlineStatus&0x20)!==0||(sensorStatus&0x0c)!==0?'out':(paperStatus&0x0c)!==0||(sensorStatus&0x03)!==0?'near_end':'ok',
  };
}

export async function sendBitmap(transport:SerialTransport, payload:PrinterBitmapPayload):Promise<void> {
  await transport.write(buildGsV0Packet(payload));
}
