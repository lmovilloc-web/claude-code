#!/usr/bin/env bash
# PASO 1 — Recuperacion: estado real del VPS antes de tocar nada.
# Solo LEE; no cambia nada. Ejecutar desde el Mac: ./01_diagnostico.sh
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

echo "=== 1. VPS vivo ==="
vps 'uptime && df -h / && free -h'

echo
echo "=== 2. Servicios ==="
vps 'systemctl status genesis-alpha genesis-beta --no-pager 2>&1 | grep -E "genesis-|Active|Main PID" || true'
vps 'systemctl --user status openclaw-gateway --no-pager 2>&1 | grep -E "Active|Main PID" || echo "openclaw-gateway: no accesible como user service via ssh (normal si no hay lingering)"'

echo
echo "=== 3. Estado de capital de los agentes ==="
vps 'for f in /root/genesis/alpha/estado.json /root/genesis/beta/estado.json; do echo "--- $f"; python3 -m json.tool "$f" 2>/dev/null || echo "NO EXISTE"; done'

echo
echo "=== 4. Actividad reciente (logs) ==="
vps 'ls -lt /root/genesis/logs/ 2>/dev/null | head -15 || echo "sin logs"'
vps 'journalctl -u genesis-alpha --since "7 days ago" --no-pager 2>/dev/null | tail -30 || true'
vps 'journalctl -u genesis-beta  --since "7 days ago" --no-pager 2>/dev/null | tail -30 || true'

echo
echo "=== 5. Seguridad actual ==="
vps 'ufw status verbose || true'
vps 'grep -E "^(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication)" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null || echo "sshd: valores por defecto (revisar)"'
vps 'ss -tlnp | grep -v 127.0.0.1 || echo "solo loopback + ssh escuchando (bien)"'
vps 'last -n 10 || true'
vps 'stat -c "%a %n" /root/.genesis_env 2>/dev/null || echo "/root/.genesis_env NO EXISTE"'

echo
echo "=== 6. Sesiones/procesos sospechosos ==="
vps 'who; ps aux --sort=-%cpu | head -12'

echo
echo ">>> Revisa la salida completa antes de pasar al 02 (standby) y 03 (hardening)."
echo ">>> Billing: revisar a mano consolas de Anthropic, OpenAI y Hetzner."
