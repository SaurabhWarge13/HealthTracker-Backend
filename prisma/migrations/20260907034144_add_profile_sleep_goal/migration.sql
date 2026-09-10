-- A daily sleep goal, in MINUTES so it matches `sleepMinutes` on a check-in
-- and neither side has to convert. Nullable: like every other goal, absent
-- means the ring shows the count with no denominator rather than judging
-- against a number nobody chose.
ALTER TABLE "Profile" ADD COLUMN "sleepGoal" INTEGER;
