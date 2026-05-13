FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
RUN pnpm --filter @draw-and-guess/shared build
RUN pnpm install --frozen-lockfile=false --offline
RUN pnpm --filter @draw-and-guess/server build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
RUN test -f packages/shared/dist/index.js
WORKDIR /app/apps/server
EXPOSE 4000
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/apps/server/src/index.js"]
