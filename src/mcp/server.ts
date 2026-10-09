import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  defaultMcpDbPath,
  readMaintenanceSummary,
  readReminders,
  readVehicles,
} from "./readStore.js";

function textResult(payload: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(message: string): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  return { content: [{ type: "text", text: `Erreur : ${message}` }], isError: true };
}

/** Serveur MCP‐ lecture seule sur la base AutoPilotage (chemin fixe). */
export function createMcpServer(dbPath: string): McpServer {
  const server = new McpServer({ name: "autopilotage", version: "0.1.0" });

  server.registerTool(
    "list_vehicles",
    { description: "Lister les véhicules suivis et leur kilométrage (lecture seule)." },
    () => {
      try {
        return textResult({ vehicles: readVehicles(dbPath) });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "get_maintenance_summary",
    {
      description: "Nombre d'interventions et coût total par véhicule et par type (lecture seule).",
      inputSchema: { vehicle_id: z.number().int().positive().optional() },
    },
    (args) => {
      try {
        return textResult(readMaintenanceSummary(dbPath, args.vehicle_id));
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "list_reminders",
    {
      description: "Consulter les rappels avec leur statut (a_venir, en_retard, termine). Lecture seule.",
      inputSchema: {
        status: z.enum(["a_venir", "en_retard", "termine"]).optional(),
        vehicle_id: z.number().int().positive().optional(),
      },
    },
    (args) => {
      try {
        return textResult({ reminders: readReminders(dbPath, args.status, args.vehicle_id) });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    },
  );

  return server;
}

import { pathToFileURL } from "node:url";

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const server = createMcpServer(defaultMcpDbPath());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
