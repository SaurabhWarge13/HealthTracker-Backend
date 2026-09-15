import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';

// Every error response uses one shape:
//   { error: { code: string; message: string; fields?: unknown } }
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = () => new AppError(404, 'NOT_FOUND', 'Resource not found');

// 404 fallthrough for unmatched routes, in the same error shape.
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields !== undefined ? { fields: err.fields } : {}),
      },
    });
    return;
  }

  // Prisma "record not found" (e.g. an update/delete that matched nothing).
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    return;
  }

  // Unique constraint violation. Reachable on a normal request now that clients
  // supply their own ids: a create for an id another account already owns lands
  // here. It must not be a 500 — the app treats 5xx as transient and would retry
  // a request that can never succeed.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'Resource already exists' } });
    return;
  }

  // Malformed JSON body — express.json() throws a SyntaxError with `status`.
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' } });
    return;
  }

  console.error('[unhandled]', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};
