#!/usr/bin/env bash
# Runs all migrations and pgTAP tests on a throwaway local PostgreSQL 16
# (needs postgresql-16, postgresql-16-pgvector, postgresql-16-pgtap).
# This checks SQL/RLS logic only; it does not replace a check on real Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
DIR=$(mktemp -d)
PORT=${PG_PORT:-54329}
RUN_AS=()
if [ "$(id -u)" = 0 ]; then chown -R postgres "$DIR"; RUN_AS=(runuser -u postgres --); fi
cleanup() { "${RUN_AS[@]}" "$BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"${RUN_AS[@]}" "$BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c wal_level=logical" -l "$DIR/log" start -w >/dev/null
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f supabase/tests/local/supabase-stub.sql
for m in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$m"; done
echo "migrations: ok ($(ls supabase/migrations/*.sql | wc -l))"
status=0
for t in supabase/tests/*.test.sql; do
  out=$("${PSQL[@]}" -t -A -f "$t" 2>&1) || status=1
  fails=$(grep -c '^not ok' <<<"$out" || true)
  oks=$(grep -c '^ok' <<<"$out" || true)
  echo "$(basename "$t"): ok=$oks not_ok=$fails"
  if [ "$fails" != 0 ] || grep -q ERROR <<<"$out"; then grep -E '^not ok|ERROR|#' <<<"$out" | head -40; status=1; fi
done
exit $status
