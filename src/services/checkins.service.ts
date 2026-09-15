import type { CheckIn } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { notFound } from '../middleware/errorHandler';
import type { CheckInInput, Sources } from '../schemas/checkin.schema';

interface CheckInResponse {
  id: string;
  weightKg: number;
  heightCm: number | null;
  sleepMinutes: number | null;
  steps: number | null;
  waterMl: number | null;
  mood: number | null;
  notes: string | null;
  sources: Sources;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

// SQLite has no JSON column via Prisma, so `sources` is stored as a string and
// parsed back into an object here.
function toApi(row: CheckIn): CheckInResponse {
  return {
    id: row.id,
    weightKg: row.weightKg,
    heightCm: row.heightCm,
    sleepMinutes: row.sleepMinutes,
    steps: row.steps,
    waterMl: row.waterMl,
    mood: row.mood,
    notes: row.notes,
    sources: JSON.parse(row.sourcesJson) as Sources,
    recordedAt: row.recordedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Optional fields absent from the request become null (full replace).
function toRow(input: CheckInInput) {
  return {
    weightKg: input.weightKg,
    heightCm: input.heightCm ?? null,
    sleepMinutes: input.sleepMinutes ?? null,
    steps: input.steps ?? null,
    waterMl: input.waterMl ?? null,
    mood: input.mood ?? null,
    notes: input.notes ?? null,
    sourcesJson: JSON.stringify(input.sources),
    recordedAt: new Date(input.recordedAt),
  };
}

export async function listCheckIns(userId: string): Promise<CheckInResponse[]> {
  const rows = await prisma.checkIn.findMany({
    where: { userId },
    orderBy: { recordedAt: 'desc' },
  });
  return rows.map(toApi);
}

export async function getCheckIn(userId: string, id: string): Promise<CheckInResponse> {
  // Scoped by userId, so another user's check-in gets the same 404 as one that
  // does not exist — no existence leak.
  const row = await prisma.checkIn.findFirst({ where: { id, userId } });
  if (!row) throw notFound();
  return toApi(row);
}

/**
 * Upserting on the client's own id makes offline retries safe: a client that
 * never saw the response retries the same request, and it lands on the same
 * row instead of creating a duplicate.
 *
 * The target is (userId, id), not the bare primary key. A plain `where: { id }`
 * is not userId-scoped, so a client that guessed another account's id could
 * overwrite that row — the same hazard `updateCheckIn` avoids by using
 * updateMany. Only an id this user already owns can be updated here; anyone
 * else's collides on the primary key and surfaces as a 409.
 */
export async function createCheckIn(userId: string, input: CheckInInput): Promise<CheckInResponse> {
  const { id } = input;

  if (id === undefined) {
    return toApi(await prisma.checkIn.create({ data: { userId, ...toRow(input) } }));
  }

  const row = await prisma.checkIn.upsert({
    where: { userId_id: { userId, id } },
    create: { id, userId, ...toRow(input) },
    update: toRow(input),
  });
  return toApi(row);
}

export async function updateCheckIn(
  userId: string,
  id: string,
  input: CheckInInput,
): Promise<CheckInResponse> {
  // updateMany (not update) so the WHERE can include userId — a plain update
  // only accepts unique fields and would let one user overwrite another's row.
  const { count } = await prisma.checkIn.updateMany({
    where: { id, userId },
    data: toRow(input),
  });
  if (count === 0) throw notFound();

  const row = await prisma.checkIn.findFirst({ where: { id, userId } });
  if (!row) throw notFound();
  return toApi(row);
}

export async function deleteCheckIn(userId: string, id: string): Promise<void> {
  // deleteMany (not delete) so the WHERE can include userId — a plain delete
  // only accepts unique fields and would let one user remove another's row.
  const { count } = await prisma.checkIn.deleteMany({ where: { id, userId } });
  if (count === 0) throw notFound();
}
