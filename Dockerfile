FROM node:20

WORKDIR /app

# System libs needed by @napi-rs/canvas at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 libgif-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifest first — layer cache busts when deps change
COPY package.json package-lock.json ./

RUN npm install --no-audit --no-fund

# Copy source (node_modules excluded via .dockerignore)
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
