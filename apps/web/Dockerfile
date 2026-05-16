FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @draw-and-guess/shared build
RUN pnpm install --frozen-lockfile=false --offline
RUN pnpm --filter @draw-and-guess/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN corepack enable
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web ./apps/web
COPY --from=build /app/packages/shared ./packages/shared
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
