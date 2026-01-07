import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the Tailwind config path relative to this file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tailwindConfigPath = path.join(__dirname, "tailwind.config.ts");

export default {
  plugins: {
    tailwindcss: { config: tailwindConfigPath },
    autoprefixer: {},
  },
};
