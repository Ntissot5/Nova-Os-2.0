# Décisions — Nova OS

> Journal des choix tranchés. Une décision = un numéro, une phrase de justification, son caractère réversible ou non. On ne supprime jamais une ligne : on la remplace par une nouvelle décision qui la cite.

| # | Date | Décision | Pourquoi | Réversible ? |
|---|---|---|---|---|
| D-001 | 2026-10-21 | Repartir de zéro, sans réutiliser Nova Console ni les connecteurs existants. | Leur emplacement est inconnu ; on pourra les intégrer plus tard comme connecteurs MCP. | Oui |
| D-002 | 2026-10-21 | NixOS stable (`nixos-26.05`) avec flakes, épinglé par `flake.lock`. | La reproductibilité exige des versions figées. | Oui (montée de version planifiée) |
| D-003 | 2026-10-21 | Deux rôles, **Hub** et **Poste**, construits depuis le même code ; une seule VM « hub+poste » en Phase 0. | Les postes deviennent jetables et les données ont un seul emplacement. | Coûteux à défaire |
| D-004 | 2026-10-21 | TypeScript pour tout le code Nova (daemon, gateway, UI, connecteurs) ; Claude Agent SDK en TypeScript. | Un seul langage, ce qui facilite la maintenance par quelqu'un d'autre ; SDK officiel disponible. | Coûteux à défaire |
| D-005 | 2026-10-21 | ~~Shell = GNOME épuré + Nova Home en fenêtre.~~ Remplacée par D-013. | — | — |
| D-006 | 2026-10-21 | Installation par image dédiée : `disko` + `nixos-install`, sans aucune question. | C'est la seule façon de tenir les 15 min reproductibles. | Oui |
| D-007 | 2026-10-21 | Cache binaire signé auto-hébergé (Attic) dès la semaine 1. | Sans cache, l'installation compile pendant des heures et rate la métrique. | Oui |
| D-008 | 2026-10-21 | Secrets chiffrés avec sops-nix + age, stockés dans `data/secrets/`. | Ils voyagent avec l'export, mais restent illisibles sans la clé de l'entreprise. | Oui |
| D-009 | 2026-10-21 | Journal en JSONL mensuel append-only dans `data/journal/` ; aucun outil d'observabilité externe. | Lisible par un humain, exportable, et c'est la source unique des coûts. | Oui |
| D-010 | 2026-10-21 | Les règles de validation sont appliquées par `nova-gateway`, jamais par l'agent. Le *niveau* de validation est défini par D-014. | Un agent mal écrit ou trompé ne peut pas les contourner. | Non négociable |
| D-011 | 2026-10-21 | Interface `nova-home` en React + TypeScript, build statique, servie par `nova-daemon`. | Écosystème le plus large pour la relève ; l'outillage d'accessibilité est mûr. | Oui |
| D-012 | 2026-10-21 | Le skill `frontend-design` mentionné dans le brief n'est pas disponible dans cet environnement : `DESIGN-SYSTEM.md` + `design/tokens.json` en tiennent lieu. | Respecter l'intention du brief (système de design avant le premier écran). | Oui |
| D-013 | 2026-10-21 | Nova OS remplace Windows : un bureau complet dont le dock **est** la boîte (Entreprise · apps · agents), généré depuis `company.nix`. Moteur GNOME Shell/Mutter invisible, interface visible 100 % Nova (`nova-shell`). | Un vrai bureau sans réécrire fenêtres, multi-écrans, accessibilité et impression ; tout l'effort va dans ce que l'utilisateur voit. | Coûteux à défaire |
| D-014 | 2026-10-21 | Le dirigeant choisit le niveau d'autonomie de chaque agent (*Je valide tout* par défaut, *Je valide l'important*, *Autonome*). Garde-fous permanents : délai d'annulation de 2 min sur tout envoi, corbeille 30 jours, plafond de paiement toujours validé. Remplace la validation systématique du brief. | Une IA sûre ne veut pas dire une IA bridée : le client garde le contrôle, et les erreurs restent rattrapables. | Coûteux à défaire |
| D-015 | 2026-10-21 | Tout ce que fait un agent est visible en direct (étapes en phrases, documents en cours, écran des logiciels encapsulés), explicable (« Pourquoi ? ») et rejouable. | Le client ne délègue que ce qu'il comprend ; c'est le cœur de l'argument « IA sûre ». | Oui |
| D-016 | 2026-10-21 | Usage illimité pour le client (forfait par poste, sans compteur). Le coût est maîtrisé par Nova : choix du modèle selon la tâche, cache, suivi interne par poste. L'espace Entreprise affiche les heures gagnées plutôt que les coûts. | « Illimité » se vend mieux qu'un compteur ; la marge se gère côté Nova. | Oui |
| D-017 | 2026-10-21 | Coût IA minimal par conception : `nova-gateway` choisit le modèle par tâche (Claude Haiku 5.5 pour trier et extraire, Claude Sonnet 5.5 pour rédiger, Claude Opus 5.5 pour les cas complexes) ; règles déterministes avant toute IA ; cache de prompts sur skills, règles et mémoire ; traitement différé (−50 %) pour le non-urgent ; connecteurs qui ne renvoient que l'utile ; réutilisation des réponses validées. | C'est ce qui rend l'usage illimité (D-016) rentable : cible 5 à 15 $ par poste et par mois. | Oui |
| D-018 | 2026-10-21 | Direction visuelle « verre » (références de Noa) : tuiles de verre dépoli sur un fond doux et coloré, grands arrondis (24 et 32 px), boutons en pilule, rail d'icônes flottant. Remplace le rayon unique de 12 px du brief. Le même fond et le même flou s'appliquent au bureau GNOME (Blur my Shell). | C'est le langage visuel attendu d'un OS moderne ; l'opacité minimale du verre garde le contraste AA, vérifié à chaque test. | Oui |

## Questions ouvertes (décisions irréversibles, à trancher par Noa)

| # | Question | Recommandation par défaut |
|---|---|---|
| Q-1 | Où vit le Hub du pilote : boîtier dans les locaux, ou serveur dans un cloud suisse ? | Cloud suisse (Infomaniak ou Exoscale) : pas de matériel à gérer chez le client, données en Suisse. |
| Q-2 | Licence de Nova OS : open source (cœur AGPL, verticaux propriétaires) ou entièrement propriétaire ? | Cœur open source : cohérent avec l'argument « zéro lock-in ». |
