import { Router } from "express";
import type { Db } from "../db.js";
import {
  parseId,
  reminderSchema,
  reminderStatus,
  type Reminder,
  type ReminderStatus,
} from "../schemas.js";

interface VehicleInfo {
  id: number;
  brand: string;
  model: string;
  mileage: number;
}

export interface ReminderView extends Reminder {
  status: ReminderStatus;
  vehicle: VehicleInfo;
}

function toReminder(row: Record<string, unknown>): Reminder {
  const dueDate = row["due_date"] as string | null;
  const dueMileage = row["due_mileage"] as number | null;
  return {
    id: row["id"] as number,
    vehicle_id: row["vehicle_id"] as number,
    title: row["title"] as string,
    due_date: dueDate ?? undefined,
    due_mileage: dueMileage ?? undefined,
    done: (row["done"] as number) === 1,
    created_at: row["created_at"] as string,
  };
}

function toView(db: Db, r: Reminder): ReminderView | null {
  const v = db.prepare("SELECT id, brand, model, mileage FROM vehicles WHERE id = ?").get(r.vehicle_id) as
    | Record<string, unknown>
    | undefined;
  if (!v) return null;
  const info: VehicleInfo = {
    id: v["id"] as number,
    brand: v["brand"] as string,
    model: v["model"] as string,
    mileage: v["mileage"] as number,
  };
  return { ...r, status: reminderStatus(r, info.mileage), vehicle: info };
}

function nullIfEmpty(v: string | undefined): string | null {
  return v === undefined || v === "" ? null : v;
}

function nullIfUndefined(v: number | undefined): number | null {
  return v === undefined ? null : v;
}

/** Routes /api/reminders (liste globale avec statut + véhicule). */
export function reminderRouter(db: Db): Router {
  const r = Router();

  r.get("/", (req, res) => {
    const statusFilter = typeof req.query["status"] === "string" ? req.query["status"] : undefined;
    if (statusFilter !== undefined && statusFilter !== "a_venir" && statusFilter !== "en_retard" && statusFilter !== "termine") {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Filtre de statut invalide." } });
      return;
    }
    const vehicleFilter = req.query["vehicle_id"] === undefined ? undefined : parseId(req.query["vehicle_id"]);
    if (req.query["vehicle_id"] !== undefined && vehicleFilter === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant de véhicule invalide." } });
      return;
    }
    const rows = db.prepare("SELECT * FROM reminders ORDER BY done ASC, id DESC").all() as Record<string, unknown>[];
    const views: ReminderView[] = [];
    for (const row of rows) {
      const view = toView(db, toReminder(row));
      if (!view) continue;
      if (vehicleFilter !== undefined && view.vehicle_id !== vehicleFilter) continue;
      if (statusFilter !== undefined && view.status !== statusFilter) continue;
      views.push(view);
    }
    res.json({ reminders: views });
  });

  r.post("/", (req, res) => {
    const parsed = reminderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Données de rappel invalides.", details: parsed.error.flatten() },
      });
      return;
    }
    const exists = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(parsed.data.vehicle_id) !== undefined;
    if (!exists) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Véhicule introuvable." } });
      return;
    }
    const m = parsed.data;
    const result = db
      .prepare("INSERT INTO reminders (vehicle_id, title, due_date, due_mileage, done) VALUES (?, ?, ?, ?, ?)")
      .run(m.vehicle_id, m.title, nullIfEmpty(m.due_date), nullIfUndefined(m.due_mileage), m.done === true ? 1 : 0);
    const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(Number(result.lastInsertRowid)) as Record<string, unknown>;
    res.status(201).json({ reminder: toView(db, toReminder(row)) });
  });

  r.put("/:id", (req, res) => {
    const params = req.params as Record<string, string>;
    const id = parseId(params["id"]);
    if (id === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant de rappel invalide." } });
      return;
    }
    const parsed = reminderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Données de rappel invalides.", details: parsed.error.flatten() },
      });
      return;
    }
    const existing = db.prepare("SELECT id FROM reminders WHERE id = ?").get(id) as unknown;
    if (!existing) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Rappel introuvable." } });
      return;
    }
    const exists = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(parsed.data.vehicle_id) !== undefined;
    if (!exists) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Véhicule introuvable." } });
      return;
    }
    const m = parsed.data;
    db.prepare("UPDATE reminders SET vehicle_id=?, title=?, due_date=?, due_mileage=?, done=? WHERE id=?").run(
      m.vehicle_id, m.title, nullIfEmpty(m.due_date), nullIfUndefined(m.due_mileage), m.done === true ? 1 : 0, id,
    );
    const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(id) as Record<string, unknown>;
    res.json({ reminder: toView(db, toReminder(row)) });
  });

  r.delete("/:id", (req, res) => {
    const params = req.params as Record<string, string>;
    const id = parseId(params["id"]);
    if (id === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant de rappel invalide." } });
      return;
    }
    const result = db.prepare("DELETE FROM reminders WHERE id = ?").run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Rappel introuvable." } });
      return;
    }
    res.status(204).end();
  });

  return r;
}
