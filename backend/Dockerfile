# syntax=docker/dockerfile:1
# ─── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cached separately from source)
COPY package.json ./
RUN npm install --frozen-lockfile

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Only production deps
COPY package.json ./
RUN npm install --frozen-lockfile --omit=dev

# Compiled output from builder
COPY --from=builder /app/dist ./dist

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
