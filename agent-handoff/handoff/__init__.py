"""Arquitectura de agentes con handoff multi-proveedor.

Codigo original y autocontenido: no depende de ningun otro codigo de este
repositorio. Permite orquestar agentes sobre distintos LLMs (Grok, Llama
via Ollama/Groq, Claude) con traspaso de conversacion (handoff) y control
de gasto de tokens.
"""

from .agent import Agent
from .orchestrator import Orchestrator, RunResult
from .providers import AnthropicProvider, OpenAICompatibleProvider, Provider

__all__ = [
    "Agent",
    "Orchestrator",
    "RunResult",
    "Provider",
    "OpenAICompatibleProvider",
    "AnthropicProvider",
]
