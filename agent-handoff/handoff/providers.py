"""Capa de proveedores: una interfaz comun sobre distintas APIs de LLM.

Soporta dos familias de API:

- ``OpenAICompatibleProvider``: cualquier endpoint compatible con
  ``/chat/completions`` de OpenAI. Eso cubre Grok (api.x.ai), Groq
  (api.groq.com), Ollama local (localhost:11434/v1), Together, vLLM, etc.
- ``AnthropicProvider``: la API nativa de Anthropic (``/v1/messages``).

Ambas normalizan la respuesta a ``ChatResponse`` para que el orquestador
no sepa ni le importe que proveedor hay debajo.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class ChatResponse:
    text: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


class Provider:
    """Interfaz base. Implementa ``chat`` en cada subclase."""

    name = "base"

    def chat(
        self,
        model: str,
        system: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.2,
    ) -> ChatResponse:
        raise NotImplementedError

    # -- utilidades compartidas -------------------------------------------

    @staticmethod
    def _post_json(url: str, headers: dict, payload: dict, timeout: float = 120.0) -> dict:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", **headers},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise ProviderError(f"HTTP {e.code} de {url}: {body[:500]}") from e


class ProviderError(RuntimeError):
    pass


class OpenAICompatibleProvider(Provider):
    """Grok, Groq, Ollama, vLLM... cualquier API estilo OpenAI.

    Ejemplos de ``base_url``:
      - Grok (xAI):   https://api.x.ai/v1
      - Groq (Llama): https://api.groq.com/openai/v1
      - Ollama local: http://localhost:11434/v1
    """

    def __init__(self, base_url: str, api_key: str | None = None, name: str = "openai-compatible"):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or ""
        self.name = name

    def chat(self, model, system, messages, tools=None, max_tokens=1024, temperature=0.2) -> ChatResponse:
        payload: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "system", "content": system}, *messages],
        }
        if tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "parameters": t.get("parameters", {"type": "object", "properties": {}}),
                    },
                }
                for t in tools
            ]

        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        data = self._post_json(f"{self.base_url}/chat/completions", headers, payload)
        choice = data["choices"][0]["message"]
        usage = data.get("usage") or {}

        tool_calls = []
        for tc in choice.get("tool_calls") or []:
            fn = tc["function"]
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            tool_calls.append(ToolCall(id=tc.get("id", ""), name=fn["name"], arguments=args))

        return ChatResponse(
            text=choice.get("content"),
            tool_calls=tool_calls,
            input_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
        )


class AnthropicProvider(Provider):
    """API nativa de Anthropic (/v1/messages)."""

    def __init__(self, api_key: str | None = None, base_url: str = "https://api.anthropic.com", name: str = "anthropic"):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.base_url = base_url.rstrip("/")
        self.name = name

    def chat(self, model, system, messages, tools=None, max_tokens=1024, temperature=0.2) -> ChatResponse:
        payload: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system,
            "messages": self._to_anthropic_messages(messages),
        }
        if tools:
            payload["tools"] = [
                {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "input_schema": t.get("parameters", {"type": "object", "properties": {}}),
                }
                for t in tools
            ]

        headers = {"x-api-key": self.api_key, "anthropic-version": "2023-06-01"}
        data = self._post_json(f"{self.base_url}/v1/messages", headers, payload)

        text_parts, tool_calls = [], []
        for block in data.get("content", []):
            if block["type"] == "text":
                text_parts.append(block["text"])
            elif block["type"] == "tool_use":
                tool_calls.append(ToolCall(id=block["id"], name=block["name"], arguments=block.get("input", {})))

        usage = data.get("usage") or {}
        return ChatResponse(
            text="".join(text_parts) or None,
            tool_calls=tool_calls,
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
        )

    @staticmethod
    def _to_anthropic_messages(messages: list[dict]) -> list[dict]:
        """Convierte el formato interno (estilo OpenAI) al de Anthropic.

        El orquestador guarda el historial en formato OpenAI; aqui se
        traducen los mensajes de tool a bloques tool_result/tool_use.
        """
        out: list[dict] = []
        for m in messages:
            role, content = m["role"], m.get("content")
            if role == "tool":
                out.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": m.get("tool_call_id", ""),
                                "content": content or "",
                            }
                        ],
                    }
                )
            elif role == "assistant" and m.get("tool_calls"):
                blocks: list[dict] = []
                if content:
                    blocks.append({"type": "text", "text": content})
                for tc in m["tool_calls"]:
                    fn = tc["function"]
                    try:
                        args = json.loads(fn.get("arguments") or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    blocks.append({"type": "tool_use", "id": tc.get("id", ""), "name": fn["name"], "input": args})
                out.append({"role": "assistant", "content": blocks})
            else:
                out.append({"role": role, "content": content or ""})
        return out


def provider_from_config(cfg: dict) -> Provider:
    """Crea un proveedor desde un dict de configuracion (ver config.example.yaml)."""
    kind = cfg.get("kind", "openai")
    api_key = cfg.get("api_key") or os.environ.get(cfg.get("api_key_env", ""), "")
    if kind == "anthropic":
        return AnthropicProvider(api_key=api_key, base_url=cfg.get("base_url", "https://api.anthropic.com"), name=cfg.get("name", "anthropic"))
    if kind == "openai":
        return OpenAICompatibleProvider(base_url=cfg["base_url"], api_key=api_key, name=cfg.get("name", "openai-compatible"))
    raise ValueError(f"Tipo de proveedor desconocido: {kind}")
