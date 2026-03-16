> [!WARNING]
> This code is work-in-progress. It has not been security-audited and APIs are subject to change.
> Do not use in production environments.

# AgentPass Examples

Two example applications demonstrating the AgentPass protocol:

- **Authority App** — An AgentPass Authority that issues and manages agent passes. Includes a dashboard UI for reviewing and approving agent requests.
- **Todo Service** — A service that accepts AgentPass tokens for authentication. Provides a simple todo API and frontend.

## Prerequisites

- Node.js 22+
- Docker and Docker Compose (for containerized setup)
- A [Clerk](https://clerk.com) account (for user authentication in the frontends)

## Quick Start with Docker Compose

1. Generate signing keys:

   ```bash
   bash generate-keys.sh
   ```

2. Copy the example env file and fill in your values:

   ```bash
   cp .env.example .env
   ```

   Paste the generated `AUTHORITY_SIGNING_KEY` and `SERVICE_SIGNING_KEY` values, and add your Clerk publishable keys for each app.

3. Start both apps:

   ```bash
   docker compose up --build
   ```

4. Open the apps:
   - Authority dashboard: http://localhost:3000
   - Todo app: http://localhost:3001
   - Authority worker API: http://localhost:8787
   - Todo service API: http://localhost:8788

## Manual Setup (without Docker)

### Authority App

```bash
cd authority-app
cp .env.example .env
# Edit .env with your Clerk key and authority URL

# Install dependencies (from repo root)
cd ../../packages/authority && npm install
cd ../../examples/authority-app && npm install

# Start the worker
npm run worker:dev

# In another terminal, start the frontend
npm run dev
```

### Todo Service

```bash
cd todo-service
cp .env.example .env
# Edit .env with your Clerk key and API URL

# Install dependencies (from repo root)
cd ../../packages/authority && npm install
cd ../../packages/service && npm install
cd ../../examples/todo-service && npm install

# Start the worker
npm run worker:dev

# In another terminal, start the frontend
npm run dev
```

## Key Generation

Generate EC P-256 signing key pairs for the Authority and Service:

```bash
bash generate-keys.sh
```

This outputs `AUTHORITY_SIGNING_KEY` and `SERVICE_SIGNING_KEY` values as JWK JSON strings. Add these to your `.env` file or pass them as environment variables.

## Running E2E Tests

With both workers running (ports 8787 and 8788):

```bash
bash e2e/test-agentpass.sh
```

This tests the full AgentPass flow: service discovery, authority resolution, pass issuance, approval, redemption, and API usage with the bearer token.

## Testing with Claude Code

See [e2e/claude-test.md](e2e/claude-test.md) for instructions on testing the AgentPass flow interactively with Claude Code.

## Environment Variables

### Docker Compose (`.env`)

| Variable | Description |
|---|---|
| `AUTHORITY_SIGNING_KEY` | JWK JSON string for the Authority's EC P-256 signing key |
| `SERVICE_SIGNING_KEY` | JWK JSON string for the Todo Service's EC P-256 signing key |
| `AUTHORITY_CLERK_PUBLISHABLE_KEY` | Clerk publishable key for the Authority App frontend |
| `SERVICE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key for the Todo Service frontend |

### Authority App

| Variable | Description |
|---|---|
| `AUTHORITY_ORIGIN` | Origin URL of the authority worker (default: `http://localhost:8787`) |
| `TRUST_MODE` | Trust mode (`federated` or `direct`) |
| `SIGNING_KEY_ID` | Key identifier for the signing key |
| `SIGNING_KEY` | JWK JSON string for the signing key |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `VITE_AUTHORITY_URL` | Authority API URL for the frontend |

### Todo Service

| Variable | Description |
|---|---|
| `SERVICE_ORIGIN` | Origin URL of the service worker (default: `http://localhost:8788`) |
| `SIGNING_KEY_ID` | Key identifier for the signing key |
| `SIGNING_KEY` | JWK JSON string for the signing key |
| `AUTHORITY_URL` | URL of the Authority for token verification |
| `AUTHORITY_CONFIG_OVERRIDES` | Override authority discovery for specific email domains (e.g., `clerk.dev=http://localhost:8787/agentpass-authority/ap`) |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `VITE_API_URL` | Todo service API URL for the frontend |
