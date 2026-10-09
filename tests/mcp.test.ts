import { describe, expect, it, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/InMemory.js";
import { openDatabase } from "../src/db.js";
import { createMcpServer } from "../src/mcp/server.js";

let dir = "";
let dbPath = "";

function hashFile(p: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "autopilotage-mcp-"));
  dbPath = path.join(dir, "test.db");
  const db = openDatabase(dbPath);
  const vid = Number(
    db.prepare("INSERT INTO vehicles (brand, model, year, mileage) VALUES (?, ?, ?, ?)").run("Renault", "Clio", 2020, 80000).lastInsertRowid,
  );
  db.prepare("INSERT INTO maintenance (vehicle_id, type, title, date, mileage, cost) VALUES (?, ?, ?, ?, ?, ?)").run(
    vid, "entretien", "Vidange", "2024-05-10", 45000, 100,
  );
  db.prepare("INSERT INTO reminders (vehicle_id, title, due_date, done) VALUES (?, ?, ?, ?)").run(vid, "Freins", "2020-01-01", 0);
  db.close();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function connectClient(targetDb: string): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(targetDb);
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
  await client.connect(clientTransport);
  return client;
}

interface TextContent {
  type: string;
  text: string;
}

function parseText(result: unknown): { content: TextContent[]; isError?: boolean } {
  return result as { content: TextContent[]; isError?: boolean };
}

describe("serveur MCP autopilotage", () => {
  it("expose les 3 outils et repond en lecture seule sans modifier la base", async () => {
    const before = hashFile(dbPath);
    const client = await connectClient(dbPath);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_maintenance_summary", "list_reminders", "list_vehicles"]);

    const vehicles = parseText(await client.callTool({ name: "list_vehicles", arguments: {} }));
    expect(vehicles.isError).toBeFalsy();
    const v = JSON.parse(vehicles.content[0]?.text ?? "{}") as { vehicles: { brand: string; mileage: number }[] };
    expect(v.vehicles).toHaveLength(1);
    expect(v.vehicles[0]).toMatchObject({ brand: "Renault", mileage: 80000 });

    const summary = parseText(await client.callTool({ name: "get_maintenance_summary", arguments: {} }));
    const s = JSON.parse(summary.content[0]?.text ?? "{}") as { grandTotal: number; recordCount: number };
    expect(s.grandTotal).toBe(100);
    expect(s.recordCount).toBe(1);

    const reminders = parseText(
      await client.callTool({ name: "list_reminders", arguments: { status: "en_retard" } }),
    );
    const r = JSON.parse(reminders.content[0]?.text ?? "{}") as { reminders: { status: string }[] };
    expect(r.reminders).toHaveLength(1);
    expect(r.reminders[0]?.status).toBe("en_retard");

    await client.close();
    expect(hashFile(dbPath)).toBe(before);
  });

  it("renvoie une erreur claire si la base est absente, sans rien creer", async () => {
    const missing = path.join(dir, "absente.db");
    const client = await connectClient(missing);
    const res = parseText(await client.callTool({ name: "list_vehicles", arguments: {} }));
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("introuvable");
    await client.close();
    expect(fs.existsSync(missing)).toBe(false);
  });

  it("rejette les arguments invalides", async () => {
    const client = await connectClient(dbPath);
    const res = parseText(await client.callTool({ name: "list_reminders", arguments: { status: "bizarre" } }));
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain("a_venir");
    await client.close();
  });
});
