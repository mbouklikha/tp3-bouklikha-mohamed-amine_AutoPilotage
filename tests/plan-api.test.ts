import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Express } from "express";
import request from "supertest";
import { createApp } from "../src/app.js";
import { runTransaction } from "../src/db.js";

let dir = "";
let dbPath = "";
const apps: Express[] = [];

function makeApp(): Express {
  const app = createApp({ dbPath });
  apps.push(app);
  return app;
}

function closeAll(): void {
  for (const app of apps.splice(0)) {
    (app.locals["db"] as DatabaseSync).close();
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "autopilotage-planapi-"));
  dbPath = path.join(dir, "test.db");
});

afterEach(() => {
  closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function createVehicle(app: Express, brand = "Renault", fuel = "Essence", mileage = 50000): Promise<number> {
  const res = await request(app)
    .post("/api/vehicles")
    .send({ brand, model: "Clio", year: 2020, mileage, fuel });
  return res.body.vehicle.id as number;
}

describe("GET /api/vehicles/:id/plan", () => {
  it("renvoie des suggestions incertaines pour un véhicule sans historique, 404 si inconnu", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    const res = await request(app).get(`/api/vehicles/${vid}/plan`);
    expect(res.status).toBe(200);
    expect(res.body.vehicle.id).toBe(vid);
    expect(typeof res.body.disclaimer).toBe("string");
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    for (const s of res.body.suggestions) {
      expect(s.uncertain).toBe(true);
      expect(s.indicative).toBe(true);
    }
    // Distribution jamais suggérée sans courroie confirmée.
    expect(res.body.suggestions.map((s: { category: string }) => s.category)).not.toContain("distribution");
    expect((await request(app).get("/api/vehicles/9999/plan")).status).toBe(404);
    expect((await request(app).get("/api/vehicles/abc/plan")).status).toBe(400);
  });

  it("isole deux véhicules et utilise le dernier entretien de chaque catégorie", async () => {
    const app = makeApp();
    const v1 = await createVehicle(app, "Renault", "Essence", 60000);
    const v2 = await createVehicle(app, "Peugeot", "Diesel", 30000);
    await request(app).post(`/api/vehicles/${v1}/maintenance`).send({ type: "entretien", title: "Vidange moteur", date: "2020-01-01", mileage: 10000, cost: 100 });
    await request(app).post(`/api/vehicles/${v1}/maintenance`).send({ type: "entretien", title: "Vidange moteur", date: "2024-05-10", mileage: 55000, cost: 120 });
    await request(app).post(`/api/vehicles/${v1}/maintenance`).send({ type: "reparation", title: "Plaquettes de frein", date: "2024-06-01", mileage: 56000, cost: 80 });

    const p1 = await request(app).get(`/api/vehicles/${v1}/plan`);
    const vidange = p1.body.suggestions.find((s: { category: string }) => s.category === "vidange");
    expect(vidange).toMatchObject({ due_mileage: 70000, uncertain: false, basis: "history" });
    // Les plaquettes ne doivent pas bloquer le liquide de frein.
    expect(p1.body.suggestions.map((s: { category: string }) => s.category)).toContain("liquide-frein");

    const p2 = await request(app).get(`/api/vehicles/${v2}/plan`);
    const vidange2 = p2.body.suggestions.find((s: { category: string }) => s.category === "vidange");
    expect(vidange2).toMatchObject({ uncertain: true, basis: "current" });
    expect(vidange2.due_mileage).toBe(45000);
  });

  it("ne propose pas de doublon avec un rappel actif, mais ignore les terminés", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    await request(app).post("/api/reminders").send({ vehicle_id: vid, title: "Vidange moteur", due_mileage: 60000 });
    await request(app).post("/api/reminders").send({ vehicle_id: vid, title: "Liquide de frein", due_date: "2020-01-01" });
    // Termine le rappel liquide de frein.
    const list = await request(app).get("/api/reminders");
    const frein = (list.body.reminders as { id: number; title: string }[]).find((r) => r.title === "Liquide de frein");
    await request(app).put(`/api/reminders/${frein?.id}`).send({ vehicle_id: vid, title: "Liquide de frein", due_date: "2020-01-01", done: true });

    const res = await request(app).get(`/api/vehicles/${vid}/plan`);
    const cats = res.body.suggestions.map((s: { category: string }) => s.category);
    expect(cats).not.toContain("vidange");
    expect(res.body.skipped).toContainEqual({ category: "vidange", reason: "already-reminded" });
    expect(cats).toContain("liquide-frein");
  });

  it("isole strictement les historiques, ignore les dates invalides et retient le dernier entretien", async () => {
    const app = makeApp();
    const v1 = await createVehicle(app, "Renault", "Essence", 60000);
    const v2 = await createVehicle(app, "Peugeot", "Diesel", 30000);
    const db = app.locals["db"] as DatabaseSync;

    // v1 : vidange récente, puis insertion postérieure d'une vidange PLUS ancienne.
    await request(app).post(`/api/vehicles/${v1}/maintenance`).send({ type: "entretien", title: "Vidange moteur", date: "2024-05-10", mileage: 55000, cost: 120 });
    db.prepare("INSERT INTO maintenance (vehicle_id, type, title, date, mileage, cost) VALUES (?, ?, ?, ?, ?, ?)").run(
      v1, "entretien", "Vidange moteur", "2022-01-01", 20000, 100,
    );
    // v1 : date ET kilométrage invalides écrits directement (l'API les refuserait).
    db.prepare("INSERT INTO maintenance (vehicle_id, type, title, date, mileage, cost) VALUES (?, ?, ?, ?, ?, ?)").run(
      v1, "entretien", "Filtre à air", "pas-une-date", -5, 30,
    );
    await request(app).post(`/api/vehicles/${v2}/maintenance`).send({ type: "entretien", title: "Filtre à air", date: "2024-03-01", mileage: 25000, cost: 25 });

    const p1 = await request(app).get(`/api/vehicles/${v1}/plan`);
    expect(p1.status).toBe(200);
    const v1vidange = p1.body.suggestions.find((s: { category: string }) => s.category === "vidange");
    // Le dernier par date (2024-05-10, 55000 km) gagne, pas l'insertion postérieure plus ancienne.
    expect(v1vidange).toMatchObject({ due_mileage: 70000, due_date: "2025-05-10", uncertain: false });
    // La date invalide du filtre à air de v1 est ignorée sans planter (repli incertain).
    const v1air = p1.body.suggestions.find((s: { category: string }) => s.category === "filtre-air");
    expect(v1air).toMatchObject({ uncertain: true, basis: "current" });

    const p2 = await request(app).get(`/api/vehicles/${v2}/plan`);
    const v2vidange = p2.body.suggestions.find((s: { category: string }) => s.category === "vidange");
    const v2air = p2.body.suggestions.find((s: { category: string }) => s.category === "filtre-air");
    // Rien de v1 ne fuit vers v2 : vidange incertaine, filtre à air basé sur son propre historique.
    expect(v2vidange).toMatchObject({ uncertain: true, basis: "current", due_mileage: 45000 });
    expect(v2air).toMatchObject({ uncertain: false, basis: "history", due_mileage: 55000 });
  });
});

