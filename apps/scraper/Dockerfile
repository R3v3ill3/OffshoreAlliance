FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
WORKDIR /repo

# ---- Build stage: pull workspace context, build the scraper ----
FROM base AS builder

# Copy all workspace manifests so pnpm sees a consistent workspace tree
# (frozen-lockfile validates against every workspace declared in
# pnpm-workspace.yaml, so any missing package.json fails the install).
# These are tiny, copy them all up front for layer caching.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/organising-db/package.json apps/organising-db/
COPY apps/scraper/package.json apps/scraper/
COPY packages/db-types/package.json packages/db-types/
COPY packages/employer-matching/package.json packages/employer-matching/

RUN pnpm install --frozen-lockfile --filter @oa/scraper...

# Now copy the source for the scraper and its workspace deps.
COPY packages/employer-matching packages/employer-matching
COPY apps/scraper apps/scraper

RUN pnpm --filter @oa/scraper build

# ---- Runtime stage ----
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json ./
# Same logic as the build stage — copy all workspace manifests so pnpm
# can validate the lockfile, even though we only install the scraper.
COPY --from=builder /repo/apps/organising-db/package.json ./apps/organising-db/package.json
COPY --from=builder /repo/apps/scraper/package.json ./apps/scraper/package.json
COPY --from=builder /repo/packages/db-types/package.json ./packages/db-types/package.json
COPY --from=builder /repo/packages/employer-matching ./packages/employer-matching
COPY --from=builder /repo/apps/scraper/dist ./apps/scraper/dist
RUN pnpm install --prod --frozen-lockfile --filter @oa/scraper...

WORKDIR /app/apps/scraper
EXPOSE 8080
CMD ["node", "dist/index.js"]
