"""Servidor HTTP minimo para desplegar la arquitectura en tu servidor.

Arranque:
    pip install fastapi uvicorn pyyaml
    HANDOFF_CONFIG=config.yaml uvicorn handoff.server:app --host 0.0.0.0 --port 8080

Endpoint:
    POST /chat  {"message": "..."}
    -> {"text": "...", "final_agent": "...", "handoffs": [...], "tokens": {...}}
"""

from __future__ import annotations

import os

from .config import load_orchestrator

try:
    from fastapi import FastAPI
    from pydantic import BaseModel
except ImportError as e:
    raise RuntimeError("Instala las dependencias del servidor: pip install fastapi uvicorn") from e

app = FastAPI(title="Agent Handoff Server")
_orchestrator = load_orchestrator(os.environ.get("HANDOFF_CONFIG", "config.yaml"))


class ChatRequest(BaseModel):
    message: str


@app.post("/chat")
def chat(req: ChatRequest) -> dict:
    result = _orchestrator.run(req.message)
    return {
        "text": result.text,
        "final_agent": result.final_agent,
        "handoffs": result.handoffs,
        "turns": result.turns,
        "tokens": result.tokens_by_agent,
        "total_tokens": result.total_tokens,
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True, "entry_agent": _orchestrator.entry_agent, "agents": list(_orchestrator.agents)}
