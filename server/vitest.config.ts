import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 30000,
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-jwt-secret",
      PAYMONGO_MOCK: "true",
      OTP_LOG_CODE: "true",
      DOCUMENT_ENCRYPTION_KEY: "test-document-key",
      GMAIL_USER: "",
      GMAIL_APP_PASSWORD: "",
      CLIENT_ORIGIN: "http://localhost:5173",
    },
  },
});
