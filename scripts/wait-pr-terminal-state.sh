#!/usr/bin/env bash
set -Eeuo pipefail

trap 'printf "ERROR: Pull Request 종료 상태 대기 실패(line=%s)\n" "$LINENO" >&2' ERR

PULL_REQUEST="${1:-}"
GITHUB_REPOSITORY="${2:-${GH_REPO:-}}"
MAX_ATTEMPTS="${PR_WAIT_ATTEMPTS:-60}"
WAIT_SECONDS="${PR_WAIT_SECONDS:-10}"

if [[ -z "$PULL_REQUEST" || -z "$GITHUB_REPOSITORY" ]]; then
  printf '사용법: bash %s <pr-url-or-number> <owner/repository>\n' "$0" >&2
  exit 64
fi

for tool in gh jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'ERROR: 필수 명령을 찾을 수 없습니다: %s\n' "$tool" >&2
    exit 127
  fi
done

for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1)); do
  PR_JSON="$(gh pr view "$PULL_REQUEST" \
    --repo "$GITHUB_REPOSITORY" \
    --json number,state,mergeStateStatus,mergedAt,url)"
  PR_STATE="$(jq -r '.state' <<<"$PR_JSON")"

  case "$PR_STATE" in
    MERGED)
      jq '{number,state,mergedAt,url}' <<<"$PR_JSON"
      printf 'PASS: Pull Request가 MERGED 상태입니다.\n'
      exit 0
      ;;
    CLOSED)
      printf 'ERROR: Pull Request가 merge 없이 CLOSED 상태가 됐습니다.\n' >&2
      exit 1
      ;;
  esac

  if [[ "$attempt" -lt "$MAX_ATTEMPTS" ]]; then
    printf 'INFO: Pull Request merge를 기다립니다(%s/%s, mergeState=%s).\n' \
      "$attempt" "$MAX_ATTEMPTS" "$(jq -r '.mergeStateStatus' <<<"$PR_JSON")"
    sleep "$WAIT_SECONDS"
  fi
done

printf 'ERROR: Pull Request가 제한 시간 안에 MERGED 상태가 되지 않았습니다.\n' >&2
exit 1
