#!/bin/bash
#
# Generate EC P-256 key pairs for Authority and Service.
# Outputs JSON that can be used as SIGNING_KEY environment variables.
#

echo "Generating Authority signing key..."
node -e "
async function main() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  console.log('AUTHORITY_SIGNING_KEY=' + JSON.stringify(JSON.stringify(privateJwk)));
}
main().catch(console.error);
"

echo ""
echo "Generating Service signing key..."
node -e "
async function main() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  console.log('SERVICE_SIGNING_KEY=' + JSON.stringify(JSON.stringify(privateJwk)));
}
main().catch(console.error);
"
