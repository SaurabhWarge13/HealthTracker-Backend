/**
 * Signup must not create an account. The whole point of the OTP step is that no
 * `User` row exists between `signup()` and a successful `verifyOtp()` — if
 * signup still wrote a row, an unverified address would own a live account.
 *
 * Also pins the replay behaviour: verifying twice must give NO_PENDING_SIGNUP
 * rather than EMAIL_TAKEN or a unique-constraint 500.
 *
 * Runs against the real SQLite file on throwaway emails and cleans up after
 * itself, so it can be re-run without leaving residue.
 */
import { prisma } from '../../lib/prisma';
import { signup, verifyOtp } from '../auth.service';

const CODE = '1234';

const freshEmail = () => `otp-${Date.now()}-${Math.random()}@test.local`;

// Every address this file touches, so cleanup covers the cases where no row was
// ever created as well as the ones where verify succeeded.
let emails: string[] = [];

const emailFor = (): string => {
  const email = freshEmail();
  emails.push(email);
  return email;
};

const userCount = (email: string) => prisma.user.count({ where: { email } });

afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  emails = [];
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('signup', () => {
  it('creates no user row and returns no tokens', async () => {
    const email = emailFor();

    const result = await signup({ email, password: 'password123' });

    expect(result).toEqual({ email });
    expect(await userCount(email)).toBe(0);
  });

  it('still rejects an address that already has an account', async () => {
    const email = emailFor();
    await prisma.user.create({ data: { email, passwordHash: 'x' } });

    await expect(signup({ email, password: 'password123' })).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
    });
  });

  it('supersedes an earlier pending attempt rather than duplicating it', async () => {
    const email = emailFor();

    await signup({ email, password: 'password123' });
    await signup({ email, password: 'different456' });

    await verifyOtp({ email, code: CODE });

    // One signup, one account — the second attempt overwrote the first.
    expect(await userCount(email)).toBe(1);
  });
});

describe('verifyOtp', () => {
  it('rejects a wrong code', async () => {
    const email = emailFor();
    await signup({ email, password: 'password123' });

    await expect(verifyOtp({ email, code: '9999' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_OTP',
    });

    // The pending entry survives, so the user can try again.
    expect(await userCount(email)).toBe(0);
  });

  it('rejects a wrong code before it looks up the pending signup', async () => {
    // No signup at all for this address. A wrong code must not reveal that by
    // answering NO_PENDING_SIGNUP instead of INVALID_OTP.
    await expect(verifyOtp({ email: emailFor(), code: '9999' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_OTP',
    });
  });

  it('rejects the right code when no signup is pending', async () => {
    await expect(verifyOtp({ email: emailFor(), code: CODE })).rejects.toMatchObject({
      status: 400,
      code: 'NO_PENDING_SIGNUP',
    });
  });

  it('creates exactly one user and returns a token pair', async () => {
    const email = emailFor();
    await signup({ email, password: 'password123' });

    const result = await verifyOtp({ email, code: CODE });

    expect(await userCount(email)).toBe(1);
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user.email).toBe(email);

    // The row is the one that was just returned, and it carries a usable hash.
    const row = await prisma.user.findUnique({ where: { email } });
    expect(row?.id).toBe(result.user.id);
    expect(row?.passwordHash).not.toBe('password123');
  });

  it('gives NO_PENDING_SIGNUP on a replay, not EMAIL_TAKEN and not a 500', async () => {
    const email = emailFor();
    await signup({ email, password: 'password123' });
    await verifyOtp({ email, code: CODE });

    // The pending entry is deleted on success, so the second call fails the
    // pending lookup before it ever reaches the email check.
    await expect(verifyOtp({ email, code: CODE })).rejects.toMatchObject({
      status: 400,
      code: 'NO_PENDING_SIGNUP',
    });

    expect(await userCount(email)).toBe(1);
  });

  it('refuses to create a second row if one appears while a signup is pending', async () => {
    const email = emailFor();
    await signup({ email, password: 'password123' });

    // The defensive branch: something else claimed the address mid-flight.
    await prisma.user.create({ data: { email, passwordHash: 'x' } });

    await expect(verifyOtp({ email, code: CODE })).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
    });

    expect(await userCount(email)).toBe(1);
  });
});
