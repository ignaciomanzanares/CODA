import { Helmet } from "react-helmet-async";
import { useLocation } from "wouter";
import { getPageTitle } from "@/lib/pageTitles";

/**
 * Actualiza &lt;title&gt; según la ruta (react-helmet-async).
 */
export default function SeoHelmet() {
  const [location] = useLocation();
  const title = getPageTitle(location);

  return (
    <Helmet>
      <title>{title}</title>
    </Helmet>
  );
}
