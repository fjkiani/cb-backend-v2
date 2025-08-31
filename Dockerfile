FROM node:18-alpine

WORKDIR /app

# Prevent Puppeteer from downloading Chrome during npm ci
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install production deps without running lifecycle scripts
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts

# Copy app source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

# Install Chrome explicitly for Puppeteer at runtime
RUN npx puppeteer browsers install chrome

EXPOSE 3000

CMD ["npm", "run", "railway:start"]
