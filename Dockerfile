FROM node:20-alpine

WORKDIR /app

# Copy manifest first so layer cache only busts on dep changes
COPY package.json package-lock.json ./

# Fresh install — no cache reuse
RUN npm install --omit=dev

# Copy rest of source
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
