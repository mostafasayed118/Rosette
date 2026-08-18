#!/usr/bin/env bash
# Smoke test for the notification retry cron endpoint.
#
# Verifies two things:
#   1. The endpoint rejects unauthenticated requests (HTTP 401).
#   2. An authenticated request returns HTTP 200 with the expected
#      { retried, sent, failed, skipped } summary.
#
# Usage: scripts/smoke-cron.sh <ENDPOINT_URL> <CRON_SECRET>
set -euo pipefail

ENDPOINT="${1:?usage: smoke-cron.sh <ENDPOINT_URL> <CRON_SECRET>}"
SECRET="${2:?usage: smoke-cron.sh <ENDPOINT_URL> <CRON_SECRET>}"

echo "Smoke testing: ${ENDPOINT}"

# 1) Unauthenticated requests must be rejected.
UNAUTH_STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
  --max-time 60 --request POST "${ENDPOINT}")
if [ "${UNAUTH_STATUS}" != "401" ]; then
  echo "FAIL: expected HTTP 401 without credentials, got ${UNAUTH_STATUS}" >&2
  exit 1
fi
echo "  ok: unauthenticated request rejected (401)"

# 2) Authenticated request must return the retry summary.
BODY_FILE=$(mktemp)
trap 'rm -f "${BODY_FILE}"' EXIT
AUTH_STATUS=$(curl -s -o "${BODY_FILE}" -w '%{http_code}' \
  --max-time 120 --request POST \
  --header "Authorization: Bearer ${SECRET}" "${ENDPOINT}")
BODY=$(<"${BODY_FILE}")

if [ "${AUTH_STATUS}" != "200" ]; then
  echo "FAIL: expected HTTP 200 with credentials, got ${AUTH_STATUS}: ${BODY}" >&2
  exit 1
fi

for KEY in retried sent failed skipped; do
  if ! printf '%s' "${BODY}" | grep -q "\"${KEY}\""; then
    echo "FAIL: summary missing \"${KEY}\": ${BODY}" >&2
    exit 1
  fi
done

echo "  ok: authenticated request returned summary -> ${BODY}"
