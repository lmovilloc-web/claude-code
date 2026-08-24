"""Servidor de agentes PortalFork — corre EN el VPS, con seguridad por agente.

Arranque (lo hace systemd):
    HANDOFF_CONFIG=/root/portalfork-src/portalfork/config.yaml \
    uvicorn server:app --host 127.0.0.1 --port 8090 --app-dir /root/portalfork-src/portalfork

Medidas de seguridad (configurables por agente en config.yaml -> security):
- Solo los agentes marcados como publicos son accesibles sin token.
- Los agentes internos exigen header X-PortalFork-Token (var PORTALFORK_ADMIN_TOKEN).
- Rate limit por cliente y por agente (peticiones/hora).
- Tope de tamano de input por agente.
- Auditoria en data/audit.jsonl con RUT/email/telefonos redactados.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE.parent / "agent-handoff"))

from fastapi import FastAPI, Header, HTTPException, Request  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from handoff.config import load_orchestrator  # noqa: E402
from skills import REGISTRY  # noqa: E402

CONFIG_PATH = os.environ.get("HANDOFF_CONFIG", str(BASE / "config.yaml"))
AUDIT = Path(os.environ.get("PORTALFORK_DATA_DIR", BASE / "data")) / "audit.jsonl"
ADMIN_TOKEN = os.environ.get("PORTALFORK_ADMIN_TOKEN", "")

app = FastAPI(title="PortalFork Agents", docs_url=None, redoc_url=None)
_orch = load_orchestrator(CONFIG_PATH, skill_registry=REGISTRY)

# security por agente desde el YAML (fuera del motor generico)
import yaml  # noqa: E402

_raw = yaml.safe_load(Path(CONFIG_PATH).read_text(encoding="utf-8"))
_SEC: dict[str, dict] = {name: (acfg.get("security") or {}) for name, acfg in _raw["agents"].items()}

_hits: dict[str, deque] = defaultdict(deque)  # clave "agente:cliente" -> timestamps


def _rate_ok(agent: str, client: str, per_hour: int) -> bool:
    key = f"{agent}:{client}"
    now = time.time()
    q = _hits[key]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= per_hour:
        return False
    q.append(now)
    return True


_REDACT = [
    (re.compile(r"\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b"), "[RUT]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[EMAIL]"),
    (re.compile(r"\+?56\s?9\s?\d{4}\s?\d{4}"), "[FONO]"),
]


def _redact(text: str) -> str:
    for pattern, repl in _REDACT:
        text = pattern.sub(repl, text)
    return text


def _audit(entry: dict) -> None:
    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    with AUDIT.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


class ChatRequest(BaseModel):
    message: str
    agent: str | None = None  # por defecto, el entry_agent (router)


@app.post("/chat")
def chat(req: ChatRequest, request: Request, x_portalfork_token: str | None = Header(default=None)) -> dict:
    agent = req.agent or _orch.entry_agent
    if agent not in _orch.agents:
        raise HTTPException(404, "agente desconocido")

    sec = _SEC.get(agent, {})
    client = request.client.host if request.client else "?"

    # 1. agentes internos: exigen token de admin
    if not sec.get("public", False):
        if not ADMIN_TOKEN or x_portalfork_token != ADMIN_TOKEN:
            raise HTTPException(403, "agente interno: requiere X-PortalFork-Token")

    # 2. tope de input
    max_chars = int(sec.get("max_input_chars", 4000))
    if len(req.message) > max_chars:
        raise HTTPException(413, f"mensaje demasiado largo (max {max_chars} caracteres)")

    # 3. rate limit por cliente
    per_hour = int(sec.get("rate_per_hour", 30))
    if not _rate_ok(agent, client, per_hour):
        raise HTTPException(429, "limite de peticiones alcanzado; intenta mas tarde")

    # 4. ejecutar con el agente pedido como entrada
    prev_entry = _orch.entry_agent
    try:
        _orch.entry_agent = agent
        result = _orch.run(req.message)
    finally:
        _orch.entry_agent = prev_entry

    _audit(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "agente": agent,
            "cliente": client,
            "mensaje": _redact(req.message)[:500],
            "ruta": [agent, *result.handoffs],
            "tokens": result.tokens_by_agent,
        }
    )
    return {
        "text": result.text,
        "final_agent": result.final_agent,
        "handoffs": result.handoffs,
        "total_tokens": result.total_tokens,
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True, "agents": list(_orch.agents)}
