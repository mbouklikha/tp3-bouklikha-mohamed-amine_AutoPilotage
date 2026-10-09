import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "../db.js";
import { runTransaction } from "../db.js";
import { parseId, planCreateSchema } from "../schemas.js";
import {
  computePlan,
  normalizeTitle,
  type LastService,
  type PlanRule,
  type Suggestion,
} from "../services/plan.js";

interface PlanFile {
  disclaimer: string;
  rules: PlanRule[];
}

let cachedPlan: PlanFile | null = null;

function loadRules(): PlanFile {
  if (cachedPlan) return cachedPlan;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", "public", "maintenance-plan.json"),
    path.resolve(here, "..", "..", "public", "maintenance-plan.json"),
    // Build compilé : dist/src/routes -> racine du projet.
    path.resolve(here, "..", "..", "..", "public", "maintenance-plan.json"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as PlanFile;
    if (!Array.isArray(parsed.rules) || typeof parsed.disclaimer !== "string") {
      throw new Error("Catalogue de règles d'entretien invalide.");
    }
    cachedPlan = parsed;
    return parsed;
  }
  throw new Error("Catalogue de règles d'entretien introuvable.");
}

function paramsOf(req: { params: unknown }): Record<string, string> {
  return req.params as Record<string, string>;
}

interface VehicleRow {
  id: number;
  brand: string;
  model: string;
  mileage: number;
  fuel: string | null;
}

interface BuiltPlan {
  vehicle: VehicleRow;
  disclaimer: string;
  suggestions: Suggestion[];
  skipped: { category: string; reason: string }[];
}

function buildPlan(db: Db, id: number): BuiltPlan {
  const vehicle = db.prepare("SELECT id, brand, model, mileage, fuel FROM vehicles WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!vehicle) {
    throw Object.assign(new Error("Véhicule introuvable."), { status: 404, code: "NOT_FOUND" });
  }
  const plan = loadRules();

  // Dernier entretien pertinent par catégorie (requêtes paramétrées, véhicule filtré).
  const records = db
    .prepare("SELECT title, date, mileage FROM maintenance WHERE vehicle_id = ? ORDER BY date DESC, id DESC")
    .all(id) as Record<string, unknown>[];
  const historyByCat = new Map<string, LastService>();
  for (const row of records) {
    const category = normalizeTitle(row["title"] as string);
    if (category === null || historyByCat.has(category)) continue;
    historyByCat.set(category, {
      category,
      date: row["date"] as string,
      mileage: row["mileage"] as number,
    });
  }

  // Rappels actifs uniquement (done = 0) : les terminés ne bloquent pas une suggestion.
  const reminders = db
    .prepare("SELECT title FROM reminders WHERE vehicle_id = ? AND done = 0")
    .all(id) as Record<string, unknown>[];
  const pendingCategories = reminders
    .map((row) => normalizeTitle(row["title"] as string))
    .filter((c): c is string => c !== null);

  const result = computePlan({
    vehicle: { mileage: vehicle["mileage"] as number, fuel: (vehicle["fuel"] as string) ?? "" },
    rules: plan.rules,
    history: [...historyByCat.values()],
    pendingCategories,
    // Aucune source fiable sur le type de distribution : jamais inféré.
    timing: "unknown",
  });

  return {
    vehicle: {
      id: vehicle["id"] as number,
      brand: vehicle["brand"] as string,
      model: vehicle["model"] as string,
      mileage: vehicle["mileage"] as number,
      fuel: (vehicle["fuel"] as string) ?? null,
    },
    disclaimer: plan.disclaimer,
    suggestions: result.suggestions,
    skipped: result.skipped,
  };
}

/** Routes /api/vehicles/:vehicleId/plan — lecture des suggestions + création explicite. */
export function planRouter(db: Db): Router {
  const r = Router({ mergeParams: true });

  r.get("/", (req, res) => {
    const id = parseId(paramsOf(req)["vehicleId"]);
    if (id === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant de véhicule invalide." } });
      return;
    }
    let built: BuiltPlan;
    try {
      built = buildPlan(db, id);
    } catch (e) {
      if (e instanceof Error && (e as { status?: number }).status === 404) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Véhicule introuvable." } });
      } else {
        res.status(500).json({
          error: { code: "INTERNAL_ERROR", message: e instanceof Error ? e.message : "Catalogue indisponible." },
        });
      }
      return;
    }
    res.json({
      vehicle: { id: built.vehicle.id, brand: built.vehicle.brand, model: built.vehicle.model },
      disclaimer: built.disclaimer,
      suggestions: built.suggestions,
      skipped: built.skipped,
    });
  });

  r.post("/", (req, res) => {
    const id = parseId(paramsOf(req)["vehicleId"]);
    if (id === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant de véhicule invalide." } });
      return;
    }
    const parsed = planCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Sélection de catégories invalide.", details: parsed.error.flatten() },
      });
      return;
    }
    let built: BuiltPlan;
    try {
      built = buildPlan(db, id);
    } catch (e) {
      if (e instanceof Error && (e as { status?: number }).status === 404) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Véhicule introuvable." } });
      } else {
        res.status(500).json({
          error: { code: "INTERNAL_ERROR", message: e instanceof Error ? e.message : "Catalogue indisponible." },
        });
      }
      return;
    }

    // Sélection explicite, dédupliquée ; seules les suggestions valides recalculées sont acceptées.
    const requested = [...new Set(parsed.data.categories)];
    const valid = new Map(built.suggestions.map((s) => [s.category, s]));
    const invalid = requested.filter((c) => !valid.has(c));
    if (invalid.length > 0) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Catégories non proposées pour ce véhicule (inconnues, déjà rappelées ou non applicables).",
          details: { invalid },
        },
      });
      return;
    }

    try {
      const created = runTransaction(db, () => {
        const out: Record<string, unknown>[] = [];
        const insert = db.prepare(
          "INSERT INTO reminders (vehicle_id, title, due_date, due_mileage, done) VALUES (?, ?, ?, ?, 0)",
        );
        for (const category of requested) {
          const s = valid.get(category);
          if (!s) throw new Error("Catégorie invalide.");
          const rowId = Number(
            insert.run(
              id,
              // Titre = libellé de la règle : renversable vers la catégorie pour les futurs anti-doublons.
              s.label,
              s.due_date ?? null,
              s.due_mileage ?? null,
            ).lastInsertRowid,
          );
          const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(rowId) as Record<string, unknown>;
          out.push({
            id: row["id"],
            vehicle_id: row["vehicle_id"],
            title: row["title"],
            due_date: (row["due_date"] as string | null) ?? undefined,
            due_mileage: (row["due_mileage"] as number | null) ?? undefined,
            done: false,
            category,
            uncertain: s.uncertain,
            indicative: s.indicative,
          });
        }
        return out;
      });
      res.status(201).json({ created });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Création des rappels impossible." } });
    }
  });

  return r;
}
