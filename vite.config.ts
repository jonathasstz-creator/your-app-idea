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
      // Exclude viewer files from React Fast Refresh to avoid RefreshRuntime conflicts.
      // The viewer manages its own React lifecycle imperatively.
      exclude: /src\/viewer\/.*/,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
