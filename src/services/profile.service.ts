import type { Profile } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { notFound } from '../middleware/errorHandler';
import type { UpsertProfileInput } from '../schemas/profile.schema';

interface ProfileResponse {
  name: string | null;
  baselineWeight: number;
  height: number | null;
  stepGoal: number | null;
  waterGoal: number | null;
  // Minutes, matching `sleepMinutes` on a check-in.
  sleepGoal: number | null;
  targetWeight: number | null;
  updatedAt: string;
}

function toApi(profile: Profile): ProfileResponse {
  return {
    name: profile.name,
    baselineWeight: profile.baselineWeight,
    height: profile.height,
    stepGoal: profile.stepGoal,
    waterGoal: profile.waterGoal,
    sleepGoal: profile.sleepGoal,
    targetWeight: profile.targetWeight,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

// The 404 is load-bearing: it is how the app distinguishes "needs onboarding"
// from "has a profile". Never soften it to an empty object or defaults.
export async function getProfile(userId: string): Promise<ProfileResponse> {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) throw notFound();
  return toApi(profile);
}

export async function upsertProfile(
  userId: string,
  input: UpsertProfileInput,
): Promise<ProfileResponse> {
  // Full replace: optional fields absent from the request are nulled.
  const data = {
    name: input.name ?? null,
    baselineWeight: input.baselineWeight,
    height: input.height ?? null,
    stepGoal: input.stepGoal ?? null,
    waterGoal: input.waterGoal ?? null,
    sleepGoal: input.sleepGoal ?? null,
    targetWeight: input.targetWeight ?? null,
  };

  const profile = await prisma.profile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  return toApi(profile);
}
