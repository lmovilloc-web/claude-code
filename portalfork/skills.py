"""Registro de skills de PortalFork — herramientas reales, una por función.

Cada agente recibe SOLO las skills que su config declara (menor privilegio).
Todas operan sobre archivos locales del VPS; ninguna skill ejecuta código
arbitrario ni toca credenciales.

  soporte    -> crear_ticket, registrar_supresion
  analista   -> leer_extractos, estado_ocs
  prospector -> buscar_leads
  router     -> (ninguna)
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE.parent / "agent-handoff"))

from handoff.agent import Tool  # noqa: E402

DATA = Path(os.environ.get("PORTALFORK_DATA_DIR", BASE / "data"))
EXPORTS = Path(os.environ.get("PORTALFORK_EXPORT_DIR", BASE / "exports"))
OC_LEDGER = BASE / "oc" / "ledger.jsonl"


def _append(path: Path, entry: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


# --- skills de soporte -----------------------------------------------------

def crear_ticket(asunto: str, detalle: str, contacto: str = "") -> str:
    ticket_id = f"PF-{uuid.uuid4().hex[:8].upper()}"
    _append(
        DATA / "tickets.jsonl",
        {
            "id": ticket_id,
            "ts": datetime.now(timezone.utc).isoformat(),
            "asunto": asunto[:200],
            "detalle": detalle[:2000],
            "contacto": contacto[:200],
            "estado": "abierto",
        },
    )
    return f"Ticket {ticket_id} creado. Un humano lo revisara."


def registrar_supresion(identificador_usuario: str, alcance: str = "todos los datos") -> str:
    _append(
        DATA / "supresiones.jsonl",
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "usuario": identificador_usuario[:200],
            "alcance": alcance[:500],
            "estado": "pendiente_ejecucion",
        },
    )
    return "Solicitud de eliminacion registrada; se procesara a la brevedad (Ley 21.719)."


# --- skills de analista ----------------------------------------------------

def leer_extractos(fecha: str = "") -> str:
    """Devuelve el manifiesto del export de esa fecha (o el mas reciente)."""
    if not EXPORTS.is_dir():
        return "No hay extractos aun; el job de BigQuery no ha corrido."
    dirs = sorted(d for d in EXPORTS.iterdir() if d.is_dir())
    if not dirs:
        return "No hay extractos aun."
    target = EXPORTS / fecha if fecha else dirs[-1]
    manifest = target / "manifest.json"
    if not manifest.is_file():
        return f"No existe extracto para '{fecha or target.name}'. Disponibles: {[d.name for d in dirs[-10:]]}"
    out = json.loads(manifest.read_text(encoding="utf-8"))
    # incluir las primeras filas de cada CSV para que el agente pueda citar cifras
    for item in out:
        csv_path = Path(item["csv"])
        if csv_path.is_file():
            lines = csv_path.read_text(encoding="utf-8").splitlines()
            item["muestra"] = lines[:15]
            item["csv"] = csv_path.name
    return json.dumps({"fecha": target.name, "queries": out}, ensure_ascii=False)


def estado_ocs(ultimas: int = 20) -> str:
    if not OC_LEDGER.is_file():
        return "Ledger de OCs vacio."
    lines = OC_LEDGER.read_text(encoding="utf-8").splitlines()
    entries = [json.loads(line) for line in lines[-int(ultimas):]]
    counts: dict[str, int] = {}
    for e in json.loads(json.dumps(entries)):
        counts[e["veredicto"]] = counts.get(e["veredicto"], 0) + 1
    resumen = [{"archivo": e["archivo"], "veredicto": e["veredicto"], "motivos": e["motivos"]} for e in entries]
    return json.dumps({"totales": counts, "ultimas": resumen}, ensure_ascii=False)


# --- skills de prospector --------------------------------------------------

def buscar_leads(consulta: str, max_resultados: int = 6) -> str:
    key = os.environ.get("TAVILY_API_KEY")
    if not key:
        return "TAVILY_API_KEY no configurada; no puedo buscar."
    from handoff.providers import Provider

    data = Provider._post_json(
        "https://api.tavily.com/search",
        {"Authorization": f"Bearer {key}"},
        {"query": consulta, "max_results": min(int(max_resultados), 10), "search_depth": "basic"},
    )
    results = [
        {"titulo": r.get("title"), "url": r.get("url"), "resumen": (r.get("content") or "")[:500]}
        for r in data.get("results", [])
    ]
    return json.dumps(results, ensure_ascii=False)


# --- registro --------------------------------------------------------------

REGISTRY: dict[str, Tool] = {
    "crear_ticket": Tool(
        name="crear_ticket",
        description="Crea un ticket de soporte para revision humana. Devuelve el ID.",
        parameters={
            "type": "object",
            "properties": {
                "asunto": {"type": "string"},
                "detalle": {"type": "string"},
                "contacto": {"type": "string", "description": "email u otro contacto que el usuario haya dado voluntariamente"},
            },
            "required": ["asunto", "detalle"],
        },
        handler=crear_ticket,
    ),
    "registrar_supresion": Tool(
        name="registrar_supresion",
        description="Registra una solicitud de eliminacion de datos personales (Ley 21.719).",
        parameters={
            "type": "object",
            "properties": {
                "identificador_usuario": {"type": "string"},
                "alcance": {"type": "string"},
            },
            "required": ["identificador_usuario"],
        },
        handler=registrar_supresion,
    ),
    "leer_extractos": Tool(
        name="leer_extractos",
        description="Lee el manifiesto y muestras del export de BigQuery (agregados locales).",
        parameters={
            "type": "object",
            "properties": {"fecha": {"type": "string", "description": "YYYY-MM-DD; vacio = mas reciente"}},
        },
        handler=leer_extractos,
    ),
    "estado_ocs": Tool(
        name="estado_ocs",
        description="Resumen del ledger de ordenes de compra procesadas.",
        parameters={
            "type": "object",
            "properties": {"ultimas": {"type": "integer", "description": "cuantas entradas recientes"}},
        },
        handler=estado_ocs,
    ),
    "buscar_leads": Tool(
        name="buscar_leads",
        description="Busca empresas candidatas en fuentes publicas (Tavily). Solo empresas, no personas.",
        parameters={
            "type": "object",
            "properties": {
                "consulta": {"type": "string"},
                "max_resultados": {"type": "integer"},
            },
            "required": ["consulta"],
        },
        handler=buscar_leads,
    ),
}
