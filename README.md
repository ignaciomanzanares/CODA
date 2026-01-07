# CODA

> Plataforma de salud financiera y evaluación de riesgo crediticio para usuarios individuales chilenos

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

## 📋 Descripción

CODA es una aplicación de finanzas personales que proporciona monitoreo de credit score en tiempo real con análisis ML, evaluación de riesgo de seguros, seguimiento de gastos con categorización automática por IA, gestión de metas financieras, integración con cuentas bancarias, división de gastos grupales y recomendaciones personalizadas de productos financieros.

## 🏗️ Arquitectura

```
CODA/
├── apps/
│   ├── api/          # Backend Node.js + Express (Puerto 5000)
│   └── web/          # Frontend React 18 + Vite (Puerto 5173)
├── packages/
│   └── db/           # Base de datos: Schema Drizzle + PostgreSQL
```

## ✨ Funcionalidades

### 📊 Dashboard
- Vista general de salud financiera en tiempo real
- Tendencias de ingresos vs gastos
- Seguimiento de patrimonio neto
- Análisis de flujo de caja

### 💳 Monitoreo de Credit Score
- Análisis de crédito en tiempo real con ML (XGBoost)
- Scoring de probabilidad de default (PD)
- Desglose detallado de factores con explicaciones SHAP
- Historial y tendencias de credit score

### 🛡️ Evaluación de Riesgo de Seguros
- Evaluación integral de riesgo para:
  - Seguro de auto
  - Seguro de hogar
  - Seguro de salud
  - Seguro de vida
- Scoring basado en patrones de comportamiento financiero

### 💰 Seguimiento de Gastos
- Categorización automática con IA
- Confidence scoring para clasificaciones
- Gestión de categorías y etiquetas personalizadas
- Análisis de patrones y tendencias de gasto

### 🎯 Metas Financieras
- Establecer metas de ahorro con montos objetivo y plazos
- Visualización de progreso e hitos
- Notificaciones de logros y progreso

### 🏦 Integración Bancaria
- Conexión segura con múltiples instituciones financieras
- Sincronización en tiempo real de saldos y transacciones
- Soporte para Open Banking

### 🧾 División de Gastos
- Crear y gestionar gastos grupales
- Seguimiento de contribuciones y pagos de participantes
- Invitaciones por email a no usuarios
- Cálculos automáticos de liquidación

### 🔍 Productos Financieros
- Recomendaciones personalizadas de:
  - Préstamos (personal, auto, hipotecario)
  - Tarjetas de crédito
  - Cuentas de ahorro
  - Productos de inversión
- Motor de comparación con tasas, plazos y requisitos

## 🚀 Instalación

### Prerrequisitos
- Node.js 20+
- PostgreSQL 14+
- npm 10+
- Auth0 account

### Setup

```bash
# Clonar repositorio
git clone <repo-url>
cd CODA

# Instalar dependencias
npm install

# Configurar variables de entorno
# Crear archivo .env en la raíz (ver PROMPT.md para variables requeridas)

# Inicializar base de datos
cd packages/db
npm run db:push
npm run db:seed
cd ../..

# Iniciar desarrollo
npm run dev          # Backend en puerto 5000
npm run dev:web      # Frontend en puerto 5173
```

### URLs
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **Health Check**: http://localhost:5000/health

## 🔐 Seguridad

- Autenticación Auth0 con JWT
- Cifrado de nivel bancario para datos financieros
- Rate limiting en endpoints de API
- Validación de entrada con esquemas Zod
- Audit logging para operaciones sensibles
- Gestión de sesiones segura

## 🧪 Testing

```bash
# Ejecutar tests
npm run test -w @coda/api

# Tests con UI
npm run test:ui -w @coda/api

# Coverage
npm run test:coverage -w @coda/api
```

## 🤖 ML/AI Features

- Modelo XGBoost para scoring de PD (formato ONNX)
- Pipeline de ingeniería de features
- Explicabilidad SHAP para decisiones de crédito
- Registro y versionado de modelos
- Clasificación automática de gastos

## 📦 Estructura de Paquetes

### `@coda/api`
Backend Express.js con TypeScript
- Endpoints REST API
- Integración Auth0
- Modelos ML con ONNX Runtime
- Conectores a servicios externos

### `@coda/web`
Frontend React 18 + Vite
- UI con Radix UI + shadcn/ui
- State management con TanStack Query
- Routing con Wouter
- Estilos con Tailwind CSS

### `@coda/db`
Schema de base de datos con Drizzle ORM
- Migraciones
- Seed data
- Tipos TypeScript generados

## 🛠️ Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Inicia backend
npm run dev:web          # Inicia frontend

# Base de datos
npm run db:push          # Aplica schema a DB
npm run db:seed          # Carga datos de prueba

# Testing
npm run test             # Ejecuta tests

# Build
npm run build            # Build de producción
```

## 🌟 Características Técnicas

- **TypeScript**: Type safety completo
- **Monorepo**: Estructura con workspaces de npm
- **Validación**: Zod schemas en todos los endpoints
- **Rate Limiting**: Protección contra abuso de API
- **Logging**: Pino structured logging
- **Caching**: ETag caching para GET requests
- **Real-time**: WebSocket support para notificaciones
- **PWA**: Progressive Web App capabilities
- **Responsive**: Mobile-first design

## 📝 Licencia

Propietario - Todos los derechos reservados

---

**Desarrollado con ❤️ por WeGroup 🇨🇱**
