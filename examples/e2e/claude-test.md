# Testing AgentPass with Claude Code

This guide walks you through manually testing the AgentPass flow using Claude Code with the AgentPass skill.

## Prerequisites

1. Start the Authority and Service workers:

```bash
# Terminal 1: Start Authority worker
cd examples/authority-app
npm install
npx wrangler dev worker/index.ts --port 8787

# Terminal 2: Start Todo Service worker
cd examples/todo-service
npm install
npx wrangler dev worker/index.ts --port 8788
```

2. Install the AgentPass skill in Claude Code:

```bash
# Copy the skill to your Claude Code skills directory
cp packages/skill/agentpass.md ~/.claude/skills/
```

## Running the Test

1. Start Claude Code in the project directory
2. Ask Claude to access the Todo service:

```
Use AgentPass to get a bearer token for the todo service at localhost:8788.
My email is test@example.com.
Then create a todo called "Hello from AgentPass".
```

3. Claude will:
   - Discover the Service at localhost:8788
   - Resolve the authority (will find the federated authority at localhost:8787)
   - Request an AgentPass from the authority
   - Tell you to approve the request

4. Approve the request:
   - Open the Authority dashboard at http://localhost:3000 (if running the frontend)
   - Or approve via the API:
   ```bash
   # Get the request ID from Claude's output, then:
   curl -X POST http://localhost:8787/api/requests/{REQUEST_ID}/decision \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer test-token" \
     -d '{"decision": "approved", "scope": ["todos:read", "todos:write"]}'
   ```

5. Claude will detect the approval, redeem the AgentPass, and use the bearer token to create the todo.

## What to Verify

- Service discovery works correctly
- Authority resolution returns the federated authority
- AgentPass issuance creates a pending request
- Approval flow works (manual or dashboard)
- Bearer token redemption succeeds
- The todo is created via the API with the bearer token
- Scope enforcement works (try requesting only `todos:read` and attempting to create)
