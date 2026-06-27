FROM node:20-alpine AS builder

# Install dependencies required by native/optional packages during install/build.
RUN apk add --no-cache curl libc6-compat python3 make g++

WORKDIR /app

# Copy dependency manifests first so Docker/Kilo layer caching remains effective.
COPY package*.json ./

# Build requires devDependencies (TypeScript, Tailwind/PostCSS, ESLint/Next build tooling).
RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY . .

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=128"

RUN npm run build

# Keep the final image lean after the production build is produced.
RUN npm prune --omit=dev --legacy-peer-deps && npm cache clean --force

FROM node:20-alpine AS runner

RUN apk add --no-cache curl libc6-compat

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3002 \
    NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=128"

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/data ./data

RUN mkdir -p data/redis && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3002}/api/health/liveness" >/dev/null || exit 1
  CMD curl -fsS "http://127.0.0.1:${PORT:-3002}/api/health" >/dev/null || exit 1

CMD ["sh", "-c", "npx next start -p ${PORT:-3002}"]
