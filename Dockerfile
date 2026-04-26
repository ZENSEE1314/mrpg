# Aetheria — single-service production image
# Server runs via tsx; built client is served by Express on the same port.

FROM node:22-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci --include=dev

COPY shared shared
COPY server server
COPY client client

RUN npm run build -w client


FROM node:22-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=/data/aetheria.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/client/package.json ./client/package.json

RUN mkdir -p /data

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "server"]
