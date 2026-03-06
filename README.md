# CODA

**CODA** es la plataforma de salud financiera para personas en Chile: credit score con ML, riesgo de seguros, gastos, metas, división de cuentas y recomendación de productos.

**CODA Empresas** es la misma plataforma para PYMEs: consolidación de caja, Open Banking, facturas DTE, reconciliación, estados financieros y evaluación de riesgo crediticio. Todo en la misma web y la misma base de datos.

---

## Stack

- **API:** Node.js + Express (puerto 5000)
- **Web:** React 18 + Vite (puerto 5173)
- **BD:** Drizzle ORM — PostgreSQL en producción (Render), SQLite opcional en local
- **ML:** Python 3.10+ (XGBoost, scikit-learn, SHAP) para credit scoring
- **Compliance:** Sistema de trazabilidad algorítmica (NCG 502)

```
CODA/
├── apps/api/           # Backend (Node.js + Express)
│   ├── ml/             # Python ML models (credit scoring)
│   └── src/
│       └── services/
│           ├── audit/  # Trazabilidad algorítmica (CMF compliance)
│           ├── creditScoring/  # Enhanced ML scoring
│           └── ...
├── apps/web/           # Frontend (React + Vite)
├── packages/           # Schema y lógica compartida (db)
└── migrations/         # SQL migrations para PostgreSQL
```

---

## Desarrollo

```bash
git clone <repo>
cd CODA
npm install
cp apps/api/.env.example apps/api/.env   # Completar DATABASE_URL, JWT_SECRET, etc.
npm run db:push    # Desde raíz; con DATABASE_URL usa Postgres
npm run dev        # API en :5000
npm run dev:web    # Web en :5173
```

Variables mínimas: `DATABASE_URL` (Postgres en prod), `JWT_SECRET`, `CORS_ORIGINS`, `CLIENT_URL`. Ver `apps/api/.env.example`.

---

## Deploy

- **Producción:** Postgres (Render). Local: SQLite opcional.

**Backend (Render)**  
Web Service, root `apps/api`, build `npm install --include=dev && npm run build`, start `npm start`. Variables: `NODE_ENV=production`, `PORT=5000`, `DATABASE_URL` (Internal URL de Render Postgres), `JWT_SECRET`, `CORS_ORIGINS`, `CLIENT_URL`, `DEBUG_ENDPOINTS=false`.  
**Login con usuarios demo (Personal y Empresas):** en producción hay que activar `DEMO_MODE=true` en Environment de Render; si no, el login con usuario demo falla. Para tener una empresa demo al entrar a CODA Empresas, en el dashboard de Empresas aparece el botón "Crear empresa demo" cuando no hay empresas, o se puede llamar una vez `POST /api/empresas/seed-demo`.

**Tablas Empresas en Postgres:** Si la API devuelve `relation "empresas_companies" does not exist`, crear solo esas tablas con:
```bash
psql "$DATABASE_URL" -f scripts/empresas-tables-postgres.sql
```
(Usar la **External** URL completa, p. ej. `...@host.virginia-postgres.render.com/db?sslmode=require`). O pegar el contenido del script en la consola SQL de Render.

**Datos de ejemplo Empresas:** Para ver el dashboard con 1–2 empresas de prueba:
```bash
DATABASE_URL="postgresql://..." npm run seed:empresas -w @coda/api
```

**Frontend (Vercel)**  
Root `apps/web`, variables `VITE_API_URL` (URL del API en Render) y `VITE_ENV=production`.

---

## Scripts

| Comando        | Uso                |
|----------------|--------------------|
| `npm run dev`  | API                |
| `npm run dev:web` | Web             |
| `npm run db:push` | Aplicar schema (raíz; con `DATABASE_URL` = Postgres) |
| `npm run db:seed` | Seed (opcional) |
| `npm run seed:empresas` | Seed empresas de ejemplo (desde raíz: `npm run seed:empresas -w @coda/api`; requiere `DATABASE_URL`) |
| `npm run build`   | Build producción |
| `npm run test`    | Tests API        |

---

## Upload de Documentos 📄

Sistema robusto de procesamiento de documentos oficiales:

### Formatos Soportados
- ✅ **PDF** (nativos o escaneados)
- ✅ **PNG / JPG / WEBP** (convertidos automáticamente)

### Características
- **Validación multi-capa:** tamaño (1KB-10MB), formato, integridad, seguridad
- **OCR automático:** Tesseract.js para documentos escaneados (español)
- **Retry logic:** hasta 3 intentos con exponential backoff
- **Mensajes claros:** errores específicos por paso (validation → extraction → parsing → scoring)
- **Warnings informativos:** separados de errores, no bloquean procesamiento

### Documentos Aceptados
1. **Informe de Deudas CMF** → Credit Score (300-850)
2. **Cartola Bancaria** → Transactional Score (0-1000)

### API
```bash
POST /api/documents/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body: document=@archivo.pdf
```

**Response:**
```json
{
  "step": "done",
  "documentType": "cmf_informe_deudas",
  "creditScore": 680,
  "warnings": ["El documento puede estar escaneado (OCR aplicado)."],
  "metadata": { ... }
}
```

Ver documentación completa: [`DOCUMENT_UPLOAD_IMPROVEMENTS.md`](./DOCUMENT_UPLOAD_IMPROVEMENTS.md)

---

*WeGroup 🇨🇱*
