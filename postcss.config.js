import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the Tailwind config path relative to this file, not the process CWD.
// This avoids failures when running Vite from the client directory (5173)
// or the backend dev server that mounts Vite as middleware.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tailwindConfigPath = path.join(__dirname, "client", "tailwind.config.ts");

export default {
  plugins: {
    tailwindcss: { config: tailwindConfigPath },
    autoprefixer: {},
  },
};
