/**
 * One DELETE must remove at most one row: matching `id` and `clientId` in a
 * single query can hit two different rows and delete both.
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
  it('cannot delete two rows when one row id collides with another row clientId', async () => {
    // Row A has no clientId, exactly like the seeded rows.
    const a = await createCheckIn(userId, input({ weightKg: 50 }));
    // Row B carries A's id as its own clientId.
    const b = await createCheckIn(userId, input({ weightKg: 51, clientId: a.id }));

    expect(a.id).not.toBe(b.id);
    expect(await rowCount()).toBe(2);

    await deleteCheckIn(userId, a.id);

    // Exactly one row goes, and it is the one addressed by primary key.
    expect(await rowCount()).toBe(1);
    expect(await prisma.checkIn.findUnique({ where: { id: a.id } })).toBeNull();
    expect(await prisma.checkIn.findUnique({ where: { id: b.id } })).not.toBeNull();
  });

  it('prefers the server id over a clientId match', async () => {
    const a = await createCheckIn(userId, input({ weightKg: 50 }));
    const b = await createCheckIn(userId, input({ weightKg: 51, clientId: a.id }));

    await deleteCheckIn(userId, a.id);

    // Precedence is explicit rather than left to the database's row order.
    const survivor = await prisma.checkIn.findFirst({ where: { userId } });
    expect(survivor?.id).toBe(b.id);
  });

  it('still deletes by clientId when no row carries that primary key', async () => {
    // The offline case: the create landed but its response was lost, so the
    // client only knows its own id.
    await createCheckIn(userId, input({ clientId: 'local_orphan' }));

    await deleteCheckIn(userId, 'local_orphan');

    expect(await rowCount()).toBe(0);
  });

  it('deletes by server id', async () => {
    const row = await createCheckIn(userId, input({ clientId: 'local_1' }));
    await deleteCheckIn(userId, row.id);
    expect(await rowCount()).toBe(0);
  });

  it('throws NOT_FOUND when nothing matches, and leaves other rows alone', async () => {
    await createCheckIn(userId, input({ clientId: 'local_1' }));

    await expect(deleteCheckIn(userId, 'no-such-id')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(await rowCount()).toBe(1);
  });

  it('cannot reach another account\'s row', async () => {
    const mine = await createCheckIn(userId, input({ clientId: 'local_1' }));
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
