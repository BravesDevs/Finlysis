# ── Stage 1: Builder ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and Prisma schema first (for layer caching)
COPY package*.json ./
# Only copy schema — seed.ts and migrations are not needed and must not be compiled
COPY prisma/schema.prisma ./prisma/schema.prisma

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Generate Prisma client (prisma is a devDep — only available here)
RUN npx prisma generate

# Copy source and compile
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src/

RUN npm run build

# Verify the build produced the expected entry point
RUN test -f /app/dist/main.js || (echo "ERROR: dist/main.js not found after build" && ls -la /app/dist/ && exit 1)

# ── Stage 2: Production ───────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy the generated Prisma client from builder (prisma CLI not available here)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

CMD ["node", "dist/main"]
