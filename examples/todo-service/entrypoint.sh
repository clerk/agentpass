#!/bin/sh
# Start the wrangler worker (serves both frontend assets and API)
# Pass environment variables as wrangler vars so they're available in worker bindings
VARS=""
[ -n "$SIGNING_KEY" ] && VARS="$VARS --var SIGNING_KEY:$SIGNING_KEY"
[ -n "$SIGNING_KEY_ID" ] && VARS="$VARS --var SIGNING_KEY_ID:$SIGNING_KEY_ID"
[ -n "$SERVICE_ORIGIN" ] && VARS="$VARS --var SERVICE_ORIGIN:$SERVICE_ORIGIN"
[ -n "$AUTHORITY_URL" ] && VARS="$VARS --var AUTHORITY_URL:$AUTHORITY_URL"
[ -n "$AUTHORITY_CONFIG_OVERRIDES" ] && VARS="$VARS --var AUTHORITY_CONFIG_OVERRIDES:$AUTHORITY_CONFIG_OVERRIDES"
[ -n "$INTERNAL_ORIGIN_OVERRIDES" ] && VARS="$VARS --var INTERNAL_ORIGIN_OVERRIDES:$INTERNAL_ORIGIN_OVERRIDES"
npx wrangler dev worker/index.ts --port 8788 --ip 0.0.0.0 $VARS
