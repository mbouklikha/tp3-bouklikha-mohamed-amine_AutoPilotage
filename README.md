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
