import { z } from 'zod';

const sourceValue = z.enum(['manual', 'health_connect']);

// All five keys are required even when the matching value field is omitted —
// the API contract types `sources` as a fully populated record.
const sourcesSchema = z.object({
  weight: sourceValue,
  height: sourceValue,
  sleep: sourceValue,
  steps: sourceValue,
  water: sourceValue,
});

// Shared by POST and PUT: PUT is a full replace, so both take the identical
// body and any omitted optional field is written as null.
export const checkInSchema = z.object({
  // The client's own id, assigned when the check-in was created — possibly
  // offline. When present it makes POST an idempotent upsert.
  clientId: z.string().min(1).max(128).optional(),
  weightKg: z.number().positive('weightKg must be a positive number').max(500),
  heightCm: z.number().positive().max(300).optional(),
  sleepMinutes: z.number().int().min(0).max(1440).optional(),
  steps: z.number().int().min(0).max(200_000).optional(),
  waterMl: z.number().int().min(0).max(20_000).optional(),
  mood: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(2000).optional(),
  sources: sourcesSchema,
  recordedAt: z.iso.datetime({ offset: true, message: 'recordedAt must be an ISO 8601 datetime' }),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
export type Sources = z.infer<typeof sourcesSchema>;
