import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/kkomo-pages/",
  plugins: [react()]
});
