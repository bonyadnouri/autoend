import { fileURLToPath } from "node:url";

export default {
  plugins: {
    // Explicit config path: the build runs from the repo root, so Tailwind
    // would otherwise look for tailwind.config.js in the wrong directory.
    tailwindcss: { config: fileURLToPath(new URL("./tailwind.config.js", import.meta.url)) },
    autoprefixer: {},
  },
};
