FROM oven/bun:1.4.4-alpine

WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.json ./
COPY patches/ patches/
COPY packages/contracts/package.json packages/contracts/
COPY packages/sdk/package.json packages/sdk/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN bun install --frozen-lockfile --ignore-scripts --omit=peer --omit=optional \
    --filter @vibbr.co/contracts --filter @vibbr.co/backend

COPY packages/contracts/ packages/contracts/
COPY packages/backend/ packages/backend/
RUN bun run --cwd packages/contracts build && bun run --cwd packages/backend build

RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
USER appuser
ENV NODE_ENV=production
EXPOSE 3000
# The image runs the TypeScript entry with Bun, as the dev server does.
CMD ["bun", "packages/backend/server.ts"]
