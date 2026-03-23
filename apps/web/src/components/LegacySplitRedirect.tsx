import { Redirect, useParams } from "wouter";

/** Redirige enlaces antiguos `/split/:code` a `/dividir/:codigo`. */
export default function LegacySplitRedirect() {
  const { code } = useParams<{ code: string }>();
  return <Redirect to={`/dividir/${code ?? ""}`} />;
}
