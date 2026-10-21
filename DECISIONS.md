# Décisions — Nova OS

> Journal des choix tranchés. Une décision = un numéro, une phrase de justification, son caractère réversible ou non. On ne supprime jamais une ligne : on la remplace par une nouvelle décision qui la cite.

| # | Date | Décision | Pourquoi | Réversible ? |
|---|---|---|---|---|
| D-001 | 2026-10-21 | Repartir de zéro, sans réutiliser Nova Console ni les connecteurs existants. | Leur emplacement est inconnu ; on pourra les intégrer plus tard comme connecteurs MCP. | Oui |
| D-002 | 2026-10-21 | NixOS stable (`nixos-26.05`) avec flakes, épinglé par `flake.lock`. | La reproductibilité exige des versions figées. | Oui (montée de version planifiée) |
| D-003 | 2026-10-21 | Deux rôles, **Hub** et **Poste**, construits depuis le même code ; une seule VM « hub+poste » en Phase 0. | Les postes deviennent jetables et les données ont un seul emplacement. | Coûteux à défaire |
| D-004 | 2026-10-21 | TypeScript pour tout le code Nova (daemon, gateway, UI, connecteurs) ; Claude Agent SDK en TypeScript. | Un seul langage, ce qui facilite la maintenance par quelqu'un d'autre ; SDK officiel disponible. | Coûteux à défaire |
| D-005 | 2026-10-21 | Shell = GNOME Wayland épuré et verrouillé, plutôt qu'un compositeur maison. | Accessibilité (Orca, clavier) et stabilité acquises d'emblée ; la valeur est dans Nova Home, pas dans le gestionnaire de fenêtres. | Oui |
| D-006 | 2026-10-21 | Installation par image dédiée : `disko` + `nixos-install`, sans aucune question. | C'est la seule façon de tenir les 15 min reproductibles. | Oui |
| D-007 | 2026-10-21 | Cache binaire signé auto-hébergé (Attic) dès la semaine 1. | Sans cache, l'installation compile pendant des heures et rate la métrique. | Oui |
| D-008 | 2026-10-21 | Secrets chiffrés avec sops-nix + age, stockés dans `data/secrets/`. | Ils voyagent avec l'export, mais restent illisibles sans la clé de l'entreprise. | Oui |
| D-009 | 2026-10-21 | Journal en JSONL mensuel append-only dans `data/journal/` ; aucun outil d'observabilité externe. | Lisible par un humain, exportable, et c'est la source unique des coûts. | Oui |
| D-010 | 2026-10-21 | La validation des actions irréversibles est appliquée par `nova-gateway`, jamais par l'agent. | Un agent mal écrit ou trompé ne peut pas la contourner. | Non négociable |
| D-011 | 2026-10-21 | Interface `nova-home` en React + TypeScript, build statique, servie par `nova-daemon`. | Écosystème le plus large pour la relève ; l'outillage d'accessibilité est mûr. | Oui |
| D-012 | 2026-10-21 | Le skill `frontend-design` mentionné dans le brief n'est pas disponible dans cet environnement : `DESIGN-SYSTEM.md` + `design/tokens.json` en tiennent lieu. | Respecter l'intention du brief (système de design avant le premier écran). | Oui |

## Questions ouvertes (décisions irréversibles, à trancher par Noa)

| # | Question | Recommandation par défaut |
|---|---|---|
| Q-1 | Où vit le Hub du pilote : boîtier dans les locaux, ou serveur dans un cloud suisse ? | Cloud suisse (Infomaniak ou Exoscale) : pas de matériel à gérer chez le client, données en Suisse. |
| Q-2 | Licence de Nova OS : open source (cœur AGPL, verticaux propriétaires) ou entièrement propriétaire ? | Cœur open source : cohérent avec l'argument « zéro lock-in ». |
