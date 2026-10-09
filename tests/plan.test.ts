import { describe, expect, it } from "vitest";
import {
  addMonths,
  computePlan,
  normalizeTitle,
  type PlanRule,
} from "../src/services/plan.js";

const vidange: PlanRule = {
  category: "vidange",
  label: "Vidange moteur",
  every_km: 15000,
  every_months: 12,
  fuels: ["Essence", "Diesel"],
  timing: null,
  source: "indicative",
  note: "",
};

const frein: PlanRule = {
  category: "liquide-frein",
  label: "Liquide de frein",
  every_km: null,
  every_months: 24,
  fuels: null,
  timing: null,
  source: "indicative",
  note: "",
};

const distribution: PlanRule = {
  category: "distribution",
  label: "Courroie de distribution",
  every_km: 120000,
  every_months: 72,
  fuels: ["Essence", "Diesel"],
  timing: "belt",
  source: "indicative",
  note: "",
};

describe("addMonths", () => {
  it("ajoute des mois calendaires avec blocage en fin de mois", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2023-01-31", 1)).toBe("2023-02-28");
    expect(addMonths("2024-05-10", 12)).toBe("2025-05-10");
    expect(addMonths("2024-11-15", 3)).toBe("2025-02-15");
  });

  it("renvoie null pour des entrées invalides", () => {
    expect(addMonths("n'importe quoi", 12)).toBeNull();
    expect(addMonths("2024-02-30", 12)).toBeNull();
    expect(addMonths("2024-05-10", -1)).toBeNull();
    expect(addMonths("2024-05-10", 1.5)).toBeNull();
  });
});

