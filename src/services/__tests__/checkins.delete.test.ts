/**
 * DELETE is scoped by userId and addresses exactly one row by primary key.
 *
 * This file used to guard against a subtler hazard: when a check-in had both an
 * `id` and a `clientId`, one DELETE could match two different rows and remove
 * both. Ids are now client-generated and there is only one identity, so that
 * case cannot arise and its tests are gone.
 *
 * Runs against the real SQLite file on a throwaway user and cleans up after
 * itself, so it can be re-run without leaving residue.
 */
import { prisma } from '../../lib/prisma';
import { createCheckIn, deleteCheckIn } from '../checkins.service';
import type { CheckInInput } from '../../schemas/checkin.schema';

const input = (over: Partial<CheckInInput> = {}): CheckInInput => ({
  weightKg: 70,
  sources: {
    weight: 'manual',
    height: 'manual',
    sleep: 'manual',
    steps: 'manual',
    water: 'manual',
  },
  recordedAt: '2026-09-01T08:00:00.000Z',
  ...over,
});

let userId: string;

// Ids are client-chosen now, so a literal like 'ck_1' would collide with the
// same literal in another suite — Jest runs them in parallel against one SQLite
// file. Namespacing by the throwaway user keeps each run's ids to itself.
const ck = (name: string) => `${userId}_${name}`;

beforeEach(async () => {
  const user = await prisma.user.create({
    data: {
      email: `delete-regression-${Date.now()}-${Math.random()}@test.local`,
      passwordHash: 'x',
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await prisma.checkIn.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const rowCount = () => prisma.checkIn.count({ where: { userId } });

describe('deleteCheckIn', () => {
  it('deletes the row the client names by its own id', async () => {
    const row = await createCheckIn(userId, input({ id: ck('1') }));
    expect(row.id).toBe(ck('1'));

    await deleteCheckIn(userId, ck('1'));

    expect(await rowCount()).toBe(0);
  });

  it('removes only the row addressed, never its neighbours', async () => {
    await createCheckIn(userId, input({ id: ck('1'), weightKg: 50 }));
    await createCheckIn(userId, input({ id: ck('2'), weightKg: 51 }));

    await deleteCheckIn(userId, ck('1'));

    expect(await rowCount()).toBe(1);
    expect(await prisma.checkIn.findUnique({ where: { id: ck('1') } })).toBeNull();
    expect(await prisma.checkIn.findUnique({ where: { id: ck('2') } })).not.toBeNull();
  });

  it('deletes a row whose id the server assigned', async () => {
    const row = await createCheckIn(userId, input());
    await deleteCheckIn(userId, row.id);
    expect(await rowCount()).toBe(0);
  });

  it('throws NOT_FOUND when nothing matches, and leaves other rows alone', async () => {
    await createCheckIn(userId, input({ id: ck('1') }));

    await expect(deleteCheckIn(userId, 'no-such-id')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(await rowCount()).toBe(1);
  });

  it("cannot reach another account's row", async () => {
    const mine = await createCheckIn(userId, input({ id: ck('1') }));
    const other = await prisma.user.create({
      data: { email: `other-${Date.now()}@test.local`, passwordHash: 'x' },
    });

    await expect(deleteCheckIn(other.id, mine.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(await rowCount()).toBe(1);

    await prisma.user.delete({ where: { id: other.id } });
  });
});
