import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../utils/jwt';

// Gate for every protected route. `req.userId` is the only trusted source of
// identity downstream — services must never take a userId from body or params.
export const verifyToken: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Authorization header missing' } });
    return;
  }

  const payload = verifyAccessToken(header.slice('Bearer '.length).trim());

  if (!payload) {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Token invalid or expired' } });
    return;
  }

  req.userId = payload.userId;
  next();
};
