FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4000

CMD ["node", "src/server.js"]
