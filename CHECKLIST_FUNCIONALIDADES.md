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
| Seguimiento mensual | **Parcial** | MonthlyTracker en Dashboard usa datos por defecto; no está alimentado por gastos reales del usuario |
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
| Tarjetas / Líneas de crédito | **Parcial** | Connector types: checking, savings, credit. Mock solo genera checking; **falta** modelar y mostrar tarjetas y líneas de crédito en UI/seed |
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
| Emisión de DTE | **Parcial** | Tabla empresasDteDocuments con direction issued/received; sync SII mock trae documentos. **Falta:** flujo de emisión desde la plataforma (crear DTE) |
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
| Asociación de órdenes a proveedores | **Parcial** | PO tiene customerRut, customerName (cliente). **Falta:** asociación explícita a proveedores y vista "OC por proveedor" |
| Flujo desde orden de compra a facturación | **Parcial** | PO tiene invoicedAmount, expectedInvoiceDate. **Falta:** flujo en UI (vincular OC → DTE) y seguimiento estado "facturado" |

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
| Alertas | **Parcial** | EmpresasRisk tiene "Alertas"; alertas específicas de caja (umbrales) pendientes. |
| Lógica similar al bot financiero de personas | **Parcial** | FinancialAssistant está disponible también en rutas Empresas (flotante); bot dedicado solo empresas pendiente. |

---

## Resumen de lo agregado en esta revisión

- **Personal:** **GET /api/transactions** y página **Movimientos** (`/movimientos`) — vista unificada de movimientos de todas las cuentas.
- **Empresas:** **GET /api/empresas/documents** y página **DTE** (`/empresas/documents`). **GET /api/empresas/cash-forecast/:company_id** y card **Proyección de caja** en Estados financieros. Página **Comparador de productos** (`/empresas/products`). Nav actualizado con DTE y Productos.

Pendientes (opcionales): alimentar MonthlyTracker con gastos reales; alertas de flujo de caja; asistente contable (bot/wizard); flujo OC → facturación en UI; Open Banking Anexo O3.
