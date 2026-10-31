FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/streamon

COPY server/package.json server/
COPY web/package.json web/
RUN npm install --prefix server && npm install --prefix web

COPY server server
COPY web web
RUN npm run build --prefix web

ENV NODE_ENV=production
ENV DATA_DIR=/opt/streamon/data
VOLUME ["/opt/streamon/data"]
EXPOSE 8080/tcp
CMD ["node", "server/src/index.js"]
