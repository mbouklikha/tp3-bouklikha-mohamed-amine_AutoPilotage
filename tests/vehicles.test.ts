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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "autopilotage-"));
  dbPath = path.join(dir, "test.db");
});

afterEach(() => {
  closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
});

const valid = { brand: "Renault", model: "Clio", year: 2020, mileage: 45000, fuel: "Essence", plate: "AB-123-CD" };

describe("vehicles CRUD", () => {
  it("cree puis lit un vehicule", async () => {
    const app = makeApp();
    const created = await request(app).post("/api/vehicles").send(valid);
    expect(created.status).toBe(201);
    expect(created.body.vehicle.id).toBeGreaterThan(0);
    const list = await request(app).get("/api/vehicles");
    expect(list.status).toBe(200);
    expect(list.body.vehicles).toHaveLength(1);
    const one = await request(app).get(`/api/vehicles/${created.body.vehicle.id as number}`);
    expect(one.status).toBe(200);
    expect(one.body.vehicle.brand).toBe("Renault");
  });

  it("modifie puis supprime", async () => {
    const app = makeApp();
    const created = await request(app).post("/api/vehicles").send(valid);
    const id = created.body.vehicle.id as number;
    const updated = await request(app).put(`/api/vehicles/${id}`).send({ ...valid, mileage: 50000 });
    expect(updated.status).toBe(200);
    expect(updated.body.vehicle.mileage).toBe(50000);
    const deleted = await request(app).delete(`/api/vehicles/${id}`);
    expect(deleted.status).toBe(204);
    const gone = await request(app).get(`/api/vehicles/${id}`);
    expect(gone.status).toBe(404);
  });

  it("rejette les champs invalides (400)", async () => {
    const app = makeApp();
    for (const body of [
      { ...valid, brand: "" },
      { ...valid, model: "" },
      { ...valid, year: 1800 },
      { ...valid, year: 2020.5 },
      { ...valid, mileage: -1 },
      { ...valid, plate: "X".repeat(21) },
    ]) {
      const res = await request(app).post("/api/vehicles").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("renvoie 404/400 pour identifiant inexistant ou invalide", async () => {
    const app = makeApp();
    expect((await request(app).get("/api/vehicles/9999")).status).toBe(404);
    expect((await request(app).put("/api/vehicles/9999").send(valid)).status).toBe(404);
    expect((await request(app).delete("/api/vehicles/9999")).status).toBe(404);
    expect((await request(app).get("/api/vehicles/abc")).status).toBe(400);
  });

  it("persiste les donnees dans le fichier SQLite", async () => {
    const app1 = makeApp();
    await request(app1).post("/api/vehicles").send(valid);
    expect(fs.existsSync(dbPath)).toBe(true);
    closeAll();
    const app2 = makeApp();
    const list = await request(app2).get("/api/vehicles");
    expect(list.body.vehicles).toHaveLength(1);
  });

  it("accepte les champs facultatifs absents", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/vehicles").send({ brand: "Peugeot", model: "208", year: 2021, mileage: 0 });
    expect(res.status).toBe(201);
  });
});
