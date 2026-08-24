# PortalFork.cl — agentes de operación

Cinco agentes sobre el motor `agent-handoff/` de este repo, con la regla del
proyecto: **el LLM propone, el código determinista dispone**. Solo lo que
necesita lenguaje usa LLM; extracción de datos y validaciones son Python puro.

| Agente | Tipo | Dónde vive | Qué hace |
|--------|------|-----------|----------|
| **router** | LLM (Qwen local, gratis) | `config.yaml` | Clasifica y traspasa; no resuelve |
| **soporte** | LLM (Haiku) | `config.yaml` + servicio HTTP | Ayuda rápida a usuarios del portal, loopback :8090 |
| **prospector** | Híbrido | `config.yaml` + `jobs/prospector_scan.py` | Tavily busca leads públicos → LLM califica y redacta borrador → cola de revisión humana |
| **analista** | LLM (Sonnet) | `config.yaml` | Responde preguntas de negocio sobre los extractos de BigQuery |
| **datos (BQ)** | Determinista, sin LLM | `jobs/bq_export.py` + timer | Ejecuta tus queries y exporta CSV+manifiesto a diario |
| **OCs** | Híbrido | `jobs/oc_processor.py` + timer | LLM extrae campos de la OC → gate determinista (RUT módulo 11, cuadratura de totales, tope CLP, confianza) → ok / revisión / rechazo + ledger |

## Estructura

```
portalfork/
├── config.yaml            # agentes LLM (alma + contexto de PortalFork)
├── COMPLIANCE.md          # Ley 21.719, EE.UU., modelos chinos, seguridad
├── queries/*.sql          # tus queries de BigQuery (agregados)
├── jobs/
│   ├── bq_export.py       # export diario (sin LLM)
│   ├── oc_processor.py    # pipeline de órdenes de compra
│   └── prospector_scan.py # prospección con revisión humana
└── deploy/
    ├── install.sh         # instalación en el VPS
    └── systemd/           # servicio de soporte + timers de jobs
```

## Despliegue en el VPS (después de server-ops/03_harden.sh)

```bash
# en el VPS
git clone <tu-repo> /root/portalfork-src
bash /root/portalfork-src/portalfork/deploy/install.sh
vi /root/.portalfork_env        # completar claves (separadas de Genesis)
systemctl restart portalfork-soporte

# probar soporte
curl -s 127.0.0.1:8090/chat -H 'Content-Type: application/json' \
  -d '{"message":"como recupero mi contraseña del portal?"}'

# router local (opcional pero recomendado)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:14b       # o qwen2.5:7b si el CPX32 va justo
```

Los jobs corren por systemd timer (BQ a las 07:00, OCs cada 30 min). El
prospector se lanza a demanda:
`python3 jobs/prospector_scan.py "empresas X en Chile"`.

## Decisiones ya tomadas (y por qué)

- **Aislado de Genesis**: env propio (`/root/.portalfork_env`), servicios
  propios. Un bug aquí no toca los agentes en standby, y viceversa.
- **Outreach nunca automático**: los borradores quedan en
  `leads/pendientes_revision.jsonl`. Ver COMPLIANCE.md.
- **Modelos chinos solo auto-hospedados** (Ollama). Ver COMPLIANCE.md.
- **Soporte sin herramientas peligrosas**: expuesto a usuarios ⇒ solo texto.
- **BigQuery con service account de lectura**, no tu perfil personal.
