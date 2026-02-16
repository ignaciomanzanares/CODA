# Propuesta: Plataforma CODA Unificada

## Resumen Ejecutivo
Propuesta para unificar CODA (Personal) y CODA-Empresas en una sola plataforma con código compartido y navegación fluida entre ambas experiencias.

## Situación Actual

### CODA (Personal)
- **Puerto**: 5173 (dev), 5000 (api)
- **Framework**: React 18 + Vite
- **Base de datos**: PostgreSQL/SQLite
- **Usuarios**: Personas individuales

### CODA-Empresas
- **Puerto**: 3001 (web), 3000 (api)
- **Framework**: Next.js 14
- **Base de datos**: SQLite
- **Usuarios**: PYMEs y empresas

### Problemas Actuales
1. Dos repositorios separados dificultan el mantenimiento
2. Código duplicado (autenticación, componentes UI, utilidades)
3. Experiencia de usuario fragmentada
4. Difícil compartir features entre ambas versiones
5. Complejidad en deployment y CI/CD

---

## Propuesta 1: Monorepo Unificado con Routing (RECOMENDADO)

### Estructura del Proyecto
```
coda-platform/
├── apps/
│   ├── web/                    # Aplicación unificada
│   │   ├── src/
│   │   │   ├── app/           # Rutas de Next.js
│   │   │   │   ├── (personal)/    # Grupo de rutas personal
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── expenses/
│   │   │   │   │   ├── goals/
│   │   │   │   │   └── ...
│   │   │   │   ├── (empresas)/    # Grupo de rutas empresas
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── companies/
│   │   │   │   │   ├── reconciliation/
│   │   │   │   │   └── ...
│   │   │   │   └── (public)/
│   │   │   │       ├── page.tsx          # Landing
│   │   │   │       ├── about/
│   │   │   │       ├── info/
│   │   │   │       └── login/
│   │   │   ├── components/
│   │   │   │   ├── personal/
│   │   │   │   ├── empresas/
│   │   │   │   └── shared/
│   │   │   └── lib/
│   │   └── package.json
│   └── api/                    # API unificada
│       ├── src/
│       │   ├── routes/
│       │   │   ├── personal/
│       │   │   └── empresas/
│       │   └── middleware/
│       └── package.json
├── packages/
│   ├── db/                     # Schemas unificados
│   ├── ui/                     # Componentes compartidos
│   ├── auth/                   # Sistema de autenticación
│   ├── i18n/                   # Internacionalización
│   └── types/                  # TypeScript types
└── package.json

```

### Ventajas
✅ Un solo codebase, más fácil de mantener
✅ Código compartido maximizado
✅ Navegación fluida entre personal y empresas
✅ Un solo deployment
✅ Mejor DX (Developer Experience)
✅ Auth unificado con roles (personal vs empresas)
✅ Compartir componentes, hooks, y utilities

### Desventajas
❌ Requiere migración inicial (2-3 semanas)
❌ Bundle size más grande (mitigable con code splitting)
❌ Necesita refactor de Next.js para ambos lados

### Implementación

#### Fase 1: Preparación (1 semana)
1. Crear nuevo monorepo con estructura base
2. Migrar packages compartidos primero (db, types, ui)
3. Setup Next.js con App Router
4. Configurar rutas y layouts base

#### Fase 2: Migración de CODA Personal (1 semana)
1. Convertir componentes React a Next.js
2. Migrar rutas de Wouter a Next.js App Router
3. Adaptar estado y data fetching
4. Testing y QA

#### Fase 3: Integración CODA Empresas (1 semana)
1. Mover rutas de empresas al nuevo monorepo
2. Unificar APIs
3. Compartir autenticación
4. Testing completo

#### Fase 4: Optimización (1 semana)
1. Code splitting por módulo
2. Optimización de bundles
3. Performance testing
4. Deploy a producción

---

## Propuesta 2: Subdominios con Código Compartido

### Estructura
```
coda-monorepo/
├── apps/
│   ├── personal/              # app.coda.cl
│   │   └── (mantiene React + Vite)
│   ├── empresas/              # empresas.coda.cl
│   │   └── (mantiene Next.js)
│   └── api/                   # api.coda.cl (unificada)
└── packages/
    ├── db/
    ├── ui/
    ├── auth/
    └── shared/
```

### Ventajas
✅ Menos refactoring inicial
✅ Apps independientes (mejor aislamiento)
✅ Deployments independientes
✅ Frameworks nativos mantenidos

### Desventajas
❌ Navegación menos fluida (cambio de dominio)
❌ Auth más complejo (cross-domain)
❌ Menos código compartido en práctica
❌ Dos deployments separados

---

## Propuesta 3: Micro-frontends con Module Federation

### Ventajas
✅ Apps completamente independientes
✅ Deploy independiente
✅ Tecnologías diferentes por módulo

