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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "autopilotage-rem-"));
  dbPath = path.join(dir, "test.db");
});

afterEach(() => {
  closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function createVehicle(app: Express, mileage = 50000): Promise<number> {
  const res = await request(app)
    .post("/api/vehicles")
    .send({ brand: "Renault", model: "Clio", year: 2020, mileage });
  return res.body.vehicle.id as number;
}

describe("reminders", () => {
  it("cree un rappel avec date et l'affiche avec son vehicule", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    const res = await request(app)
      .post("/api/reminders")
      .send({ vehicle_id: vid, title: "Vidange", due_date: "2999-01-01", due_mileage: 60000 });
    expect(res.status).toBe(201);
    expect(res.body.reminder.status).toBe("a_venir");
    expect(res.body.reminder.vehicle.brand).toBe("Renault");
    const list = await request(app).get("/api/reminders");
    expect(list.body.reminders).toHaveLength(1);
  });

  it("detecte le retard par date et par kilometrage", async () => {
    const app = makeApp();
    const vid = await createVehicle(app, 80000);
    const late = await request(app)
      .post("/api/reminders")
      .send({ vehicle_id: vid, title: "Freins", due_date: "2020-01-01" });
    expect(late.body.reminder.status).toBe("en_retard");
    const lateKm = await request(app)
      .post("/api/reminders")
      .send({ vehicle_id: vid, title: "Distribution", due_mileage: 70000 });
    expect(lateKm.body.reminder.status).toBe("en_retard");
  });

  it("termine un rappel puis le modifie et le supprime", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    const created = await request(app)
      .post("/api/reminders")
      .send({ vehicle_id: vid, title: "Pneus", due_date: "2020-01-01" });
    const id = created.body.reminder.id as number;
    expect(created.body.reminder.status).toBe("en_retard");
    const done = await request(app)
      .put(`/api/reminders/${id}`)
      .send({ vehicle_id: vid, title: "Pneus", due_date: "2020-01-01", done: true });
    expect(done.status).toBe(200);
    expect(done.body.reminder.status).toBe("termine");
    const filtered = await request(app).get("/api/reminders?status=termine");
    expect(filtered.body.reminders).toHaveLength(1);
    expect((await request(app).delete(`/api/reminders/${id}`)).status).toBe(204);
    expect((await request(app).get("/api/reminders")).body.reminders).toHaveLength(0);
  });

  it("refuse les valeurs invalides et les vehicules inexistants", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    for (const body of [
      { vehicle_id: vid, title: "", due_date: "2025-01-01" },
      { vehicle_id: vid, title: "X" },
      { vehicle_id: vid, title: "X", due_date: "2024-13-45" },
      { vehicle_id: vid, title: "X", due_mileage: -1 },
      { vehicle_id: vid, title: "X", due_date: "", due_mileage: undefined },
    ]) {
      const res = await request(app).post("/api/reminders").send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect((await request(app).post("/api/reminders").send({ vehicle_id: 9999, title: "X", due_date: "2025-01-01" })).status).toBe(404);
    expect((await request(app).put("/api/reminders/9999").send({ vehicle_id: vid, title: "X", due_date: "2025-01-01" })).status).toBe(404);
    expect((await request(app).delete("/api/reminders/9999")).status).toBe(404);
    expect((await request(app).get("/api/reminders?status=bizarre")).status).toBe(400);
  });
});
