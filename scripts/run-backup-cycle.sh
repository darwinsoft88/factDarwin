#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${FACTUDARWIN_ROOT_DIR:-$(dirname "$SCRIPT_DIR")}"
BACKEND_DIR="$ROOT_DIR/backend"
LOCAL_OFFSITE_DIR="${FACTUDARWIN_LOCAL_OFFSITE_DIR:-$BACKEND_DIR/backups/offsite-staging}"
LOG_DIR="${FACTUDARWIN_BACKUP_LOG_DIR:-$BACKEND_DIR/logs}"

mkdir -p "$LOG_DIR"
cd "$ROOT_DIR"
FACTUDARWIN_LOCAL_OFFSITE_DIR="$LOCAL_OFFSITE_DIR" node "$ROOT_DIR/scripts/run-backup-cycle.js"

printf '%s backup PostgreSQL + activos + cifrado local OK\n' "$(date --iso-8601=seconds)" >> "$LOG_DIR/backup-cycle.log"
