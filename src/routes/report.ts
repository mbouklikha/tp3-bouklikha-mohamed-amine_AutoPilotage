import { Router } from "express";
import PDFDocument from "pdfkit";
import type { Db } from "../db.js";
import { parseId, reminderStatus, todayString } from "../schemas.js";

const TYPE_LABELS: Record<string, string> = {
  entretien: "Entretien",
  reparation: "Réparation",
  controle: "Contrôle technique",
  autre: "Autre",
};

function sanitizePart(value: string): string {
  const clean = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean === "" ? "vehicule" : clean;
}

function euros(n: number): string {
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function orMissing(value: string | null | undefined): string {
  return value === null || value === undefined || value === "" ? "Non renseigné" : value;
}

/** GET /api/vehicles/:vehicleId/report.pdf — historique PDF, données réelles uniquement. */
export function reportRouter(db: Db): Router {
  const r = Router({ mergeParams: true });

  r.get("/", (req, res) => {
    const params = req.params as Record<string, string>;
    const vehicleId = parseId(params["vehicleId"]);
    if (vehicleId === null) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Identifiant de véhicule invalide." } });
      return;
    }
    const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId) as
      | Record<string, unknown>
      | undefined;
    if (!vehicle) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Véhicule introuvable." } });
      return;
    }
    const records = db
      .prepare("SELECT * FROM maintenance WHERE vehicle_id = ? ORDER BY date DESC, id DESC")
      .all(vehicleId) as Record<string, unknown>[];
    const reminders = db
      .prepare("SELECT * FROM reminders WHERE vehicle_id = ? ORDER BY id DESC")
      .all(vehicleId) as Record<string, unknown>[];
    const total = records.reduce((s, x) => s + (x["cost"] as number), 0);
    const vehicleMileage = vehicle["mileage"] as number;

    const doc = new PDFDocument({ size: "A4", margin: 50, compress: false, info: { Title: "Historique d'entretien du véhicule" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (e: Error) => reject(e));
    });

    const needSpace = (height: number): void => {
      if (doc.y + height > doc.page.height - 70) doc.addPage();
    };
    const section = (title: string): void => {
      needSpace(60);
      doc.moveDown(0.5).font("Helvetica-Bold").fontSize(14).fillColor("#111111").text(title);
      doc.moveDown(0.3);
    };

    // En-tête
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#111111").text("Historique d'entretien du véhicule");
    doc.font("Helvetica").fontSize(10).fillColor("#555555").text(`Document généré le ${todayString()} par AutoPilotage`);
    doc.moveDown(0.5);

    // Identification
    section("Véhicule");
    doc.font("Helvetica").fontSize(11).fillColor("#111111");
    const brand = vehicle["brand"] as string;
    const model = vehicle["model"] as string;
    doc.text(`${brand} ${model}`);
    doc.text(`Année : ${String(vehicle["year"])}`);
    doc.text(`Motorisation : ${orMissing(vehicle["fuel"] as string | null)}`);
    doc.text(`Immatriculation : ${orMissing(vehicle["plate"] as string | null)}`);
    doc.text(`Kilométrage actuel enregistré : ${(vehicleMileage as number).toLocaleString("fr-FR")} km`);

    // Résumé
    section("Résumé");
    doc.font("Helvetica").fontSize(11).text(`Nombre d'interventions : ${records.length}`);
    doc.text(`Coût total de l'entretien et des réparations : ${euros(total)}`);

    // Historique
    section("Historique des entretiens et réparations (du plus récent au plus ancien)");
    doc.font("Helvetica").fontSize(11);
    if (records.length === 0) {
      doc.text("Aucune intervention enregistrée pour ce véhicule.");
    }
    for (const x of records) {
      needSpace(70);
      const type = TYPE_LABELS[x["type"] as string] ?? (x["type"] as string);
      doc.font("Helvetica-Bold").text(`${x["date"] as string} — ${type} — ${x["title"] as string}`);
      doc.font("Helvetica").text(
        `Kilométrage : ${(x["mileage"] as number).toLocaleString("fr-FR")} km — Coût : ${euros(x["cost"] as number)}`,
      );
      doc.text(`Description : ${orMissing(x["description"] as string | null)}`);
      doc.moveDown(0.4);
    }

    // Rappels
    section("Rappels associés");
    doc.font("Helvetica").fontSize(11);
    if (reminders.length === 0) {
      doc.text("Aucun rappel enregistré pour ce véhicule.");
    } else {
      const groups: { key: string; label: string }[] = [
        { key: "en_retard", label: "En retard" },
        { key: "a_venir", label: "À venir" },
        { key: "termine", label: "Terminés" },
      ];
      for (const g of groups) {
        const items = reminders.filter((x) => {
          const done = (x["done"] as number) === 1;
          const dueDate = (x["due_date"] as string | null) ?? undefined;
          const dueMileage = (x["due_mileage"] as number | null) ?? undefined;
          return reminderStatus({ due_date: dueDate, due_mileage: dueMileage, done }, vehicleMileage) === g.key;
        });
        if (items.length === 0) continue;
        needSpace(50);
        doc.font("Helvetica-Bold").text(`${g.label} (${items.length})`);
        doc.font("Helvetica");
        for (const x of items) {
          needSpace(40);
          const dueDate = (x["due_date"] as string | null) ?? "sans date";
          const dueMileage = x["due_mileage"] as number | null;
          const km = dueMileage === null ? "" : ` — ${dueMileage.toLocaleString("fr-FR")} km`;
          doc.text(`• ${x["title"] as string} — échéance : ${dueDate}${km}`);
        }
      }
    }

    doc.end();
    void done.then(
      (pdf) => {
        const filename = `historique-${sanitizePart(brand)}-${sanitizePart(model)}-${vehicleId}.pdf`;
        res
          .status(200)
          .set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` })
          .send(pdf);
      },
      () => {
        if (!res.headersSent) {
          res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Génération du PDF impossible." } });
        }
      },
    );
  });

  return r;
}
