"""Prospeccion de clientes para PortalFork.cl — hibrido con humano al final.

1. [Determinista] Busca candidatos con Tavily (solo fuentes publicas).
2. [LLM] El agente 'prospector' (config.yaml) califica cada lead y redacta
   un BORRADOR de contacto.
3. [Determinista] Todo queda en leads/pendientes_revision.jsonl.
   NADA SE ENVIA AUTOMATICAMENTE: tu revisas y apruebas cada contacto.
   (Requisito de Ley 21.719 y anti-spam; ademas los errores de outreach
   automatico ya estan en la lista de "errores cometidos" del proyecto.)

Uso:
    export TAVILY_API_KEY=... ANTHROPIC_API_KEY=...
    python3 jobs/prospector_scan.py "empresas de arriendo de maquinaria en Chile"
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE.parent / "agent-handoff"))

from handoff.config import load_orchestrator  # noqa: E402
from handoff.providers import Provider  # noqa: E402

LEADS_FILE = BASE / "leads" / "pendientes_revision.jsonl"


def tavily_search(query: str, max_results: int = 8) -> list[dict]:
    import os

    key = os.environ.get("TAVILY_API_KEY")
    if not key:
        raise SystemExit("Define TAVILY_API_KEY")
    data = Provider._post_json(
        "https://api.tavily.com/search",
        {"Authorization": f"Bearer {key}"},
        {"query": query, "max_results": max_results, "search_depth": "basic"},
    )
    return [
        {"titulo": r.get("title"), "url": r.get("url"), "resumen": (r.get("content") or "")[:600]}
        for r in data.get("results", [])
    ]


def main() -> int:
    if len(sys.argv) < 2:
        print('Uso: python3 jobs/prospector_scan.py "descripcion del cliente objetivo"')
        return 2
    query = sys.argv[1]

    resultados = tavily_search(query)
    if not resultados:
        print("Sin resultados de busqueda")
        return 1
    print(f"{len(resultados)} candidatos encontrados; calificando con el agente prospector...")

    orch = load_orchestrator(str(BASE / "config.yaml"))
    orch.entry_agent = "prospector"  # saltamos el router: la tarea ya esta clasificada

    LEADS_FILE.parent.mkdir(parents=True, exist_ok=True)
    guardados = 0
    for lead in resultados:
        prompt = (
            "Califica este lead para PortalFork.cl y redacta el borrador de contacto.\n"
            f"Cliente objetivo buscado: {query}\n"
            f"Lead (fuente publica): {json.dumps(lead, ensure_ascii=False)}"
        )
        result = orch.run(prompt)
        with LEADS_FILE.open("a", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "busqueda": query,
                        "lead": lead,
                        "evaluacion": result.text,
                        "tokens": result.total_tokens,
                        "estado": "pendiente_revision_humana",
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
        guardados += 1

    print(f"{guardados} leads calificados en {LEADS_FILE} — revisar y aprobar a mano antes de contactar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
