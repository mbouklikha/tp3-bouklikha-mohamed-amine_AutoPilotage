import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "node:fs";
import { defaultDbPath, openDatabase } from "./db.js";
import { vehicleRouter } from "./routes/vehicles.js";
import { maintenanceRouter } from "./routes/maintenance.js";
import { reminderRouter } from "./routes/reminders.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [path.resolve(here, "..", "public"), path.resolve(here, "..", "..", "public")];
const found = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));
const publicDir: string = found ?? (candidates[0] as string);

export interface AppOptions {
  dbPath?: string;
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  app.use(express.json());
  const db = openDatabase(options.dbPath ?? defaultDbPath());
  app.locals["db"] = db;
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "autopilotage", version: "0.1.0" });
  });
  app.use("/api/vehicles", vehicleRouter(db));
  app.use("/api/vehicles/:vehicleId/maintenance", maintenanceRouter(db));
  app.use("/api/reminders", reminderRouter(db));
  app.use(express.static(publicDir));
  // JSON 404 for unknown API routes; let static middleware handle the rest.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route API inconnue." } });
  });
  // Centralized error handler (must be last).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur." } });
  });
  return app;
}
