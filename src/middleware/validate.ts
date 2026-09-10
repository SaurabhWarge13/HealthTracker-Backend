import type { RequestHandler } from 'express';
import { z, type ZodType } from 'zod';

// On success `req.body` is replaced with the parsed result, so controllers and
// services only ever see stripped, coerced, validated data.
export function validate(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const first = result.error.issues[0];
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: first?.message ?? 'Invalid request body',
          fields: z.treeifyError(result.error),
        },
      });
      return;
    }

    req.body = result.data;
    next();
  };
}
