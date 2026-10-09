import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type Db = DatabaseSync;

export function openDatabase(dbPath: string): Db {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      mileage INTEGER NOT NULL DEFAULT 0,
      fuel TEXT,
      plate TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

export function defaultDbPath(): string {
  // src/ -> racine en dev, dist/src/ -> racine en prod
  const here = new URL(import.meta.url);
  const dir = path.dirname(here.pathname.replace(/^\//, "").replace(/%20/g, " "));
  void dir;
  const cwd = process.cwd();
  return path.join(cwd, "data", "autopilotage.db");
}
