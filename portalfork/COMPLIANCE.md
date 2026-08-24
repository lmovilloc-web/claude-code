# Compliance — datos personales y elección de modelos

## Ley 21.719 (Chile) — reglas operativas para estos agentes

- **Minimización**: el agente de soporte pide solo los datos mínimos; las
  queries de BigQuery exportan agregados o datos disociados, nunca tablas
  con RUT/email/teléfono a CSV plano.
- **Fuentes públicas**: el prospector solo usa información pública del lead
  y el primer contacto no revela datos personales de terceros.
- **Consentimiento y supresión**: si un usuario o lead pide no ser
  contactado o borrar sus datos → se elimina de `leads/` y de cualquier
  almacenamiento, de inmediato. El agente de soporte registra y escala toda
  solicitud de supresión.
- **Humano en el loop para outreach**: ningún contacto comercial se envía
  automáticamente; todo queda en `leads/pendientes_revision.jsonl` para
  aprobación manual.
- **Transferencias internacionales**: enviar datos personales a una API de
  LLM es una transferencia a un tercero. Usar solo proveedores con DPA
  (acuerdo de tratamiento de datos) y sin entrenamiento sobre tus datos
  (Anthropic y OpenAI API lo ofrecen por defecto en API). Aun así:
  **anonimiza antes de enviar cuando sea posible**.

## EE.UU. (si el portal tiene usuarios americanos)

- No hay ley federal única: aplican leyes estatales (CCPA/CPRA California,
  etc.). Las mismas prácticas de arriba (minimización, supresión a demanda,
  no vender datos, DPA con proveedores) te dejan razonablemente cubierto.
  Si escalas en EE.UU., agrega política de privacidad explícita en el
  portal y mecanismo de opt-out.

## "Opus chino" (Qwen, DeepSeek, GLM…) — cómo usarlos sin riesgo

La calidad de Qwen 2.5/3 y DeepSeek V3/R1 es real y competitiva para
clasificación, extracción y soporte. El riesgo no es el modelo, es **dónde
corre**:

| Opción | ¿Datos salen del servidor? | Veredicto |
|--------|---------------------------|-----------|
| API de plataforma china (DeepSeek API, DashScope…) | Sí, a jurisdicción sin adecuación y sin DPA útil | ❌ No usar con datos de clientes |
| Pesos abiertos auto-hospedados (Ollama/vLLM en tu VPS) | No | ✅ Recomendado |
| Pesos abiertos en proveedor occidental (Groq, Together, Fireworks) | Sí, pero con DPA estándar | ⚠️ Aceptable con contrato revisado |

Por eso `config.yaml` usa `qwen2.5:14b` **en Ollama local** para el router:
calidad china, datos residentes en tu VPS, costo cero por token. Ojo: el
CPX32 (4 vCPU, 8 GB RAM, sin GPU) corre un 14B cuantizado lento (~2-5
tok/s); para el router (respuestas de 1 línea) alcanza, pero si se hace
cuello de botella baja a `qwen2.5:7b` o `llama3.1:8b`.

## Seguridad del sitio (que el agente no sea vulnerable)

- El servicio de soporte escucha **solo en 127.0.0.1:8090**; el portal lo
  consume vía reverse proxy con auth. Nunca exponer el puerto.
- **Prompt injection**: el agente de soporte no tiene herramientas de
  escritura ni acceso a datos de otros usuarios; aunque un usuario lo
  manipule, lo peor que obtiene es texto. Mantener esa regla al agregar
  herramientas: nunca darle al agente expuesto al público acceso directo a
  BigQuery, al ledger de OCs ni a secretos.
- Los jobs con credenciales (BigQuery, OCs) no reciben input de usuarios
  del portal; corren por timer con archivos locales.
- Cuenta de servicio de BigQuery **de solo lectura** y dedicada — deja de
  usar tu perfil personal para la extracción.
