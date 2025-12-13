# ==========================================
# Stage 1: Builder
# ==========================================
FROM oven/bun:1.3.4-slim AS builder

WORKDIR /app

# Copy dependency files first to leverage caching
COPY package.json bun.lock ./

# Install all dependencies (including devDependencies like vitest, types)
# --frozen-lockfile ensures reproducible builds
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# ==========================================
# Stage 2: Runner (Production)
# ==========================================
FROM oven/bun:1.3.4-slim AS release

# Install system dependencies for Puppeteer (Chromium)
# We keep this in the final stage because the app needs them at runtime
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Puppeteer Config
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Patch tsconfig to point to dist instead of src for production
RUN sed -i 's/"src\/\*"/"dist\/\*"/g' tsconfig.json

# Install ONLY production dependencies
RUN bun install --frozen-lockfile --production

# Run as non-root user for security
USER bun

CMD ["bun", "run", "start"]
