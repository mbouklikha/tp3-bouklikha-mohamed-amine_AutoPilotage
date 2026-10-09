# AutoPilotage — règles de travail des agents

## Architecture actuelle

Application monolithique Node.js + TypeScript strict + Express.
`src/server.ts` démarre le serveur (port 3000), `src/app.ts` construit
l'application Express (fonction `createApp({ dbPath? })`, testable sans
serveur réseau). `src/db.ts` isole l'accès SQLite (`node:sqlite`,
fichier `data/autopilotage.db` créé automatiquement). `src/schemas.ts`
contient les schémas Zod, `src/routes/` les routeurs Express.
Frontend statique en HTML/CSS/JS dans `public/`, servi par Express.
Tests Vitest + supertest dans `tests/` (DB temporaires, jamais la vraie base).

## Règles obligatoires

1. **TypeScript strict** : `npm run check` (`tsc --noEmit`) doit passer.
   Ne pas utiliser `any`, respecter les types, gérer les cas `undefined`
   (ex. `prepare().get()` renvoie `undefined` si absent).
2. **Validation Zod** : toute donnée entrante (body, params) est validée
   avec les schémas de `src/schemas.ts`. Réponse `400` avec
   `{ error: { code: "VALIDATION_ERROR", message } }`, jamais de plantage.
3. **SQLite via `node:sqlite` uniquement** : requêtes paramétrées (`?`),
   jamais de concaténation SQL. Accès DB isolé dans `src/db.ts` et les
   routeurs. Ne pas ajouter d'ORM ni de dépendance native.
4. **Erreurs propres** : `404` `{ code: "NOT_FOUND" }` pour identifiant
   inconnu ou route inconnue, `400` pour identifiant invalide, handler
   centralisé en fin de `createApp`. Côté frontend, afficher les erreurs
   sans planter la page (états chargement / erreur / vide).
5. **Aucun secret** : pas de clé ni de token dans le code, la config ou
   les tests. La base `data/*.db*` est ignorée par Git.
6. **Tests conservés et étendus** : chaque fonctionnalité ajoute des tests
   Vitest isolés (DB en dossier temporaire, connexion fermée après usage).
   Vérifier avec `npm run check`, `npm run lint`, `npm test`, `npm run build`.
7. **Dépendances minimales** : ne pas ajouter de paquet sans raison réelle
   et sans l'annoncer (exception documentée : vitest 2 → 3, car Vite 5 ne
   reconnaissait pas le builtin `node:sqlite`).
8. **Ne pas inventer de harness** : n'ajouter à `.opencode/` ou
   `opencode.jsonc` que des champs dont la syntaxe est confirmée par la
   documentation officielle OpenCode V2.
