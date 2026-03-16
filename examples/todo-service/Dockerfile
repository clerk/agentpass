FROM node:22-slim AS builder

WORKDIR /app

# Copy SDK dependencies
COPY packages/authority/package.json packages/authority/
COPY packages/authority/tsconfig.json packages/authority/
COPY packages/authority/tsup.config.ts packages/authority/
COPY packages/authority/src packages/authority/src/
COPY packages/service/package.json packages/service/
COPY packages/service/tsconfig.json packages/service/
COPY packages/service/tsup.config.ts packages/service/
COPY packages/service/src packages/service/src/

# Copy app source
COPY examples/todo-service/package.json examples/todo-service/
COPY examples/todo-service/src examples/todo-service/src/
COPY examples/todo-service/index.html examples/todo-service/
COPY examples/todo-service/vite.config.ts examples/todo-service/
COPY examples/todo-service/tsconfig.json examples/todo-service/
COPY examples/todo-service/worker examples/todo-service/worker/
COPY examples/todo-service/wrangler.toml examples/todo-service/

# Install and build SDK dependencies
WORKDIR /app/packages/authority
RUN npm install && npm run build

WORKDIR /app/packages/service
RUN npm install && npm run build

# Install and build frontend
WORKDIR /app/examples/todo-service
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_API_URL=http://localhost:8788
RUN npm install && npm run build

# --- Runtime stage ---
FROM node:22-slim

WORKDIR /app

# Preserve directory structure so file: references resolve correctly
COPY --from=builder /app/packages/authority ./packages/authority
COPY --from=builder /app/packages/service ./packages/service
COPY --from=builder /app/examples/todo-service ./examples/todo-service

# Entrypoint runs wrangler (serves both frontend assets and API)
COPY examples/todo-service/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /app/examples/todo-service

EXPOSE 8788
CMD ["/entrypoint.sh"]
