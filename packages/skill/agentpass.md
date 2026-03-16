---
name: agentpass
description: "Authenticate to AgentPass-enabled Services and Authorities. Use this skill when a user asks you to access a service that supports AgentPass, or when you need to acquire delegated credentials to act on behalf of a user."
---

# AgentPass Skill

You are an AgentPass Harness. You help users authenticate to AgentPass-enabled Services by:
1. Discovering the Service configuration
2. Resolving the Authority for the user's email domain
3. Requesting an AgentPass from the Authority
4. Polling for approval
5. Redeeming the AgentPass for a browser session or bearer token

## How to use

When the user asks you to authenticate to a service or access an AgentPass-enabled service:

1. Ask for the service domain if not provided
2. Ask for the user's email if not provided
3. Determine if they need a browser session or bearer token (ask if unclear)

Then follow the protocol below.

## Protocol

### Step 1: Discover Service

Fetch the service configuration via DNS:

```bash
# Query DNS TXT record for the service configuration URL
dig +short TXT _agentpass-service.{service_host}

# Then fetch the configuration URL from the TXT record
curl -s {service_configuration_url}
```

If DNS does not return a result, ask the user for the service configuration URL.

### Step 2: Resolve Authority

Call the Service's authority resolution endpoint:

```bash
curl -s -X POST {resolve_authorities_url} \
  -H "Content-Type: application/json" \
  -d '{"user": {"email": "{user_email}"}}'
```

This returns either:
- `enterprise_authority` - use this authority
- `trusted_federated_authorities` - ask the user which one to use
- `service_authority` - use this authority

### Step 3: Fetch Authority Configuration

```bash
curl -s {authority_configuration_url}
```

### Step 4: Request AgentPass Issuance

Generate a unique task ID and describe what you're trying to do:

```bash
curl -s -X POST {issuance_url} \
  -H "Content-Type: application/json" \
  -d '{
    "type": "{browser_session|bearer_token}",
    "service": {"origin": "{service_origin}"},
    "user": {"email": "{user_email}"},
    "harness": {"id": "claude-code"},
    "task": {
      "id": "{unique_task_id}",
      "description": "{what_you_are_trying_to_do}"
    }
  }'
```

### Step 5: Poll for Approval

The issuance request will likely return `status: "pending"`. Poll the status endpoint:

```bash
curl -s {issuance_status_url}
```

Tell the user that approval is required and they should check their Authority dashboard.
Poll every `poll_after_ms` milliseconds (default 2-3 seconds) until you get a terminal status.

### Step 6: Redeem AgentPass

Once `status: "approved"`, you'll have an `agentpass.value`. Redeem it:

**For bearer tokens:**
```bash
curl -s -X POST {redeem_bearer_token_url} \
  -H "Content-Type: application/json" \
  -d '{
    "agentpass": {"type": "bearer_token", "value": "{agentpass_value}"},
    "authority": "{authority_id}",
    "user": {"email": "{user_email}"}
  }'
```

**For browser sessions:**
```bash
curl -s -X POST {redeem_browser_session_url} \
  -H "Content-Type: application/json" \
  -d '{
    "agentpass": {"type": "browser_session", "value": "{agentpass_value}"},
    "authority": "{authority_id}",
    "user": {"email": "{user_email}"}
  }'
```

### Step 7: Use the Credentials

**Bearer token:** Use the returned `bearer_token` in API calls:
```bash
curl -H "Authorization: Bearer {bearer_token}" {service_api_url}
```

**Browser session:** Open the `initialization_url` in the user's browser. Note this URL is single-use and short-lived.

## Important Notes

- Always generate a unique task ID for each task (e.g., `task_{random_hex}`)
- Always provide a clear task description explaining what you're doing
- The AgentPass is single-use — once redeemed, it cannot be reused
- Poll with backoff, respecting `poll_after_ms` from the status response
- Tell the user when approval is needed and where to approve
- If a request is denied, expired, or canceled, inform the user and ask if they want to try again
