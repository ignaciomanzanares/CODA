import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { Auth0Provider } from "@auth0/auth0-react";

// Use environment variables for Auth0 configuration
const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN || "dev-klhap06xvhqbtvbi.us.auth0.com";
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID || "9vk8ApGUVUO4txi1wQGOo5PoymgvQrqm";
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE || "https://finhealth-api";
const redirectUri = import.meta.env.VITE_AUTH0_REDIRECT_URI || window.location.origin;

createRoot(document.getElementById("root")!).render(
  <Auth0Provider
    domain={auth0Domain}
    clientId={auth0ClientId}
    authorizationParams={{
      redirect_uri: redirectUri,
      audience: auth0Audience
    }}
    cacheLocation="localstorage"
    useRefreshTokens={true}
  >
    <App />
  </Auth0Provider>
);
