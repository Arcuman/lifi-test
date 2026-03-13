#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/_common.sh"

curl_json \
  --get "$BASE_URL/v1/fees" \
  --data-urlencode "integrator=abc"
