FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY fonts ./fonts
COPY --from=base /app/package.json /app/package-lock.json* ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/dist ./dist
CMD ["sh", "-lc", "npm run prisma:migrate && npm run prisma:seed && node dist/api/main.js"]

FROM node:20-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY fonts ./fonts
COPY --from=base /app/package.json /app/package-lock.json* ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/dist ./dist
CMD ["sh", "-lc", "npm run prisma:migrate && node dist/worker/main.js"]

