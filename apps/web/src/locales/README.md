# Traducción automática (i18n)

## Cómo funciona

- **Español** es el idioma por defecto (`es.json`).
- **Inglés** se puede generar automáticamente desde español con el script de DeepL.

## Traducción automática con DeepL

1. Obtén una API key gratuita en [DeepL](https://www.deepl.com/pro-api) (plan free: 500.000 caracteres/mes).
2. Desde la raíz de `apps/web`:

```bash
# Generar en.json a partir de es.json (traducción ES → EN)
DEEPL_AUTH_KEY=tu_api_key npm run translate:en

# Generar es.json a partir de en.json (traducción EN → ES)
DEEPL_AUTH_KEY=tu_api_key npm run translate:es
```

O directamente:

```bash
DEEPL_AUTH_KEY=tu_api_key node scripts/translate-auto.mjs --source es --target en
```

## Usar los textos en componentes

En cualquier componente:

```tsx
import { useTranslation } from "react-i18next";

function MiComponente() {
  const { t } = useTranslation();
  return <h1>{t("landing.heroTitle")} {t("landing.heroTitleHighlight")}</h1>;
}
```

Para cambiar el idioma en tiempo de ejecución:

```tsx
const { i18n } = useTranslation();
i18n.changeLanguage("en"); // o "es"
```

## Estructura de claves

- `nav.*` – Navegación (panel, gastos, perfil, etc.)
- `landing.*` – Landing page
- `auth.*` – Login, registro
- `dashboard.*` – Panel de control
- `common.*` – Común (guardar, cancelar, etc.)

Al añadir nuevas claves, edita solo `es.json` (o el idioma que mantengas como fuente) y vuelve a ejecutar el script para actualizar el otro idioma.
