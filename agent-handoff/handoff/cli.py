"""CLI interactiva: python -m handoff.cli --config config.yaml"""

from __future__ import annotations

import argparse

from .config import load_orchestrator


def main() -> None:
    parser = argparse.ArgumentParser(description="Chat con la arquitectura de agentes con handoff")
    parser.add_argument("--config", default="config.yaml", help="Ruta al YAML de configuracion")
    parser.add_argument("--once", metavar="MENSAJE", help="Envia un solo mensaje y sal")
    args = parser.parse_args()

    orch = load_orchestrator(args.config)

    def ask(msg: str) -> None:
        result = orch.run(msg)
        route = " -> ".join([orch.entry_agent, *result.handoffs])
        print(f"\n[{route} | {result.total_tokens} tokens]\n{result.text}\n")

    if args.once:
        ask(args.once)
        return

    print("Escribe tu mensaje (Ctrl+D para salir):")
    while True:
        try:
            msg = input("> ").strip()
        except EOFError:
            break
        if msg:
            ask(msg)


if __name__ == "__main__":
    main()
