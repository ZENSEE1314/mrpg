import "dotenv/config";

const isProd = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: process.env.JWT_SECRET ?? (isProd ? "" : "dev-secret-change-me"),
  dbPath: process.env.DB_PATH ?? (isProd ? "/data/aetheria.db" : "../data/aetheria.db"),
  corsOrigin: process.env.CORS_ORIGIN ?? (isProd ? "*" : "http://localhost:5173"),
  serveClient: isProd || process.env.SERVE_CLIENT === "1",
  clientDistPath: process.env.CLIENT_DIST_PATH ?? "../../client/dist",
  isProd,
  tickRateHz: 10,
  saveIntervalMs: 15_000,
};

if (isProd && !config.jwtSecret) {
  throw new Error("JWT_SECRET must be set in production");
}
