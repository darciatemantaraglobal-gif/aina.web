FROM node:20

WORKDIR /app

# System libs for @napi-rs/canvas and sharp at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 libgif-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# --ignore-scripts skips native-binary postinstall steps that fail in CI
# canvas + sharp are dynamic imports with graceful fallback, so this is safe
RUN npm install --ignore-scripts --no-audit --no-fund

# Verify critical packages are present before proceeding
RUN node -e "require('./node_modules/multer')" && echo "multer OK"
RUN node -e "require('./node_modules/express')" && echo "express OK"

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
