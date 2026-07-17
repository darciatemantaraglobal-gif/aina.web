FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./

# canvas + sharp are optionalDependencies — failures are ignored by npm automatically
RUN npm install --no-audit --no-fund

# Verify critical runtime packages installed correctly
RUN node -e "require('./node_modules/multer')" && echo "multer OK"

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
