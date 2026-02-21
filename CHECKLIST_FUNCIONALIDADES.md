# Checklist de funcionalidades CODA y CODA Empresas

Estado de cada ítem según revisión del código (paso a paso). Leyenda: **OK** = implementado, **Parcial** = existe pero falta algo, **Falta** = no implementado.

---

## 3. Plataforma para personas naturales

### 3.1 Agregador de cuentas bancarias
| Subítem | Estado | Detalle |
|--------|--------|---------|
| Cuentas corrientes | **OK** | `accounts.type` checking/depository, `financial-summary` y Dashboard por tipo |
| Tarjetas de crédito | **OK** | type credit / subtype credit card, `creditCards` en summary |
| Líneas de crédito | **OK** | type loan / subtype line of credit en schema y routes |
| Movimientos interbancarios e intrabancarios | **OK** | Vista unificada: **GET /api/transactions** y página **Movimientos** (`/movimientos`) con todos los movimientos de todas las cuentas. |

### 3.2 Consolidación de patrimonio y posición financiera
| Estado | Detalle |
|--------|---------|
| **OK** | `GET /api/financial-summary`: totalBalance, totalAssets, totalLiabilities, netWorth, accountsByType, trends.netWorth. Dashboard: NetWorthChart, AccountBreakdown, FinancialSummaryStats |

### 3.3 Organizador financiero
| Subítem | Estado | Detalle |
|--------|--------|---------|
| Clasificación de gastos | **OK** | Expenses CRUD, categorías, subcategoría, `isAutoClassified`, API `expenses/classify` |
| Seguimiento mensual | **OK** | MonthlyTracker alimentado con **GET /api/expenses/monthly-summary** y datos reales en Plan (por categoría e histórico 6 meses). |
| Históricos | **OK** | Gastos con `date`, listado filtrable en Expenses; financial-summary tiene trends |
| Proyección anual de gastos y flujo | **OK** | AnnualProjection (ingresos/gastos/ahorro), CashFlowChart en Dashboard |

### 3.4 Motor de credit scoring para personas
| Estado | Detalle |
|--------|---------|
| **OK** | `/api/credit-score`, `/api/scoring/application`, PD (XGBoost/ONNX + baseline), CreditScoreCard, PDOverview, CreditScoreInfo. Evaluación con información financiera (feature vector). **Parcial:** integración explícita con "registros CMF" no verificada en código (puede ser dato externo a futuro) |

### 3.5 Comparador de productos financieros
| Estado | Detalle |
|--------|---------|
| **OK** | Página Products: Créditos, Tarjetas, Ahorro, Seguros. Filtros, ProductsTable, API `financial-products` |

### 3.6 Bot financiero / asistente personal
| Estado | Detalle |
|--------|---------|
| **OK** | FinancialAssistant (chat flotante), `/api/assistant/chat`, `/api/assistant/insights`, sugerencias e insights |

### 3.7 Integración con API de Open Banking (Anexo O3)
| Estado | Detalle |
|--------|---------|
| **Falta** | Indicado por el usuario: "todavía no". Existe Mock provider y demo ingest; **no** integración real con requisitos regulatorios Anexo O3 |

---

## 4. Plataforma para empresas

### 4.1 Agregador de cuentas bancarias empresariales
| Subítem | Estado | Detalle |
|--------|--------|---------|
| Cuentas corrientes | **OK** | empresasBankAccounts, sync Open Banking mock (accountType checking) |
| Tarjetas / Líneas de crédito | **OK** | Mock Open Banking genera checking, savings y credit; seed y seed-demo crean los tres tipos; resumen por empresa incluye **accountsByType**; Transacciones muestra columna Cuenta (Corriente/Ahorro/Tarjeta). |
| Movimientos interbancarios e intrabancarios | **OK** | empresasBankTransactions por company, sync desde connector, vista Transacciones |

### 4.2 Consolidación completa de movimientos bancarios
| Estado | Detalle |
|--------|---------|
| **OK** | GET `/api/empresas/transactions?company_id=`, dashboard por empresa con revenue/expenses/cashBalance |

### 4.3 Asistente contable
| Estado | Detalle |
|--------|---------|
| **Parcial** | Generación de estados (estado de resultado, flujo de caja, balance) y journal. **Falta:** módulo tipo "asistente" (bot o wizard) que guíe contabilidad o resuelva dudas |

### 4.4 Sistema de facturación electrónica
| Subítem | Estado | Detalle |
|--------|--------|---------|
| Emisión de DTE | **OK** | **POST /api/empresas/documents** para emitir DTE; en **/empresas/documents** botón "Emitir DTE" con formulario (receptor, monto neto, IVA opcional). Folio automático por empresa. |
| Recepción de DTE | **OK** | direction "received", almacenamiento y listado |
| Plataforma de orden y almacenamiento de DTE | **OK** | Vista dedicada **/empresas/documents** (DTE): listado por empresa, orden por fecha, emisor/receptor y total. |

### 4.5 Integración con SII (API DTE)
| Estado | Detalle |
|--------|---------|
| **OK** | Connector SII mock, POST `connections/:company_id/sii/sync` trae DTE; integración real SII sería reemplazo del mock |

### 4.6 Sistema de conciliación bancaria
| Estado | Detalle |
|--------|---------|
| **OK** | Cruce DTE vs movimientos: GET reconciliation/:company_id, POST reconciliation/:company_id/run, matchEngine + scoring, EmpresasReconciliation |

