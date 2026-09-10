# HealthTracker Backend

Express + TypeScript REST API for the HealthTracker React Native app. It serves the three
things the app needs from a network — **auth**, **profile/settings**, and **check-in CRUD** —
over a real relational schema (SQLite via Prisma), because the data genuinely is relational:
`User → Profile`, `User → CheckIn[]`.

It is a mock backend in the sense that email delivery is stubbed and the demo data is seeded,
but everything else is real: Zod-validated requests, bcrypt-hashed passwords, rotating JWT
pairs, and per-user authorization on every query. The dashboard is computed client-side, and
Health Connect data never leaves the device.

The React Native client is a separate sibling repository (`../HealthTracker`); this README
covers the API only.

**Stack:** Node 22 · TypeScript (strict) · Express 4 · Prisma 6 + SQLite · Zod 4 · JWT (HS256)
· bcrypt · Jest

```text
React Native App
       ↓
    HTTP API
       ↓
    Express          cors → json → /health → /dev → latency/fail-next
       ↓                   → /auth → verifyToken → /profile, /checkins
     Routes          path + method only, one line per endpoint
       ↓
  Controllers        parse request, call one service, shape response
       ↓
   Services          all business logic; never sees req/res
       ↓
     Prisma
       ↓
     SQLite
```

---

## Setup

```bash
npm install
npm run dev
```

That's it. `npm install` runs a `postinstall` hook that generates the Prisma client, applies
migrations (creating `prisma/dev.db`), and seeds the demo user — so a clean clone serves
requests immediately.

To run those steps by hand instead:

```bash
npx prisma generate
npx prisma migrate deploy   # or: npm run prisma:migrate  (for a new dev migration)
npm run seed
```

Copy `.env.example` to `.env` if you want to change the port or JWT secrets.

### Demo login

```
email:    demo@healthtracker.app
password: password123
```

Seeded with a profile and 7 check-ins over the last three weeks (weight trending
76.5 → 72.0 kg, varied mood, a mix of `manual` and `health_connect` sources per field).
Re-seeding is idempotent: it wipes the demo user's rows and recreates them, with
`recordedAt` recomputed relative to seed time.

### Scripts

| Script | Does |
|---|---|
| `npm run dev` | Hot-reloading dev server on `:3000` |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm test` | Jest service-layer suite |
| `npm run seed` | Re-seed the demo user |
| `npm run prisma:migrate` | Create + apply a new migration |
| `npm run prisma:studio` | Browse the database in Prisma Studio |

### Environment

Validated by Zod in `src/config/env.ts` at **import time** — a bad or missing value throws
before a port is ever bound, so the process fails loudly at boot rather than at first request.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | Coerced to an integer |
| `JWT_ACCESS_SECRET` | — | **Required.** No default |
| `JWT_REFRESH_SECRET` | — | **Required.** Separate key from the access secret (not enforced, but use a different value) |
| `JWT_ACCESS_EXPIRY` | `15m` | |
| `JWT_REFRESH_EXPIRY` | `30d` | |
| `BCRYPT_SALT_ROUNDS` | `10` | Clamped to 4–15 |

There is deliberately **no `DATABASE_URL`** — `prisma/schema.prisma` hardcodes
`file:./dev.db`, which Prisma resolves relative to `prisma/` regardless of working directory.
`NODE_ENV` is not part of the schema either; it is read in exactly one place
(`src/lib/prisma.ts`, to cache the client across hot reloads outside production).

---

## Connecting from the app

On boot the server prints every address it can be reached at:

```
Server running:
  http://localhost:3000
  http://192.168.7.4:3000   <- use this address in the app's Server URL field

  Android emulator: http://10.0.2.2:3000
```

The server binds to `0.0.0.0`, so it is reachable from other devices on the network.

| Running the app on | Server URL |
|---|---|
| iOS simulator / same machine | `http://localhost:3000` |
| Android emulator | `http://10.0.2.2:3000` (the emulator's alias for the host's localhost) |
| Physical phone | the LAN IP printed above — phone must be on the same Wi-Fi |

