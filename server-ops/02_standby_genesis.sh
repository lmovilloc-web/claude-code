#!/usr/bin/env bash
# PASO 2 — Standby: detiene los agentes Genesis SIN perder nada.
# 1) Respalda estado + logs + env a un tarball local (en tu Mac).
# 2) Detiene y deshabilita genesis-alpha y genesis-beta (no arrancan al reboot).
# 3) Deja marcador de standby con fecha para el futuro reinicio.
# El gateway de OpenClaw NO se toca (escucha solo en loopback).
# Reactivar luego con: ./04_reactivar_genesis.sh
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/genesis_backups}"
mkdir -p "$BACKUP_DIR"

echo "=== 1. Respaldo de estado a $BACKUP_DIR/genesis_$STAMP.tar.gz ==="
vps 'tar czf - /root/genesis /root/.genesis_env 2>/dev/null' > "$BACKUP_DIR/genesis_$STAMP.tar.gz"
ls -lh "$BACKUP_DIR/genesis_$STAMP.tar.gz"
tar tzf "$BACKUP_DIR/genesis_$STAMP.tar.gz" | head -5

echo
echo "=== 2. Deteniendo y deshabilitando agentes ==="
vps 'systemctl stop genesis-alpha genesis-beta; systemctl disable genesis-alpha genesis-beta; systemctl status genesis-alpha genesis-beta --no-pager | grep -E "genesis-|Active" || true'

echo
echo "=== 3. Marcador de standby ==="
vps "echo 'standby desde $STAMP — reactivar con systemctl enable --now genesis-alpha genesis-beta' > /root/genesis/STANDBY.txt && cat /root/genesis/STANDBY.txt"

echo
echo ">>> Agentes en standby. Estado y logs respaldados en tu Mac."
echo ">>> Verifica el backup: tar tzf $BACKUP_DIR/genesis_$STAMP.tar.gz"
