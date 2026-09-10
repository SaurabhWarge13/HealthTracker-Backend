-- The app's own id for a check-in, stable from the moment it was created
-- offline. Makes POST /checkins idempotent: a request the client retried
-- because the response was lost upserts the same row instead of duplicating it.
ALTER TABLE "CheckIn" ADD COLUMN "clientId" TEXT;

-- Backfill: rows that predate this column are addressable under their own id,
-- so an old check-in can still be matched by a client that learned its id from
-- GET /checkins. Also guarantees the unique index below cannot fail on
-- duplicates, since "id" is already unique.
UPDATE "CheckIn" SET "clientId" = "id" WHERE "clientId" IS NULL;

-- The constraint the upsert targets. NULLs are distinct in SQLite, so any
-- future row written by an older client without a clientId is unaffected.
CREATE UNIQUE INDEX "CheckIn_userId_clientId_key" ON "CheckIn"("userId", "clientId");
