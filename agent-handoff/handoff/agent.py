"""Definicion de agentes y del mecanismo de handoff.

Un ``Agent`` es una configuracion: nombre, instrucciones, proveedor+modelo,
herramientas propias y lista de agentes a los que puede traspasar la
conversacion. El traspaso se expone al modelo como una herramienta
``transfer_to_<agente>``; cuando el modelo la invoca, el orquestador cambia
de agente activo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from .providers import Provider

HANDOFF_PREFIX = "transfer_to_"


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    handler: Callable[..., str]

    def spec(self) -> dict:
        return {"name": self.name, "description": self.description, "parameters": self.parameters}


@dataclass
class Agent:
    name: str
    instructions: str
    provider: Provider
    model: str
    tools: list[Tool] = field(default_factory=list)
    handoffs: list[str] = field(default_factory=list)  # nombres de otros agentes
    max_tokens: int = 1024
    temperature: float = 0.2
    # Presupuesto de tokens por conversacion para ESTE agente (0 = sin limite).
    token_budget: int = 0

    def handoff_tool_specs(self) -> list[dict]:
        """Una herramienta transfer_to_X por cada agente destino permitido."""
        specs = []
        for target in self.handoffs:
            specs.append(
                {
                    "name": f"{HANDOFF_PREFIX}{target}",
                    "description": (
                        f"Traspasa la conversacion al agente '{target}'. Usala cuando la tarea "
                        f"corresponda a ese agente. Incluye en 'summary' todo el contexto que "
                        f"necesita para continuar sin releer el historial."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "summary": {
                                "type": "string",
                                "description": "Resumen del estado de la tarea y lo que se espera del siguiente agente.",
                            }
                        },
                        "required": ["summary"],
                    },
                }
            )
        return specs

    def all_tool_specs(self) -> list[dict]:
        return [t.spec() for t in self.tools] + self.handoff_tool_specs()

    def find_tool(self, name: str) -> Tool | None:
        for t in self.tools:
            if t.name == name:
                return t
        return None
