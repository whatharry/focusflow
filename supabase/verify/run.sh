#!/usr/bin/env bash
# Executes every migration in order against a throwaway Postgres and asserts the
# schema's invariants: the signup trigger, task defaults, the pause-integrity
# CHECK, the one-live-session index, the project/milestone composite foreign
# keys, archive losslessness, and RLS isolation between two users.
#
# Needs Docker, and only to verify the schema — the app itself never requires it.
#
#   ./supabase/verify/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

NAME=ff-verify-pg
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=ff postgres:17-alpine >/dev/null

for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -d ff >/dev/null 2>&1 && break
  sleep 1
done

run() { docker cp "$1" "$NAME:/tmp/s.sql" >/dev/null; docker exec "$NAME" psql -U postgres -d ff -v ON_ERROR_STOP=1 -q -f /tmp/s.sql; }

echo "── stubbing Supabase auth schema"
run supabase/verify/00_auth_stub.sql
echo "── applying migrations"
for migration in supabase/migrations/*.sql; do
  echo "   $(basename "$migration")"
  run "$migration"
done
echo "── constraints, defaults and triggers"
run supabase/verify/01_constraints.sql
echo "── row level security"
run supabase/verify/02_rls.sql
echo "── project structure, archive and milestone isolation"
run supabase/verify/03_structure.sql
echo
echo "✓ schema verified"
