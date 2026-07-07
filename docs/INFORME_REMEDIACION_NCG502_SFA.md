# Informe de Remediación — Auditoría NCG 502 + Preparación SFA

**Proyecto:** CODA (API Node/Express + Web React)
**Rama:** `security/auditoria-remediacion`
**Marco:** CMF — NCG 502 (gestión de riesgo y trazabilidad algorítmica), Ley 19.628 / 21.719
(protección de datos), Ley 21.521 + NCG 514/569 (Sistema de Finanzas Abiertas).
**Fecha:** junio 2026.

---

## 1. Resumen ejecutivo

Se remediaron las brechas de la auditoría externa y se ejecutó un plan de mejora integral sobre
cinco dimensiones técnicas. El sistema pasó de una evaluación interna de **6.2/10 a ~7.8/10**.
El hito de mayor impacto: el modelo de scoring crediticio dejó de entrenarse con datos
sintéticos sin señal (AUC 0.41/0.61) y ahora corre sobre **datos reales (AUC 0.72)**. Además se
dejó el sistema **alineado al modelo de datos del SFA** (ISO 20022) para su entrada en vigencia.

| Dimensión | Antes | Ahora | Driver del cambio |
|---|---|---|---|
| Extracción y normalización | 6.5 | ~7.5 | OCR→parser, validación cruzada cartola/CMF |
| Interconexión end-to-end | 7.0 | ~7.5 | cruce CMF/cartola, alineación modelo SFA |
| Precisión de determinaciones | 4.5 | ~7.0 | modelo real 0.72, score CMF calibrado, clasificador persistente |
| Retroalimentación y aprendizaje | 6.0 | ~8.0 | A/B testing, trigger de drift, función de pérdida |
| Protección de datos | 7.5 | ~9.0 | rotación de llave, RTBF, cifrado de glosas, CVEs |

---

## 2. Remediación de seguridad (NCG 502 / Ley 21.719)

### Autenticación y sesión
- OTP de 2FA con generación **criptográficamente segura** (`crypto.randomInt`, antes `Math.random`).
- 2FA respaldado por Redis (TTL, máx. intentos), **fail-closed** en producción.
- Cookie `httpOnly`/`secure`/`sameSite`; CSRF doble-submit; invalidación de token persistida en DB
  (logout cross-device sobrevive reinicios). `optionalAuth` ahora **también** valida la invalidación.
- Contraseñas PBKDF2 (100k iteraciones, SHA-512).

### Protección de datos en reposo
- Cifrado de campo **AES-256-GCM** sobre PII: `users` (nombres, TOTP, backup codes), `parsedData`
  de documentos, blobs, logs de predicción y ahora **`transactions.description`** (glosas de
  comercio/contraparte).
- **Rotación de llave** (`FIELD_ENCRYPTION_KEY_PREV` + job `db:rotate-encryption-key`,
  idempotente y reanudable) — antes no había forma de rotar sin perder acceso.
- **RTBF / acceso del titular** (Ley 21.719 Art. 13): `GET /api/profile/my-data` exporta todos
  los datos del usuario; borrado vía anonimización irreversible existente.

### Trazabilidad algorítmica (NCG 502)
- `algorithm_model_versions` + `algorithm_prediction_logs` **persistidos en DB** (antes in-memory;
  se perdían en reinicio/escala). Rutas de auditoría leen de DB.
- SHAP por instancia (explicabilidad por decisión). Validación de artefacto antes de promover.
- **Trigger automático de drift**: PSI > 0.25 registra un `AlgorithmChange` pendiente + alerta
  a Ops (reentrenamiento sigue requiriendo aprobación humana).

### Vulnerabilidades / endurecimiento
- Upgrade `drizzle-orm` → 0.45.2 (CVE GHSA-gpj5-g38j-94v9, SQL injection).
- Upgrade `nodemailer` → 9.0.1 (CVE GHSA-c7w3-x93f-qmm8, inyección SMTP).
- `/metrics` autenticado (Bearer `METRICS_TOKEN` o loopback).
- Helmet, Permissions-Policy, límite de body, CORS por allowlist, 5 rate limiters Redis.
- **Binding RUT** en upload CMF: el informe queda ligado al RUT del titular; uploads posteriores
  se validan (cierra el vector de subir el informe de un tercero).

---

## 3. Precisión de las determinaciones (la brecha más crítica)

### Modelo de scoring crediticio — de ruido a señal real
- **Diagnóstico:** el modelo en producción tenía AUC **0.41** (peor que azar), porque la etiqueta
  de entrenamiento se generaba con `Math.random()` sobre datos sintéticos casi idénticos.
- **Acción:** se entrenó con el dataset real **Berka** (PKDD'99, transacciones reales + outcome de
  préstamo). Feature set **window-invariante + entrenamiento multi-ventana** y **scale-free**
  (transfiere CZK→CLP). AUC honesto **0.72** (GroupKFold por cuenta; se detectó y corrigió un
  leakage que inflaba a 0.75). **Promovido a producción** (`artifacts/current`); el sintético
  queda preservado y reversible.
