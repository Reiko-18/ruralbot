FROM node:20-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY .npmrc ./
RUN npm ci

COPY prisma.config.ts ./
COPY src/prisma/schema.prisma ./src/prisma/schema.prisma
RUN DIRECT_URL="postgresql://placeholder:5432/placeholder" npx prisma generate

COPY . .

# Build dashboard SPA
RUN cd dashboard && npm install --include=dev && npm run build

EXPOSE 3000

CMD ["npm", "start"]
