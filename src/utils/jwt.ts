import { randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type TokenType = 'access' | 'refresh';

export interface TokenPayload {
  userId: string;
  type: TokenType;
}

// The random `jwtid` is what makes rotation work: `iat` has one-second
// resolution, so without it two tokens signed for the same user in the same
// second are byte-identical and a "rotated" token equals the one it replaced.
export function signAccessToken(userId: string): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRY as SignOptions['expiresIn'],
    jwtid: randomUUID(),
  };
  return jwt.sign({ userId, type: 'access' } satisfies TokenPayload, env.JWT_ACCESS_SECRET, options);
}

export function signRefreshToken(userId: string): string {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRY as SignOptions['expiresIn'],
    jwtid: randomUUID(),
  };
  return jwt.sign({ userId, type: 'refresh' } satisfies TokenPayload, env.JWT_REFRESH_SECRET, options);
}

/**
 * Checks signature, expiry and the `type` claim — the claim is what stops a
 * refresh token being replayed as an access token. Returns null on any
 * failure, so callers never leak why a token was rejected.
 */
function verify(token: string, secret: string, expectedType: TokenType): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded !== 'object' || decoded === null) return null;

    const { userId, type } = decoded as Partial<TokenPayload>;
    if (typeof userId !== 'string' || type !== expectedType) return null;

    return { userId, type };
  } catch {
    return null;
  }
}

export function verifyAccessToken(token: string): TokenPayload | null {
  return verify(token, env.JWT_ACCESS_SECRET, 'access');
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  return verify(token, env.JWT_REFRESH_SECRET, 'refresh');
}