### Desventajas
❌ Complejidad arquitectónica alta
❌ Overhead de configuración
❌ Debugging más difícil
❌ Overkill para este proyecto

---

## Recomendación: Propuesta 1 (Monorepo Unificado)

### Razones
1. **Mantenibilidad**: Un solo codebase es más fácil de mantener a largo plazo
2. **Experiencia de Usuario**: Navegación fluida sin cambio de dominio
3. **Reutilización de Código**: Máxima compartición de componentes y lógica
4. **Performance**: Next.js App Router con code splitting optimizado
5. **i18n**: Sistema de internacionalización unificado
6. **Auth**: Sistema de autenticación compartido con roles

### Rutas Propuestas
```
# Público
/                           → Landing unificado
/about                      → Sobre nosotros
/login                      → Login unificado
/signup                     → Signup con selector personal/empresas

# Personal (usuarios autenticados)
/dashboard                  → Dashboard personal
/expenses                   → Gastos
/goals                      → Metas
/bill-split                → División de cuentas
/products                   → Productos financieros
/plan                       → Plan financiero

# Empresas (usuarios autenticados con rol empresas)
/empresas/dashboard         → Dashboard empresarial
/empresas/companies         → Mis empresas
/empresas/transactions      → Transacciones
/empresas/reconciliation    → Reconciliación
/empresas/statements        → Estados financieros
/empresas/risk              → Evaluación de riesgo

# Info (público)
/info/credit-score         → Qué es credit score
/info/insurance-risk       → Qué es insurance risk
```

### Sistema de Roles
```typescript
enum UserRole {
  PERSONAL = 'personal',
  EMPRESAS = 'empresas',
  ADMIN = 'admin'
}

interface User {
  id: string;
  email: string;
  role: UserRole;
  // ... otros campos
}
```

### Autenticación Unificada
- Login único para ambas versiones
- JWT con claim de `role`
- Middleware que valida acceso basado en ruta
- UI que adapta navegación según rol

---

## Implementación de i18n

### Sistema Recomendado: next-intl
```typescript
// messages/es.json
{
  "landing": {
    "hero": {
      "title": "Toma Control de tu Futuro Financiero",
      "subtitle": "Insights impulsados por IA...",
      "cta": "Comienza Gratis"
    }
  },
  "personal": {
    "dashboard": {
      "title": "Panel de Control"
    }
  },
  "empresas": {
    "dashboard": {
      "title": "Dashboard Ejecutivo"
    }
  }
}
```

### Idiomas Soportados
- 🇨🇱 Español (default)
- 🇺🇸 English (secundario)

---

## Plan de Migración Detallado

### Semana 1: Setup y DB
- [ ] Crear nuevo repo `coda-platform`
- [ ] Setup monorepo con Turborepo/npm workspaces
- [ ] Migrar package `db` con schemas unificados
- [ ] Setup Next.js 14 con App Router
- [ ] Configurar i18n con next-intl
- [ ] Crear layouts base

### Semana 2: CODA Personal
- [ ] Migrar páginas públicas (landing, about, info)
- [ ] Migrar autenticación
- [ ] Migrar dashboard
- [ ] Migrar expenses, goals, bill-split
- [ ] Testing

### Semana 3: CODA Empresas
- [ ] Migrar páginas de empresas
- [ ] Integrar API endpoints
- [ ] Unificar autenticación
- [ ] Testing e2e

### Semana 4: Optimización y Deploy
- [ ] Code splitting
- [ ] Performance optimization
- [ ] Security audit
- [ ] Deploy a staging
- [ ] Testing con usuarios
- [ ] Deploy a producción

---

## Estimación de Esfuerzo

### Desarrollo
- **Setup inicial**: 40 horas
- **Migración Personal**: 60 horas
- **Migración Empresas**: 60 horas
- **Testing y QA**: 40 horas
- **Total**: ~200 horas (~5 semanas con 1 dev)

### Alternativa: Propuesta 2 (Subdominios)
- **Total**: ~80 horas (~2 semanas)
- Menos esfuerzo pero menos beneficios a largo plazo

---

## Conclusión

**Recomiendo la Propuesta 1** (Monorepo Unificado) porque:
1. Mejor experiencia de usuario a largo plazo
2. Más mantenible
3. Mayor reutilización de código
4. Mejor performance con Next.js 14
5. Sistema i18n unificado

La inversión inicial vale la pena para un producto escalable y profesional.

---

## Próximos Pasos

1. **Validar con stakeholders**: Confirmar aprobación de la propuesta
2. **Planning detallado**: Crear tickets en Jira/Linear
3. **Setup repo**: Crear estructura base
4. **Comenzar migración**: Fase por fase según el plan

¿Preguntas? ¿Ajustes necesarios?
