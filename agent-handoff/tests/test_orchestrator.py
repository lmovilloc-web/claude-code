"""Pruebas del orquestador con un proveedor simulado (sin red ni claves).

Ejecutar:  python -m unittest discover -s tests -v   (desde agent-handoff/)
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from handoff.agent import Agent, Tool
from handoff.orchestrator import Orchestrator
from handoff.providers import ChatResponse, Provider, ToolCall


class FakeProvider(Provider):
    """Devuelve respuestas predefinidas en orden y registra las llamadas."""

    def __init__(self, responses: list[ChatResponse]):
        self.responses = list(responses)
        self.calls: list[dict] = []

    def chat(self, model, system, messages, tools=None, max_tokens=1024, temperature=0.2):
        self.calls.append({"model": model, "messages": messages, "tools": tools})
        return self.responses.pop(0)


def text(t: str, tokens: int = 10) -> ChatResponse:
    return ChatResponse(text=t, input_tokens=tokens, output_tokens=tokens)


def call(name: str, args: dict, tokens: int = 10) -> ChatResponse:
    return ChatResponse(text=None, tool_calls=[ToolCall(id="tc1", name=name, arguments=args)], input_tokens=tokens, output_tokens=tokens)


class HandoffTests(unittest.TestCase):
    def test_direct_answer_without_handoff(self):
        p = FakeProvider([text("hola!")])
        orch = Orchestrator({"router": Agent("router", "instr", p, "m")}, "router")
        result = orch.run("hola")
        self.assertEqual(result.text, "hola!")
        self.assertEqual(result.final_agent, "router")
        self.assertEqual(result.handoffs, [])

    def test_handoff_compacts_context(self):
        router_p = FakeProvider([call("transfer_to_coder", {"summary": "usuario quiere un script"})])
        coder_p = FakeProvider([text("aqui esta el script")])
        agents = {
            "router": Agent("router", "instr", router_p, "llama", handoffs=["coder"]),
            "coder": Agent("coder", "instr", coder_p, "grok"),
        }
        result = Orchestrator(agents, "router").run("hazme un script")

        self.assertEqual(result.text, "aqui esta el script")
        self.assertEqual(result.final_agent, "coder")
        self.assertEqual(result.handoffs, ["coder"])
        # El agente entrante recibe SOLO el resumen compactado, no el historial.
        coder_messages = coder_p.calls[0]["messages"]
        self.assertEqual(len(coder_messages), 1)
        self.assertIn("usuario quiere un script", coder_messages[0]["content"])
        self.assertIn("hazme un script", coder_messages[0]["content"])

    def test_handoff_not_allowed_is_rejected(self):
        router_p = FakeProvider([
            call("transfer_to_writer", {"summary": "x"}),  # writer no esta permitido
            text("lo resuelvo yo entonces"),
        ])
        agents = {
            "router": Agent("router", "instr", router_p, "m", handoffs=["coder"]),
            "coder": Agent("coder", "instr", FakeProvider([]), "m"),
            "writer": Agent("writer", "instr", FakeProvider([]), "m"),
        }
        result = Orchestrator(agents, "router").run("hola")
        self.assertEqual(result.final_agent, "router")
        self.assertEqual(result.handoffs, [])
        # El modelo vio el error de traspaso no permitido en el 2o turno.
        second_call_msgs = router_p.calls[1]["messages"]
        self.assertTrue(any("no tienes permitido" in (m.get("content") or "") for m in second_call_msgs))

    def test_local_tool_execution(self):
        p = FakeProvider([
            call("sumar", {"a": 2, "b": 3}),
            text("el resultado es 5"),
        ])
        tool = Tool(
            name="sumar",
            description="suma dos numeros",
            parameters={"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}},
            handler=lambda a, b: str(a + b),
        )
        agent = Agent("calc", "instr", p, "m", tools=[tool])
        result = Orchestrator({"calc": agent}, "calc").run("cuanto es 2+3?")
        self.assertEqual(result.text, "el resultado es 5")
        msgs = p.calls[1]["messages"]
        self.assertTrue(any(m.get("role") == "tool" and m.get("content") == "5" for m in msgs))

    def test_token_budget_cuts_run(self):
        p = FakeProvider([call("transfer_to_coder", {"summary": "x"}, tokens=600)])
        agents = {
            "router": Agent("router", "instr", p, "m", handoffs=["coder"], token_budget=1000),
            "coder": Agent("coder", "instr", FakeProvider([]), "m"),
        }
        result = Orchestrator(agents, "router").run("hola")
        # 600 entrada + 600 salida = 1200 >= 1000: corta antes de traspasar.
        self.assertEqual(result.final_agent, "router")
        self.assertEqual(result.tokens_by_agent["router"], 1200)

    def test_max_turns_stops_handoff_loops(self):
        # A y B se traspasan mutuamente para siempre.
        a_p = FakeProvider([call("transfer_to_b", {"summary": "ping"}) for _ in range(10)])
        b_p = FakeProvider([call("transfer_to_a", {"summary": "pong"}) for _ in range(10)])
        agents = {
            "a": Agent("a", "instr", a_p, "m", handoffs=["b"]),
            "b": Agent("b", "instr", b_p, "m", handoffs=["a"]),
        }
        result = Orchestrator(agents, "a", max_turns=6).run("hola")
        self.assertEqual(result.turns, 6)
        self.assertIn("limite de turnos", result.text)

    def test_config_validation_rejects_unknown_handoff(self):
        agents = {"a": Agent("a", "i", FakeProvider([]), "m", handoffs=["fantasma"])}
        with self.assertRaises(ValueError):
            Orchestrator(agents, "a")


if __name__ == "__main__":
    unittest.main()
