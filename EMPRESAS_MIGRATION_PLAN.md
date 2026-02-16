# Plan de migración: CODA Empresas dentro del repo CODA

## Objetivo
Integrar la aplicación CODA Empresas **dentro del repositorio CODA** para que todo sea accesible desde **una sola página web** (un solo build, un solo deploy). No se crea ningún repo nuevo.

## Situación actual
- **CODA (este repo)**: `apps/web` (React 18 + Vite), `apps/api` (Express). Deploy actual.
- **CODA Empresas (repo aparte)**: Next.js 14, puerto 3001. Otra base de datos (SQLite).
- Hoy las rutas `/empresas/*` muestran una página de transición que redirige a la app externa.

## Enfoque elegido: una sola app en `apps/web`

Se integra Empresas como **más rutas y páginas** dentro de la app existente (`apps/web`). Así:
- Un solo build (`npm run build` en `apps/web`).
- Un solo dominio y una sola “página web”.
- Mismo Header/Footer y misma autenticación (se puede extender con roles después).

No se añade una segunda app (p. ej. `apps/empresas` con Next.js) para evitar dos frontends y dos builds.

---

## Estructura objetivo en el repo CODA

```
CODA/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── App.tsx                    # Rutas /empresas/* apuntan a nuevas páginas
│   │       ├── pages/
│   │       │   ├── empresas/
│   │       │   │   ├── EmpresasLayout.tsx       # Layout con navegación Empresas
│   │       │   │   ├── EmpresasDashboard.tsx
│   │       │   │   ├── EmpresasCompanies.tsx
│   │       │   │   ├── EmpresasTransactions.tsx
│   │       │   │   ├── EmpresasReconciliation.tsx
│   │       │   │   ├── EmpresasStatements.tsx
│   │       │   │   ├── EmpresasRisk.tsx
│   │       │   │   └── EmpresasTransition.tsx   # Se elimina cuando todo esté migrado
│   │       │   └── ...
│   │       └── components/
│   │           ├── empresas/              # Componentes solo usados en Empresas
│   │           │   ├── SidebarEmpresas.tsx
│   │           │   └── ...
│   │           └── ...
│   └── api/
│       └── src/
│           ├── routes/
│           │   ├── ...                     # Rutas actuales (personal)
│           │   └── empresas/               # Nuevas rutas API para Empresas
│           │       ├── companies.ts
│           │       ├── transactions.ts
│           │       ├── reconciliation.ts
│           │       └── ...
│           └── ...
└── packages/
    └── db/                                 # Opcional: schemas de empresas si unificamos DB
```

---

## Fases de implementación

### Fase 1: Tener el código de Empresas en CODA (día 1)

1. **Copiar el repo de Empresas** (o clonarlo) en una carpeta temporal, por ejemplo:
   - `_migrate-empresas/` en la raíz de CODA (añadir a `.gitignore` si es solo referencia), o
   - directamente abrir el repo Empresas en otra ventana y usar su código como referencia.

2. **Documentar** en CODA qué pantallas y endpoints tiene Empresas:
   - Listado de páginas (dashboard, companies, transactions, reconciliation, statements, risk).
   - Listado de APIs que usa (por ruta y método).
   - Modelos de datos (empresa, transacción, conciliación, etc.).

No es obligatorio mover todo el código de Next a la vez; se puede ir pantalla a pantalla.

---

### Fase 2: Layout y rutas Empresas en `apps/web` (1–2 días)

1. **Layout Empresas**
   - Crear `pages/empresas/EmpresasLayout.tsx` que:
     - Use el mismo `Header` y `Footer` del resto de CODA (o una variante con “Empresas” resaltado).
     - Incluya una navegación secundaria solo para Empresas: Dashboard, Empresas, Transacciones, Reconciliación, Estados, Riesgo (enlaces a `/empresas/dashboard`, `/empresas/companies`, etc.).

2. **Rutas en `App.tsx`**
   - Sustituir las rutas que hoy renderizan `EmpresasTransition` por el nuevo layout y páginas:
     - `/empresas/dashboard` → `EmpresasDashboard`
     - `/empresas/companies` → `EmpresasCompanies`
     - etc.
   - Todas bajo el mismo layout (por ejemplo, un `<Route path="/empresas">` con rutas anidadas o un `<Route path="/empresas/:section">` si prefieres un solo componente que cambie según la sección).

3. **Protección**
   - Envolver las rutas de `/empresas/*` con `ProtectedRoute` (o un futuro `EmpresasRoute` que compruebe rol) para que solo usuarios autenticados (y si aplica, con rol empresas) entren.

Con esto, al hacer clic en “CODA Empresas” y en los enlaces internos ya se navega dentro de la misma web, sin redirigir a otro puerto.

---

### Fase 3: Migrar pantallas de Empresas una a una (1–2 semanas)

Para cada pantalla del repo Empresas (Next.js):

