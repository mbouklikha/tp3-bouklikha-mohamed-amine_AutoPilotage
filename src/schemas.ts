import { z } from "zod";

const currentYear = new Date().getFullYear();

export const vehicleSchema = z.object({
  brand: z.string().trim().min(1, "La marque est obligatoire.").max(60),
  model: z.string().trim().min(1, "Le modèle est obligatoire.").max(60),
  year: z.number().int().min(1900, "Année trop ancienne.").max(currentYear + 1, "Année invalide."),
  mileage: z.number().int().min(0, "Le kilométrage doit être positif ou nul."),
  fuel: z.string().trim().max(30).optional().or(z.literal("")),
  plate: z.string().trim().max(20, "Immatriculation trop longue.").optional().or(z.literal("")),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;

export interface Vehicle extends VehicleInput {
  id: number;
  created_at: string;
}

const idSchema = z.coerce.number().int().positive();

export function parseId(raw: unknown): number | null {
  const r = idSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export const maintenanceTypes = ["entretien", "reparation", "controle", "autre"] as const;

function isValidPastDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, (m as number) - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== (m as number) - 1 || dt.getUTCDate() !== d) return false;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return value <= (todayStr as string);
}

export const maintenanceSchema = z.object({
  type: z.enum(maintenanceTypes, { message: "Type d'intervention invalide." }),
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(100),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  date: z.string().refine(isValidPastDate, "Date invalide (format AAAA-MM-JJ, réelle et non future)."),
  mileage: z.number().int().min(0, "Le kilométrage doit être positif ou nul."),
  cost: z.number().min(0, "Le coût ne peut pas être négatif.").max(1000000, "Coût irréaliste."),
});

export type MaintenanceInput = z.infer<typeof maintenanceSchema>;

export interface MaintenanceRecord extends MaintenanceInput {
  id: number;
  vehicle_id: number;
  created_at: string;
}
