import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { Toaster } from "@/components/ui/toaster";
import { Auth0Provider } from "@auth0/auth0-react";

createRoot(document.getElementById("root")!).render(
  <Auth0Provider
    domain="dev-klhap06xvhqbtvbi.us.auth0.com"
    clientId="9vk8ApGUVUO4txi1wQGOo5PoymgvQrqm"
    authorizationParams={{
      redirect_uri: "http://localhost:5173",
      audience: "https://finhealth-api"
    }}
    cacheLocation="localstorage"
    useRefreshTokens={true}
  >
    <App />
    <Toaster />
  </Auth0Provider>
);