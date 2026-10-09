# AutoPilotage

Application web de suivi automobile (TP final — outils d'IA pour développeurs).

## Lancement

```powershell
npm install
npm run dev
```

Ouvrir `http://localhost:3000`.

## Vérification

```powershell
npm run check
npm run lint
npm test
npm run build
```

## État actuel (étape 3)

Gestion des véhicules : CRUD complet (`/api/vehicles`), persistance SQLite
(`data/autopilotage.db`, créée automatiquement, ignorée par Git), validation
zod (400 claire), requêtes SQL paramétrées. Interface : navigation Tableau de
bord / Véhicules / Statistiques, formulaire ajout/modification, état vide,
confirmations de suppression, erreurs affichées sans plantage.

Entretiens et réparations : historique par véhicule
(`GET/POST /api/vehicles/:vehicleId/maintenance`,
`PUT/DELETE .../maintenance/:recordId`), triés du plus récent au plus ancien,
avec total des coûts. Types : entretien, réparation, contrôle technique,
autre. Validation : coût positif ou nul, date réelle non future, kilométrage
positif ou nul, véhicule existant requis. Section « Entretiens » dans
l'interface (sélecteur de véhicule, historique, total, formulaire).

Rappels d'entretien (`/api/reminders`) : titre + échéance date et/ou
kilométrage (au moins une requise), statuts À venir / En retard / Terminé
calculés côté serveur (retard si date dépassée ou kilométrage du véhicule
atteint), filtres par statut, terminer/rouvrir, modifier, supprimer.
Section « Rappels » dans l'interface avec badges de statut.

Statistiques (`GET /api/stats`, filtre optionnel `?vehicle_id=`) : total des
dépenses, nombre d'interventions, coût moyen, dépenses par véhicule et par
type, kilométrage total. Section « Statistiques » avec cartes et graphiques
en barres CSS, état vide propre, tableau de bord affichant les dépenses
réelles.

Fiche véhicule (interface, URL `#fiche/:id/:onglet`) : identité complète,
totaux, derniers entretiens, prochaines échéances, onglets Vue d'ensemble /
Entretiens / Rappels avec ajout direct (véhicule préselectionné), boutons
Modifier et « Télécharger l'historique PDF ». Historique PDF
(`GET /api/vehicles/:id/report.pdf`, génération locale pdfkit, nom
`historique-<Marque>-<Modele>-<id>.pdf`, 404 si inconnu).

## Serveur MCP local (harness OpenCode)

`src/mcp/server.ts` expose 3 outils **lecture seule** sur la base existante
(`list_vehicles`, `get_maintenance_summary`, `list_reminders`), via le SDK
officiel `@modelcontextprotocol/sdk` v1. Connexion SQLite en lecture seule
(`readOnly`), requêtes SELECT paramétrées, chemin de base fixe
(`data/autopilotage.db`, non configurable par les outils), aucun secret.
Déclaré dans `opencode.jsonc` (`mcp.servers.autopilotage`, syntaxe OpenCode V2). Lancement manuel : `npm run build` puis `npm run mcp`.

Vérifier la connexion dans OpenCode : `opencode mcp list` (serveur
`autopilotage` connecté), puis `/mcps`. Les outils apparaissent comme
`autopilotage_list_vehicles`, etc.

## Catalogue automobile local

`public/catalog.json` assiste la saisie (marque → modèle → années →
motorisation, avec repli « Autre… » en saisie libre). Données indicatives
sans valeur officielle, structurées pour être enrichies (marques, modèles,
plages `[min, max]`, motorisations). Testé par `tests/catalog.test.ts`.
Les visuels des véhicules sont des emplacements neutres génériques, jamais
présentés comme des photos des modèles.
