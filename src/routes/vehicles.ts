import { Router } from "express";
import type { Db } from "../db.js";
import { parseId, vehicleSchema, type Vehicle } from "../schemas.js";

function toVehicle(row: Record<string, unknown>): Vehicle {
  return {
    id: row["id"] as number,
    brand: row["brand"] as string,
    model: row["model"] as string,
    year: row["year"] as number,
    mileage: row["mileage"] as number,
    fuel: (row["fuel"] as string) ?? undefined,
    plate: (row["plate"] as string) ?? undefined,
    created_at: row["created_at"] as string,
  };
}

function nullIfEmpty(v: string | undefined): string | null {
  return v === undefined || v === "" ? null : v;
}

export function vehicleRouter(db: Db): Router {
  const r = Router();

  r.get("/", (_req, res) => {
    const rows = db.prepare("SELECT * FROM vehicles ORDER BY id DESC").all() as Record<string, unknown>[];
    res.json({ vehicles: rows.map(toVehicle) });
  });

  r.post("/", (req, res) => {
    const parsed = vehicleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Données du véhicule invalides.", details: parsed.error.flatten() },
      });
      return;
    }
    const v = parsed.data;
    const result = db
      .prepare("INSERT INTO vehicles (brand, model, year, mileage, fuel, plate) VALUES (?, ?, ?, ?, ?, ?)")
      .run(v.brand, v.model, v.year, v.mileage, nullIfEmpty(v.fuel), nullIfEmpty(v.plate));
    const id = Number(result.lastInsertRowid);
    const row = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as Record<string, unknown>;
    res.status(201).json({ vehicle: toVehicle(row) });
  });

  r.get("/:id", (req, res) => {
    const id = parseId(req.params["id"]);
    if (id === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant invalide." } });
      return;
    }
    const row = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Véhicule introuvable." } });
      return;
    }
    res.json({ vehicle: toVehicle(row) });
  });

  r.put("/:id", (req, res) => {
    const id = parseId(req.params["id"]);
    if (id === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant invalide." } });
      return;
    }
    const parsed = vehicleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Données du véhicule invalides.", details: parsed.error.flatten() },
      });
      return;
    }
    const existing = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(id) as unknown;
    if (!existing) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Véhicule introuvable." } });
      return;
    }
    const v = parsed.data;
    db.prepare("UPDATE vehicles SET brand=?, model=?, year=?, mileage=?, fuel=?, plate=? WHERE id=?").run(
      v.brand, v.model, v.year, v.mileage, nullIfEmpty(v.fuel), nullIfEmpty(v.plate), id,
    );
    const row = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(id) as Record<string, unknown>;
    res.json({ vehicle: toVehicle(row) });
  });

  r.delete("/:id", (req, res) => {
    const id = parseId(req.params["id"]);
    if (id === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant invalide." } });
      return;
    }
    const result = db.prepare("DELETE FROM vehicles WHERE id = ?").run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Véhicule introuvable." } });
      return;
    }
    res.status(204).end();
  });

  return r;
}
