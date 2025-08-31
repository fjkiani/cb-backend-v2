FROM node:18-alpine

WORKDIR /app

# Install deps first (optimized)
COPY package*.json ./
RUN npm ci --only=production --no-audit --no-fund

# Copy app (excluding node_modules)
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

# Install Chrome for Puppeteer
RUN npx puppeteer browsers install chrome

EXPOSE 3000

CMD ["npm", "run", "railway:start"]
