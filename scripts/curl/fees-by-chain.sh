#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/_common.sh"

require_env INTEGRATOR

curl_json \
  --get "$BASE_URL/v1/fees" \
  --data-urlencode "integrator=$INTEGRATOR" \
  --data-urlencode "chainId=${CHAIN_ID:-137}" \
  --data-urlencode "limit=${LIMIT:-20}"
