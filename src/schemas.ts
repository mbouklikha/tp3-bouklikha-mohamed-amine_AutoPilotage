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
