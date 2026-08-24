# server-ops — recuperación, standby y protección del VPS Genesis

Scripts para ejecutar **desde tu Mac** (la llave `~/.ssh/genesis_key` vive ahí).
Todos usan la config de `00_env.sh` (puedes sobreescribir con variables de
entorno `VPS_HOST`, `VPS_USER`, `VPS_KEY`).

```bash
chmod +x server-ops/*.sh
```

## Orden de ejecución

| Paso | Script | Qué hace | ¿Cambia algo? |
|------|--------|----------|----------------|
| 1 | `01_diagnostico.sh` | Estado real: uptime, servicios, capital de los agentes, logs de 7 días, firewall, sshd, puertos abiertos, últimos logins | No, solo lee |
| 2 | `02_standby_genesis.sh` | Respalda `/root/genesis` + `.genesis_env` a `~/genesis_backups/` en tu Mac, luego `stop` + `disable` de genesis-alpha/beta | Sí (reversible) |
| 3 | `03_harden.sh` | Parches + unattended-upgrades, SSH solo-llave, fail2ban, UFW solo 22, permisos 600 en secretos | Sí |
| — | `04_reactivar_genesis.sh` | Saca a Genesis del standby cuando decidas | Sí |

**Regla de oro del hardening:** después del paso 3, prueba el acceso SSH en una
terminal **nueva** antes de cerrar la sesión actual. El script valida
`sshd -t` antes de recargar y se auto-revierte si la config es inválida, pero
verifica igual.

## Rotación de credenciales (hacer a mano, importante)

El handoff maestro circuló con la IP del servidor y la lista de variables de
entorno, y `/root/.genesis_env` guarda claves en texto plano (incluyendo
passwords de Fiverr/Reddit/Gumroad). Después del hardening:

1. Rota `ANTHROPIC_API_KEY` y `OPENAI_API_KEY` en sus consolas (y revisa el
   billing de abril→agosto de paso).
2. Rota `TAVILY_API_KEY`, `RESEND_API_KEY`, `BROWSERLESS_API_KEY`,
   `LEMONSQUEEZY_API_KEY` y los tokens de los bots de Telegram (@BotFather →
   `/revoke`).
3. Cambia los passwords de Fiverr / Reddit / Gumroad y actualiza el env.
4. Considera mover secretos a un archivo por servicio o a `systemd`
   `LoadCredential=` en vez de un solo env global.

## Qué NO tocan estos scripts

- El gateway de OpenClaw (escucha solo en `127.0.0.1:18789`, no está expuesto).
- El Supabase de producción de RentaCheck (`bvarllxfdfgntbzbfqny`).
- Los `estado.json` de los agentes: quedan intactos en el VPS **y** respaldados
  en tu Mac.
