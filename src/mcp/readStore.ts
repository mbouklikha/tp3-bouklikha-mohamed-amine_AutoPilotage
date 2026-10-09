import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { reminderStatus } from "../schemas.js";

/** Chemin fixe de la base AutoPilotage (aucun chemin libre exposé aux outils). */
export function defaultMcpDbPath(): string {
  return path.resolve(process.cwd(), "data", "autopilotage.db");
}

/**
 * Ouvre la base en lecture seule. Ne crée jamais de fichier :
 * échoue avec un message clair si la base est absente ou inaccessible.
 */
export function openReadOnlyDatabase(dbPath: string): DatabaseSync {
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Base AutoPilotage introuvable (${dbPath}). Lancez d'abord l'application (npm run dev) pour la créer.`,
    );
  }
  try {
    return new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    throw new Error(`Base AutoPilotage inaccessible (${dbPath}). Vérifiez les permissions du fichier.`);
  }
}

export interface VehicleSummary {
  id: number;
  brand: string;
  model: string;
  year: number;
  mileage: number;
}

export interface MaintenanceSummary {
  perVehicle: { vehicle_id: number; brand: string; model: string; count: number; total: number }[];
  perType: { type: string; count: number; total: number }[];
  recordCount: number;
  grandTotal: number;
}

export interface ReminderSummary {
  id: number;
  vehicle_id: number;
  vehicle: string;
  title: string;
  due_date?: string;
  due_mileage?: number;
  done: boolean;
  status: string;
}

function withReadDb<T>(dbPath: string, fn: (db: DatabaseSync) => T): T {
  const db = openReadOnlyDatabase(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** Requêtes SELECT uniquement, paramétrées. */
export function readVehicles(dbPath: string): VehicleSummary[] {
  return withReadDb(dbPath, (db) => {
    const rows = db
      .prepare("SELECT id, brand, model, year, mileage FROM vehicles ORDER BY brand, model")
      .all() as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row["id"] as number,
      brand: row["brand"] as string,
      model: row["model"] as string,
      year: row["year"] as number,
      mileage: row["mileage"] as number,
    }));
  });
}

export function readMaintenanceSummary(dbPath: string, vehicleId?: number): MaintenanceSummary {
  return withReadDb(dbPath, (db) => {
    const filter = vehicleId === undefined ? "" : "WHERE m.vehicle_id = ?";
    const args = vehicleId === undefined ? [] : [vehicleId];
    const perVehicle = db
      .prepare(
        `SELECT v.id AS vehicle_id, v.brand AS brand, v.model AS model,
                COUNT(m.id) AS count, COALESCE(SUM(m.cost), 0) AS total
         FROM vehicles v LEFT JOIN maintenance m ON m.vehicle_id = v.id
         ${vehicleId === undefined ? "" : "WHERE v.id = ?"}
         GROUP BY v.id ORDER BY v.brand, v.model`,
      )
      .all(...args) as Record<string, unknown>[];
    const perType = db
      .prepare(
        `SELECT type, COUNT(*) AS count, COALESCE(SUM(cost), 0) AS total
         FROM maintenance m ${filter} GROUP BY type ORDER BY type`,
      )
      .all(...args) as Record<string, unknown>[];
    const totals = db
      .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(cost), 0) AS total FROM maintenance m ${filter}`)
      .get(...args) as { n: number; total: number };
    return {
      perVehicle: perVehicle.map((row) => ({
        vehicle_id: row["vehicle_id"] as number,
        brand: row["brand"] as string,
        model: row["model"] as string,
        count: row["count"] as number,
        total: row["total"] as number,
      })),
      perType: perType.map((row) => ({
        type: row["type"] as string,
        count: row["count"] as number,
        total: row["total"] as number,
      })),
      recordCount: totals.n,
      grandTotal: totals.total,
    };
  });
}

export function readReminders(dbPath: string, status?: string, vehicleId?: number): ReminderSummary[] {
  return withReadDb(dbPath, (db) => {
    const conditions: string[] = [];
    const args: number[] = [];
    if (vehicleId !== undefined) {
      conditions.push("r.vehicle_id = ?");
      args.push(vehicleId);
    }
    const rows = db
      .prepare(
        `SELECT r.id, r.vehicle_id, r.title, r.due_date, r.due_mileage, r.done,
                v.brand, v.model, v.mileage
         FROM reminders r JOIN vehicles v ON v.id = r.vehicle_id
         ${conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`}
         ORDER BY r.id DESC`,
      )
      .all(...args) as Record<string, unknown>[];
    const all = rows.map((row) => {
      const dueDate = row["due_date"] as string | null;
      const dueMileage = row["due_mileage"] as number | null;
      const done = (row["done"] as number) === 1;
      return {
        id: row["id"] as number,
        vehicle_id: row["vehicle_id"] as number,
        vehicle: `${row["brand"] as string} ${row["model"] as string}`,
        title: row["title"] as string,
        due_date: dueDate ?? undefined,
        due_mileage: dueMileage ?? undefined,
        done,
        status: reminderStatus(
          { due_date: dueDate ?? undefined, due_mileage: dueMileage ?? undefined, done },
          row["mileage"] as number,
        ),
      };
    });
    return status === undefined ? all : all.filter((r) => r.status === status);
  });
}
