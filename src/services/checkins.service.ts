import type { CheckIn } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { notFound } from '../middleware/errorHandler';
import type { CheckInInput, Sources } from '../schemas/checkin.schema';

interface CheckInResponse {
  id: string;
  // Echoed back so a client can recognise a row it created. Null for rows
  // written by a client that sent no id.
  clientId: string | null;
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
    clientId: row.clientId,
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
 * Upserting on (userId, clientId) makes offline retries safe: a client that
 * never saw the response retries the same request, and it lands on the same
 * row instead of creating a duplicate. The constraint is scoped by userId, so
 * two accounts can never collide.
 */
export async function createCheckIn(userId: string, input: CheckInInput): Promise<CheckInResponse> {
  const { clientId } = input;

  if (clientId === undefined) {
    return toApi(await prisma.checkIn.create({ data: { userId, ...toRow(input) } }));
  }

  const row = await prisma.checkIn.upsert({
    where: { userId_clientId: { userId, clientId } },
    create: { userId, clientId, ...toRow(input) },
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

/**
 * Accepts either the server's id or the client's own clientId, because a
 * check-in created offline can reach a state where the client never learned
 * the server id it was given.
 */
export async function deleteCheckIn(userId: string, id: string): Promise<void> {
  // Resolved to one row first: matching both columns at once can hit two
  // different rows (one whose id is X, another whose clientId is X) and delete
  // both. Server id wins, both lookups are userId-scoped, and the delete goes
  // by primary key, so at most one row can ever go.
  const row =
    (await prisma.checkIn.findFirst({ where: { userId, id } })) ??
    (await prisma.checkIn.findFirst({ where: { userId, clientId: id } }));

  if (!row) throw notFound();

  await prisma.checkIn.delete({ where: { id: row.id } });
}
