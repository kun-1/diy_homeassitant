import { z } from 'zod';
export const calendarProviderSelection = z.object({ provider: z.enum(['mock', 'google']).default('mock') });
export const idParam = z.object({ id: z.string().min(1) });
export const eventCreate = z.object({ title: z.string().min(1), startsAt: z.string().datetime(), endsAt: z.string().datetime(), description: z.string().nullable().default(null), location: z.string().nullable().default(null) });
export const eventPatch = eventCreate.partial();
export const todoCreate = z.object({ title: z.string().min(1), completed: z.boolean().default(false), dueDate: z.string().nullable().default(null) });
export const todoPatch = todoCreate.partial();
export const letterPaper = z.enum(['border', 'emoji', 'receipt', 'minimal']);
export const letterContent = z.enum(['none', 'polaroid', 'coupon', 'ghost-stamp', 'prescription']);
export const letterMetadata = z.object({
  content: letterContent.default('none'),
  fontProfile: z.enum(['system', 'thermal-sans', 'pixel', 'pixel-large', 'pixel-hard', 'pixel-soft', 'heiti', 'hybrid', 'comparison']).optional(),
  coupon: z.object({name:z.string().max(80),code:z.string().max(80),expiry:z.string().max(20)}).optional(),
  ghostEmoji: z.string().max(8).optional(),
  prescription: z.array(z.string().min(1).max(80)).max(5).optional(),
  imageData: z.string().max(750_000).regex(/^data:image\/(?:png|jpeg);base64,/).optional(),
}).strict();
export const letterCreate = z.object({ title: z.string().min(1).max(80), body: z.string().min(1).max(500), signature: z.string().min(1).max(80), paper: letterPaper.default('border'), metadata: letterMetadata.default({content:'none'}) });
export const letterPatch = letterCreate.partial().extend({ unread: z.boolean().optional(), archived: z.boolean().optional() });
export const heartbeat = z.object({ batteryPct: z.number().int().min(0).max(100).nullable().default(null), powerBankPct: z.number().int().min(0).max(100).nullable().default(null), paperStatus: z.enum(['ok', 'near_end', 'out', 'unknown']).nullable().default(null), coverOpen: z.boolean().nullable().default(null), printerError: z.boolean().nullable().default(null), firmwareVersion: z.string().max(80).nullable().default(null), wifiRssiDbm: z.number().int().min(-127).max(0).nullable().default(null), uptimeSeconds: z.number().int().min(0).nullable().default(null), chipTemperatureC: z.number().finite().min(-40).max(125).nullable().default(null), ipAddress: z.string().max(64).nullable().default(null) });
export const printerPaperOverride = z.object({ paperStatus: z.enum(['near_end', 'out']).nullable() });
export const einkArrangement = z.object({
  mode: z.enum(['birds', 'summary', 'schedule', 'todo', 'letters']),
  content: z.object({schedule: z.boolean(), todo: z.boolean(), letters: z.boolean()}),
});
