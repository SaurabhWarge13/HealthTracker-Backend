import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@healthtracker.app';
const DEMO_PASSWORD = 'password123';

type Source = 'manual' | 'health_connect';

interface SeedCheckIn {
  daysAgo: number;
  weightKg: number;
  sleepMinutes: number;
  steps: number;
  waterMl: number;
  mood: number;
  notes: string | null;
  sources: Record<'weight' | 'height' | 'sleep' | 'steps' | 'water', Source>;
}

const MANUAL_ALL: SeedCheckIn['sources'] = {
  weight: 'manual',
  height: 'manual',
  sleep: 'manual',
  steps: 'manual',
  water: 'manual',
};

const MOSTLY_SYNCED: SeedCheckIn['sources'] = {
  weight: 'manual',
  height: 'manual',
  sleep: 'health_connect',
  steps: 'health_connect',
  water: 'manual',
};

const FULLY_SYNCED: SeedCheckIn['sources'] = {
  weight: 'health_connect',
  height: 'manual',
  sleep: 'health_connect',
  steps: 'health_connect',
  water: 'health_connect',
};

// Three weeks of check-ins with a decreasing weight trend, varied mood, and a
// mix of sources per field so the source-chip UI has realistic data.
const CHECK_INS: SeedCheckIn[] = [
  { daysAgo: 20, weightKg: 76.5, sleepMinutes: 402, steps: 6480, waterMl: 1800, mood: 3, notes: 'Starting point. Sluggish week.', sources: MANUAL_ALL },
  { daysAgo: 17, weightKg: 76.1, sleepMinutes: 448, steps: 9120, waterMl: 2200, mood: 4, notes: 'Long walk after work.', sources: MOSTLY_SYNCED },
  { daysAgo: 14, weightKg: 75.4, sleepMinutes: 380, steps: 5240, waterMl: 1500, mood: 2, notes: 'Slept badly, skipped the gym.', sources: MOSTLY_SYNCED },
  { daysAgo: 11, weightKg: 74.8, sleepMinutes: 465, steps: 11340, waterMl: 2600, mood: 5, notes: 'Best day in a while.', sources: FULLY_SYNCED },
  { daysAgo: 7, weightKg: 74.0, sleepMinutes: 431, steps: 10260, waterMl: 2500, mood: 4, notes: null, sources: FULLY_SYNCED },
  { daysAgo: 4, weightKg: 73.2, sleepMinutes: 412, steps: 8730, waterMl: 2350, mood: 4, notes: 'Steady. Hydration on target.', sources: MOSTLY_SYNCED },
  { daysAgo: 1, weightKg: 72.0, sleepMinutes: 455, steps: 12480, waterMl: 2800, mood: 5, notes: 'Hit the step goal three days running.', sources: FULLY_SYNCED },
];

// 08:00 local time, so check-ins land at a plausible hour.
function daysAgoAt8am(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(8, 0, 0, 0);
  return date;
}

async function main() {
  // Idempotent: wipe and recreate the demo user's data so re-running the seed
  // never stacks up duplicate check-ins.
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    await prisma.checkIn.deleteMany({ where: { userId: existing.id } });
    await prisma.profile.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      profile: {
        create: {
          name: 'Demo User',
          baselineWeight: 76.5,
          height: 175,
          stepGoal: 10000,
          waterGoal: 2500,
          targetWeight: 70,
        },
      },
    },
  });

  await prisma.checkIn.createMany({
    data: CHECK_INS.map((entry) => ({
      userId: user.id,
      weightKg: entry.weightKg,
      heightCm: 175,
      sleepMinutes: entry.sleepMinutes,
      steps: entry.steps,
      waterMl: entry.waterMl,
      mood: entry.mood,
      notes: entry.notes,
      sourcesJson: JSON.stringify(entry.sources),
      recordedAt: daysAgoAt8am(entry.daysAgo),
    })),
  });

  console.log(`Seeded ${DEMO_EMAIL} / ${DEMO_PASSWORD} with ${CHECK_INS.length} check-ins.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