The LAN IP changes when you rejoin a network, so read it from the boot output rather than
hardcoding it. CORS is wide open: the client is a mobile app, not a browser, so there is no
origin to protect against here.

---

## API

12 endpoints across auth, profile and check-ins, plus 2 dev toggles and 1 health probe.
Import [`postman_collection.json`](./postman_collection.json) to exercise all of them — every
request has tests attached, so **Run collection** works as a smoke suite.

| | |
|---|---|
| **Base path** | none — routers mount at bare `/auth`, `/profile`, `/checkins`, `/dev`. There is no `/api/v1` prefix |
| **Auth header** | `Authorization: Bearer <accessToken>` on protected routes |
| **Content-Type** | `application/json` on every request with a body |
| **Timestamps** | ISO 8601 strings, UTC in responses |
| **Query params** | none, on any endpoint |
| **Pagination** | none — the dataset is small by design |
| **Token lifetimes** | access 15 minutes, refresh 30 days |

`GET /health` → `200 {"ok": true}`. No token, and exempt from the `/dev` toggles below.

### Auth — `/auth` (no token required)

| Endpoint | Body | Success | Errors |
|---|---|---|---|
| `POST /auth/signup` | `{ email, password }` | `201 { email }` | `400 VALIDATION_ERROR` · `409 EMAIL_TAKEN` |
| `POST /auth/verify-otp` | `{ email, code }` | `201 { accessToken, refreshToken, user }` | `400 VALIDATION_ERROR` · `400 INVALID_OTP` · `400 NO_PENDING_SIGNUP` · `409 EMAIL_TAKEN` |
| `POST /auth/login` | `{ email, password }` | `200 { accessToken, refreshToken, user }` | `400 VALIDATION_ERROR` · `401 INVALID_CREDENTIALS` |
| `POST /auth/refresh` | `{ refreshToken }` | `200 { accessToken, refreshToken }` | `401 INVALID_REFRESH_TOKEN` |
| `POST /auth/logout` | `{}` (needs access token) | `204` | `401 NO_TOKEN` / `INVALID_TOKEN` |

Emails are trimmed and lowercased; signup passwords need 8+ characters; the code must match
`/^\d{4}$/`.

**Signup is two steps, and there is no separate "request OTP" endpoint.**
`POST /auth/signup` creates nothing — it holds the password hash in an in-memory `Map` and
returns the email. `POST /auth/verify-otp` is the only endpoint that creates a `User`. The
code is always **`1234`**, logged to the server console, so a restart drops pending signups
and the user has to sign up again. Re-running signup for the same email supersedes the
earlier attempt.

One ordering detail is deliberate: the code is checked *before* the pending-signup lookup, so
a wrong code cannot be used to enumerate which emails have a signup in flight.

### Profile — `/profile` (token required)

| Endpoint | Success | Errors |
|---|---|---|
| `GET /profile` | `200 { name, baselineWeight, height, stepGoal, waterGoal, sleepGoal, targetWeight, updatedAt }` | `404 NOT_FOUND` |
| `PUT /profile` | `200 <same shape>` | `400 VALIDATION_ERROR` |

`GET /profile` returning **404 is meaningful**: it is how the app distinguishes "needs
onboarding" from "has a profile". It never returns an empty object or defaults instead.

`PUT` is an upsert with **full-replace** semantics — an omitted optional field is written as
`null`, not left at its previous value. Only `baselineWeight` is required.

### Check-ins — `/checkins` (token required)

| Endpoint | Success | Errors |
|---|---|---|
| `GET /checkins` | `200 CheckIn[]` — newest first, by `recordedAt` | |
| `GET /checkins/:id` | `200 CheckIn` | `404 NOT_FOUND` |
| `POST /checkins` | `201 CheckIn` | `400 VALIDATION_ERROR` |
| `PUT /checkins/:id` | `200 CheckIn` (full replace) | `400 VALIDATION_ERROR` · `404 NOT_FOUND` |
| `DELETE /checkins/:id` | `204` — `:id` may be the server `id` **or** the `clientId` | `404 NOT_FOUND` |

