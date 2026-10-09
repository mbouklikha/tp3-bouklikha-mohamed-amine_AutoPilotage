import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Express } from "express";
import request from "supertest";
import { createApp } from "../src/app.js";

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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "autopilotage-maint-"));
  dbPath = path.join(dir, "test.db");
});

afterEach(() => {
  closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function createVehicle(app: Express): Promise<number> {
  const res = await request(app)
    .post("/api/vehicles")
    .send({ brand: "Renault", model: "Clio", year: 2020, mileage: 50000 });
  return res.body.vehicle.id as number;
}

const valid = {
  type: "entretien",
  title: "Vidange",
  description: "Huile + filtre",
  date: "2024-05-10",
  mileage: 45000,
  cost: 129.9,
};

describe("maintenance", () => {
  it("cree et lit l'historique du plus recent au plus ancien, avec total", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    await request(app).post(`/api/vehicles/${vid}/maintenance`).send(valid);
    await request(app).post(`/api/vehicles/${vid}/maintenance`).send({ ...valid, title: "Freins", date: "2024-08-01", cost: 210 });
    const list = await request(app).get(`/api/vehicles/${vid}/maintenance`);
    expect(list.status).toBe(200);
    expect(list.body.records).toHaveLength(2);
    expect(list.body.records[0].title).toBe("Freins");
    expect(list.body.records[1].title).toBe("Vidange");
    expect(list.body.total).toBeCloseTo(339.9, 5);
  });

  it("modifie puis supprime une intervention", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    const created = await request(app).post(`/api/vehicles/${vid}/maintenance`).send(valid);
    const id = created.body.record.id as number;
    const updated = await request(app).put(`/api/vehicles/${vid}/maintenance/${id}`).send({ ...valid, cost: 99 });
    expect(updated.status).toBe(200);
    expect(updated.body.record.cost).toBe(99);
    expect((await request(app).delete(`/api/vehicles/${vid}/maintenance/${id}`)).status).toBe(204);
    const list = await request(app).get(`/api/vehicles/${vid}/maintenance`);
    expect(list.body.records).toHaveLength(0);
    expect(list.body.total).toBe(0);
  });

  it("refuse cout negatif, date invalide, kilometrage negatif, type inconnu", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    for (const body of [
      { ...valid, cost: -5 },
      { ...valid, date: "n'importe quoi" },
      { ...valid, date: "2024-02-30" },
      { ...valid, date: "2999-01-01" },
      { ...valid, mileage: -1 },
      { ...valid, type: "fusée" },
      { ...valid, title: "" },
    ]) {
      const res = await request(app).post(`/api/vehicles/${vid}/maintenance`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("refuse un vehicule inexistant et des interventions inconnues", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    expect((await request(app).post("/api/vehicles/9999/maintenance").send(valid)).status).toBe(404);
    expect((await request(app).get("/api/vehicles/9999/maintenance")).status).toBe(404);
    expect((await request(app).put(`/api/vehicles/${vid}/maintenance/9999`).send(valid)).status).toBe(404);
    expect((await request(app).delete(`/api/vehicles/${vid}/maintenance/9999`)).status).toBe(404);
    expect((await request(app).get("/api/vehicles/abc/maintenance")).status).toBe(400);
  });

  it("isole les interventions par vehicule", async () => {
    const app = makeApp();
    const v1 = await createVehicle(app);
    const v2 = await createVehicle(app);
    await request(app).post(`/api/vehicles/${v1}/maintenance`).send(valid);
    const list2 = await request(app).get(`/api/vehicles/${v2}/maintenance`);
    expect(list2.body.records).toHaveLength(0);
  });

  it("supprimer un vehicule supprime ses interventions", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    await request(app).post(`/api/vehicles/${vid}/maintenance`).send(valid);
    await request(app).delete(`/api/vehicles/${vid}`);
    expect((await request(app).get(`/api/vehicles/${vid}/maintenance`)).status).toBe(404);
  });
});
