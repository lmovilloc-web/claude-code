# PortalFork.cl — agentes de operación

Agentes propios de PortalFork sobre el motor `agent-handoff/` de este repo.
**Independientes de Genesis** (solo comparten el VPS): env propio, servicios
propios, datos propios. Todo corre **en el VPS** vía systemd; los modelos van
por API con DPA (nada corre en tu Mac).

Cada agente se define en tres capas:

1. **Soul** (`souls/<agente>.md`): identidad, misión, reglas duras. Archivo
   versionado; editas el alma sin tocar código y reinicias el servicio.
2. **Skills** (`skills.py` + `skills:` en `config.yaml`): herramientas
   reales con menor privilegio — cada agente recibe SOLO las suyas.
3. **Security** (`security:` en `config.yaml`, aplicado por `server.py`):
   público o interno-con-token, rate limit/hora y tope de input por agente.

| Agente | Modelo | Skills | Seguridad |
|---|---|---|---|
| **router** | Llama 3.1 8B (Groq) | ninguna (solo traspasa) | público, 60 req/h, 3k chars |
| **soporte** | Llama 3.3 70B (Groq) | `crear_ticket`, `registrar_supresion` | público, 30 req/h, 4k chars |
| **prospector** | Grok 3 (xAI) | `buscar_leads` (solo empresas) | interno (token), 20 req/h |
| **analista** | DeepSeek V3 (Together, hosting EE.UU.) | `leer_extractos`, `estado_ocs` | interno (token), 20 req/h |

Los modelos se cambian editando `config.yaml` (proveedor + modelo por
agente); Anthropic y Ollama quedan como proveedores opcionales comentados.
Regla que sí se mantiene: DeepSeek/Qwen solo auto-hospedados o en hosting
occidental con DPA — nunca la API de plataforma china con datos de clientes
(COMPLIANCE.md).

Jobs deterministas (sin LLM o híbridos, por systemd timer):

- `jobs/bq_export.py` — export diario de BigQuery (07:00) con service
  account de solo lectura. Sin LLM.
- `jobs/oc_processor.py` — OCs cada 30 min: LLM extrae, gate determinista
  decide (RUT módulo 11, cuadratura, tope CLP, confianza) → ledger.
- `jobs/prospector_scan.py` — prospección a demanda → cola de revisión
  humana (`leads/pendientes_revision.jsonl`); nada se envía solo.

## Seguridad del servidor de agentes

- Escucha **solo en 127.0.0.1:8090**; el portal lo consume vía reverse
  proxy. Los agentes internos exigen header `X-PortalFork-Token`
  (`PORTALFORK_ADMIN_TOKEN` en `/root/.portalfork_env`).
- Auditoría en `data/audit.jsonl` con RUT/email/teléfono **redactados**.
- La unidad systemd corre con `ProtectSystem=strict` + `NoNewPrivileges`:
  el proceso solo puede escribir en `data/`, `leads/` y `oc/`.
- Los agentes públicos no tienen skills de lectura de datos internos;
  los que las tienen no son públicos. Ver COMPLIANCE.md para Ley 21.719,
  normas de EE.UU. y política de modelos.

## Despliegue en el VPS (después de server-ops/03_harden.sh)

```bash
# en el VPS
git clone <tu-repo> /root/portalfork-src
bash /root/portalfork-src/portalfork/deploy/install.sh
vi /root/.portalfork_env          # claves + PORTALFORK_ADMIN_TOKEN
systemctl restart portalfork-soporte

# probar (público)
curl -s 127.0.0.1:8090/chat -H 'Content-Type: application/json' \
  -d '{"message":"como recupero mi contraseña?"}'
# probar (interno)
curl -s 127.0.0.1:8090/chat -H 'Content-Type: application/json' \
  -H "X-PortalFork-Token: $PORTALFORK_ADMIN_TOKEN" \
  -d '{"agent":"analista","message":"resumen del ultimo extracto"}'
```

## Editar el alma de un agente

```bash
vi souls/soporte.md
systemctl restart portalfork-soporte   # recarga souls y config
```

## Verificación local (sin claves ni red)

```bash
cd agent-handoff && python3 -m unittest discover -s tests   # motor: 7 tests
cd ../portalfork && python3 -c "import sys; sys.path[:0]=['.','../agent-handoff']; \
  from skills import REGISTRY; from handoff.config import load_orchestrator; \
  print(list(load_orchestrator('config.yaml', skill_registry=REGISTRY).agents))"
```
