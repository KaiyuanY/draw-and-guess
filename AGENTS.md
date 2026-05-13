# Draw and Guess Agent Context

## Project Overview

This is a web-based multiplayer draw-and-guess game for 2-4 players. Players join a room anonymously with a nickname, the room host starts the game, each player draws once, and the game ends after every player has had one drawing turn.

Core gameplay:
- Drawing turns last 90 seconds.
- Each turn is followed by a 15-second reveal period where everyone sees the word.
- Wrong guesses are public in real time.
- Correct guesses are private; the correct player gets a green checkmark on their avatar.
- If there are `N` guessers, correct guessers score `N`, `N-1`, etc. based on order.
- The drawer earns 1 point per correct guesser.
- At game end, the highest score wins; host can continue with a new game or players can leave.

## Tech Stack

- Package manager: `pnpm` via Corepack.
- Monorepo workspaces:
  - `apps/web`: Next.js React frontend.
  - `apps/server`: Express + Socket.IO backend.
  - `packages/shared`: shared TypeScript types and socket event contracts.
- Realtime: Socket.IO.
- Active game state: Redis.
- Persistence: PostgreSQL via Prisma.
- Local stack: Docker Compose.

## Important Files

- `apps/web/app/page.tsx`: main client UI, socket connection, landing page, room/game views, canvas drawing.
- `apps/web/app/globals.css`: full app styling.
- `apps/server/src/index.ts`: REST API, Socket.IO event handlers, timers, persistence hooks.
- `apps/server/src/gameEngine.ts`: pure-ish game state transitions and snapshot sanitization.
- `apps/server/src/store.ts`: Redis room/session storage.
- `apps/server/src/words.ts`: built-in server word list.
- `apps/server/prisma/schema.prisma`: durable room/game result schema.
- `packages/shared/src/index.ts`: shared constants, DTOs, and Socket.IO event interfaces.
- `docker-compose.yml`: PostgreSQL, Redis, server, and web services.

## Commands

Use `corepack pnpm` rather than assuming a global `pnpm` shim exists.

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm lint
corepack pnpm build
```

Run Prisma locally:

```bash
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/draw_guess?schema=public"
corepack pnpm --filter @draw-and-guess/server prisma migrate dev
```

Run local Docker stack:

```bash
docker compose up -d --build
```

Service URLs:
- Web: `http://localhost:3000`
- Server health: `http://localhost:4000/health`
- Redis: `localhost:6379`
- PostgreSQL: `localhost:5432`

## Implementation Notes

- Room IDs are short uppercase IDs generated server-side.
- Nicknames do not need to be unique.
- Anonymous browser session tokens are stored client-side and mapped to player IDs in Redis.
- Redis is the source of truth for active rooms and games.
- PostgreSQL currently stores durable room rows and completed game summaries.
- The server sends sanitized `RoomSnapshot` objects per socket. Guessers must not receive `currentWord` until reveal.
- The drawer receives `currentWord` during drawing; all players receive it during reveal.
- The UI displays `turnIndex + 1 / totalTurns`; server clamps `turnIndex` when the game ends to avoid showing a phantom turn such as `3/2`.

## Docker Notes

- `.dockerignore` must exclude `node_modules`, `dist`, `.next`, and `*.tsbuildinfo`.
- `*.tsbuildinfo` caused a Docker-only bug where TypeScript skipped emitting `packages/shared/dist`.
- `packages/shared/tsconfig.json` intentionally avoids `composite` to keep Docker builds straightforward.
- The server Dockerfile copies `packages/shared/dist` explicitly into the runtime image because the server runtime imports the shared package through Node ESM resolution.

## Testing Notes

- Server tests live in `apps/server/tests/gameEngine.test.ts`.
- Existing tests cover:
  - scoring order
  - drawer bonus scoring
  - wrong guess visibility
  - correct guess privacy
  - word hiding until reveal
  - drawing to reveal to next turn transitions
  - ended-game turn counter regression
  - continue-game behavior
- Web smoke tests are currently manual/browser-based.

## Known Constraints And Follow-ups

- Horizontal Socket.IO scaling is not fully production-ready yet. The Redis adapter is configured, but timers are still process-local. Before scaling the server service beyond one ECS task, move timer ownership to a distributed lock/queue or equivalent.
- Game history persistence is minimal; completed results are stored, but there is no admin/history UI.
- No accounts, custom word bank, or drawer word choice in v1.
- Current canvas protocol sends completed strokes, with local preview while drawing. Continuous in-progress streaming could be improved later.
