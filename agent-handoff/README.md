# Agent Handoff — arquitectura de agentes multi-proveedor

Sistema de agentes con **handoff** (traspaso de conversación entre agentes)
que puedes desplegar en tu propio servidor. Diseñado para **no quemar tokens**:
un agente *router* con un modelo barato o local (Llama en Ollama) clasifica
cada petición y solo escala a modelos caros (Grok, Claude) cuando la tarea lo
exige.

> Código original y autocontenido: no depende de nada más de este repositorio.
> Solo Python 3.10+, sin dependencias para el núcleo (`pyyaml` para config,
> `fastapi`+`uvicorn` solo si usas el servidor HTTP).

## Cómo funciona el handoff

1. Cada agente declara en su configuración a qué agentes puede traspasar
   (`handoffs: [coder, writer]`).
2. El orquestador expone eso al modelo como herramientas
   `transfer_to_<agente>` con un parámetro `summary` obligatorio.
3. Cuando el modelo invoca el traspaso, el orquestador cambia de agente
   activo y **compacta el contexto**: el agente entrante recibe solo el
   resumen + la petición original del usuario, no el historial completo.
   Así el coste de contexto se mantiene plano aunque haya varios saltos.

Controles anti-desperdicio:

- `token_budget` por agente y `global_token_budget` por conversación.
- `max_turns` corta bucles de handoff (A → B → A → …).
- Un agente solo puede traspasar a los destinos que su config permite; un
  intento fuera de la lista se rechaza y el modelo ve el error.

## Estructura

```
agent-handoff/
├── handoff/
│   ├── providers.py      # Grok / Groq / Ollama (API estilo OpenAI) + Anthropic
│   ├── agent.py          # definición de agentes y herramientas de handoff
│   ├── orchestrator.py   # bucle de ejecución, handoffs, presupuestos
│   ├── config.py         # carga de todo desde YAML
│   ├── cli.py            # chat interactivo en terminal
│   └── server.py         # API HTTP (FastAPI) para tu servidor
├── config.example.yaml   # arquitectura de ejemplo: router → especialistas
└── tests/                # pruebas con proveedor simulado (sin claves)
```

## Uso rápido

```bash
cd agent-handoff
pip install pyyaml
cp config.example.yaml config.yaml     # edítalo a tu gusto

# claves solo de los proveedores que uses:
export XAI_API_KEY=...        # Grok
export GROQ_API_KEY=...       # Llama en Groq
export ANTHROPIC_API_KEY=...  # Claude
# Ollama local no necesita clave (ollama pull llama3.1:8b)

python -m handoff.cli --config config.yaml
# o un solo mensaje:
python -m handoff.cli --config config.yaml --once "revisa este error de python: ..."
```

## Desplegar como servicio en tu servidor

```bash
pip install pyyaml fastapi uvicorn
HANDOFF_CONFIG=config.yaml uvicorn handoff.server:app --host 0.0.0.0 --port 8080
```

```bash
curl -s localhost:8080/chat -H 'Content-Type: application/json' \
  -d '{"message": "resume este texto: ..."}'
# → {"text": "...", "final_agent": "writer", "handoffs": ["writer"],
#    "tokens": {"router": 350, "writer": 1200}, ...}
```

La respuesta siempre incluye la ruta de agentes y los tokens gastados por
agente, para que veas exactamente dónde se va el presupuesto.

## Añadir agentes o proveedores

Todo es YAML. Un proveedor nuevo compatible con OpenAI (vLLM, Together,
LM Studio…) solo necesita `base_url` y su variable de clave. Un agente nuevo
necesita `provider`, `model`, `instructions` y opcionalmente `handoffs`,
`token_budget`, `max_tokens`, `temperature`.

También puedes darle herramientas propias a un agente por código (clase
`Tool` en `handoff/agent.py`): nombre, descripción, JSON Schema de parámetros
y un `handler` de Python. El orquestador ejecuta la herramienta y devuelve el
resultado al modelo.

## Pruebas

```bash
cd agent-handoff
python -m unittest discover -s tests -v
```

Usan un proveedor simulado: verifican handoff, compactación de contexto,
rechazo de traspasos no permitidos, ejecución de herramientas, presupuestos
de tokens y corte de bucles, sin necesitar red ni claves.

## Consejos para que los agentes "sí terminen las tareas"

Si tus subagentes fallan en completar tareas, casi siempre es por una de
estas causas, y esta arquitectura las ataca así:

- **Contexto perdido entre agentes** → el `summary` del handoff es
  obligatorio y las instrucciones del router exigen incluir datos concretos.
- **Modelo demasiado pequeño para la tarea** → el router no resuelve, solo
  clasifica; cada especialista usa el modelo mínimo que aguanta su dominio.
- **Bucles infinitos** → `max_turns` y presupuestos cortan y devuelven lo
  que haya, con la ruta y el gasto visibles para diagnosticar.
- **Instrucciones vagas** → cada agente tiene un rol estrecho y criterios
  explícitos de cuándo traspasar.
