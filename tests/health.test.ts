import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Express } from "express";
import request from "supertest";
import { createApp } from "../src/app.js";

let dir = "";
const apps: Express[] = [];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "autopilotage-health-"));
});

afterEach(() => {
  for (const app of apps.splice(0)) {
    (app.locals["db"] as DatabaseSync).close();
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

function makeApp(): Express {
  const app = createApp({ dbPath: path.join(dir, "test.db") });
  apps.push(app);
  return app;
}

describe("GET /api/health", () => {
  it("repond ok:true", async () => {
    const res = await request(makeApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("sert la page d'accueil", async () => {
    const res = await request(makeApp()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("AutoPilotage");
  });
});
