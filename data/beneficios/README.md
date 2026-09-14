# Catastro de programas sociales del Estado — BIPS 2025

677 programas sociales extraídos del **BIPS** (Banco Integrado de Programas Sociales, Ministerio de Desarrollo Social y Familia) y de los informes de **Evaluación y Monitoreo de Dipres**.

Generado con `scripts/beneficios/bips_extract.py`. Datos públicos.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `bips-2025-indice.json` | Índice crudo del endpoint del BIPS: 677 registros |
| `bips-2025-programas.jsonl` | Un objeto por programa con los campos extraídos del informe |
| `bips-2025-programas.csv` | La misma data, plana, para revisión humana |

## Campos por programa

`id_programa` · `id_bips` · `periodo` · `nombre` · `ministerio` · `servicio` · `tipo_oferta` · `descripcion` · `proposito` · **`poblacion_objetivo`** · `criterios_focalizacion` · `criterios_priorizacion` · `ano_inicio` · `ano_termino` · `ejecutores` · `complementariedades` · `gasto_por_beneficiario` · `hallazgo_focalizacion` · `hallazgo_eficiencia` · `hallazgo_eficacia` · `url_ficha` · `url_informe`

## Qué sirve y qué no

**`poblacion_objetivo` es el campo útil** para derivar elegibilidad. Viene en prosa (mediana ~227 caracteres) pero con criterios concretos: edad, condición, exclusiones. Ejemplo real:

> *Salud Oral* — «Estudiantes de prekínder a 8º Básico matriculados en establecimientos financiados por el Estado. Se excluye a los estudiantes de 6 años (edad cubierta por la garantía GES de atención odontológica integral de 6 años del Ministerio de Salud).»

**`criterios_focalizacion` y `criterios_priorizacion` NO son los criterios del programa.** Son el juicio del evaluador de Dipres sobre si el diseño del programa es adecuado. Se incluyen porque ocasionalmente describen el criterio al criticarlo, pero no construir lógica de elegibilidad sobre ellos.

**El BIPS no tiene requisitos de postulación.** Es un sistema de monitoreo y evaluación presupuestaria. Los requisitos operativos —cómo se postula, qué documentos se necesitan— están en la **API de ChileAtiende** (`chileatiende.gob.cl/api/fichas`, requiere `access_token` solicitado al IPS). Las dos fuentes son complementarias: el BIPS aporta universo, vigencia, presupuesto y población objetivo; ChileAtiende, la elegibilidad operativa.

## Cosas a tener en cuenta

- **Más de un tercio no apunta a personas naturales.** Del análisis del texto de `poblacion_objetivo`: ~280 a personas, ~113 a instituciones (municipios, establecimientos, empresas), ~284 mixto o indefinido. Filtrar antes de cruzar contra ChileAtiende.
- **`ano_termino` no discrimina**: todos los programas del endpoint Ex-Dure figuran como «Permanente», porque por definición están en monitoreo activo.
- **Montos en M$** (miles de pesos) del año que indique la etiqueta. `M$ = miles`, `MM$ = millones`. El punto es separador de miles.

## Regenerar

```bash
python3 scripts/beneficios/bips_extract.py --ano 2025
```

El script es reanudable: retoma desde el `.jsonl` existente y solo baja lo que falta. `--reiniciar` parte de cero. El endpoint cubre desde 2012.

**Fuentes:** `bips.ministeriodesarrollosocial.gob.cl` · `evaluacionymonitoreosesdipres.gob.cl`
