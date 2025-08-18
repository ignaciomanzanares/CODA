import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { Toaster } from "@/components/ui/toaster";
import { Auth0Provider } from "@auth0/auth0-react";

createRoot(document.getElementById("root")!).render(
  <Auth0Provider
    domain="dev-klhap06xvhqbtvbi.us.auth0.com"
    clientId="Cy3qCLzDxKMFHYSBumvivFx3OSRtRhkv"
    authorizationParams={{
      redirect_uri: window.location.origin,
      audience: "https://finhealth-api"
    }}
  >
    <App />
    <Toaster />
  </Auth0Provider>
);