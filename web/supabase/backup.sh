#!/usr/bin/env bash
# Backs up the accounts database: what a restore needs, encrypted for the owner of the private key.
# Run by .github/workflows/backup.yml every night; it can run on a computer with Docker and `age` too:
#
#   DATABASE_URL=postgresql://... AGE_PUBLIC_KEY=age1... web/supabase/backup.sh <folder for the backup>
#
# The dump holds the data of the tables in `public` (songs and setlists) and of `auth.users` and
# `auth.identities`, since every row's owner_id points at a user and signing in needs both. The tables
# themselves come from the migrations (README: Restoring a backup). `public.server_epoch`, which tells devices
# the database was restored, is left out: a restore must not bring back an old value. It stops with an error, so the
# workflow fails and GitHub sends a notice, when the dump is too small or lacks the songs table, or when the
# database has grown close to the free plan's 500 MB, past which it turns read-only.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the connection string of the database}"
: "${AGE_PUBLIC_KEY:?Set AGE_PUBLIC_KEY to the public key the backup is encrypted for}"
folder=$(mkdir -p "${1:?Give the folder the backup goes in}" && cd "$1" && pwd)
# The plain dump never stays behind, however the script ends.
trap 'rm -f "$folder/groovekeeper.dump"' EXIT
max_db_mb=${MAX_DB_MB:-400}
min_dump_bytes=${MIN_DUMP_BYTES:-1024}

# Postgres 17's tools, as the database's version; --network host lets a local database be reached too.
pg() {
  docker run --rm --network host --user "$(id -u):$(id -g)" -v "$folder:/out" postgres:17 "$@"
}

size_bytes=$(pg psql "$DATABASE_URL" --no-psqlrc -Atc 'select pg_database_size(current_database())')
size_mb=$((size_bytes / 1024 / 1024))
echo "The database is $size_mb MB (the free plan turns read-only at 500 MB)."
if ((size_mb > max_db_mb)); then
  echo "::error::The database is $size_mb MB, over $max_db_mb MB: delete data or move to a bigger plan before it turns read-only."
  exit 1
fi

pg pg_dump "$DATABASE_URL" --format custom --data-only --no-owner --no-privileges \
  --table 'public.*' --exclude-table public.server_epoch --table auth.users --table auth.identities \
  --file /out/groovekeeper.dump

dump_bytes=$(stat -c %s "$folder/groovekeeper.dump")
echo "The dump is $dump_bytes bytes."
if ((dump_bytes < min_dump_bytes)); then
  echo "::error::The dump is only $dump_bytes bytes; something is wrong with it."
  exit 1
fi
contents=$(pg pg_restore --list /out/groovekeeper.dump)
for table in 'public songs' 'public setlists' 'auth users' 'auth identities'; do
  if ! grep -q "TABLE DATA $table " <<<"$contents"; then
    echo "::error::The dump has no data of ${table/ /.}."
    exit 1
  fi
done

backup="$folder/groovekeeper-$(date -u +%Y-%m-%d).dump.age"
age --recipient "$AGE_PUBLIC_KEY" <"$folder/groovekeeper.dump" >"$backup"
rm "$folder/groovekeeper.dump"
if [[ ! -s "$backup" ]]; then
  echo "::error::The encrypted backup is empty."
  exit 1
fi
echo "Wrote $(basename "$backup") ($(stat -c %s "$backup") bytes)."
