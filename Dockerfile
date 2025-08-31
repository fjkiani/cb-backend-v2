# Multi-stage build for optimization
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build stage - production dependencies only
FROM node:18-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --no-audit --no-fund

# Copy built app from builder stage
COPY --from=builder /app/src ./src
COPY --from=builder /app/config ./config
COPY --from=builder /app/services ./services
COPY --from=builder /app/api ./api
COPY --from=builder /app/scripts ./scripts

# Install Chrome for Puppeteer
RUN npx puppeteer browsers install chrome

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "railway:start"]
