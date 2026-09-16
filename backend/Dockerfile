# Backend API (Express). Build: docker compose build / .\up.ps1 -Build
FROM node:20-slim

# Cliente psql para migraciones en el entrypoint
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Codigo + migraciones + entrypoint
COPY backend/app.js ./app.js
COPY backend/config ./config
COPY backend/helpers ./helpers
COPY backend/middleware ./middleware
COPY backend/routes ./routes
COPY backend/scripts ./scripts
COPY backend/docker-entrypoint.sh ./docker-entrypoint.sh
COPY database /migrations
RUN chmod +x ./docker-entrypoint.sh

ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "app.js"]
