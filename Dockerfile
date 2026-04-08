# Use Node.js 20 as base image
FROM node:20-slim AS builder

# Install build dependencies for native modules (sqlite3, sharp)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment to skip Electron binary download
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDeps for build)
RUN npm install

# Copy source code
COPY . .

# Generate Prisma client and build the app
RUN npx prisma generate
RUN npm run build

# --- Production Stage ---
FROM node:20-slim

WORKDIR /app

# Copy only built files and necessary production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

# Ensure uploads directory exists (ephemeral)
RUN mkdir -p uploads/images uploads/videos uploads/voice

EXPOSE 3000

# Start the server with DB push
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm start"]
