import { z } from 'zod';
import { DEFAULT_FONT_PROFILE, DEFAULT_FONT_SCALE } from './defaults.js';

export const idParam = z.object({
  id: z.string().min(1),
});

export const todoCreate = z.object({
  title: z.string().min(1).max(200),
  completed: z.boolean().default(false),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  tag: z.string().max(40).nullable().default(null),
  owner: z.string().max(40).nullable().default(null),
  dueDate: z.string().max(40).nullable().default(null),
});

export const todoPatch = todoCreate.partial();

export const ditherAlgorithmSchema = z.enum([
  'atkinson',
  'floyd-steinberg',
  'bayer',
  'threshold',
]);

export const photoOptionsSchema = z.object({
  algorithm: ditherAlgorithmSchema.default('atkinson'),
  gamma: z.number().min(0.5).max(3.5).default(1.8),
  threshold: z.number().min(1).max(254).default(128),
  contrastStretch: z.boolean().default(true),
  brightness: z.number().min(-60).max(60).default(0),
});

export const renderOptionsSchema = z.object({
  algorithm: ditherAlgorithmSchema.optional(),
  gamma: z.number().min(0.5).max(3.5).optional(),
  threshold: z.number().min(1).max(254).optional(),
  fontScale: z.number().min(0.7).max(2.0).optional(),
  hybrid: z.boolean().optional(),
  photoOptions: photoOptionsSchema.optional(),
});

export const templateKindSchema = z.enum([
  'todo',
  'focus',
  'note',
  'photo',
  'calibration',
]);

export const styleSchema = z.enum(['receipt', 'journal']);
export const fontProfileSchema = z.string().min(1).max(160).default(DEFAULT_FONT_PROFILE);

export const printerPreviewSchema = z.object({
  template: templateKindSchema.default('todo'),
  style: styleSchema.default('receipt'),
  fontProfile: fontProfileSchema,
  fontScale: z.number().min(0.7).max(2.0).default(DEFAULT_FONT_SCALE),
  algorithm: ditherAlgorithmSchema.default('threshold'),
  gamma: z.number().min(0.5).max(3.5).default(1.1),
  threshold: z.number().min(1).max(254).default(120),
  hybrid: z.boolean().optional(),
  photoOptions: photoOptionsSchema.optional(),
  data: z.record(z.unknown()).optional(),
});

export const printJobCreate = z.object({
  template: templateKindSchema,
  style: styleSchema.default('receipt'),
  fontProfile: fontProfileSchema,
  data: z.record(z.unknown()).default({}),
  renderOptions: renderOptionsSchema.default({}),
});

export const printJobFail = z.object({
  error: z.string().max(500).default('printer error'),
  retryable: z.boolean().default(true),
});

export const heartbeatSchema = z.object({
  batteryPct: z.number().int().min(0).max(100).nullable().default(null),
  powerBankPct: z.number().int().min(0).max(100).nullable().default(null),
  paperStatus: z.enum(['ok', 'near_end', 'out', 'unknown']).nullable().default(null),
  coverOpen: z.boolean().nullable().default(null),
  printerError: z.boolean().nullable().default(null),
  firmwareVersion: z.string().max(80).nullable().default(null),
  wifiRssiDbm: z.number().int().min(-127).max(0).nullable().default(null),
  uptimeSeconds: z.number().int().min(0).nullable().default(null),
  chipTemperatureC: z.number().finite().min(-40).max(125).nullable().default(null),
  ipAddress: z.string().max(64).nullable().default(null),
});
