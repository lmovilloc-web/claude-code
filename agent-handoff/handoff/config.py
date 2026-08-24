"""Carga de la arquitectura completa desde un YAML (ver config.example.yaml).

Cada agente puede definir sus instrucciones de dos formas:
- ``instructions``: texto inline en el YAML.
- ``instructions_file``: ruta (relativa al YAML) a un archivo "soul" con la
  identidad completa del agente. Permite versionar y editar el alma sin
  tocar la configuracion.

Y sus herramientas via ``skills: [nombre, ...]``, resueltas contra un
``skill_registry`` (dict nombre -> Tool) que aporta el proyecto que usa el
motor. El motor no define skills propias.
"""

from __future__ import annotations

from pathlib import Path

from .agent import Agent, Tool
from .orchestrator import Orchestrator
from .providers import provider_from_config


def load_orchestrator(path: str, skill_registry: dict[str, Tool] | None = None) -> Orchestrator:
    try:
        import yaml
    except ImportError as e:
        raise RuntimeError("Instala pyyaml: pip install pyyaml") from e

    base_dir = Path(path).resolve().parent
    with open(path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    providers = {name: provider_from_config({**pcfg, "name": name}) for name, pcfg in cfg["providers"].items()}
    registry = skill_registry or {}

    agents: dict[str, Agent] = {}
    for name, acfg in cfg["agents"].items():
        provider_name = acfg["provider"]
        if provider_name not in providers:
            raise ValueError(f"El agente '{name}' usa un proveedor no definido: '{provider_name}'")

        if "instructions_file" in acfg:
            soul_path = base_dir / acfg["instructions_file"]
            if not soul_path.is_file():
                raise ValueError(f"Soul del agente '{name}' no encontrada: {soul_path}")
            instructions = soul_path.read_text(encoding="utf-8")
        elif "instructions" in acfg:
            instructions = acfg["instructions"]
        else:
            raise ValueError(f"El agente '{name}' necesita 'instructions' o 'instructions_file'")

        tools: list[Tool] = []
        for skill_name in acfg.get("skills", []):
            if skill_name not in registry:
                raise ValueError(
                    f"El agente '{name}' pide la skill '{skill_name}' que no esta en el registro "
                    f"(disponibles: {sorted(registry) or 'ninguna'})"
                )
            tools.append(registry[skill_name])

        agents[name] = Agent(
            name=name,
            instructions=instructions,
            provider=providers[provider_name],
            model=acfg["model"],
            tools=tools,
            handoffs=acfg.get("handoffs", []),
            max_tokens=acfg.get("max_tokens", 1024),
            temperature=acfg.get("temperature", 0.2),
            token_budget=acfg.get("token_budget", 0),
        )

    run_cfg = cfg.get("run", {})
    return Orchestrator(
        agents=agents,
        entry_agent=cfg["entry_agent"],
        max_turns=run_cfg.get("max_turns", 12),
        global_token_budget=run_cfg.get("global_token_budget", 0),
    )
