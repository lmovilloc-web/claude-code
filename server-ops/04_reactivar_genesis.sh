#!/usr/bin/env bash
# Reactivar los agentes Genesis cuando lo decidas.
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

vps 'systemctl enable --now genesis-alpha genesis-beta && rm -f /root/genesis/STANDBY.txt'
vps 'systemctl status genesis-alpha genesis-beta --no-pager | grep -E "genesis-|Active|Main PID"'
echo ">>> Genesis reactivados."
