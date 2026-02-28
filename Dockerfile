# Dockerfile for Vibbit Managed Backend

FROM node:20-alpine
WORKDIR /app

COPY apps/backend/package*.json apps/backend/
RUN cd apps/backend && npm ci --only=production

COPY apps/backend/ ./apps/backend/

EXPOSE 8787
ENV PORT=8787
ENV NODE_ENV=production

CMD ["node", "apps/backend/src/server.mjs"]
