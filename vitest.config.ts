import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // 15s invece dei 5s di default: la suite gira in parallelo su più worker
    // e i test che montano componenti pesanti (menu Radix, form completi)
    // superavano i 5s SOTTO CARICO pur passando in 300ms da soli — rossi che
    // non erano regressioni e costavano ogni volta una verifica in isolamento.
    // Resta un tetto vero: un test appeso fallisce comunque, solo più tardi.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
