export * from "./api.tsx";
export * from "./apiFetch";

// Centralized API URL for the frontend
export const API_URL: string = import.meta.env.VITE_API_URL as string;
