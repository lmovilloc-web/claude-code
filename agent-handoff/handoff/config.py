"""Carga de la arquitectura completa desde un YAML (ver config.example.yaml)."""

from __future__ import annotations

from .agent import Agent
from .orchestrator import Orchestrator
from .providers import provider_from_config


def load_orchestrator(path: str) -> Orchestrator:
    try:
        import yaml
    except ImportError as e:
        raise RuntimeError("Instala pyyaml: pip install pyyaml") from e

    with open(path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    providers = {name: provider_from_config({**pcfg, "name": name}) for name, pcfg in cfg["providers"].items()}

    agents: dict[str, Agent] = {}
    for name, acfg in cfg["agents"].items():
        provider_name = acfg["provider"]
        if provider_name not in providers:
            raise ValueError(f"El agente '{name}' usa un proveedor no definido: '{provider_name}'")
        agents[name] = Agent(
            name=name,
            instructions=acfg["instructions"],
            provider=providers[provider_name],
            model=acfg["model"],
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
