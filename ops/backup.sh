#!/bin/bash
set -euo pipefail
umask 077
: "${MYSQL_DATABASE:?Database is required}"
: "${MYSQL_PWD:?Database password is required}"
mkdir -p /backups
while true; do
  target="/backups/brightbuy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  if mysqldump --host="${DB_HOST:-db}" --user=root --single-transaction --routines --events --triggers --no-tablespaces --set-gtid-purged=OFF --databases "$MYSQL_DATABASE" | gzip > "$target.partial"; then
    mv -- "$target.partial" "$target"
    echo "Database backup completed: $target"
    # Only this service's dated backup files are eligible for retention cleanup.
    find /backups -maxdepth 1 -type f -name 'brightbuy-*.sql.gz' -mtime +7 -delete
  else
    echo 'Database backup failed; no complete backup was published.' >&2
    exit 1
  fi
  if [ "${BACKUP_ONCE:-false}" = true ]; then exit 0; fi
  sleep 86400
done
