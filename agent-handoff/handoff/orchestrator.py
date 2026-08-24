"""Orquestador: ejecuta agentes, resuelve herramientas y aplica handoffs.

Decisiones de diseno pensadas para no quemar tokens:

1. En cada handoff NO se arrastra el historial completo: el agente saliente
   escribe un resumen (parametro ``summary`` de la herramienta de handoff) y
   el agente entrante arranca con ese resumen + el ultimo mensaje del
   usuario. El coste de contexto por agente se mantiene plano aunque la
   conversacion crezca.
2. Cada agente puede tener ``token_budget``; si lo agota, el orquestador
   corta y devuelve lo que haya. Ademas hay un presupuesto global.
3. ``max_turns`` evita bucles de handoff (A -> B -> A -> ...).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .agent import HANDOFF_PREFIX, Agent


@dataclass
class RunResult:
    text: str
    final_agent: str
    turns: int
    handoffs: list[str] = field(default_factory=list)
    tokens_by_agent: dict[str, int] = field(default_factory=dict)

    @property
    def total_tokens(self) -> int:
        return sum(self.tokens_by_agent.values())


class Orchestrator:
    def __init__(
        self,
        agents: dict[str, Agent],
        entry_agent: str,
        max_turns: int = 12,
        global_token_budget: int = 0,
    ):
        if entry_agent not in agents:
            raise ValueError(f"Agente de entrada desconocido: {entry_agent}")
        for agent in agents.values():
            for target in agent.handoffs:
                if target not in agents:
                    raise ValueError(f"'{agent.name}' declara handoff a agente inexistente '{target}'")
        self.agents = agents
        self.entry_agent = entry_agent
        self.max_turns = max_turns
        self.global_token_budget = global_token_budget

    def run(self, user_message: str, history: list[dict] | None = None) -> RunResult:
        """Procesa un mensaje de usuario hasta obtener respuesta final.

        ``history`` es el historial previo de la conversacion (formato
        OpenAI); el llamador decide cuanto historial conservar entre turnos.
        """
        active = self.agents[self.entry_agent]
        messages: list[dict] = list(history or []) + [{"role": "user", "content": user_message}]

        handoffs: list[str] = []
        tokens_by_agent: dict[str, int] = {}
        turns = 0

        while turns < self.max_turns:
            turns += 1
            response = active.provider.chat(
                model=active.model,
                system=active.instructions,
                messages=messages,
                tools=active.all_tool_specs() or None,
                max_tokens=active.max_tokens,
                temperature=active.temperature,
            )
            tokens_by_agent[active.name] = tokens_by_agent.get(active.name, 0) + response.total_tokens

            if self._over_budget(active, tokens_by_agent):
                return RunResult(
                    text=response.text or "[presupuesto de tokens agotado]",
                    final_agent=active.name,
                    turns=turns,
                    handoffs=handoffs,
                    tokens_by_agent=tokens_by_agent,
                )

            if not response.tool_calls:
                return RunResult(
                    text=response.text or "",
                    final_agent=active.name,
                    turns=turns,
                    handoffs=handoffs,
                    tokens_by_agent=tokens_by_agent,
                )

            # Registrar la respuesta del asistente (con tool_calls) en el historial.
            messages.append(
                {
                    "role": "assistant",
                    "content": response.text,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {"name": tc.name, "arguments": _dumps(tc.arguments)},
                        }
                        for tc in response.tool_calls
                    ],
                }
            )

            handoff_target: Agent | None = None
            handoff_summary = ""
            for tc in response.tool_calls:
                if tc.name.startswith(HANDOFF_PREFIX):
                    target_name = tc.name[len(HANDOFF_PREFIX):]
                    if target_name in active.handoffs:
                        handoff_target = self.agents[target_name]
                        handoff_summary = str(tc.arguments.get("summary", ""))
                        messages.append(
                            {"role": "tool", "tool_call_id": tc.id, "content": f"Conversacion traspasada a {target_name}."}
                        )
                    else:
                        messages.append(
                            {"role": "tool", "tool_call_id": tc.id, "content": f"Error: no tienes permitido traspasar a '{target_name}'."}
                        )
                else:
                    tool = active.find_tool(tc.name)
                    if tool is None:
                        result = f"Error: herramienta desconocida '{tc.name}'."
                    else:
                        try:
                            result = tool.handler(**tc.arguments)
                        except Exception as e:  # el modelo debe ver el error, no romper el bucle
                            result = f"Error ejecutando {tc.name}: {e}"
                    messages.append({"role": "tool", "tool_call_id": tc.id, "content": str(result)})

            if handoff_target is not None:
                handoffs.append(handoff_target.name)
                active = handoff_target
                # Compactacion: el agente entrante arranca solo con el resumen
                # y la peticion original del usuario, no con todo el historial.
                messages = [
                    {
                        "role": "user",
                        "content": (
                            f"[Handoff recibido]\nResumen del agente anterior: {handoff_summary}\n\n"
                            f"Peticion original del usuario: {user_message}"
                        ),
                    }
                ]

        return RunResult(
            text="[limite de turnos alcanzado sin respuesta final]",
            final_agent=active.name,
            turns=turns,
            handoffs=handoffs,
            tokens_by_agent=tokens_by_agent,
        )

    def _over_budget(self, agent: Agent, tokens_by_agent: dict[str, int]) -> bool:
        if agent.token_budget and tokens_by_agent.get(agent.name, 0) >= agent.token_budget:
            return True
        if self.global_token_budget and sum(tokens_by_agent.values()) >= self.global_token_budget:
            return True
        return False


def _dumps(obj) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False)
