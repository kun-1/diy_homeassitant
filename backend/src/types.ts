import type { DitherAlgorithm } from './rasterizer.js';
import type {
  ReceiptFontProfile,
  ReceiptStyle,
  ReceiptTemplateKind,
} from './receipt-templates.js';

export type TodoPriority = 'high' | 'normal' | 'low';

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  priority: TodoPriority;
  tag: string | null;
  owner: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PrintJobStatus = 'queued' | 'printing' | 'completed' | 'failed';

export interface PrintRenderOptions {
  algorithm?: DitherAlgorithm;
  gamma?: number;
  threshold?: number;
  fontScale?: number;
  hybrid?: boolean;
  photoOptions?: {
    algorithm?: DitherAlgorithm;
    gamma?: number;
    threshold?: number;
    contrastStretch?: boolean;
    brightness?: number;
  };
}

export interface PrintJob {
  id: string;
  template: ReceiptTemplateKind;
  style: ReceiptStyle;
  fontProfile: ReceiptFontProfile;
  payload: Record<string, unknown>;
  renderOptions: PrintRenderOptions;
  status: PrintJobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface PrinterBitmapPayload {
  format: 'MONO_1BPP_MSB_FIRST';
  widthPx: 384;
  heightPx: number;
  bytesPerRow: 48;
  bitmapB64: string;
}

export type DeviceKind = 'host' | 'esp32' | 'printer' | 'powerBank';
export type PrinterPaperStatus = 'ok' | 'near_end' | 'out' | 'unknown';

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  status: 'online' | 'offline';
  lastSeenAt: string | null;
  batteryPct: number | null;
  paperStatus: PrinterPaperStatus | null;
  coverOpen: boolean | null;
  printerError: boolean | null;
  firmwareVersion: string | null;
  wifiRssiDbm: number | null;
  uptimeSeconds: number | null;
  chipTemperatureC: number | null;
  ipAddress: string | null;
  updatedAt: string;
}
