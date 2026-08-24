#!/usr/bin/env bash
# Configuracion compartida de los scripts de operacion.
# Estos scripts se ejecutan DESDE TU MAC; entran al VPS por SSH.

export VPS_HOST="${VPS_HOST:-128.140.32.207}"
export VPS_USER="${VPS_USER:-root}"
export VPS_KEY="${VPS_KEY:-$HOME/.ssh/genesis_key}"

vps() {
  ssh -i "$VPS_KEY" -o ConnectTimeout=15 "$VPS_USER@$VPS_HOST" "$@"
}
