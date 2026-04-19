FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

