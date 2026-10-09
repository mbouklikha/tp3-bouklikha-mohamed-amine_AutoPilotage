import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

interface CatalogModel {
  name: string;
  years: [number, number];
  fuels: string[];
}

interface CatalogMake {
  brand: string;
  models: CatalogModel[];
}

interface Catalog {
  makes: CatalogMake[];
  fuels: string[];
}

function loadCatalog(): Catalog {
  const raw = fs.readFileSync(path.join(process.cwd(), "public", "catalog.json"), "utf8");
  return JSON.parse(raw) as Catalog;
}

describe("catalogue automobile local", () => {
  it("est un JSON valide avec des marques et des modèles", () => {
    const catalog = loadCatalog();
    expect(Array.isArray(catalog.makes)).toBe(true);
    expect(catalog.makes.length).toBeGreaterThan(0);
    expect(Array.isArray(catalog.fuels)).toBe(true);
    const brands = catalog.makes.map((m) => m.brand);
    expect(new Set(brands).size).toBe(brands.length);
  });

  it("chaque modèle a un nom, une plage d'années cohérente et des motorisations connues", () => {
    const catalog = loadCatalog();
    const maxYear = new Date().getFullYear() + 1;
    for (const make of catalog.makes) {
      expect(make.brand.trim().length).toBeGreaterThan(0);
      expect(make.models.length).toBeGreaterThan(0);
      const names = make.models.map((m) => m.name);
      expect(new Set(names).size).toBe(names.length);
      for (const model of make.models) {
        expect(model.name.trim().length).toBeGreaterThan(0);
        expect(model.years).toHaveLength(2);
        const [min, max] = model.years;
        expect(Number.isInteger(min)).toBe(true);
        expect(Number.isInteger(max)).toBe(true);
        expect(min).toBeGreaterThanOrEqual(1900);
        expect(max).toBeLessThanOrEqual(maxYear);
        expect(min).toBeLessThanOrEqual(max);
        expect(model.fuels.length).toBeGreaterThan(0);
        for (const fuel of model.fuels) {
          expect(catalog.fuels).toContain(fuel);
        }
      }
    }
  });

  it("contient des entrées compatibles avec la validation des véhicules", () => {
    const catalog = loadCatalog();
    const currentYear = new Date().getFullYear();
    const sample = catalog.makes[0]?.models[0];
    expect(sample).toBeDefined();
    if (sample) {
      expect(sample.name.length).toBeLessThanOrEqual(60);
      expect(sample.years[1]).toBeLessThanOrEqual(currentYear + 1);
    }
  });
});