1. **Recrear la pantalla en React** dentro de `apps/web/src/pages/empresas/`:
   - Misma estructura de datos (estado, formularios, tablas).
   - Reutilizar componentes de `@/components/ui` (Button, Card, Table, etc.) para mantener el look de CODA.
   - Si en Empresas usan componentes propios, traerlos a `components/empresas/` y adaptarlos a React (sin `getServerSideProps` ni API routes de Next).

2. **Llamadas a API**
   - Donde Empresas (Next) llamaba a su API (puerto 3000 o rutas de Next):
     - **Opción A (recomendada)**: llamar a `apps/api` de CODA. Para eso hay que implementar en Fase 4 las rutas en `apps/api` que replican la lógica de Empresas.
     - **Opción B (transitoria)**: que el frontend de CODA llame todavía a la API actual de Empresas (por URL configurable, p. ej. `VITE_EMPRESAS_API_URL`). Mismo dominio no es necesario; CORS permitiendo, funciona. Luego se migra la lógica a `apps/api` y se cambia la URL.

3. **Orden sugerido**
   - EmpresasDashboard (resumen).
   - EmpresasCompanies (CRUD empresas).
   - EmpresasTransactions (listado/filtros).
   - EmpresasReconciliation, EmpresasStatements, EmpresasRisk según prioridad.

Al terminar cada pantalla, la ruta correspondiente deja de ser “transición” y pasa a ser la página real. Cuando todas estén listas, se puede eliminar `EmpresasTransition` y el enlace externo.

---

### Fase 4: API de Empresas en `apps/api` (en paralelo o después)

Para que todo viva en un solo backend (y un solo deploy):

1. **Rutas nuevas** en `apps/api` bajo un prefijo, por ejemplo `/api/empresas/`:
   - Companies: list, get, create, update, delete.
   - Transactions: list (por empresa, fechas, etc.).
   - Reconciliation, statements, risk: según lo que use hoy la app Empresas.

2. **Base de datos**
   - **Opción A**: Añadir tablas/schemas de Empresas en el mismo `packages/db` (PostgreSQL/SQLite actual de CODA) y migrar datos desde la BD de Empresas si hace falta.
   - **Opción B**: Mantener temporalmente la BD de Empresas y que `apps/api` se conecte a esa BD solo para las rutas `/api/empresas/*`. Menos ideal a largo plazo pero permite tener una sola API y un solo frontend desde el día uno.

3. **Autenticación**
   - Reutilizar el mismo JWT / sesión que usa CODA. Si en el futuro quieres “solo usuarios Empresas”, se puede añadir un claim `role: 'empresas'` y comprobarlo en middleware de las rutas `/api/empresas/*`.

---

### Fase 5: Deploy y corte (1 día)

1. **Variables de entorno**
   - En producción, no definir `VITE_EMPRESAS_APP_URL` (o dejarla vacía) para que nadie use el enlace “Ir a CODA Empresas” en otra pestaña.
   - Si usaste API externa temporal, cuando la API esté en CODA, quitar `VITE_EMPRESAS_API_URL` o apuntarla al mismo origen.

2. **Build y deploy**
   - Sigue siendo un solo build: `npm run build -w @coda/web` (o el comando que uses). El deploy actual de CODA sirve la misma app con las nuevas rutas `/empresas/*`.

3. **Comunicación**
   - Si había usuarios usando directamente la URL de la app Empresas (ej. antigua en otro dominio), configurar redirección (301) de esas URLs a `https://tudominio.com/empresas/dashboard` (o la que corresponda).

---

## Resumen de decisiones

| Tema | Decisión |
|------|----------|
| Repo | Todo en el repo CODA; no hay repo nuevo. |
| Frontend | Una sola app: `apps/web`. Empresas = más rutas y páginas en la misma SPA. |
| Build | Un solo build de `apps/web`. |
| Backend | Misma API `apps/api`; se añaden rutas bajo `/api/empresas/*`. |
| Base de datos | Ideal: unificar en la BD de CODA. Transitorio: API de CODA puede hablar con la BD de Empresas. |
| Autenticación | La misma que CODA; opcionalmente roles (personal / empresas) más adelante. |

---

## Próximo paso inmediato

1. **Si tienes el repo de Empresas** (en otra carpeta o en otro equipo):  
   Haz un listado de pantallas y de endpoints que usa cada una (o comparte la estructura de rutas de Next y los `fetch`/`useEffect` de cada página). Con eso se puede bajar a detalle por pantalla (qué campos, qué tablas, qué permisos).

2. **Si no tienes aún el código de Empresas en este repo**:  
   Crear solo la **Fase 2** (layout + rutas reales con páginas placeholder). Así, al entrar en `/empresas/dashboard` ya estás dentro de la misma web; cada página puede mostrar “En construcción” hasta que se migre la lógica y el diseño desde el repo Empresas.

Si quieres, el siguiente paso puede ser: (a) esbozar `EmpresasLayout.tsx` y los componentes de rutas en `App.tsx`, o (b) definir las rutas de la API en `apps/api` para companies/transactions. Indica con cuál prefieres seguir y si ya tienes el código de Empresas disponible.
