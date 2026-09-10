import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import type { LoginInput, SignupInput, VerifyOtpInput } from '../schemas/auth.schema';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { comparePassword, hashPassword } from '../utils/password';

/**
 * bcrypt truncates at 72 bytes, and every refresh token issued to a user
 * shares a longer identical prefix than that — so bcrypt alone would treat
 * them all as equal and a rotated token would never be invalidated. Condensing
 * to a fixed-length digest first keeps the whole token significant.
 */
const digest = (token: string): string => createHash('sha256').update(token).digest('hex');

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Signups awaiting their code. Process-wide, never persisted — a server restart
 * drops them and the user has to sign up again.
 */
const pendingSignups = new Map<string, { passwordHash: string }>();

/** This mock backend sends no mail, so the code is fixed and logged instead. */
const DEV_OTP_CODE = '1234';

/**
 * Stores only the hash of the refresh token, so a database leak hands out no
 * usable tokens. Overwriting on every issue makes this single-session-per-user
 * by design — real multi-device support would need a separate sessions table.
 */
async function issueTokens(userId: string): Promise<TokenPair> {
  const accessToken = signAccessToken(userId);
  const refreshToken = signRefreshToken(userId);

  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash: await hashPassword(digest(refreshToken)) },
  });

  return { accessToken, refreshToken };
}

/**
 * Holds the credentials until the code is verified — no `User` row exists until
 * then, so an account never goes live before someone proves they own the email.
 */
export async function signup({ email, password }: SignupInput): Promise<{ email: string }> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with that email already exists');
  }

  // Overwrites any earlier attempt for this address, so re-submitting signup is
  // safe and simply supersedes the previous pending record.
  pendingSignups.set(email, { passwordHash: await hashPassword(password) });

  console.log(`[otp] code for ${email}: ${DEV_OTP_CODE}`);
  return { email };
}

/** The only place a `User` is created. */
export async function verifyOtp({ email, code }: VerifyOtpInput): Promise<AuthResult> {
  // Checked before the pending lookup, so a wrong code reveals nothing about
  // which addresses have a signup in flight.
  if (code !== DEV_OTP_CODE) {
    throw new AppError(400, 'INVALID_OTP', "That code isn't right");
  }

  const pending = pendingSignups.get(email);
  if (!pending) {
    throw new AppError(400, 'NO_PENDING_SIGNUP', 'Start again from the signup screen');
  }

  // Defensive only: a replayed verify is already caught above, because the
  // pending entry is deleted on success. This covers the rare case where a row
  // for this address appeared while a signup was still pending, so the create
  // below cannot hit a unique-constraint 500.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    pendingSignups.delete(email);
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with that email already exists');
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: pending.passwordHash },
  });
  pendingSignups.delete(email);

  const tokens = await issueTokens(user.id);
  return { ...tokens, user: { id: user.id, email: user.email } };
}

export async function login({ email, password }: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Same error whether the email is unknown or the password is wrong — never
  // reveal which accounts exist.
  const invalid = new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  if (!user) throw invalid;
  if (!(await comparePassword(password, user.passwordHash))) throw invalid;

  const tokens = await issueTokens(user.id);
  return { ...tokens, user: { id: user.id, email: user.email } };
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  // Bad signature, expiry, deleted user, logged-out session and superseded
  // token are all indistinguishable to the caller.
  const invalid = new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token invalid or expired');

  const payload = verifyRefreshToken(refreshToken);
  if (!payload) throw invalid;

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user?.refreshTokenHash) throw invalid;

  const matches = await comparePassword(digest(refreshToken), user.refreshTokenHash);
  if (!matches) throw invalid;

  // Rotation: the presented token is now spent.
  return issueTokens(user.id);
}

export async function logout(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash: null },
  });
}
