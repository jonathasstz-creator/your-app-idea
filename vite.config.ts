import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react({
      // Only apply React Fast Refresh to files outside src/viewer/.
      // The viewer manages its own React lifecycle imperatively.
      include: /src\/(?!viewer\/).*\.(jsx|tsx)$/,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
