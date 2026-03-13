#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-http://localhost:3000}"

curl_json() {
  tmp_file=$(mktemp)
  status_code=$(curl -sS -o "$tmp_file" -w "%{http_code}" "$@")
  cat "$tmp_file"
  rm -f "$tmp_file"
  printf '\nHTTP %s\n' "$status_code"
}

require_env() {
  var_name="$1"
  eval "var_value=\${$var_name:-}"

  if [ -z "$var_value" ]; then
    printf '%s\n' "Missing $var_name. Run like: $var_name=value $0" >&2
    exit 1
  fi
}
