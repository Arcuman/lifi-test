#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/_common.sh"

require_env INTEGRATOR
require_env FROM_BLOCK
require_env TO_BLOCK

curl_json \
  --get "$BASE_URL/v1/fees" \
  --data-urlencode "integrator=$INTEGRATOR" \
  --data-urlencode "fromBlock=$FROM_BLOCK" \
  --data-urlencode "toBlock=$TO_BLOCK" \
  --data-urlencode "limit=${LIMIT:-20}"