Request body for `POST` / `PUT`:

```jsonc
{
  "clientId": "local_1725523452881",  // optional
  "weightKg": 72.0,
  "heightCm": 175,          // optional
  "sleepMinutes": 455,      // optional
  "steps": 12480,           // optional
  "waterMl": 2800,          // optional
  "mood": 5,                // optional
  "notes": "Felt great",    // optional
  "sources": {              // all five keys required
    "weight": "manual",
    "height": "manual",
    "sleep": "health_connect",
    "steps": "health_connect",
    "water": "manual"
  },
  "recordedAt": "2026-09-05T08:00:00.000Z"
}
```

Responses echo every field back, adding `id`, `createdAt` and `updatedAt`; unsent optional
fields come back as `null`. `sources` is always a parsed object, never a string.

### Validation rules

Enforced by Zod (`src/schemas/`), which validates the **body only** and replaces `req.body`
with the parsed result, so services never see unchecked input.

| Field | Rule | | Field | Rule |
|---|---|---|---|---|
| `weightKg` | **required**, > 0, ≤ 500 | | `baselineWeight` | **required**, > 0, ≤ 500 |
| `heightCm` | > 0, ≤ 300 | | `height` | > 0, ≤ 300 |
| `sleepMinutes` | int 0–1440 | | `sleepGoal` | int > 0, ≤ 1440 (minutes) |
| `steps` | int 0–200000 | | `stepGoal` | int > 0, ≤ 100000 |
| `waterMl` | int 0–20000 | | `waterGoal` | int > 0, ≤ 20000 |
| `mood` | int 1–5 | | `targetWeight` | > 0, ≤ 500 |
| `notes` | ≤ 2000 chars | | `name` | trimmed, 1–100 chars |
| `clientId` | 1–128 chars | | | |
| `recordedAt` | **required**, ISO 8601 **with offset** | | | |
| `sources` | **required**, all five keys, each `manual` \| `health_connect` | | | |

`sleepGoal` and `sleepMinutes` are both in **minutes**, so they compare directly.

### Dev toggles — `/dev` (no token required)

For demoing the app's loading and error states.

| Endpoint | Body | Effect |
|---|---|---|
| `POST /dev/latency` | `{ ms }` (0–60000) | Every later non-`/dev` request sleeps `ms` before responding. `{ "ms": 0 }` turns it off |
| `POST /dev/fail-next` | `{}` | The **next** non-`/dev` request returns `500 SIMULATED_FAILURE`, then behaviour resets |

