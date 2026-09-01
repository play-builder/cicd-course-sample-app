#!/usr/bin/env bash

set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
app_dir=$(cd -- "${test_dir}/.." && pwd)
test_port=${TEST_PORT:-39001}
test_log=$(mktemp "${TMPDIR:-/tmp}/sample-app-curl-loop.XXXXXX")

cleanup() {
  if [[ -n "${server_pid:-}" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -f "$test_log"
}
trap cleanup EXIT

PORT="$test_port" node "${app_dir}/src/server.js" >"$test_log" 2>&1 &
server_pid=$!

for _ in {1..30}; do
  if curl --silent --fail "http://127.0.0.1:${test_port}/readyz" >/dev/null; then
    break
  fi
  sleep 0.1
done

result=$("${app_dir}/scripts/curl-loop.sh" "http://127.0.0.1:${test_port}/" 3 0)

grep -q 'request=1 status=200' <<<"$result"
grep -q 'request=3 status=200' <<<"$result"

printf 'curl-loop test passed\n'