### 4.7 Asistente de seguimiento de ventas
| Subítem | Estado | Detalle |
|--------|--------|---------|
| Registro de órdenes de compra | **OK** | empresasPurchaseOrders, sync purchase_orders, listado en dashboard (poCount) |
| Asociación de órdenes a proveedores | **OK** | Vista **OC por proveedor** en **/empresas/purchase-orders** (tab "Por proveedor"); proveedor = customerRut/customerName. |
| Flujo desde orden de compra a facturación | **OK** | **PATCH /api/empresas/purchase-orders/:id/link-dte**; en la página OC, botón "Vincular DTE" para asociar un DTE recibido; estado "Facturado" y dteDocumentId. |

### 4.8 Motor de credit scoring para empresas
| Estado | Detalle |
|--------|---------|
| **OK** | GET `/api/empresas/risk/:company_id`, empresasRiskScores, rating, overallScore, recommendations, EmpresasRisk |

### 4.9 Comparador de productos financieros para empresas
| Estado | Detalle |
|--------|---------|
| **OK** | Página **/empresas/products** (Comparador): créditos/líneas y tarjetas empresariales; reutiliza API de productos. |

### 4.10 Asistente de flujo de caja
| Subítem | Estado | Detalle |
|--------|--------|---------|
| Proyecciones | **OK** | **GET /api/empresas/cash-forecast/:company_id**; card "Proyección de caja (30 días)" en Estados financieros. |
| Seguimiento | **OK** | Estado de flujo de caja en Statements (cashFlow), dashboard con cashBalance |
| Alertas | **OK** | En Estados financieros: umbral mínimo de caja (CLP) configurable; alerta cuando la proyección de caja cae bajo el umbral (días y montos listados). |
| Lógica similar al bot financiero de personas | **Parcial** | FinancialAssistant está disponible también en rutas Empresas (flotante); bot dedicado solo empresas pendiente. |

---

## Resumen de lo agregado en esta revisión

- **Personal:** **GET /api/transactions** y página **Movimientos** (`/movimientos`) — vista unificada de movimientos de todas las cuentas. **GET /api/expenses/monthly-summary** y **MonthlyTracker** alimentado con gastos reales en Plan.
- **Empresas:** **GET /api/empresas/documents** y página **DTE** con **POST** y "Emitir DTE". **GET /api/empresas/cash-forecast/:company_id** y alertas de caja por umbral. Tarjetas y líneas de crédito (mock/seed, accountsByType, columna Cuenta). **OC:** página **/empresas/purchase-orders** (nav "OC"), **GET /api/empresas/purchase-orders** y **/by-vendor**, **PATCH .../link-dte** para vincular OC → DTE recibido y estado facturado (schema: `empresas_purchase_orders.dte_document_id`; ejecutar `npm run db:push` si la tabla ya existía). Página **Comparador de productos**. Nav actualizado.

---

## Pendientes (tareas concretas)

Prioridad: **P1** = alta, **P2** = media, **P3** = baja / futuro.

### Personal

| Prioridad | Tarea | Referencia | Notas |
|-----------|--------|------------|--------|
| ~~P2~~ | ~~Alimentar **MonthlyTracker** con gastos reales~~ | 3.3 | **Hecho.** GET /api/expenses/monthly-summary; Plan usa datos reales para totalSpent, categoryData e historicalData. |
| P3 | Integración explícita con **registros CMF** (scoring) | 3.4 | Opcional; puede quedar como dato externo o integración posterior. |

### Empresas

| Prioridad | Tarea | Referencia | Notas |
|-----------|--------|------------|--------|
| ~~P2~~ | ~~Modelar y mostrar **tarjetas y líneas de crédito** en Empresas~~ | 4.1 | **Hecho.** Mock: checking + savings + credit; seed/seed-demo: tres tipos; summary.accountsByType; columna Cuenta en Transacciones. |
| P2 | Módulo **asistente contable** (bot o wizard) | 4.3 | Añadir flujo que guíe contabilidad o responda dudas (reutilizar o extender patrón del FinancialAssistant). |
| ~~P2~~ | ~~Flujo de **emisión de DTE** desde la plataforma~~ | 4.4 | **Hecho.** POST /api/empresas/documents; en DTE, botón "Emitir DTE" y formulario (RUT receptor, nombre, monto neto, IVA opcional). |
| ~~P2~~ | ~~**OC por proveedor** y flujo OC → facturación en UI~~ | 4.7 | **Hecho.** Página **/empresas/purchase-orders** (nav "OC"): tabs "Todas las OC" y "Por proveedor"; **PATCH .../link-dte** y botón "Vincular DTE" para marcar facturado. |
| ~~P2~~ | ~~**Alertas de flujo de caja** (umbrales)~~ | 4.10 | **Hecho.** En Estados financieros: input "Umbral mínimo (CLP)" y alerta cuando la proyección cae bajo ese umbral. |
| P3 | **Bot dedicado solo a empresas** | 4.10 | Variante del FinancialAssistant con contexto empresas (opcional si el flotante actual basta). |

### Regulatorio / infraestructura

| Prioridad | Tarea | Referencia | Notas |
|-----------|--------|------------|--------|
| P1* | **Open Banking Anexo O3** (integración real) | 3.7 | Requisitos regulatorios; reemplazar mock por proveedor certificado cuando corresponda. *Prioridad de negocio/legal. |

### Orden sugerido de implementación

1. **Corto plazo (valor rápido):** MonthlyTracker con gastos reales (3.3), alertas de caja (4.10).
2. **Mediano plazo:** Tarjetas/líneas Empresas (4.1), emisión DTE (4.4), flujo OC → facturación (4.7).
3. **Más adelante:** Asistente contable (4.3), bot empresas (4.10), CMF (3.4), Open Banking Anexo O3 (3.7).
