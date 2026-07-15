import { Helmet } from "react-helmet-async";
import { useLocation } from "wouter";
import {
  BASE_URL,
  DEFAULT_OG_IMAGE,
  PUBLIC_ROUTES,
  ALIAS_ROUTES,
  PRIVATE_ROUTES,
  type RouteSeoEntry,
} from "@/lib/seo-routes";
import { FEATURES } from "@/config/features";

/** Look up SEO data for the current pathname. */
function getRouteSeo(pathname: string): RouteSeoEntry & { canonical: string } {
  const normalized = pathname.split("?")[0]?.replace(/\/$/, "") || "/";

  // Direct match: public, alias, or private
  const direct =
    PUBLIC_ROUTES[normalized] ?? ALIAS_ROUTES[normalized] ?? PRIVATE_ROUTES[normalized];

  if (direct) {
    const canonicalPath = direct.canonicalPath ?? normalized;
    return {
      ...direct,
      canonical: direct.noIndex ? "" : `${BASE_URL}${canonicalPath}`,
    };
  }

  // Empresas sub-routes — all noIndex. Only emitted when CODA Empresas flag is on.
  if (FEATURES.codaEmpresas && normalized.startsWith("/empresas/")) {
    return { title: "CODA Empresas", description: "", canonical: "", noIndex: true };
  }

  // /dividir/:code public share pages
  if (normalized.startsWith("/dividir/")) {
    return {
      title: "Dividir Cuenta | CODA",
      description: "Te invitaron a dividir una cuenta. Revisa los detalles y paga tu parte.",
      canonical: `${BASE_URL}${normalized}`,
      noIndex: true,
    };
  }

  return { title: "CODA", description: "", canonical: "", noIndex: true };
}

export default function SeoHelmet() {
  const [location] = useLocation();
  const seo = getRouteSeo(location);

  return (
    <Helmet>
      <title>{seo.title}</title>

      {seo.description && <meta name="description" content={seo.description} />}
      {seo.canonical && <link rel="canonical" href={seo.canonical} />}

      {seo.noIndex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={seo.title} />
      {seo.description && <meta property="og:description" content={seo.description} />}
      {seo.canonical && <meta property="og:url" content={seo.canonical} />}
      <meta property="og:image" content={seo.ogImage || DEFAULT_OG_IMAGE} />
      <meta property="og:locale" content="es_CL" />
      <meta property="og:site_name" content="CODA" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={seo.title} />
      {seo.description && <meta name="twitter:description" content={seo.description} />}
      <meta name="twitter:image" content={seo.ogImage || DEFAULT_OG_IMAGE} />
    </Helmet>
  );
}
