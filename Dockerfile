# ---- Build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

# ---- Runtime ----
FROM node:20-alpine
RUN apk add --no-cache postgresql-client
WORKDIR /app

COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/
COPY frontend/ ./frontend/

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "backend/app.js"]
