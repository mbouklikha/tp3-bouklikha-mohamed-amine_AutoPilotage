import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

interface PlanRule {
  category: string;
  label: string;
  every_km: number | null;
  every_months: number | null;
  fuels: string[] | null;
  timing: "belt" | null;
  source: "indicative" | "verified";
  source_ref?: string;
  note: string;
}

interface PlanCatalog {
  name: string;
  version: number;
  disclaimer: string;
  fuels: string[];
  rules: PlanRule[];
}

function loadPlan(): PlanCatalog {
  const raw = fs.readFileSync(path.join(process.cwd(), "public", "maintenance-plan.json"), "utf8");
  return JSON.parse(raw) as PlanCatalog;
}

describe("catalogue de règles d'entretien", () => {
  it("est un JSON valide avec un avertissement explicite", () => {
    const plan = loadPlan();
    expect(Array.isArray(plan.rules)).toBe(true);
    expect(plan.rules.length).toBeGreaterThan(0);
    expect(plan.disclaimer.trim().length).toBeGreaterThan(0);
    expect(plan.disclaimer).toMatch(/indicative/i);
  });

  it("chaque règle est cohérente et au moins une échéance est définie", () => {
    const plan = loadPlan();
    const categories = plan.rules.map((r) => r.category);
    expect(new Set(categories).size).toBe(categories.length);
    for (const rule of plan.rules) {
      expect(rule.label.trim().length).toBeGreaterThan(0);
      expect(rule.label.length).toBeLessThanOrEqual(100);
      expect(rule.note.trim().length).toBeGreaterThan(0);
      expect(["indicative", "verified"]).toContain(rule.source);
      if (rule.every_km !== null) {
        expect(Number.isInteger(rule.every_km)).toBe(true);
        expect(rule.every_km as number).toBeGreaterThan(0);
      }
      if (rule.every_months !== null) {
        expect(Number.isInteger(rule.every_months)).toBe(true);
        expect(rule.every_months as number).toBeGreaterThan(0);
      }
      expect(rule.every_km !== null || rule.every_months !== null).toBe(true);
      expect(rule.timing === null || rule.timing === "belt").toBe(true);
      if (rule.fuels !== null) {
        expect(rule.fuels.length).toBeGreaterThan(0);
        for (const fuel of rule.fuels) {
          expect(plan.fuels).toContain(fuel);
        }
      }
    }
  });

  it("aucune règle non vérifiée ne se présente comme officielle", () => {
    const plan = loadPlan();
    for (const rule of plan.rules) {
      if (rule.source === "verified") {
        expect(rule.source_ref?.trim().length).toBeGreaterThan(0);
      } else {
        const text = `${rule.label} ${rule.note}`.toLowerCase();
        expect(text).not.toMatch(/officiel|constructeur|préconisation/);
      }
    }
  });
});
