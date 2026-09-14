#!/usr/bin/env python3
"""
Extrae el catastro de programas sociales del BIPS (Ministerio de Desarrollo Social y Familia)
y los criterios de focalización de cada informe de Evaluación y Monitoreo de Dipres.

Uso:
    python3 scripts/beneficios/bips_extract.py [--ano 2025] [--limite N] [--delay 0.8]

Salidas (en outputs/coda/beneficios/):
    bips-<ano>-indice.json      índice crudo del endpoint del BIPS
    bips-<ano>-programas.jsonl  un objeto por programa, con los campos extraídos
    bips-<ano>-programas.csv    la misma data, plana, para revisión humana

IMPORTANTE sobre el alcance de esta fuente:
    El BIPS y los informes de Dipres entregan CRITERIOS DE FOCALIZACIÓN Y PRIORIZACIÓN
    a nivel de diseño de política pública, en prosa. NO entregan requisitos operativos
    de postulación ("ser mayor de 60 años", "tramo RSH <= 60%").
    Esos requisitos vienen de la API de ChileAtiende. Las dos fuentes son complementarias:
    BIPS aporta universo, vigencia, presupuesto y focalización; ChileAtiende, la elegibilidad.
"""

import argparse
import csv
import html
import json
import os
import re
import subprocess
import sys
import time

BASE = "https://bips.ministeriodesarrollosocial.gob.cl/"
ENDPOINT = BASE + "resultadosTablaExDure/{ano}/0/0/0/11621/0"  # 11621 = Programa Social
CURL = "/usr/bin/curl"
UA = "Mozilla/5.0 (compatible; CODA-catastro/1.0)"

# Etiquetas del informe de Dipres cuyo valor es la línea siguiente.
CAMPOS_INFORME = {
    "Descripción:": "descripcion",
    "Año de inicio:": "ano_inicio",
    "Año de término:": "ano_termino",
    "Ejecutores:": "ejecutores",
    "Complementariedades informadas:": "complementariedades",
    "Criterios de focalización:": "criterios_focalizacion",
    "Criterios de priorización:": "criterios_priorizacion",
    "Población Objetivo:": "poblacion_objetivo",
    "Gasto por beneficiario:": "gasto_por_beneficiario",
}


def fetch(url, timeout=60):
    """Descarga una URL con curl. Devuelve texto, o None si falla."""
    try:
        r = subprocess.run(
            [CURL, "-s", "-L", "--max-time", str(timeout), "-A", UA,
             "-H", "X-Requested-With: XMLHttpRequest", url],
            capture_output=True, timeout=timeout + 15,
        )
        return r.stdout.decode("utf-8", errors="replace") if r.returncode == 0 else None
    except Exception:
        return None


def a_lineas(doc):
    """HTML -> lista de líneas de texto visible."""
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", doc, flags=re.S)
    t = html.unescape(re.sub("<[^>]+>", "\n", t))
    return [l.strip() for l in t.split("\n") if l.strip()]


