import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';

// Demo switches for exercising the app's loading and error states.
// Process-wide, never persisted, reset on restart.
let latencyMs = 0;
let failNext = false;

// Delays every non-/dev request.
export const latencyMiddleware: RequestHandler = (_req, _res, next) => {
  if (latencyMs <= 0) {
    next();
    return;
  }
  setTimeout(() => next(), latencyMs);
};

// Consumes the one-shot failure flag. Runs after latencyMiddleware, so an
// armed failure still respects the configured delay.
export const failNextMiddleware: RequestHandler = (_req, res, next) => {
  if (!failNext) {
    next();
    return;
  }
  failNext = false;
  res.status(500).json({
    error: { code: 'SIMULATED_FAILURE', message: 'Simulated failure for demo' },
  });
};

const latencySchema = z.object({
  ms: z.number().int().min(0).max(60_000),
});

export const devRouter = Router();

devRouter.post('/latency', validate(latencySchema), (req, res) => {
  latencyMs = req.body.ms;
  res.status(200).json({ ok: true, latencyMs });
});

devRouter.post('/fail-next', (_req, res) => {
  failNext = true;
  res.status(200).json({ ok: true });
});
