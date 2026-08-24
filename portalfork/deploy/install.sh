#!/usr/bin/env bash
# Instala los agentes PortalFork en el VPS. Ejecutar EN el VPS como root:
#   git clone <tu-repo> /root/portalfork-src   (o scp/rsync de agent-handoff/ y portalfork/)
#   bash /root/portalfork-src/portalfork/deploy/install.sh
set -euo pipefail

SRC="$(cd "$(dirname "$0")/../.." && pwd)"   # raiz del repo (contiene agent-handoff/ y portalfork/)
ENV_FILE=/root/.portalfork_env

apt-get install -y -q python3-pip >/dev/null
pip3 install -q pyyaml fastapi uvicorn google-cloud-bigquery

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
# Secretos de PortalFork — separados de los de Genesis. chmod 600.
ANTHROPIC_API_KEY=
TAVILY_API_KEY=
BQ_PROJECT=
GOOGLE_APPLICATION_CREDENTIALS=/root/portalfork/secrets/bq-reader.json
OC_MAX_TOTAL_CLP=5000000
HANDOFF_CONFIG=/root/portalfork-src/portalfork/config.yaml
EOF
  chmod 600 "$ENV_FILE"
  echo ">>> Completa las claves en $ENV_FILE"
fi

mkdir -p /root/portalfork/secrets && chmod 700 /root/portalfork/secrets

for unit in "$SRC"/portalfork/deploy/systemd/*; do
  cp "$unit" /etc/systemd/system/
done
systemctl daemon-reload

# Soporte (API HTTP en loopback) arranca ya; los timers de jobs quedan listos
systemctl enable --now portalfork-soporte.service
systemctl enable --now portalfork-bq.timer portalfork-oc.timer

systemctl status portalfork-soporte --no-pager | head -5
systemctl list-timers 'portalfork-*' --no-pager || true
echo ">>> Listo. El portal consume el soporte en http://127.0.0.1:8090/chat (tunel/reverse proxy, no abrir el puerto)."
