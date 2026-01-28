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
cp apps/api/.env.example apps/api/.env
# Editar apps/api/.env con tus valores

# Inicializar base de datos
cd packages/db
npm run db:push
npm run db:seed
cd ../..

# Iniciar desarrollo
npm run dev          # Backend en puerto 5000
npm run dev:web      # Frontend en puerto 5173
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | API server port (default: 5000) |
| `NODE_ENV` | No | Environment mode: `development` or `production` |
| `DATABASE_URL` | Yes (prod) | PostgreSQL connection string |
| `SQLITE_PATH` | No | SQLite file path for development |
| `JWT_SECRET` | Yes | Secret for JWT signing |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `DEBUG_ENDPOINTS` | No | Enable debug endpoints (dev only) |

See `apps/api/.env.example` for full documentation.

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

## 🛡️ Hardening Checklist (Production Deployment)

Use this checklist before deploying to production:

### Environment & Secrets
- [ ] **JWT_SECRET**: Use a strong random secret (32+ bytes), generate with `openssl rand -base64 32`
- [ ] **DATABASE_URL**: Use PostgreSQL with SSL (`?sslmode=require`)
- [ ] **CORS_ORIGINS**: Set to only your production frontend domain(s)
- [ ] **NODE_ENV**: Set to `production`
- [ ] **DEBUG_ENDPOINTS**: Ensure this is `false` or unset
- [ ] Verify `.env` and `.env.production` files are in `.gitignore`
- [ ] Use a secrets manager (e.g., AWS Secrets Manager, Vault) for sensitive values

### API Security
- [ ] Rate limiting is enabled (configured in `middleware/rateLimiter.ts`)
- [ ] All sensitive endpoints require authentication
- [ ] Input validation is enforced with Zod schemas
- [ ] CORS is properly configured (no wildcards in production)
- [ ] Debug endpoints are disabled (`DEBUG_ENDPOINTS=false`)

### Database
- [ ] Database connection uses SSL/TLS
- [ ] Database credentials are rotated regularly
- [ ] Database backups are configured and tested
- [ ] Use least-privilege database user

### Infrastructure
- [ ] HTTPS is enforced (redirect HTTP → HTTPS)
- [ ] Security headers are configured (CSP, HSTS, X-Frame-Options)
- [ ] Logging is configured (but not logging sensitive data)
- [ ] Error messages don't leak internal details in production
- [ ] Health check endpoint (`/health`) is accessible for monitoring

### ML/AI
- [ ] Model artifacts are present in `apps/api/src/ml/artifacts/current/`
- [ ] ONNX model is validated before deployment
- [ ] Feature metadata matches expected schema

### Monitoring & Observability
- [ ] Application logging is enabled (Pino)
- [ ] Error tracking service is configured (e.g., Sentry)
- [ ] Performance monitoring is in place
- [ ] Alerts are configured for critical errors

## 🚀 Production Deployment

### Backend (Render)

1. **Create a new Web Service** in Render Dashboard
2. **Connect your repository** and select the CODA repo
3. **Configure the service:**
   - **Root Directory**: `apps/api`
   - **Build Command**: `npm install --include=dev && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`

   > **Note**: The `--include=dev` flag is required because TypeScript and `@types/*` packages are in devDependencies but needed for compilation.

4. **Set Environment Variables** in Render Dashboard:
   ```
   NODE_ENV=production
   PORT=5000
   DATABASE_URL=<from Render PostgreSQL internal URL>
   JWT_SECRET=<generate with: openssl rand -base64 32>
   CORS_ORIGINS=https://coda-web-steel.vercel.app
   DEBUG_ENDPOINTS=false
   ```

5. **Create PostgreSQL Database** in Render and link to the web service

> **Important**: Use the **Internal Database URL** from Render for better performance and security.

### Frontend (Vercel)

1. **Import your repository** in Vercel Dashboard
2. **Configure the project:**
   - **Root Directory**: `apps/web` (or leave empty if using root vercel.json)
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build` (auto-detected)
   - **Output Directory**: `dist`

3. **Set Environment Variables** in Vercel Dashboard:
   ```
   VITE_API_URL=https://coda-api-fplk.onrender.com
   VITE_ENV=production
   ```

4. **Deploy** - Vercel will automatically deploy on push to main

### Post-Deployment Checklist

- [ ] Verify health check: `curl https://your-api.onrender.com/health`
- [ ] Test authentication flow end-to-end
- [ ] Verify CORS is working (no browser console errors)
- [ ] Check database connection (API logs in Render)
- [ ] Test ML scoring endpoints
- [ ] Verify email notifications (if configured)

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
