# Draw and Guess

A Docker-ready multiplayer drawing and guessing game built with Next.js, Socket.IO, Redis, and PostgreSQL.

## Local Development

```bash
corepack pnpm install
cp .env.example .env
docker compose up postgres redis
corepack pnpm prisma:generate
corepack pnpm prisma:migrate
corepack pnpm dev
```

Web runs on `http://localhost:3000`; the API and Socket.IO server run on `http://localhost:4000`.

To run the whole stack in containers:

```bash
docker compose up --build
```

## AWS ECS Notes

- Build and push `apps/web/Dockerfile` and `apps/server/Dockerfile` images to ECR.
- Run web and server as separate ECS services behind an ALB.
- Use ElastiCache Redis for `REDIS_URL`.
- Use RDS PostgreSQL for `DATABASE_URL`.
- Configure sticky sessions or ensure all realtime state/timers are made cluster-safe before scaling the Socket.IO service horizontally.
