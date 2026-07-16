# Encaje regulatorio de CODA en la Ley Fintech (21.521) — julio 2026

> Análisis interno. No constituye asesoría legal; validar las conclusiones marcadas
> ⚖️ con abogado regulatorio antes de decidir.
>
> Fuentes primarias: Ley 21.521; NCG 502 (ene-2024, registro/autorización/obligaciones
> de prestadores); NCG 503 (acreditación de asesores de inversión); NCG 514 (SFA) y su
> modificación NCG 569 (01-jun-2026, incorpora Anexo Técnico 3 y **aplaza el SFA a
> julio 2027**). Documentos propios: `WeGroup Drive/CODA - Anexo Regulatorio CMF - v.1.docx`
> (16-feb-2026), `Checklist inscripción.xlsx`, Informe Normativo CMF ene-2026 (Anexo 3 +
> Iniciación de Pagos).

## 1. Qué servicios de la ley calzan con lo que CODA hace HOY

| Actividad CODA (en producción) | Figura Ley 21.521 | ¿Regulada? |
|---|---|---|
| Score crediticio propio + diagnóstico + recomendación de créditos/tarjetas/refinanciamiento con comisión por originación | **Asesoría crediticia** (art. 3) | **Sí — requiere inscripción RPSF + autorización CMF previa** |
| Recomendación de fondos mutuos, depósitos a plazo, APV ("Explorar fondos mutuos y APV" en el panel) | **Asesoría de inversión** | **Sí — además exige acreditación NCG 503 de las personas que emiten/supervisan recomendaciones y políticas de suitability** |
| Consumo de datos del SFA (futuro) | **PSBI** (Prestador de Servicios Basados en Información) | Sí — habilitación PSBI bajo NCG 514/569; **exigible recién con el SFA vivo (jul-2027)** |
| Subida manual de cartolas por el usuario | No es SFA (el usuario aporta sus propios documentos) | No per se — pero los datos alimentan la asesoría regulada |
| Dividir cuenta (split) | No es servicio de pago (no custodia, no ejecuta transferencias) | No (así está bien argumentado en el Anexo Regulatorio §2) |
| CODA Empresas | Potencialmente otras figuras | Apagado por flag hasta autorización — correcto |

## 2. ⚖️ El punto crítico: CODA está operando en vivo sin inscripción ni autorización

- La NCG 502 exige **inscripción en el Registro de Prestadores de Servicios
  Financieros Y autorización previa de la CMF** para prestar asesoría crediticia;
  la sola inscripción no habilita a operar. Quienes ya operaban tuvieron plazo
  hasta el 03-feb-2025; los nuevos entrantes deben estar inscritos y autorizados
  **antes** de ofrecer el servicio.
- Estado real: www.codafinance.cl está público con registro abierto, score y
  recomendaciones con fees de originación configurados; el footer dice
  "inscripción en trámite", pero el `Checklist inscripción.xlsx` tiene **los 24
  ítems en Pendiente** (ni la solicitud electrónica RPSF está presentada).
- Mitigantes de hecho: sin marketing masivo, usuarios ≈ fundadores/pruebas, sin
  ingresos por originación aún, catálogo con tasas "referenciales de fuentes
  públicas". Pero el criterio legal de la NCG 502 es dirigir la **oferta** del
  servicio a residentes en Chile — un sitio público con signup abierto calza.

**Opciones (decidir con abogado):**
1. **Beta cerrada** mientras se tramita: signup por invitación/lista de espera,
   sin catálogo con fees activos. Baja el riesgo a casi cero y no mata el
   desarrollo. (Cambio chico: flag de invitación en el registro.)
2. **Acelerar el dossier RPSF** (la ruta del checklist) y asumir el interinato
   como riesgo consciente y acotado.
3. Reetiquetar temporalmente el módulo de productos como "información general,
   sin recomendación personalizada" — perímetro discutible, frágil si el ranking
   sigue siendo personalizado. No recomendada como única medida.