def parsear_informe(doc):
    """Extrae los campos de un informe de Evaluación y Monitoreo de Dipres."""
    lineas = a_lineas(doc)
    out = {}

    for i, linea in enumerate(lineas):
        campo = CAMPOS_INFORME.get(linea)
        if campo and campo not in out and i + 1 < len(lineas):
            out[campo] = lineas[i + 1]

    # El propósito viene bajo su propio encabezado.
    for i, linea in enumerate(lineas):
        if linea == "Propósito" and i + 1 < len(lineas):
            out["proposito"] = lineas[i + 1]
            break

    # Hallazgos del desempeño, por dimensión.
    for dim in ("Focalización", "Eficiencia", "Eficacia"):
        m = re.search(rf"\d\.\s*{dim}\n(.+?)(?=\n\d\.\s|\nOtras dimensiones)", "\n".join(lineas), re.S)
        if m:
            out[f"hallazgo_{dim.lower().replace('ó','o').replace('í','i')}"] = " ".join(m.group(1).split())[:900]

    # Presupuesto y beneficiarios, donde aparezcan.
    texto = " ".join(lineas)
    m = re.search(r"Gasto por beneficiario \(M\$(\d{4})\)", texto)
    if m:
        out["gasto_beneficiario_moneda_ano"] = m.group(1)

    out["_lineas_informe"] = len(lineas)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ano", default="2025")
    ap.add_argument("--limite", type=int, default=0, help="0 = todos")
    ap.add_argument("--delay", type=float, default=0.8, help="segundos entre requests")
    ap.add_argument("--out", default=None)
    ap.add_argument("--reiniciar", action="store_true", help="ignora lo ya extraído y parte de cero")
    args = ap.parse_args()

    raiz = args.out or os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "outputs", "coda", "beneficios",
    )
    os.makedirs(raiz, exist_ok=True)

    # 1) Índice completo
    print(f"[1/3] Descargando índice de programas sociales {args.ano}…", flush=True)
    crudo = fetch(ENDPOINT.format(ano=args.ano))
    if not crudo:
        sys.exit("No se pudo obtener el índice del BIPS.")
    try:
        indice = json.loads(crudo)
    except json.JSONDecodeError:
        sys.exit(f"El endpoint no devolvió JSON. Primeros bytes: {crudo[:200]!r}")

    p_indice = os.path.join(raiz, f"bips-{args.ano}-indice.json")
    with open(p_indice, "w", encoding="utf-8") as f:
        json.dump(indice, f, ensure_ascii=False, indent=1)
    print(f"      {len(indice)} programas · {p_indice}", flush=True)

    objetivo = indice[: args.limite] if args.limite else indice

    # 2) Informe de cada programa — reanudable: salta lo ya extraído
    p_jsonl = os.path.join(raiz, f"bips-{args.ano}-programas.jsonl")
    hechos = set()
    if os.path.exists(p_jsonl) and not args.reiniciar:
        with open(p_jsonl, encoding="utf-8") as f:
            for linea in f:
                try:
                    hechos.add(json.loads(linea).get("id_programa"))
                except json.JSONDecodeError:
                    pass
    pendientes = [p for p in objetivo if p.get("id_programa") not in hechos]
    print(f"[2/3] {len(objetivo)} programas · {len(hechos)} ya extraídos · {len(pendientes)} pendientes", flush=True)

    fallidos = 0
    modo = "w" if args.reiniciar else "a"

    with open(p_jsonl, modo, encoding="utf-8") as f:
        for n, prog in enumerate(pendientes, 1):
            fila = {
                "id_programa": prog.get("id_programa"),
                "id_bips": prog.get("id_bips"),
                "periodo": prog.get("periodo"),
                "nombre": prog.get("nombre"),
                "ministerio": prog.get("ministerio"),
                "servicio": prog.get("servicio"),
                "tipo_oferta": prog.get("nombre_tipo_oferta"),
                "tipo_formulario": prog.get("tipo_formulario"),
                "url_informe": prog.get("url_informe"),
                "url_ficha": f"{BASE}programa/{prog.get('id_programa')}",
            }

            url = prog.get("url_informe")
            if url:
                doc = fetch(url)
                if doc:
                    fila.update(parsear_informe(doc))
                else:
                    fila["_error"] = "informe no descargado"
                    fallidos += 1
                time.sleep(args.delay)
            else:
                fila["_error"] = "sin url_informe"

            f.write(json.dumps(fila, ensure_ascii=False) + "\n")
            f.flush()

            if n % 25 == 0 or n == len(pendientes):
                print(f"      {n}/{len(pendientes)} · fallidos: {fallidos}", flush=True)

    # 3) CSV plano — se arma leyendo el jsonl, para no mantener todo en memoria
    print("[3/3] Escribiendo CSV…", flush=True)
    filas = []
    with open(p_jsonl, encoding="utf-8") as f:
        for linea in f:
            try:
                filas.append(json.loads(linea))
            except json.JSONDecodeError:
                pass
    columnas = [
        "id_programa", "id_bips", "periodo", "nombre", "ministerio", "servicio",
        "tipo_oferta", "ano_inicio", "ano_termino", "descripcion", "proposito",
        "poblacion_objetivo", "criterios_focalizacion", "criterios_priorizacion",
        "ejecutores", "complementariedades", "gasto_por_beneficiario",
        "hallazgo_focalizacion", "hallazgo_eficiencia", "hallazgo_eficacia",
        "url_ficha", "url_informe", "_error",
    ]
    p_csv = os.path.join(raiz, f"bips-{args.ano}-programas.csv")
    with open(p_csv, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=columnas, extrasaction="ignore")
        w.writeheader()
        w.writerows(filas)

    con_foc = sum(1 for r in filas if r.get("criterios_focalizacion"))
    print(f"\nListo. {len(filas)} programas · {con_foc} con criterios de focalización · {fallidos} fallidos")
    print(f"  {p_jsonl}\n  {p_csv}")


if __name__ == "__main__":
    main()