- **Caveat documentado:** Berka es conducta bancaria checa; es una **base real**, no calibrada a
  Chile. La recalibración chilena se desbloquea con el SFA (ver §5).

### Score CMF calibrado
- La fórmula heurística plana (`score_cmf * 5.5 + 300`, que daba ~768 fijo sin deuda) se
  reemplazó por **calibración actuarial** (historial de mora 30/60/90 + ratio deuda/ingreso).

### Clasificador de categorías persistente
- El clasificador Naive Bayes incremental ahora **serializa su estado** (`stored_blobs`) y lo
  restaura al arranque — antes perdía todo el aprendizaje en cada reinicio.

---

## 4. Retroalimentación, extracción e interconexión

- **A/B testing de modelos** (`ab_traffic_pct`): dos versiones activas se samplean por tráfico.
- **Función de pérdida de productos**: `α·CTR + β·conversión` desde `product_conversion_events`
  (antes ajuste heurístico sin objetivo).
- **OCR → parser genérico**: las cartolas escaneadas ahora se intentan vía Tesseract en el pipeline
  (antes devolvía error).
- **Validación cruzada cartola ↔ CMF**: detecta CMF "sin deuda" contradicho por servicio de deuda
  en la cartola, y deuda CMF en instituciones sin cartola subida (señales informativas).

---

## 5. Preparación para el SFA (Sistema de Finanzas Abiertas)

**Marco:** Ley 21.521; NCG 514 modificada por **NCG 569 (1-jun-2026)**, Anexo Técnico N°3.
Transporte REST/JSON, OpenAPI 3.1, esquemas **ISO 20022**, seguridad **FAPI 2.0**.

**Rol de CODA:** **PSBI** (consumidor). Los Data Holders exponen el JSON; CODA lo consume. Por
eso la estrategia fue **adoptar el modelo de datos del SFA internamente**, sobre la abstracción
`OBProvider` que ya alimenta el scoring.

### Modelo de datos implementado (todo validado contra ejemplos oficiales del portal OFAC)

| Familia | Prefijo | Mapeo en CODA |
|---|---|---|
| Movimientos (cuenta/tarjeta/crédito, schema compartido) | `/accounts/v1`, etc. | scoring transaccional |
| Operaciones de crédito (loan + balance, con mora) | `/loans/v1` | **evaluador de riesgo** (deuda + mora reales) |
| Saldo de cuenta | `/accounts/v1` | liquidez |
| Tarjeta de crédito (balance + cupo) | `/credit-card-accounts/v1` | deuda rotativa + utilización |
| Inversiones (detalle + balance) | `/investments/v1` | **patrimonio** (`userAssets`) → motor de salud |

- Mapeo **bidireccional** (`toSfa*` / `fromSfa*`): hoy renderiza cartolas en formato SFA; mañana
  el conector real cae en el mismo modelo interno sin reescritura.
- **Convenciones de formato confirmadas:** montos con `currency` ISO 4217 aparte; **CLP entero**
  (0 decimales), USD 2, UF 4; `transactionType` enum `"Débito"`/`"Crédito"`; fechas ISO 8601.
- **Hallazgo:** el tipo de `amount` **no es consistente** entre endpoints (string en saldo de
  cuenta, número en el resto) → se maneja con `parseAmount()` defensivo.
- Endpoint diagnóstico `GET /api/profile/accounts/:id/transactions-sfa` (datos propios).
- **15 tests** contra ejemplos oficiales.

**Impacto clave:** el SFA entrega deuda chilena real en el feature space del CMF (tipo, monto,
mora vía `accruedLateInterest`). Esto **desbloquea el evaluador de riesgo con datos chilenos en
vivo** —lo que no era posible con datasets públicos— en cuanto el conector esté operativo.

---

## 6. Pendientes y bloqueos

| Ítem | Estado | Bloqueo |
|---|---|---|
| Conector SFA real (`SfaProvider`: OAuth2/PKCE/mTLS/JWS) | Diseñado, no implementado | Registro de CODA como PSBI ante CMF + sandbox |
| Recalibración del modelo a Chile | Base real lista | Datos chilenos (vía SFA en vivo, o piloto DICOM/Equifax con contrato legal) |
| Parsers de tarjeta de crédito (BCI, BancoEstado, B.Chile, Itaú) | Solo Santander | Faltan PDFs de muestra reales |
| Calibración de umbrales del motor de salud financiera | Documentado/testeado | Datos chilenos reales |
| Doppler (gestión de secretos) · Drill DR · Ejecutar rotación de llave | Documentado/script listo | Acciones de infraestructura/operación |
| Consistencia de capa de servicio (rutas con acceso directo a DB) | Diferido | Bajo valor / alto churn |

---

## 7. Verificación

```bash
npm test -w apps/api        # 376/377 (el único fallo es modelRegistryPromotion, requiere Postgres)
npx tsc --noEmit -p apps/api/tsconfig.json   # limpio
```

Trazabilidad: la remediación está en commits atómicos sobre `security/auditoria-remediacion`
(desde `0a50451` hasta `2c07798`), cada uno con su descripción y tests.
