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

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, (m as number) - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m as number) - 1 && dt.getUTCDate() === d;
}

const optionalDeadlineDate = z.string().trim().optional().or(z.literal(""));
const optionalDeadlineMileage = z.number().int().min(0, "Le kilométrage prévu doit être positif ou nul.").optional();

export const reminderSchema = z
  .object({
    vehicle_id: z.number().int().positive("Véhicule invalide."),
    title: z.string().trim().min(1, "Le titre est obligatoire.").max(100),
    due_date: optionalDeadlineDate,
    due_mileage: optionalDeadlineMileage,
    done: z.boolean().optional(),
  })
  .refine((v) => v.due_date !== undefined && v.due_date !== "" ? isValidCalendarDate(v.due_date) : true, {
    message: "Date d'échéance invalide (format AAAA-MM-JJ).",
    path: ["due_date"],
  })
  .refine((v) => (v.due_date ?? "") !== "" || v.due_mileage !== undefined, {
    message: "Indiquez au moins une échéance : date ou kilométrage.",
    path: ["due_date"],
  });

export type ReminderInput = z.infer<typeof reminderSchema>;

export type ReminderStatus = "a_venir" | "en_retard" | "termine";

export interface Reminder extends Omit<ReminderInput, "due_date" | "due_mileage" | "done"> {
  id: number;
  due_date: string | undefined;
  due_mileage: number | undefined;
  done: boolean;
  created_at: string;
}

export function todayString(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export function reminderStatus(r: { due_date?: string; due_mileage?: number; done: boolean }, vehicleMileage: number): ReminderStatus {
  if (r.done) return "termine";
  if (r.due_date !== undefined && r.due_date !== "" && r.due_date < todayString()) return "en_retard";
  if (r.due_mileage !== undefined && vehicleMileage >= r.due_mileage) return "en_retard";
  return "a_venir";
}
