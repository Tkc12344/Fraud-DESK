FROM node:22-bookworm-slim AS build

WORKDIR /src
COPY web/package.json ./
RUN npm install
COPY web/index.html web/vite.config.js ./
COPY web/src ./src
RUN npm run build

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
