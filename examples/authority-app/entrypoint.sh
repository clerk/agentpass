#!/bin/sh
# Start the wrangler worker (serves both frontend assets and API)
# Pass environment variables as wrangler vars so they're available in worker bindings
VARS=""
[ -n "$SIGNING_KEY" ] && VARS="$VARS --var SIGNING_KEY:$SIGNING_KEY"
[ -n "$SIGNING_KEY_ID" ] && VARS="$VARS --var SIGNING_KEY_ID:$SIGNING_KEY_ID"
[ -n "$AUTHORITY_ORIGIN" ] && VARS="$VARS --var AUTHORITY_ORIGIN:$AUTHORITY_ORIGIN"
[ -n "$TRUST_MODE" ] && VARS="$VARS --var TRUST_MODE:$TRUST_MODE"
[ -n "$INTERNAL_ORIGIN_OVERRIDES" ] && VARS="$VARS --var INTERNAL_ORIGIN_OVERRIDES:$INTERNAL_ORIGIN_OVERRIDES"
[ -n "$SERVICE_CONFIG_OVERRIDES" ] && VARS="$VARS --var SERVICE_CONFIG_OVERRIDES:$SERVICE_CONFIG_OVERRIDES"
npx wrangler dev worker/index.ts --port 8787 --ip 0.0.0.0 $VARS