describe("computePlan", () => {
  it("calcule depuis le dernier entretien quand l'historique existe", () => {
    const { suggestions, skipped } = computePlan({
      vehicle: { mileage: 50000, fuel: "Essence" },
      rules: [vidange],
      history: [{ category: "vidange", date: "2024-05-10", mileage: 40000 }],
      pendingCategories: [],
      today: "2024-06-01",
    });
    expect(skipped).toEqual([]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      category: "vidange",
      due_mileage: 55000,
      due_date: "2025-05-10",
      uncertain: false,
      basis: "history",
      overdue: false,
      indicative: true,
    });
  });

  it("détecte les échéances dépassées par date et par kilométrage", () => {
    const byDate = computePlan({
      vehicle: { mileage: 50000, fuel: "Essence" },
      rules: [vidange],
      history: [{ category: "vidange", date: "2020-01-01", mileage: 10000 }],
      pendingCategories: [],
      today: "2024-06-01",
    });
    expect(byDate.suggestions[0]?.overdue).toBe(true);

    const byKm = computePlan({
      vehicle: { mileage: 80000, fuel: "Essence" },
      rules: [vidange],
      history: [{ category: "vidange", date: "2024-01-01", mileage: 40000 }],
      pendingCategories: [],
      today: "2024-06-01",
    });
    expect(byKm.suggestions[0]?.due_mileage).toBe(55000);
    expect(byKm.suggestions[0]?.overdue).toBe(true);
  });

  it("produit une suggestion incertaine quand l'historique manque", () => {
    const { suggestions } = computePlan({
      vehicle: { mileage: 50000, fuel: "Diesel" },
      rules: [vidange, frein],
      history: [],
      pendingCategories: [],
      today: "2024-06-01",
    });
    expect(suggestions).toHaveLength(2);
    for (const s of suggestions) {
      expect(s.uncertain).toBe(true);
      expect(s.basis).toBe("current");
    }
    expect(suggestions[0]).toMatchObject({ due_mileage: 65000, due_date: "2025-06-01" });
    expect(suggestions[1]).toMatchObject({ due_mileage: undefined, due_date: "2026-06-01" });
  });

  it("laisse l'interface distinguer l'historique de l'estimation (uncertain + basis)", () => {
    const scenarios = [
      computePlan({
        vehicle: { mileage: 50000, fuel: "Essence" },
        rules: [vidange, frein],
        history: [{ category: "vidange", date: "2024-05-10", mileage: 40000 }],
        pendingCategories: [],
        today: "2024-06-01",
      }),
      computePlan({
        vehicle: { mileage: 50000, fuel: "Essence" },
        rules: [vidange, frein],
        history: [],
        pendingCategories: [],
        today: "2024-06-01",
      }),
      computePlan({
        vehicle: { mileage: 50000, fuel: "Essence" },
        rules: [vidange],
        history: [{ category: "vidange", date: "pas-une-date", mileage: -5 }],
        pendingCategories: [],
        today: "2024-06-01",
      }),
    ];
    const all = scenarios.flatMap((r) => r.suggestions);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      // L'interface peut se fier indifféremment aux deux champs.
      expect(s.uncertain).toBe(s.basis === "current");
      expect(["history", "current"]).toContain(s.basis);
    }
    const fromHistory = all.filter((s) => s.basis === "history");
    const estimated = all.filter((s) => s.basis === "current");
    expect(fromHistory.length).toBeGreaterThan(0);
    expect(fromHistory.every((s) => !s.uncertain)).toBe(true);
    expect(estimated.length).toBeGreaterThan(0);
    expect(estimated.every((s) => s.uncertain)).toBe(true);
  });

  it("reste prudent face à un historique partiellement invalide", () => {
    const { suggestions } = computePlan({
      vehicle: { mileage: 50000, fuel: "Essence" },
      rules: [vidange],
      history: [{ category: "vidange", date: "date-bizarre", mileage: 40000 }],
      pendingCategories: [],
      today: "2024-06-01",
    });
    // Le kilométrage reste exploitable, la date est ignorée.
    expect(suggestions[0]).toMatchObject({ due_mileage: 55000, due_date: undefined, uncertain: false });

    const full = computePlan({
      vehicle: { mileage: 50000, fuel: "Essence" },
      rules: [vidange],
      history: [{ category: "vidange", date: "pas-une-date", mileage: -5 }],
      pendingCategories: [],
      today: "2024-06-01",
    });
    expect(full.suggestions[0]).toMatchObject({ uncertain: true, basis: "current" });
  });

  it("ne suggère jamais la courroie sans courroie confirmée", () => {
    for (const timing of ["unknown", "chain"] as const) {
      const { suggestions, skipped } = computePlan({
        vehicle: { mileage: 50000, fuel: "Diesel" },
        rules: [distribution],
        history: [],
        pendingCategories: [],
        timing,
        today: "2024-06-01",
      });
      expect(suggestions).toHaveLength(0);
      expect(skipped).toEqual([{ category: "distribution", reason: timing === "unknown" ? "timing-unknown" : "timing-chain" }]);
    }
    const ok = computePlan({
      vehicle: { mileage: 50000, fuel: "Diesel" },
      rules: [distribution],
      history: [],
      pendingCategories: [],
      timing: "belt",
      today: "2024-06-01",
    });
    expect(ok.suggestions).toHaveLength(1);
    expect(ok.suggestions[0]).toMatchObject({ due_mileage: 170000 });
  });

  it("ignore les catégories déjà rappelées et les motorisations incompatibles", () => {
    const { suggestions, skipped } = computePlan({
      vehicle: { mileage: 50000, fuel: "Électrique" },
      rules: [vidange, frein],
      history: [],
      pendingCategories: ["liquide-frein"],
      today: "2024-06-01",
    });
    expect(suggestions.map((s) => s.category)).toEqual([]);
    expect(skipped).toContainEqual({ category: "vidange", reason: "fuel-mismatch" });
    expect(skipped).toContainEqual({ category: "liquide-frein", reason: "already-reminded" });
  });
});

describe("normalizeTitle", () => {
  it("retrouve la catégorie malgré casse et accents", () => {
    expect(normalizeTitle("Vidange + filtre")).toBe("vidange");
    expect(normalizeTitle("FILTRE À HUILE")).toBe("filtre-huile");
    expect(normalizeTitle("Controle technique")).toBe("controle-technique");
    expect(normalizeTitle("Courroie de distribution")).toBe("distribution");
    expect(normalizeTitle("Liquide de frein")).toBe("liquide-frein");
    expect(normalizeTitle("Pneus hiver")).toBeNull();
  });

  it("ne confond pas les plaquettes de frein avec le liquide de frein", () => {
    expect(normalizeTitle("Remplacement des plaquettes de frein")).toBeNull();
    expect(normalizeTitle("Disques et plaquettes avant")).toBeNull();
    expect(normalizeTitle("Étriers de frein")).toBeNull();
    // Le liquide reste reconnu sous ses formes usuelles.
    expect(normalizeTitle("Purge du liquide de frein")).toBe("liquide-frein");
  });
});
