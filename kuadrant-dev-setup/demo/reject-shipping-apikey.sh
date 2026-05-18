#!/bin/bash

set -e

NAMESPACE="toystore"
APIKEY_NAME_PATTERN="rejected-shipping-apikey"
MAX_WAIT_SECONDS=120
POLL_INTERVAL=2

echo "Waiting for APIKeyRequest to be created by controller (pattern: ${APIKEY_NAME_PATTERN})..."

# Poll for APIKeyRequest creation
elapsed=0
apikey_request_name=""

while [ $elapsed -lt $MAX_WAIT_SECONDS ]; do
  # Look for APIKeyRequest that matches the pattern
  apikey_request_name=$(kubectl get apikeyrequests -n "$NAMESPACE" -o name 2>/dev/null | grep "$APIKEY_NAME_PATTERN" | head -n 1 | sed 's|.*/||' || echo "")

  if [ -n "$apikey_request_name" ]; then
    echo "Found APIKeyRequest: $apikey_request_name"
    break
  fi

  echo "  Waiting for APIKeyRequest... ($elapsed/$MAX_WAIT_SECONDS seconds)"
  sleep $POLL_INTERVAL
  elapsed=$((elapsed + POLL_INTERVAL))
done

if [ -z "$apikey_request_name" ]; then
  echo "ERROR: APIKeyRequest not found after ${MAX_WAIT_SECONDS} seconds"
  echo "Make sure the developer-portal-controller is running and the APIKey resource exists"
  exit 1
fi

echo ""
echo "Creating APIKeyApproval to reject the request..."

# Create APIKeyApproval with rejection
cat <<EOF | kubectl apply -f -
apiVersion: devportal.kuadrant.io/v1alpha1
kind: APIKeyApproval
metadata:
  name: rejected-shipping-apikey-approval
  namespace: ${NAMESPACE}
spec:
  # Reference to the APIKeyRequest being rejected (same namespace)
  apiKeyRequestRef:
    name: ${apikey_request_name}
  # Rejection decision
  approved: false
  # Who made the decision
  reviewedBy: "owner2@kuadrant.local"
  # When the decision was made
  reviewedAt: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  # Reason for rejection
  reason: "RejectedByOwner"
  # Review message
  message: "Access denied - third-party vendor integrations require enterprise plan tier. Please upgrade to enterprise tier or contact owner2-team for alternative integration options."
EOF

echo ""
echo "✓ APIKeyApproval created successfully"
echo ""
echo "The rejected-shipping-apikey should now show as 'Denied' status"
