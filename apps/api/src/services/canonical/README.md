# Capa canónica (D1)

Contrato de datos **único y normalizado** del perfil financiero, con **procedencia por dato**
(fuente, frescura, confianza). Unifica lo que hoy está disperso: `userFinancialSources` (renta/
empleo), parse CMF (deuda), transacciones (flujo) y la reconciliación D7 (renta).

> "Todo lo demás se enchufa acá": los consumidores leen `CanonicalProfile` en vez de cada fuente
> cruda, y cada campo sabe de dónde salió y qué tan confiable es.

## Piezas

| Archivo | Rol |
|---|---|
| `types.ts` | `CanonicalProfile` (identidad/renta/deuda/empleo), `CanonicalFact<T>` = valor + `Provenance` |
| `buildCanonicalProfile.ts` | Builder **puro** (insumos → contrato). Testeable sin DB |
| `assembleCanonicalProfile.ts` | Fetch + build: reúne D7 (renta), gov (empleo/fiscal), CMF (deuda) |

## Procedencia

Cada `CanonicalFact` lleva `{ source, asOf, confidence }`. La renta reutiliza la confianza de D7
(reconciliación); el resto usa una confianza base por fuente (CMF/SII 0.9, AFP 0.85, cartola 0.7…).

## Qué NO hace (todavía)

- No cambia el scoring (sigue en `userRiskProfile` con su lógica). D1 es la capa de LECTURA
  unificada; migrar consumidores a ella es un paso posterior.
- El RUT crudo no se materializa (solo se guarda su hash) → `identidad.rut` queda para cuando se
  conecte Registro Civil. Hoy se puebla `identidad.nombre` (declarado).
- La escritura/ingesta con gate de consentimiento (D2) + auditoría-por-consulta se enchufa cuando
  existan los fetch automatizados (D3/D5/D6/scraper) — el gate ya está listo (`assertSourceConsent`).
