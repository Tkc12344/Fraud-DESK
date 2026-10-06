FROM node:22-bookworm-slim

WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/src ./src
COPY server/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod -R a+rX /app && chmod +x /docker-entrypoint.sh

ENV PORT=4000
EXPOSE 4000
ENTRYPOINT ["/docker-entrypoint.sh"]