describe("POST /api/vehicles/:id/plan", () => {
  it("crée uniquement les catégories sélectionnées, avec les échéances recalculées côté serveur", async () => {
    const app = makeApp();
    const vid = await createVehicle(app, "Renault", "Essence", 50000);
    const plan = await request(app).get(`/api/vehicles/${vid}/plan`);
    const vidange = plan.body.suggestions.find((s: { category: string }) => s.category === "vidange");
    // Le client tente d'imposer ses propres valeurs : elles doivent être ignorées.
    const res = await request(app)
      .post(`/api/vehicles/${vid}/plan`)
      .send({ categories: ["vidange"], due_mileage: 1, due_date: "2030-01-01" });
    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.created[0]).toMatchObject({
      vehicle_id: vid,
      title: "Vidange moteur",
      category: "vidange",
      uncertain: true,
      indicative: true,
      done: false,
    });
    expect(res.body.created[0].due_mileage).toBe(vidange.due_mileage);
    expect(res.body.created[0].due_mileage).not.toBe(1);

    const list = await request(app).get("/api/reminders");
    expect(list.body.reminders).toHaveLength(1);
    expect(list.body.reminders[0].title).toBe("Vidange moteur");
  });

  it("crée plusieurs catégories d'un coup, déduplique et refuse les doublons répétés", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    const res = await request(app).post(`/api/vehicles/${vid}/plan`).send({ categories: ["vidange", "vidange", "liquide-frein"] });
    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(2);

    const again = await request(app).post(`/api/vehicles/${vid}/plan`).send({ categories: ["vidange"] });
    expect(again.status).toBe(400);
    const list = await request(app).get("/api/reminders");
    expect(list.body.reminders).toHaveLength(2);
  });

  it("refuse les catégories invalides sans rien créer, y compris la courroie", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    for (const body of [
      { categories: ["vidange", "categorie-inexistante"] },
      { categories: ["distribution"] },
      { categories: "vidange" },
      {},
    ]) {
      const res = await request(app).post(`/api/vehicles/${vid}/plan`).send(body);
      expect(res.status).toBe(400);
    }
    const list = await request(app).get("/api/reminders");
    expect(list.body.reminders).toHaveLength(0);

    expect((await request(app).post("/api/vehicles/9999/plan").send({ categories: ["vidange"] })).status).toBe(404);
  });

  it("accepte une sélection vide sans rien créer", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    const res = await request(app).post(`/api/vehicles/${vid}/plan`).send({ categories: [] });
    expect(res.status).toBe(201);
    expect(res.body.created).toEqual([]);
  });

  it("annule tout si une création échoue en cours de transaction", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    const db = app.locals["db"] as DatabaseSync;
    expect(() =>
      runTransaction(db, () => {
        // Même table et mêmes colonnes que la route POST /api/vehicles/:id/plan.
        db.prepare("INSERT INTO reminders (vehicle_id, title, due_mileage, done) VALUES (?, ?, ?, 0)").run(
          vid, "Vidange moteur", 60000,
        );
        db.prepare("INSERT INTO reminders (vehicle_id, title, due_mileage, done) VALUES (?, ?, ?, 0)").run(
          vid, "Liquide de frein", 70000,
        );
        throw new Error("panne simulée après deux insertions");
      }),
    ).toThrow("panne simulée après deux insertions");
    const rows = db.prepare("SELECT * FROM reminders WHERE vehicle_id = ?").all(vid) as unknown[];
    expect(rows).toHaveLength(0);
  });
});
