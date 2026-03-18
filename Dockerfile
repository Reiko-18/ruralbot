FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
COPY .npmrc ./
RUN npm ci

COPY prisma.config.ts ./
COPY src/prisma/schema.prisma ./src/prisma/schema.prisma
RUN DIRECT_URL="postgresql://placeholder:5432/placeholder" npx prisma generate

COPY . .

CMD ["npm", "start"]