## 3. El aplazo del SFA cambia la estrategia (a favor)

- NCG 569 (01-jun-2026): el SFA parte en **julio 2027** (+12 meses), con
  gradualidad por fases, piloto y sandbox de pruebas de la CMF, y una modalidad
  de "participación simplificada" para entidades menores.
- Consecuencias para CODA:
  - **La subida de cartolas sigue siendo EL canal de datos por ≥12 meses más.**
    Vale la pena seguir invirtiendo en parsers/UX de upload (lo hecho esta semana
    va en la dirección correcta).
  - Los ítems PSBI del checklist (certificado de perfiles de seguridad Anexo 3
    por tercero, reporte de pruebas funcionales de APIs) **no corren prisa**; sí
    conviene entrar temprano al piloto/sandbox cuando abra.
  - La prioridad regulatoria inmediata es solo la mitad RPSF del checklist.

## 4. Secuencia recomendada

**Fase 1 — ahora (asesoría crediticia):** presentar solicitud RPSF + autorización
solo como **asesor crediticio**, y **posponer la asesoría de inversión**
(ocultar/reetiquetar las recomendaciones de fondos/APV tras un flag). Razón: la
inversión arrastra acreditación NCG 503 de personas naturales + políticas de
suitability — trámite y costo extra que hoy no paga su lugar en el producto.

**Fase 2 — con tracción:** ampliar la autorización a asesoría de inversión
(acreditar al responsable vía NCG 503, política de suitability, reactivar fondos).

**Fase 3 — 2do semestre 2026 / 2027:** habilitación PSBI: piloto/sandbox CMF,
certificación Anexo 3 con tercero, pruebas funcionales, políticas Sección III.

## 5. Qué exige la norma vs qué ya tiene el código

| Obligación (NCG 502 / Anexo Regulatorio propio) | Estado en el producto |
|---|---|
| Trazabilidad de recomendaciones algorítmicas (variables, reglas, versión, fecha) | ✅ `algorithm_prediction_logs` + categorización con `ruleId`+`version` + `docs/TRACEABILITY_RUNTIME.md` |
| Consentimientos granulares con registro (fecha, versión, alcance) y revocación | ✅ panel de privacidad por finalidad (perfil), registro con policyVersion |
| Seguridad: cifrado en tránsito/reposo, control de acceso, registro de auditoría | ✅ cifrado de campo, RUT seudonimizado, cookies httpOnly+CSRF, headers |
| Derechos del titular: acceso/eliminación | ✅ "Descargar mis datos" + borrado de datos financieros + anonimización de cuenta |
| Gestión de modelos: versionado, validación, monitoreo drift/sesgo, responsable humano | 🟡 registry de modelos con promoción y benchmark existe; **falta** formalizar política escrita + designar responsable técnico con certificados (lo pide el checklist) |
| Políticas internas aprobadas por la administración (riesgos, continuidad, incidentes, conflictos de interés, reclamos) | 🟡 los TEXTOS están en el Anexo Regulatorio v.1 — falta aprobarlos formalmente, con fecha y responsables reales |
| Canal de reclamos con registro y trazabilidad | 🔴 no existe en el producto (solo mail de contacto) — exigido para la autorización |
| RAT (Registro de Actividades de Tratamiento) modelo | 🔴 no encontrado — exigido en el checklist (mitad PSBI, pero buena práctica presentarlo igual) |
| Acreditación NCG 503 (solo si se mantiene asesoría de inversión) | 🔴 pendiente — se evita en Fase 1 |

## 6. Anexo: aclaraciones de la reunión de asesores

- "**ley 514**" = **NCG 514** de la CMF (norma del SFA) y su Anexo 3 de seguridad
  de interfaces — no una ley. Hoy modificada por NCG 569.
- "**normas ARC**" = derechos **ARCO** (Ley 19.628 / 21.719): ya cubiertos en
  producto salvo detalles (ver tabla §5).
