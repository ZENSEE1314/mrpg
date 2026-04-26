import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  dbPath: process.env.DB_PATH ?? "../data/aetheria.db",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  tickRateHz: 10,
  saveIntervalMs: 15_000,
};
