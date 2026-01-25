// Set your backend API base URL for production (Render) and development (local)
// IMPORTANT: Set your actual Render backend URL below
export const API_BASE_URL =
  import.meta.env.MODE === "production"
    ? "https://coda-api-fplk.onrender.com/api"
    : "/api"; // Local dev uses Vite proxy
