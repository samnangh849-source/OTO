# Use Node.js 20 as base image
FROM node:20-slim AS builder

# Install build dependencies for native modules (sqlite3, sharp, node-gyp)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    pkg-config \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment to skip Electron binary download
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

# Prisma needs this at build time sometimes
ARG DATABASE_URL="file:./prisma/database.sqlite"
ENV DATABASE_URL=$DATABASE_URL

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDeps for build)
# We use --build-from-source for native modules if needed
RUN npm install

# Copy source code
COPY . .

# Rebuild native modules for the current architecture
RUN npm rebuild sqlite3 sharp

# Generate Prisma client and build the app
RUN npx prisma generate
RUN npm run build

# --- Production Stage ---
FROM node:20-slim

# Install system dependencies needed for native modules in production
RUN apt-get update && apt-get install -y \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ARG DATABASE_URL="file:./prisma/database.sqlite"
ENV DATABASE_URL=$DATABASE_URL

# Copy only built files and necessary production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

# Ensure uploads directory exists (ephemeral)
RUN mkdir -p uploads/images uploads/videos uploads/voice

EXPOSE 3000

# Start the server with DB push to ensure schema is ready
# Use a script to ensure db push happens before starting node
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/server.cjs"]
