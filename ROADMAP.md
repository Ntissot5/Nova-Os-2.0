# Roadmap — Nova OS (MVP, 10 semaines)

> Chaque phase se termine par une **démonstration réelle** (pas une maquette) et une **métrique chiffrée** mesurée par un script du dépôt, pas à l'œil.

| Phase | Durée | Démonstration | Métrique de succès |
|---|---|---|---|
| 0 — Fondations | 2 sem. | Une VM vierge devient un poste Nova avec l'écran d'accueil | VM neuve → poste prêt en **< 15 min**, **3 fois de suite** |
| 1 — Bus d'API | 3 sem. | Une question en français traverse mail, agenda et compta | **5/5** connecteurs avec test de contrat vert ; réponse **< 10 s** sur 3 sources |
| 2 — Agents & dashboard | 3 sem. | La gérance pilote valide ses relances depuis le dashboard | **Heures admin économisées/semaine** (avant/après, 30 jours) ; **coût API par poste et par mois** |
| 3 — Export & flotte | 2 sem. | La boîte entière déménage sur une machine vierge | Export → import, **0 perte**, **< 30 min** ; **3 postes** gérés depuis le dashboard |

---

## Phase 0 — Fondations (semaines 1–2)

**But :** prouver la promesse de base : un dossier → une machine identique, vite, à chaque fois.

| Semaine | Livrable |
|---|---|
| 1 | `flake.nix` + modules `nova.base`/`nova.poste`/`nova.hub` ; `companies/demo/company.nix` ; chiffrement disque (disko + LUKS) ; secrets sops ; cache binaire Attic |
| 1 | `design/tokens.json` + page de référence `#/design` (clair/sombre, AA vérifié automatiquement) |
| 2 | Image d'installation : démarre, installe `demo` sans question, redémarre sur le shell |
| 2 | Shell GNOME épuré + `nova-home` (écran d'accueil) + `nova-daemon` minimal |
| 2 | `scripts/bench-install` : crée une VM vierge, installe, chronomètre jusqu'à l'affichage de l'accueil, 3 fois |

**Démo :** `scripts/bench-install --runs 3` en direct ; affichage des 3 temps.
**Critère de sortie :** 3 temps < 15 min ; mêmes empreintes de système (`/run/current-system`) sur les 3 VM ; accueil conforme AA (axe-core 0 violation).

## Phase 1 — Bus d'API (semaines 3–5)

- `nova-gateway` : authentification OIDC, permissions par agent, journal JSONL, file d'approbation.
- 5 connecteurs MCP : `mcp-mail` (IMAP/SMTP + Graph), `mcp-calendar` (CalDAV + Graph), `mcp-files`, `mcp-compta` (CSV puis API du logiciel du pilote), `mcp-phone` (journal d'appels).
- Chaque connecteur : un **test de contrat** (schéma des outils, réponses contre un faux serveur enregistré) en CI.
- Recherche en langage naturel (`/`) dans Nova Home.

**Mesure :** `scripts/bench-question` — 20 questions types multi-sources, temps médian et p95. Cible : p95 < 10 s.

## Phase 2 — Agents & dashboard (semaines 6–8)

- Vertical **gérance** : agent **tri des demandes locataires** (qualification, urgence, routage) et agent **relances de loyers** (validation humaine obligatoire).
- Écran Dirigeant : ce qui s'est passé · en attente · ce que ça a coûté.
- Budgets par agent, suspension automatique à 100 %.
- Scénario de bout en bout rejouable par agent.

**Mesure :** 2 semaines de relevé du temps administratif **avant** déploiement chez le pilote, puis 30 jours **après** (même grille, saisie hebdomadaire de 2 minutes). Coût API lu dans le journal.
**Seuil de réussite proposé :** ≥ 4 h économisées par semaine pour un coût < 60 CHF par poste et par mois.

## Phase 3 — Export & flotte (semaines 9–10)

- `EXPORT-SPEC.md` v1 (format `data/`, versionné, rétrocompatible).
- `nova export` / `nova import`, vérification par empreintes (chaque fichier, chaque table).
- Écran Flotte : version de chaque poste, mise à jour, rollback, révocation d'accès.

**Mesure :** `scripts/bench-export` — exporter la boîte pilote anonymisée, importer sur une VM vierge, comparer les empreintes. Cible : 0 différence, < 30 min.

---

## Après le MVP (non engagé)

Onboarding d'un employé en 10 min par clé USB ou lien · verticaux fiduciaire, agence, cabinet · VM Windows encapsulée · mémoire d'entreprise enrichie par les agents.