`/dev` and `/health` are registered before both middlewares, so you can always switch latency
back off without waiting out the delay you just set. State is in-memory and resets on restart.
See [Known limitations](#known-limitations) — these routes are not gated by environment.

### Errors

Every error response, everywhere, uses one shape:

```ts
{ error: { code: string; message: string; fields?: unknown } }
```

`fields` appears only on `VALIDATION_ERROR` and holds the full Zod issue tree, so the client
can map messages onto individual form inputs; `message` is the first issue's message.

| Code | Status | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Body failed validation, or malformed JSON |
| `INVALID_OTP` | 400 | Verify: the 4-digit code is wrong |
| `NO_PENDING_SIGNUP` | 400 | Verify: no signup is awaiting a code for that email |
| `NO_TOKEN` | 401 | `Authorization` header missing or not `Bearer …` |
| `INVALID_TOKEN` | 401 | Access token bad, expired, or wrong `type` claim |
| `INVALID_CREDENTIALS` | 401 | Login: unknown email **or** wrong password |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token bad, expired, rotated, or logged out |
| `NOT_FOUND` | 404 | Missing record, another user's record, or unknown route |
| `EMAIL_TAKEN` | 409 | Signup with an email that already exists |
| `SIMULATED_FAILURE` | 500 | `/dev/fail-next` was armed |
| `INTERNAL_ERROR` | 500 | Uncaught server error |

---

## Data model

```
User ─1:1─ Profile
  └─1:N─ CheckIn
```

| Model | Key fields |
|---|---|
| `User` | `id`, `email` (unique), `passwordHash`, `refreshTokenHash?`, `createdAt` |
| `Profile` | `userId` (unique), `baselineWeight` (required), `name?`, `height?`, `stepGoal?`, `waterGoal?`, `sleepGoal?`, `targetWeight?`, `updatedAt` |
| `CheckIn` | `id`, `clientId?`, `userId`, `weightKg` (required), optional metrics, `sourcesJson`, `recordedAt`, timestamps |

`CheckIn` carries `@@unique([userId, clientId])` and `@@index([userId, recordedAt])` — the
first makes writes idempotent per user, the second serves the only read pattern there is
(one user's check-ins, newest first). Foreign keys are `ON DELETE RESTRICT`, so there are no
cascading deletes; the seed removes children explicitly.

`sources` is stored as a JSON string (`sourcesJson`) because SQLite has no native JSON column
via Prisma, but it is parsed on the way out and stringified on the way in — the API only ever
speaks objects.

Three migrations: `init`, `add_checkin_client_id` (which backfills `clientId = id` before
adding the unique index), and `add_profile_sleep_goal`.

---

## Notes on the implementation

**Layering.** `routes → controllers → services`. Controllers parse the request, call one
service method, and shape the response — all business logic and every Prisma call lives in
the service layer, which never sees `req`/`res`.

**Ownership.** Every service method takes `userId` as its first argument, sourced only from
`req.userId` (set by `verifyToken`) — never from the body or params. Check-in reads use
`findFirst` and updates use `updateMany`, both scoped by `id` **and** `userId`; `DELETE`
resolves exactly one row with a `userId`-scoped `findFirst` and then deletes it by primary
key. Another user's check-in returns the same `404` as one that doesn't exist. No existence
leak, and no 403 that would confirm the row is real.

**Idempotent writes.** Sending a `clientId` makes `POST /checkins` an upsert on
`(userId, clientId)`, so a request the app retried because the response was lost updates the
same row instead of creating a duplicate. It also lets `DELETE` address a row the client only
knows by its own id — the offline case.

**Token rotation.** Every successful `/auth/refresh` issues a new access + refresh pair and
overwrites the stored refresh hash, so the presented token is immediately spent. This makes
the backend **single-session-per-user**: signing in elsewhere invalidates the previous
session. That is an intentional simplification, not an oversight — real multi-device support
would need a separate sessions table. Two details make the rotation actually work:

- Refresh tokens carry a random `jti`. Without it, two tokens signed for the same user in the
  same second are byte-identical (`iat` has one-second resolution) and a "rotated" token
  would equal the one it replaced.
- The token is SHA-256 digested before being bcrypt-hashed. bcrypt silently truncates at 72
  bytes, and all of a user's JWTs share a longer identical prefix than that — so bcrypt alone
  would consider every one of their refresh tokens equal.

Tokens also carry a `type` claim that verification checks, which is what stops a refresh
token being replayed as an access token. Logout clears `refreshTokenHash`; access tokens stay
valid until they expire, since there is no blocklist.

**Email verification is a dev stub.** The OTP step is real in that no account exists until a
code is verified, but the code is hardcoded, with no expiry, no attempt limit and no mail
transport. `DEV_OTP_CODE` and `pendingSignups` in `src/services/auth.service.ts` are the two
seams where a real generator, an expiry, an attempt counter and a mail transport would slot
in. There is no `isVerified` column: an unverified signup simply has no row.

---

## Testing

```bash
npm test
```

Jest + ts-jest against `src` directly, with a 20s timeout because the tests touch real SQLite.
**2 suites, 15 tests, currently all passing (~1.8s).**

| Suite | Pins down |
|---|---|
| `auth.otp.test.ts` | Signup creates no `User` row and issues no tokens; wrong code is checked before the pending lookup; a verified code creates exactly one user; a replayed code gives `NO_PENDING_SIGNUP`, not a 500 |
| `checkins.delete.test.ts` | One DELETE removes at most one row when an `id` and a `clientId` collide; server-`id` takes precedence; cross-user delete returns 404 |

Both target the invariants that would be quietly destructive if broken — account creation and
row deletion — rather than aiming at coverage.

Being honest about the scope: this is **service-layer only**. There is no supertest, so no
HTTP, routing, middleware or validation-schema tests, and nothing covering profile, `/dev` or
token refresh. The tests also run against the real `prisma/dev.db` rather than a separate test
database; they self-isolate with randomized throwaway emails and clean up in `afterEach`.
There is no CI configuration.

---

## Deployment

`render.yaml` is a Render blueprint for the service. Nothing in `src/` exists to support
deployment — `src/index.ts` already binds `0.0.0.0` on `env.PORT`, so Render's injected port
is picked up unchanged.

| | |
|---|---|
| Plan / runtime | `free`, `node`, branch `main` |
| Health check | `/health` |
| Build | `npm install --include=dev && npm run build` |
| Start | `npx prisma migrate deploy && npx prisma db seed && npm start` |
| Secrets | Both JWT secrets use `generateValue: true` — Render mints them, nothing enters the repo |

Two choices worth explaining:

- `--include=dev` on the build, because Render's default `npm install` can omit TypeScript and
  the Prisma CLI depending on how it sets `NODE_ENV`, leaving no `dist/` for `npm start`.
- Migrate and seed run at **start**, not build. The free tier has no persistent disk, so a
  database created at build time would not survive to the first request.

`PORT` and `DATABASE_URL` are deliberately left unset — Render injects the former, and the
latter is hardcoded in the schema.

**There is no deployed instance yet.** The repository currently has no commits and no git
remote, so `branch: main` has nothing to deploy from.

---

## SQLite trade-offs

SQLite was chosen because the data is genuinely relational and it needs no server, container
or cloud dependency — a clean clone is serving requests after one `npm install`. Prisma keeps
the door open to Postgres later. What it costs:

- **One writer at a time.** Fine for a single-user demo app, wrong for concurrent traffic.
- **No native JSON column** through Prisma, hence the `sourcesJson` string and the
  parse/stringify at the service boundary.
- **The path is hardcoded**, not `env("DATABASE_URL")`. Switching to Postgres means editing
  the datasource and resetting migrations, not flipping an environment variable.
- **On Render's free tier the database is ephemeral.** With no persistent disk, the filesystem
  is discarded on every deploy, restart and spin-down, and the start command recreates the
  database from migrations plus the seed. Anything a user creates against the hosted instance
  is gone on the next restart. Real persistence means adding a disk, or moving to Postgres.

---

## Known limitations

Deliberate omissions: no password reset, no multi-device sessions, no rate limiting, no
pagination, no roles, no file uploads.

Things worth knowing before pointing anything real at this:

- **`/dev` toggles are unauthenticated and not environment-gated.** They are mounted in the
  same app that `render.yaml` deploys, so anyone who can reach a deployed instance can add up
  to 60 seconds of latency to every request or arm a 500.
- **The OTP is hardcoded `1234` everywhere**, including production, and is logged in
  plaintext. With no attempt limit and no rate limiting, a 4-digit code is 10,000 guesses. The
  seeded demo credentials are live in production too.
- **No `helmet`** — no HSTS, `X-Frame-Options` or `X-Content-Type-Options`, and Express's
  `x-powered-by` header is left on. CORS is fully permissive by design.
- **No request logging.** There is no morgan/pino/winston; an HTTP request produces no log
  line. Only the boot banner, unhandled errors and the OTP stub write to the console.
- **`/health` is a liveness probe only.** It returns `{ ok: true }` without touching Prisma,
  so it stays green even if the database is unreachable — relevant because Render gates
  deploys on it.
