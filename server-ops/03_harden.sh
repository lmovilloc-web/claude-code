#!/usr/bin/env bash
# PASO 3 — Proteccion del VPS. Idempotente; disenado para NO dejarte fuera:
# valida sshd_config antes de recargar y nunca cierra el puerto 22.
# Ejecutar DESPUES de revisar el diagnostico (01) y con el backup del 02 hecho.
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

vps 'bash -s' <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "=== 1. Parches del sistema + actualizaciones automaticas ==="
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q unattended-upgrades fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo
echo "=== 2. SSH: solo llave, sin password ==="
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/90-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
MaxAuthTries 3
LoginGraceTime 20
X11Forwarding no
EOF
# validar ANTES de recargar: si esta roto, no recargamos y avisamos
if sshd -t; then
  systemctl reload ssh || systemctl reload sshd
  echo "sshd recargado con hardening."
else
  rm /etc/ssh/sshd_config.d/90-hardening.conf
  echo "ERROR: sshd_config invalido; hardening SSH revertido, revisa a mano." >&2
fi

echo
echo "=== 3. fail2ban (bloqueo de fuerza bruta ssh) ==="
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 4
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban
fail2ban-client status sshd || true

echo
echo "=== 4. Firewall: solo 22 entrante ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable
ufw status verbose

echo
echo "=== 5. Permisos de secretos ==="
chmod 600 /root/.genesis_env 2>/dev/null && echo "/root/.genesis_env -> 600" || echo "/root/.genesis_env no existe"
chmod -R o-rwx /root/genesis 2>/dev/null || true

echo
echo "=== 6. Verificacion final ==="
ss -tlnp | awk 'NR==1 || $4 !~ /127\.0\.0\.1|\[::1\]/'
echo ">>> Solo deberia escuchar publico el puerto 22."
REMOTE

echo
echo ">>> Hardening aplicado. NO cierres esta sesion sin antes probar en OTRA terminal:"
echo ">>>   ssh -i \$VPS_KEY $VPS_USER@$VPS_HOST 'echo ok'"
