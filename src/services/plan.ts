/**
 * Calcul pur des suggestions d'entretien (aucun accès SQL, aucune date
 * constructeur inventée : les règles consommées ici sont indicatives,
 * voir public/maintenance-plan.json).
 */

export interface PlanRule {
  category: string;
  label: string;
  every_km: number | null;
  every_months: number | null;
  fuels: string[] | null;
  timing: "belt" | null;
  source: "indicative" | "verified";
  note: string;
}

export interface PlanVehicle {
  mileage: number;
  fuel?: string;
}

export type DistributionTiming = "belt" | "chain" | "unknown";

export interface LastService {
  category: string;
  /** Date AAAA-MM-JJ du dernier entretien pertinent (optionnelle). */
  date?: string;
  /** Kilométrage au moment du dernier entretien (optionnel). */
  mileage?: number;
}

export interface Suggestion {
  category: string;
  label: string;
  due_mileage?: number;
  due_date?: string;
  /** Vrai quand l'historique manque : échéance calculée depuis l'état actuel, à ajuster. */
  uncertain: boolean;
  basis: "history" | "current";
  overdue: boolean;
  indicative: boolean;
}

export interface Skipped {
  category: string;
  reason: "already-reminded" | "timing-unknown" | "timing-chain" | "fuel-mismatch";
}

export interface PlanResult {
  suggestions: Suggestion[];
  skipped: Skipped[];
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, (m as number) - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m as number) - 1 && dt.getUTCDate() === d;
}

/** Addition calendaire en UTC (jour bloqué en fin de mois si nécessaire). Null si entrée invalide. */
export function addMonths(dateStr: string, months: number): string | null {
  if (!isValidCalendarDate(dateStr) || !Number.isInteger(months) || months < 0) return null;
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const totalMonths = (m as number) - 1 + months;
  const ny = (y as number) + Math.floor(totalMonths / 12);
  const nm = (totalMonths % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d as number, lastDay);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${ny}-${pad(nm)}-${pad(nd)}`;
}

export function todayString(): string {
  const t = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** Normalise un titre libre vers une catégorie connue (comparaison sans accents, insensible à la casse). */
export function normalizeTitle(title: string): string | null {
  const clean = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const keywords: [string, string[]][] = [
    ["vidange", ["vidange", "huile moteur"]],
    ["filtre-huile", ["filtre a huile", "filtre huile"]],
    ["filtre-air", ["filtre a air", "filtre air"]],
    ["liquide-frein", ["liquide de frein", "liquide frein"]],
    ["distribution", ["distribution", "courroie"]],
    ["controle-technique", ["controle technique", "ct "]],
  ];
  for (const [category, words] of keywords) {
    if (words.some((w) => clean.includes(w))) return category;
  }
  return null;
}

export interface PlanInput {
  vehicle: PlanVehicle;
  rules: PlanRule[];
  /** Dernier entretien connu par catégorie (issu de l'historique). */
  history: LastService[];
  /** Catégories ayant déjà un rappel actif. */
  pendingCategories: string[];
  /** Type de distribution : sans info fiable, la courroie n'est jamais suggérée. */
  timing?: DistributionTiming;
  today?: string;
}

export function computePlan(input: PlanInput): PlanResult {
  const today = input.today ?? todayString();
  const timing = input.timing ?? "unknown";
  const historyByCat = new Map(input.history.map((h) => [h.category, h]));
  const pending = new Set(input.pendingCategories);
  const suggestions: Suggestion[] = [];
  const skipped: Skipped[] = [];

  for (const rule of input.rules) {
    if (pending.has(rule.category)) {
      skipped.push({ category: rule.category, reason: "already-reminded" });
      continue;
    }
    if (rule.timing === "belt" && timing === "unknown") {
      skipped.push({ category: rule.category, reason: "timing-unknown" });
      continue;
    }
    if (rule.timing === "belt" && timing === "chain") {
      skipped.push({ category: rule.category, reason: "timing-chain" });
      continue;
    }
    const vehicleFuel = (input.vehicle.fuel ?? "").trim();
    if (rule.fuels !== null && vehicleFuel !== "" && !rule.fuels.includes(vehicleFuel)) {
      skipped.push({ category: rule.category, reason: "fuel-mismatch" });
      continue;
    }

    const last = historyByCat.get(rule.category);
    const lastDateValid = last?.date !== undefined && isValidCalendarDate(last.date);
    const lastMileageValid = last?.mileage !== undefined && Number.isInteger(last.mileage) && (last.mileage as number) >= 0;
    const usableHistory = last !== undefined && (lastDateValid || lastMileageValid);

    let dueMileage: number | undefined;
    let dueDate: string | undefined;
    let uncertain = false;
    let basis: "history" | "current" = "history";

    if (usableHistory) {
      if (rule.every_km !== null && lastMileageValid) {
        dueMileage = (last.mileage as number) + (rule.every_km as number);
      }
      if (rule.every_months !== null && lastDateValid) {
        dueDate = addMonths(last.date as string, rule.every_months as number) ?? undefined;
      }
      if (dueMileage === undefined && dueDate === undefined) {
        uncertain = true;
        basis = "current";
      }
    } else {
      uncertain = true;
      basis = "current";
    }

    if (basis === "current") {
      if (rule.every_km !== null) dueMileage = input.vehicle.mileage + rule.every_km;
      if (rule.every_months !== null) dueDate = addMonths(today, rule.every_months) ?? undefined;
    }

    const overdue =
      (dueDate !== undefined && dueDate < today) ||
      (dueMileage !== undefined && input.vehicle.mileage >= dueMileage);

    suggestions.push({
      category: rule.category,
      label: rule.label,
      due_mileage: dueMileage,
      due_date: dueDate,
      uncertain,
      basis,
      overdue,
      indicative: rule.source === "indicative",
    });
  }

  return { suggestions, skipped };
}
