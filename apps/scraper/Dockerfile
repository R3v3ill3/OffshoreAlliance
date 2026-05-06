FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
WORKDIR /repo

# ---- Build stage: pull workspace context, build the scraper ----
FROM base AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/employer-matching/package.json packages/employer-matching/
COPY apps/scraper/package.json apps/scraper/
RUN pnpm install --frozen-lockfile --filter @oa/scraper...

COPY packages/employer-matching packages/employer-matching
COPY apps/scraper apps/scraper
RUN pnpm --filter @oa/scraper build

# ---- Runtime stage ----
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json ./
COPY --from=builder /repo/packages/employer-matching ./packages/employer-matching
COPY --from=builder /repo/apps/scraper/package.json ./apps/scraper/package.json
COPY --from=builder /repo/apps/scraper/dist ./apps/scraper/dist
RUN pnpm install --prod --frozen-lockfile --filter @oa/scraper...

WORKDIR /app/apps/scraper
EXPOSE 8080
CMD ["node", "dist/index.js"]
