-- Collapses `clientId` into `id`. The client generates a check-in's id when it
-- is created — possibly offline — and that id is now the primary key, so there
-- is one identity instead of two and no local->server mapping to maintain.
--
-- SQLite cannot drop a column or alter a primary key in place, so this is the
-- standard rebuild: create, copy, drop, rename.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "weightKg" REAL NOT NULL,
    "heightCm" REAL,
    "sleepMinutes" INTEGER,
    "steps" INTEGER,
    "waterMl" INTEGER,
    "mood" INTEGER,
    "notes" TEXT,
    "sourcesJson" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Existing rows adopt their clientId as the primary key where they have one,
-- so a client that already knows a row by its own id keeps addressing it the
-- same way. COALESCE covers seeded rows, which never had a clientId.
--
-- The previous unique index on (userId, clientId) guaranteed no two rows for
-- one user shared a clientId, and `id` was already unique, so this cannot
-- collide.
INSERT INTO "new_CheckIn" ("id", "userId", "weightKg", "heightCm", "sleepMinutes", "steps", "waterMl", "mood", "notes", "sourcesJson", "recordedAt", "createdAt", "updatedAt")
SELECT COALESCE("clientId", "id"), "userId", "weightKg", "heightCm", "sleepMinutes", "steps", "waterMl", "mood", "notes", "sourcesJson", "recordedAt", "createdAt", "updatedAt"
FROM "CheckIn";

DROP TABLE "CheckIn";
ALTER TABLE "new_CheckIn" RENAME TO "CheckIn";

-- Not redundant with the primary key: it gives `upsert` a userId-scoped target,
-- so a create can never reach a row belonging to another account.
CREATE UNIQUE INDEX "CheckIn_userId_id_key" ON "CheckIn"("userId", "id");
CREATE INDEX "CheckIn_userId_recordedAt_idx" ON "CheckIn"("userId", "recordedAt");

PRAGMA foreign_keys=ON;
