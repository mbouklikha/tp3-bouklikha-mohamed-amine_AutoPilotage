---
description: Vérifier le projet (typecheck, lint, tests, build)
---

Exécute successivement ces quatre vérifications dans le projet AutoPilotage,
dans cet ordre, et résume clairement le résultat de chacune :

1. `npm run check`
2. `npm run lint`
3. `npm test`
4. `npm run build`

Règles : ne jamais annoncer qu'une vérification a réussi si elle n'a pas
été réellement exécutée ou si elle a échoué. Si un problème est lié aux
changements en cours, corrige-le puis relance les vérifications concernées.
Si un problème est préexistant et hors sujet, signale-le sans le modifier.
