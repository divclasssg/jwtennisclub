#!/usr/bin/env bash

set -euo pipefail

readonly MATCH_REPLAY_ROOT="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
  pwd
)"
readonly MATCH_DB_CONTAINER="supabase_db_jwtennisclub-shared-match-backend"
readonly MATCH_PREPARE_SQL="${MATCH_REPLAY_ROOT}/supabase/scripts/prepare_match_baseline.local.sql"
readonly MATCH_RESET_SQL="${MATCH_REPLAY_ROOT}/supabase/scripts/reset_match_baseline.local.sql"

cleanup_match_baseline() {
  docker exec -i "${MATCH_DB_CONTAINER}" \
    psql -q -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1 -f - \
    < "${MATCH_RESET_SQL}"
}

finish_replay() {
  local replay_status=$?
  local cleanup_status=0

  trap - EXIT INT TERM
  cleanup_match_baseline || cleanup_status=$?

  if ((cleanup_status != 0)); then
    echo "match baseline cleanup failed" >&2
    exit "${cleanup_status}"
  fi

  exit "${replay_status}"
}

trap finish_replay EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

cd -- "${MATCH_REPLAY_ROOT}"
export SUPABASE_TELEMETRY_DISABLED=1

supabase db reset --local --no-seed --version 202608020001

docker exec -i "${MATCH_DB_CONTAINER}" \
  psql -q -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1 -f - \
  < "${MATCH_PREPARE_SQL}"

supabase migration up --local
