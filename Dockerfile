FROM node:18-alpine

WORKDIR /app

# Install system dependencies for Chrome
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to use the installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install production deps without running lifecycle scripts
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts

# Copy app source
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "railway:start"]
