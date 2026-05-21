#!/usr/bin/env bash
# Convenience wrapper for the locally-installed Postgres.app server.
# Usage: ./scripts/pg.sh {start|stop|status|psql|reset}
set -euo pipefail

PGBIN="$HOME/Applications/Postgres.app/Contents/Versions/latest/bin"
PGDATA="$HOME/Library/Application Support/Postgres/var-17"
PGLOG="$HOME/Library/Logs/postgres.log"
PORT=5432

export PATH="$PGBIN:$PATH"

cmd="${1:-status}"

case "$cmd" in
  start)
    "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGLOG" -o "-p $PORT --unix_socket_directories='/tmp'" start
    ;;
  stop)
    "$PGBIN/pg_ctl" -D "$PGDATA" stop -m fast
    ;;
  status)
    "$PGBIN/pg_ctl" -D "$PGDATA" status || true
    "$PGBIN/pg_isready" -h /tmp -p "$PORT"
    ;;
  psql)
    "$PGBIN/psql" -h /tmp -p "$PORT" -U mits -d mits
    ;;
  reset)
    echo "Dropping + recreating 'mits' database…"
    "$PGBIN/psql" -h /tmp -p "$PORT" -U "$USER" -d postgres -c "DROP DATABASE IF EXISTS mits;"
    "$PGBIN/psql" -h /tmp -p "$PORT" -U "$USER" -d postgres -c "CREATE DATABASE mits OWNER mits;"
    echo "Done. Now run: cd backend && npx prisma migrate deploy && npm run seed"
    ;;
  *)
    echo "Usage: $0 {start|stop|status|psql|reset}" >&2
    exit 1
    ;;
esac
