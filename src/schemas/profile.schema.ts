import { z } from 'zod';

// Upsert with full-replace semantics: an omitted optional field is written as
// null, not left at its previous value. The app always submits the whole form.
export const upsertProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  baselineWeight: z.number().positive('baselineWeight must be a positive number').max(500),
  height: z.number().positive().max(300).optional(),
  stepGoal: z.number().int().positive().max(100_000).optional(),
  waterGoal: z.number().int().positive().max(20_000).optional(),
  // Minutes, matching `sleepMinutes` on a check-in so neither side converts.
  sleepGoal: z.number().int().positive().max(1440).optional(),
  targetWeight: z.number().positive().max(500).optional(),
});

export type UpsertProfileInput = z.infer<typeof upsertProfileSchema>;
