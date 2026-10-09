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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "autopilotage-report-"));
  dbPath = path.join(dir, "test.db");
});

afterEach(() => {
  closeAll();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function createVehicle(app: Express, brand = "Opel", model = "Corsa"): Promise<number> {
  const res = await request(app)
    .post("/api/vehicles")
    .send({ brand, model, year: 2012, mileage: 192000, fuel: "Diesel", plate: "EB-114-BA" });
  return res.body.vehicle.id as number;
}

function countPages(pdf: Buffer): number {
  return pdf.toString("latin1").split("/Type /Page").length - 1;
}

/** pdfkit encode le texte en hexadécimal : on le décode pour vérifier le contenu. */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const parts: string[] = [];
  for (const m of raw.matchAll(/<([0-9A-Fa-f]+)>/g)) {
    const hex = m[1] as string;
    if (hex.length % 2 === 0) parts.push(Buffer.from(hex, "hex").toString("latin1"));
  }
  return parts.join(" ");
}

describe("GET /api/vehicles/:id/report.pdf", () => {
  it("genere un PDF avec les infos et interventions du bon vehicule", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    const other = await createVehicle(app, "Renault", "Clio");
    await request(app).post(`/api/vehicles/${vid}/maintenance`).send({ type: "reparation", title: "Plaquettes de frein", date: "2024-06-15", mileage: 180000, cost: 189.5 });
    await request(app).post(`/api/vehicles/${other}/maintenance`).send({ type: "entretien", title: "Vidange Clio", date: "2024-01-01", mileage: 10000, cost: 50 });
    await request(app).post("/api/reminders").send({ vehicle_id: vid, title: "Controle technique", due_date: "2020-01-01" });

    const res = await request(app).get(`/api/vehicles/${vid}/report.pdf`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain(`historique-Opel-Corsa-${vid}.pdf`);
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const text = pdfText(pdf);
    for (const expected of ["Historique", "Opel", "Corsa", "Plaquettes", "Controle technique", "189"]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain("Vidange Clio");
  });

  it("fonctionne avec un historique vide et sans description", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    const res = await request(app).get(`/api/vehicles/${vid}/report.pdf`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("pagine sur plusieurs pages avec beaucoup d'interventions", async () => {
    const app = makeApp();
    const vid = await createVehicle(app);
    for (let i = 0; i < 60; i++) {
      const day = String((i % 28) + 1).padStart(2, "0");
      await request(app).post(`/api/vehicles/${vid}/maintenance`).send({
        type: "entretien", title: `Intervention ${i}`, date: `2020-01-${day}`, mileage: i * 1000, cost: 10,
      });
    }
    const res = await request(app).get(`/api/vehicles/${vid}/report.pdf`);
    expect(res.status).toBe(200);
    expect(countPages(res.body as Buffer)).toBeGreaterThanOrEqual(2);
  });

  it("renvoie 404 pour un vehicule inconnu et 400 pour un id invalide", async () => {
    const app = makeApp();
    expect((await request(app).get("/api/vehicles/9999/report.pdf")).status).toBe(404);
    expect((await request(app).get("/api/vehicles/abc/report.pdf")).status).toBe(400);
  });
});
