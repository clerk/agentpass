#!/bin/bash
#
# AgentPass E2E Test Script
#
# Prerequisites:
# 1. Authority worker running on localhost:8787
# 2. Todo Service worker running on localhost:8788
#
# This script tests the full AgentPass flow:
# 1. Fetch Service configuration
# 2. Resolve authority for user
# 3. Request AgentPass issuance
# 4. Approve the request (simulating human approval)
# 5. Redeem for bearer token
# 6. Use bearer token to interact with Todo API
#

set -e

AUTHORITY_URL="http://localhost:8787"
SERVICE_URL="http://localhost:8788"
USER_EMAIL="test@example.com"

echo "=== AgentPass E2E Test ==="
echo ""

# Step 1: Fetch Service Configuration
echo "1. Fetching Service configuration..."
SERVICE_CONFIG=$(curl -s "${SERVICE_URL}/agentpass-service/config.json")
echo "   Service: $(echo "$SERVICE_CONFIG" | jq -r '.service.name // "unknown"')"
echo "   Origin: $(echo "$SERVICE_CONFIG" | jq -r '.service.origin')"
echo ""

# Step 2: Resolve Authority
echo "2. Resolving authority for ${USER_EMAIL}..."
RESOLUTION=$(curl -s -X POST "${SERVICE_URL}/agentpass-service/agentpass/resolve-authorities" \
  -H "Content-Type: application/json" \
  -d "{\"user\": {\"email\": \"${USER_EMAIL}\"}}")
echo "   Resolution: $(echo "$RESOLUTION" | jq -c '.')"
echo ""

# Step 3: Fetch Authority Configuration
echo "3. Fetching Authority configuration..."
AUTH_CONFIG=$(curl -s "${AUTHORITY_URL}/agentpass-authority/ap")
echo "   Authority: $(echo "$AUTH_CONFIG" | jq -r '.authority')"
echo "   Trust mode: $(echo "$AUTH_CONFIG" | jq -r '.trust_mode')"
echo ""

# Step 4: Request AgentPass Issuance
TASK_ID="task_$(openssl rand -hex 6)"
echo "4. Requesting AgentPass issuance (task: ${TASK_ID})..."
ISSUANCE=$(curl -s -X POST "${AUTHORITY_URL}/agentpass-authority/requests" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"bearer_token\",
    \"service\": {\"origin\": \"${SERVICE_URL}\"},
    \"user\": {\"email\": \"${USER_EMAIL}\"},
    \"harness\": {\"id\": \"claude-code\"},
    \"task\": {
      \"id\": \"${TASK_ID}\",
      \"description\": \"Read and manage todos for testing\"
    }
  }")
REQUEST_ID=$(echo "$ISSUANCE" | jq -r '.id')
STATUS=$(echo "$ISSUANCE" | jq -r '.status')
echo "   Request ID: ${REQUEST_ID}"
echo "   Status: ${STATUS}"
echo ""

# Step 5: Approve the request (via dashboard API)
echo "5. Approving request via dashboard API..."
APPROVAL=$(curl -s -X POST "${AUTHORITY_URL}/agentpass-authority/api/requests/${REQUEST_ID}/decision" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"decision": "approved", "scope": ["todos:read", "todos:write"]}')
APPROVED_STATUS=$(echo "$APPROVAL" | jq -r '.status')
AGENTPASS_VALUE=$(echo "$APPROVAL" | jq -r '.agentpass.value')
echo "   Status: ${APPROVED_STATUS}"
echo "   AgentPass: ${AGENTPASS_VALUE:0:20}..."
echo ""

if [ "$APPROVED_STATUS" != "approved" ]; then
  echo "ERROR: Request was not approved!"
  exit 1
fi

# Step 6: Redeem for Bearer Token
echo "6. Redeeming AgentPass for bearer token..."
REDEMPTION=$(curl -s -X POST "${SERVICE_URL}/agentpass-service/agentpass/redeem-bearer-token" \
  -H "Content-Type: application/json" \
  -d "{
    \"agentpass\": {\"type\": \"bearer_token\", \"value\": \"${AGENTPASS_VALUE}\"},
    \"authority\": \"${AUTHORITY_URL}\",
    \"user\": {\"email\": \"${USER_EMAIL}\"}
  }")
BEARER_TOKEN=$(echo "$REDEMPTION" | jq -r '.bearer_token')
GRANTED_SCOPE=$(echo "$REDEMPTION" | jq -c '.scope')
echo "   Bearer token: ${BEARER_TOKEN:0:20}..."
echo "   Scope: ${GRANTED_SCOPE}"
echo ""

if [ "$BEARER_TOKEN" == "null" ] || [ -z "$BEARER_TOKEN" ]; then
  echo "ERROR: No bearer token received!"
  echo "   Response: $(echo "$REDEMPTION" | jq -c '.')"
  exit 1
fi

# Step 7: Use Bearer Token - Create a todo
echo "7. Creating a todo via API..."
CREATE_RESULT=$(curl -s -X POST "${SERVICE_URL}/api/todos" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${BEARER_TOKEN}" \
  -d '{"title": "Test todo from AgentPass e2e test"}')
TODO_ID=$(echo "$CREATE_RESULT" | jq -r '.todo.id')
echo "   Created todo: ${TODO_ID}"
echo ""

# Step 8: Use Bearer Token - List todos
echo "8. Listing todos via API..."
LIST_RESULT=$(curl -s "${SERVICE_URL}/api/todos" \
  -H "Authorization: Bearer ${BEARER_TOKEN}")
TODO_COUNT=$(echo "$LIST_RESULT" | jq '.todos | length')
echo "   Found ${TODO_COUNT} todo(s)"
echo ""

# Step 9: Use Bearer Token - Complete the todo
echo "9. Completing todo..."
PATCH_RESULT=$(curl -s -X PATCH "${SERVICE_URL}/api/todos/${TODO_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${BEARER_TOKEN}" \
  -d '{"completed": true}')
COMPLETED=$(echo "$PATCH_RESULT" | jq -r '.todo.completed')
echo "   Completed: ${COMPLETED}"
echo ""

# Step 10: Use Bearer Token - Delete the todo
echo "10. Deleting todo..."
DELETE_RESULT=$(curl -s -X DELETE "${SERVICE_URL}/api/todos/${TODO_ID}" \
  -H "Authorization: Bearer ${BEARER_TOKEN}")
DELETED=$(echo "$DELETE_RESULT" | jq -r '.deleted')
echo "    Deleted: ${DELETED}"
echo ""

echo "=== All E2E tests passed! ==="
