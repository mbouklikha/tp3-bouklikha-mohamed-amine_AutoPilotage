import { Router } from "express";
import type { Db } from "../db.js";
import { maintenanceSchema, parseId, type MaintenanceRecord } from "../schemas.js";

function toRecord(row: Record<string, unknown>): MaintenanceRecord {
  return {
    id: row["id"] as number,
    vehicle_id: row["vehicle_id"] as number,
    type: row["type"] as MaintenanceRecord["type"],
    title: row["title"] as string,
    description: (row["description"] as string) ?? undefined,
    date: row["date"] as string,
    mileage: row["mileage"] as number,
    cost: row["cost"] as number,
    created_at: row["created_at"] as string,
  };
}

function paramsOf(req: { params: unknown }): Record<string, string> {
  return req.params as Record<string, string>;
}

function nullIfEmpty(v: string | undefined): string | null {
  return v === undefined || v === "" ? null : v;
}

function vehicleExists(db: Db, id: number): boolean {
  return db.prepare("SELECT id FROM vehicles WHERE id = ?").get(id) !== undefined;
}

/** Routes imbriquées sous /api/vehicles/:vehicleId/maintenance */
export function maintenanceRouter(db: Db): Router {
  const r = Router({ mergeParams: true });

  function resolveVehicle(reqId: unknown): { id: number } | { status: 400 | 404; message: string } {
    const id = parseId(reqId);
    if (id === null) return { status: 400, message: "Identifiant de véhicule invalide." };
    if (!vehicleExists(db, id)) return { status: 404, message: "Véhicule introuvable." };
    return { id };
  }

  r.get("/", (req, res) => {
    const v = resolveVehicle(paramsOf(req)["vehicleId"]);
    if ("status" in v) {
      res.status(v.status).json({ error: { code: v.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message: v.message } });
      return;
    }
    const rows = db
      .prepare("SELECT * FROM maintenance WHERE vehicle_id = ? ORDER BY date DESC, id DESC")
      .all(v.id) as Record<string, unknown>[];
    const total = db
      .prepare("SELECT COALESCE(SUM(cost), 0) AS total FROM maintenance WHERE vehicle_id = ?")
      .get(v.id) as { total: number };
    res.json({ records: rows.map(toRecord), total: total.total });
  });

  r.post("/", (req, res) => {
    const v = resolveVehicle(paramsOf(req)["vehicleId"]);
    if ("status" in v) {
      res.status(v.status).json({ error: { code: v.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message: v.message } });
      return;
    }
    const parsed = maintenanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Données d'intervention invalides.", details: parsed.error.flatten() },
      });
      return;
    }
    const m = parsed.data;
    const result = db
      .prepare("INSERT INTO maintenance (vehicle_id, type, title, description, date, mileage, cost) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(v.id, m.type, m.title, nullIfEmpty(m.description), m.date, m.mileage, m.cost);
    const row = db.prepare("SELECT * FROM maintenance WHERE id = ?").get(Number(result.lastInsertRowid)) as Record<string, unknown>;
    res.status(201).json({ record: toRecord(row) });
  });

  r.put("/:recordId", (req, res) => {
    const v = resolveVehicle(paramsOf(req)["vehicleId"]);
    if ("status" in v) {
      res.status(v.status).json({ error: { code: v.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message: v.message } });
      return;
    }
    const recordId = parseId(paramsOf(req)["recordId"]);
    if (recordId === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant d'intervention invalide." } });
      return;
    }
    const parsed = maintenanceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Données d'intervention invalides.", details: parsed.error.flatten() },
      });
      return;
    }
    const existing = db
      .prepare("SELECT id FROM maintenance WHERE id = ? AND vehicle_id = ?")
      .get(recordId, v.id) as unknown;
    if (!existing) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Intervention introuvable." } });
      return;
    }
    const m = parsed.data;
    db.prepare("UPDATE maintenance SET type=?, title=?, description=?, date=?, mileage=?, cost=? WHERE id=?").run(
      m.type, m.title, nullIfEmpty(m.description), m.date, m.mileage, m.cost, recordId,
    );
    const row = db.prepare("SELECT * FROM maintenance WHERE id = ?").get(recordId) as Record<string, unknown>;
    res.json({ record: toRecord(row) });
  });

  r.delete("/:recordId", (req, res) => {
    const v = resolveVehicle(paramsOf(req)["vehicleId"]);
    if ("status" in v) {
      res.status(v.status).json({ error: { code: v.status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message: v.message } });
      return;
    }
    const recordId = parseId(paramsOf(req)["recordId"]);
    if (recordId === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant d'intervention invalide." } });
      return;
    }
    const result = db.prepare("DELETE FROM maintenance WHERE id = ? AND vehicle_id = ?").run(recordId, v.id);
    if (result.changes === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Intervention introuvable." } });
      return;
    }
    res.status(204).end();
  });

  return r;
}
