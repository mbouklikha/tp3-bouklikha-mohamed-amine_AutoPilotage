---
name: AutoPilotage Dev
description: Développer une fonctionnalité AutoPilotage selon les règles du projet
---

# Développer dans AutoPilotage

## 1. Comprendre avant de modifier

Lis `AGENTS.md`, puis les fichiers concernés : `src/app.ts` (Express),
`src/db.ts` (SQLite), `src/schemas.ts` (Zod), `src/routes/` (routeurs),
`public/` (interface), `tests/` (Vitest + supertest).

## 2. Règles de code

- TypeScript strict : pas de `any`, gérer les `undefined`
  (`prepare().get()` renvoie `undefined` si absent).
- Valider toute entrée avec Zod (`src/schemas.ts`) : `400`
  `{ error: { code: "VALIDATION_ERROR", message } }` si invalide.
- SQLite via `node:sqlite` uniquement, requêtes paramétrées (`?`),
  jamais de concaténation SQL. Pas d'ORM.
- Erreurs : `404` `{ code: "NOT_FOUND" }` pour identifiant inconnu,
  `400` pour identifiant invalide, handler centralisé existant.
- Aucun secret dans le code. Base `data/*.db*` ignorée par Git.
- Aucune dépendance ajoutée sans raison réelle annoncée.

## 3. Tests

- Ajouter ou modifier les tests Vitest dans `tests/`.
- DB temporaires (`os.tmpdir()`), connexion fermée après usage
  (`app.locals["db"]`), **ne jamais toucher `data/autopilotage.db`**.
- Couvrir : création/lecture, modification/suppression, champs
  invalides (400), identifiants inexistants (404).

## 4. Vérifications obligatoires

Exécuter dans l'ordre : `npm run check`, `npm run lint`, `npm test`,
`npm run build`. Ne jamais annoncer un succès non exécuté.
