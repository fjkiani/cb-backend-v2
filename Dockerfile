FROM node:18-alpine

WORKDIR /app

# Install deps first
COPY package*.json ./
RUN npm ci

# Copy app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

# Only needed if your postinstall expects Chrome
RUN npx puppeteer browsers install chrome

EXPOSE 3000

CMD ["npm", "run", "railway:start"]
