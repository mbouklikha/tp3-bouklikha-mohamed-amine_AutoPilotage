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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "autopilotage-stats-"));
  dbPath = path.join(dir, "test.db");
});

afterEach(() => {
  closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function createVehicle(app: Express, brand: string, mileage: number): Promise<number> {
  const res = await request(app)
    .post("/api/vehicles")
    .send({ brand, model: "M", year: 2020, mileage });
  return res.body.vehicle.id as number;
}

describe("GET /api/stats", () => {
  it("renvoie des zeros quand il n'y a aucune donnee", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({
      vehicleCount: 0, totalMileage: 0, recordCount: 0, totalCost: 0, averageCost: 0,
    });
    expect(res.body.stats.byVehicle).toEqual([]);
    expect(res.body.stats.byType).toEqual([]);
  });

  it("calcule totaux, par vehicule et par type", async () => {
    const app = makeApp();
    const v1 = await createVehicle(app, "Renault", 50000);
    const v2 = await createVehicle(app, "Peugeot", 30000);
    await request(app).post(`/api/vehicles/${v1}/maintenance`).send({ type: "entretien", title: "Vidange", date: "2024-05-10", mileage: 45000, cost: 100 });
    await request(app).post(`/api/vehicles/${v1}/maintenance`).send({ type: "reparation", title: "Freins", date: "2024-08-01", mileage: 48000, cost: 200 });
    await request(app).post(`/api/vehicles/${v2}/maintenance`).send({ type: "entretien", title: "Filtre", date: "2024-06-01", mileage: 25000, cost: 50 });
    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(200);
    const s = res.body.stats;
    expect(s.vehicleCount).toBe(2);
    expect(s.totalMileage).toBe(80000);
    expect(s.recordCount).toBe(3);
    expect(s.totalCost).toBeCloseTo(350, 5);
    expect(s.averageCost).toBeCloseTo(350 / 3, 5);
    expect(s.byVehicle[0]).toMatchObject({ vehicle_id: v1, total: 300, count: 2 });
    expect(s.byVehicle[1]).toMatchObject({ vehicle_id: v2, total: 50, count: 1 });
    const entretien = s.byType.find((t: { type: string }) => t.type === "entretien");
    expect(entretien).toMatchObject({ total: 150, count: 2 });
  });

  it("filtre par vehicule et refuse les parametres invalides", async () => {
    const app = makeApp();
    const v1 = await createVehicle(app, "Renault", 50000);
    await request(app).post(`/api/vehicles/${v1}/maintenance`).send({ type: "entretien", title: "Vidange", date: "2024-05-10", mileage: 45000, cost: 100 });
    const res = await request(app).get(`/api/stats?vehicle_id=${v1}`);
    expect(res.status).toBe(200);
    expect(res.body.stats.vehicle_id).toBe(v1);
    expect(res.body.stats.totalCost).toBe(100);
    expect(res.body.stats.vehicleCount).toBe(1);
    expect((await request(app).get("/api/stats?vehicle_id=abc")).status).toBe(400);
    expect((await request(app).get("/api/stats?vehicle_id=9999")).status).toBe(404);
  });
});
