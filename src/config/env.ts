import 'dotenv/config';
import { z } from 'zod';

// Validated at import time, so a missing or malformed variable crashes on boot
// rather than surfacing as a confusing 500 on the first request that needs it.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),

  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_ACCESS_EXPIRY: z.string().min(1).default('15m'),
  JWT_REFRESH_EXPIRY: z.string().min(1).default('30d'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = parsed.data;
