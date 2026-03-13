#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/_common.sh"

require_env INTEGRATOR
require_env CURSOR

curl_json \
  --get "$BASE_URL/v1/fees" \
  --data-urlencode "integrator=$INTEGRATOR" \
  --data-urlencode "cursor=$CURSOR" \
  --data-urlencode "limit=${LIMIT:-2}"
