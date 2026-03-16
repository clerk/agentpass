FROM node:22-slim AS builder

WORKDIR /app

# Copy SDK dependency
COPY packages/authority/package.json packages/authority/
COPY packages/authority/tsconfig.json packages/authority/
COPY packages/authority/tsup.config.ts packages/authority/
COPY packages/authority/src packages/authority/src/

# Copy app source
COPY examples/authority-app/package.json examples/authority-app/
COPY examples/authority-app/src examples/authority-app/src/
COPY examples/authority-app/index.html examples/authority-app/
COPY examples/authority-app/vite.config.ts examples/authority-app/
COPY examples/authority-app/tsconfig.json examples/authority-app/
COPY examples/authority-app/worker examples/authority-app/worker/
COPY examples/authority-app/wrangler.toml examples/authority-app/

# Install and build SDK
WORKDIR /app/packages/authority
RUN npm install && npm run build

# Install and build frontend
WORKDIR /app/examples/authority-app
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_AUTHORITY_URL=http://localhost:8787
RUN npm install && npm run build

# --- Runtime stage ---
FROM node:22-slim

WORKDIR /app

# Preserve directory structure so file: references resolve correctly
COPY --from=builder /app/packages/authority ./packages/authority
COPY --from=builder /app/examples/authority-app ./examples/authority-app

# Entrypoint runs wrangler (serves both frontend assets and API)
COPY examples/authority-app/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /app/examples/authority-app

EXPOSE 8787
CMD ["/entrypoint.sh"]
