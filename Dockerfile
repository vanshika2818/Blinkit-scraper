# 1. Use an official Node.js 18 image
FROM node:18-slim

# 2. Set the working directory
WORKDIR /usr/src/app

# 3. Install *only* the necessary system dependencies for Chrome
RUN apt-get update \
    && apt-get install -y \
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
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 4. Copy package files
COPY package*.json ./

# 5. Install app dependencies
RUN npm install

# 6. --- THIS IS THE FIX ---
# Set the cache directory *inside* our app folder
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache/puppeteer

# Run Puppeteer's built-in command to install the correct browser
RUN npx puppeteer browsers install chrome

# 7. Copy the rest of your app's source code
COPY . .

# 8. Expose the port
EXPOSE 3000

# 9. Run the "start" script
CMD [ "npm", "start" ]