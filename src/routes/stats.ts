import { Router } from "express";
import type { Db } from "../db.js";
import { parseId } from "../schemas.js";

export interface VehicleStat {
  vehicle_id: number;
  brand: string;
  model: string;
  total: number;
  count: number;
}

export interface TypeStat {
  type: string;
  total: number;
  count: number;
}

export interface Stats {
  vehicle_id: number | null;
  vehicleCount: number;
  totalMileage: number;
  recordCount: number;
  totalCost: number;
  averageCost: number;
  byVehicle: VehicleStat[];
  byType: TypeStat[];
}

/** GET /api/stats — statistiques calculées depuis SQLite. */
export function statsRouter(db: Db): Router {
  const r = Router();

  r.get("/", (req, res) => {
    let vehicleId: number | null = null;
    if (req.query["vehicle_id"] !== undefined) {
      const parsed = parseId(req.query["vehicle_id"]);
      if (parsed === null) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant de véhicule invalide." } });
        return;
      }
      const exists = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(parsed) !== undefined;
      if (!exists) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Véhicule introuvable." } });
        return;
      }
      vehicleId = parsed;
    }

    const vehicleFilter = vehicleId === null ? "" : "WHERE id = ?";
    const maintFilter = vehicleId === null ? "" : "WHERE vehicle_id = ?";
    const args = vehicleId === null ? [] : [vehicleId];

    const vRow = db
      .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(mileage), 0) AS km FROM vehicles ${vehicleFilter}`)
      .get(...args) as { n: number; km: number };
    const mRow = db
      .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(cost), 0) AS total FROM maintenance ${maintFilter}`)
      .get(...args) as { n: number; total: number };
    const byVehicleRows = db
      .prepare(
        `SELECT v.id AS vehicle_id, v.brand AS brand, v.model AS model,
                COALESCE(SUM(m.cost), 0) AS total, COUNT(m.id) AS count
         FROM vehicles v LEFT JOIN maintenance m ON m.vehicle_id = v.id
         ${vehicleFilter === "" ? "" : "WHERE v.id = ?"}
         GROUP BY v.id ORDER BY total DESC`,
      )
      .all(...args) as Record<string, unknown>[];
    const byTypeRows = db
      .prepare(
        `SELECT type, COALESCE(SUM(cost), 0) AS total, COUNT(*) AS count
         FROM maintenance ${maintFilter} GROUP BY type ORDER BY total DESC`,
      )
      .all(...args) as Record<string, unknown>[];

    const stats: Stats = {
      vehicle_id: vehicleId,
      vehicleCount: vRow.n,
      totalMileage: vRow.km,
      recordCount: mRow.n,
      totalCost: mRow.total,
      averageCost: mRow.n === 0 ? 0 : mRow.total / mRow.n,
      byVehicle: byVehicleRows.map((row) => ({
        vehicle_id: row["vehicle_id"] as number,
        brand: row["brand"] as string,
        model: row["model"] as string,
        total: row["total"] as number,
        count: row["count"] as number,
      })),
      byType: byTypeRows.map((row) => ({
        type: row["type"] as string,
        total: row["total"] as number,
        count: row["count"] as number,
      })),
    };
    res.json({ stats });
  });

  return r;
}
