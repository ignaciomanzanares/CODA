// API base URL - uses VITE_API_URL in production, Vite proxy in development
export const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";
