"""Automatizacion de Ordenes de Compra (OC): pipeline hibrido.

Patron "el LLM propone, el gate determinista dispone" (mismo del handoff
maestro): el modelo SOLO extrae campos del documento; la validacion y la
decision son codigo puro.

Flujo:
  intake/*.txt|.json  ->  [LLM extrae campos]  ->  [gate determinista]
      ok      -> ledger.jsonl + processed/  (+ aviso Telegram)
      dudosa  -> review/   (requiere humano)
      invalida-> rejected/ (con motivo)

Uso:
    export GROQ_API_KEY=...                 # o define OC_BASE_URL/OC_API_KEY_ENV/OC_MODEL
    python3 jobs/oc_processor.py            # procesa todo el intake
Deja los PDF ya convertidos a texto en intake/ (pdftotext archivo.pdf).
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE.parent / "agent-handoff"))

from handoff.providers import OpenAICompatibleProvider, Provider  # noqa: E402

INTAKE = BASE / "oc" / "intake"
PROCESSED = BASE / "oc" / "processed"
REVIEW = BASE / "oc" / "review"
REJECTED = BASE / "oc" / "rejected"
LEDGER = BASE / "oc" / "ledger.jsonl"

# Limites del gate: ajustalos a tu operacion real.
MAX_TOTAL_CLP = int(os.environ.get("OC_MAX_TOTAL_CLP", "5000000"))
REQUIRED_FIELDS = ["numero_oc", "proveedor", "rut_proveedor", "fecha", "total_clp", "items"]

EXTRACT_PROMPT = """Extrae los campos de esta orden de compra chilena y responde SOLO con JSON:
{"numero_oc": str, "proveedor": str, "rut_proveedor": str, "fecha": "YYYY-MM-DD",
 "total_clp": int, "items": [{"descripcion": str, "cantidad": num, "precio_unitario": int}],
 "confianza": num entre 0 y 1}
Si un campo no aparece en el documento usa null. No inventes valores.

DOCUMENTO:
"""


def extract_fields(provider: Provider, model: str, text: str) -> dict:
    resp = provider.chat(
        model=model,
        system="Eres un extractor de datos de documentos. Respondes unicamente JSON valido.",
        messages=[{"role": "user", "content": EXTRACT_PROMPT + text[:12000]}],
        max_tokens=1500,
        temperature=0.0,
    )
    raw = (resp.text or "").strip()
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError(f"el modelo no devolvio JSON: {raw[:200]}")
    return json.loads(match.group(0))


def valid_rut(rut: str | None) -> bool:
    """Valida RUT chileno con digito verificador (modulo 11)."""
    if not rut:
        return False
    rut = rut.replace(".", "").replace(" ", "").upper()
    if not re.fullmatch(r"\d{7,8}-[\dK]", rut):
        return False
    body, dv = rut.split("-")
    total, factor = 0, 2
    for digit in reversed(body):
        total += int(digit) * factor
        factor = 2 if factor == 7 else factor + 1
    rest = 11 - (total % 11)
    expected = "0" if rest == 11 else "K" if rest == 10 else str(rest)
    return dv == expected


def gate(data: dict) -> tuple[str, list[str]]:
    """Decision determinista: 'ok' | 'review' | 'rejected' + motivos."""
    issues: list[str] = []
    for field in REQUIRED_FIELDS:
        if data.get(field) in (None, "", []):
            issues.append(f"falta campo: {field}")
    if issues:
        return "rejected", issues

    if not valid_rut(data["rut_proveedor"]):
        issues.append(f"RUT invalido: {data['rut_proveedor']}")

    try:
        items_total = sum(int(i["cantidad"] * i["precio_unitario"]) for i in data["items"])
        # tolerancia 1% por redondeos/IVA declarado aparte
        if abs(items_total - int(data["total_clp"])) > max(1000, int(data["total_clp"]) * 0.01):
            issues.append(f"total no cuadra: items={items_total} vs declarado={data['total_clp']}")
    except (KeyError, TypeError, ValueError):
        issues.append("items ilegibles, no se pudo verificar el total")

    if int(data.get("total_clp") or 0) > MAX_TOTAL_CLP:
        issues.append(f"total {data['total_clp']} CLP excede el limite {MAX_TOTAL_CLP} (requiere humano)")

    if float(data.get("confianza") or 0) < 0.8:
        issues.append(f"confianza baja del extractor: {data.get('confianza')}")

    return ("review" if issues else "ok"), issues


def main() -> int:
    for d in (INTAKE, PROCESSED, REVIEW, REJECTED):
        d.mkdir(parents=True, exist_ok=True)

    files = sorted(p for p in INTAKE.iterdir() if p.suffix in (".txt", ".json") and p.is_file())
    if not files:
        print("intake vacio, nada que procesar")
        return 0

    # Extractor configurable; por defecto Llama 70B en Groq (barato y con DPA).
    provider = OpenAICompatibleProvider(
        base_url=os.environ.get("OC_BASE_URL", "https://api.groq.com/openai/v1"),
        api_key=os.environ.get(os.environ.get("OC_API_KEY_ENV", "GROQ_API_KEY"), ""),
    )
    model = os.environ.get("OC_MODEL", "llama-3.3-70b-versatile")

    for path in files:
        print(f"-> {path.name}")
        try:
            if path.suffix == ".json":
                data = json.loads(path.read_text(encoding="utf-8"))  # ya estructurada
            else:
                data = extract_fields(provider, model, path.read_text(encoding="utf-8"))
            verdict, issues = gate(data)
        except Exception as e:
            verdict, issues, data = "rejected", [f"error de procesamiento: {e}"], {}

        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "archivo": path.name,
            "veredicto": verdict,
            "motivos": issues,
            "oc": data,
        }
        with LEDGER.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        dest = {"ok": PROCESSED, "review": REVIEW, "rejected": REJECTED}[verdict]
        path.rename(dest / path.name)
        print(f"   {verdict}" + (f" ({'; '.join(issues)})" if issues else ""))

    print(f"Ledger: {LEDGER}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
