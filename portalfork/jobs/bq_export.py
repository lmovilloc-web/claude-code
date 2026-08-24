"""Job determinista: extraccion de datos de BigQuery. SIN LLM.

Automatiza lo que hoy haces a mano con tu perfil:
1. Ejecuta cada .sql de portalfork/queries/ contra BigQuery.
2. Guarda el resultado como CSV en EXPORT_DIR con fecha.
3. Escribe un manifiesto JSON (filas, columnas, bytes procesados).
4. (Opcional) avisa por Telegram.

Requisitos en el VPS:
    pip install google-cloud-bigquery
    # Cuenta de SERVICIO dedicada de solo lectura (no tu perfil personal):
    export GOOGLE_APPLICATION_CREDENTIALS=/root/portalfork/secrets/bq-reader.json
    export BQ_PROJECT=mi-proyecto
    export PORTALFORK_EXPORT_DIR=/root/portalfork/exports   # opcional

Regla de compliance: las queries deben devolver AGREGADOS o datos ya
disociados. Nada de exportar tablas con RUT/email/telefono a CSV plano;
si una query necesita datos personales, se discute antes (ver COMPLIANCE.md).
"""

from __future__ import annotations

import csv
import json
import os
import sys
from datetime import date
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
QUERIES_DIR = BASE / "queries"
EXPORT_DIR = Path(os.environ.get("PORTALFORK_EXPORT_DIR", BASE / "exports"))


def notify(text: str) -> None:
    """Aviso opcional por Telegram (usa las vars de Genesis si existen)."""
    token, chat = os.environ.get("GENESIS_ALPHA_TOKEN"), os.environ.get("GENESIS_CHAT_ID")
    if not (token and chat):
        return
    import urllib.parse
    import urllib.request

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": chat, "text": text}).encode()
    try:
        urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=15)
    except Exception as e:
        print(f"[warn] Telegram fallo: {e}", file=sys.stderr)


def main() -> int:
    try:
        from google.cloud import bigquery
    except ImportError:
        print("Instala el cliente: pip install google-cloud-bigquery", file=sys.stderr)
        return 2

    project = os.environ.get("BQ_PROJECT")
    if not project:
        print("Define BQ_PROJECT", file=sys.stderr)
        return 2

    sql_files = sorted(QUERIES_DIR.glob("*.sql"))
    if not sql_files:
        print(f"No hay queries en {QUERIES_DIR}; agrega archivos .sql", file=sys.stderr)
        return 1

    client = bigquery.Client(project=project)
    stamp = date.today().isoformat()
    out_dir = EXPORT_DIR / stamp
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest: list[dict] = []
    for sql_file in sql_files:
        name = sql_file.stem
        print(f"-> {name}")
        job = client.query(sql_file.read_text(encoding="utf-8"))
        rows = job.result()
        out_csv = out_dir / f"{name}.csv"
        with out_csv.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            fields = [field.name for field in rows.schema]
            writer.writerow(fields)
            n = 0
            for row in rows:
                writer.writerow([row.get(field) for field in fields])
                n += 1
        manifest.append(
            {
                "query": name,
                "rows": n,
                "columns": fields,
                "bytes_processed": job.total_bytes_processed,
                "csv": str(out_csv),
            }
        )

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    total_rows = sum(m["rows"] for m in manifest)
    notify(f"PortalFork BQ export {stamp}: {len(manifest)} queries, {total_rows} filas -> {out_dir}")
    print(f"OK: {len(manifest)} queries exportadas a {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
