# Roadmap — Nova OS (MVP, 12 semaines)

> Chaque phase se termine par une **démonstration réelle** (pas une maquette) et une **métrique chiffrée** mesurée par un script du dépôt, pas à l'œil.

| Phase | Durée | Démonstration | Métrique de succès |
|---|---|---|---|
| 0 — Fondations | 2 sem. | Une VM vierge démarre sur le bureau Nova : barre du haut, dock de la boîte, espace Entreprise | VM neuve → poste prêt en **< 15 min**, **3 fois de suite** |
| 1 — Bus d'API | 3 sem. | Une question en français traverse mail, agenda et compta | **5/5** connecteurs avec test de contrat vert ; réponse **< 10 s** sur 3 sources |
| 2 — Agents visibles & autonomie | 4 sem. | Le dirigeant pilote regarde ses agents travailler en direct, valide ou les laisse faire seuls | **Heures admin économisées/semaine** (avant/après, 30 jours) ; **coût API par poste et par mois** |
| 3 — Export & flotte | 2 sem. | La boîte entière déménage sur une machine vierge | Export → import, **0 perte**, **< 30 min** ; **3 postes** gérés depuis l'espace Entreprise |

---

## Phase 0 — Fondations (semaines 1–2)

**But :** prouver la promesse de base : un dossier → une machine identique, vite, à chaque fois.

| Semaine | Livrable |
|---|---|
| 1 | `flake.nix` + modules `nova.base`/`nova.poste`/`nova.hub` ; `companies/demo/company.nix` ; chiffrement disque (disko + LUKS) ; secrets sops ; cache binaire Attic |
| 1 | `design/tokens.json` + page de référence `#/design` (clair/sombre, AA vérifié automatiquement) |
| 2 | Image d'installation : démarre, installe `demo` sans question, redémarre sur le shell |
| 2 | Bureau Nova : `nova-shell` (barre du haut + dock généré depuis `company.nix`), espace Entreprise et une page d'agent dans `nova-home` (données de démo), `nova-daemon` minimal |
| 2 | `scripts/bench-install` : crée une VM vierge, installe, chronomètre jusqu'à l'affichage du bureau, 3 fois |

**Démo :** `scripts/bench-install --runs 3` en direct ; affichage des 3 temps.
**Critère de sortie :** 3 temps < 15 min ; mêmes empreintes de système (`/run/current-system`) sur les 3 VM ; bureau et espace Entreprise conformes AA, entièrement utilisables au clavier (axe-core 0 violation).

## Phase 1 — Bus d'API (semaines 3–5)

- `nova-gateway` : authentification OIDC, permissions par agent, journal JSONL, file d'approbation.
- 5 connecteurs MCP : `mcp-mail` (IMAP/SMTP + Graph), `mcp-calendar` (CalDAV + Graph), `mcp-files`, `mcp-compta` (CSV puis API du logiciel du pilote), `mcp-phone` (journal d'appels).
- Chaque connecteur : un **test de contrat** (schéma des outils, réponses contre un faux serveur enregistré) en CI.
- Recherche et questions en langage naturel (`/`) depuis la barre du haut.

**Mesure :** `scripts/bench-question` — 20 questions types multi-sources, temps médian et p95. Cible : p95 < 10 s.

**État (21 octobre 2026) :**
- ✓ `nova-gateway` : connecteurs, droits par agent, journal, autonomie appliquée sur l'aperçu des connecteurs, actions des agents exécutées sur le bus.
- ✓ 5 connecteurs, 16 tests de contrat (vrai serveur et vrai client MCP).
- ✓ Fournisseurs réels IMAP/SMTP et CalDAV : 3/3 contre Dovecot, Mailpit et Radicale dans une VM (`checks.connecteurs-reels`, CI). Le test a trouvé un vrai défaut, corrigé : l'adresse d'expédition SMTP doit être distincte de l'identifiant IMAP.
- ✓ Questions en langage naturel (`/`, rail, barre du haut), étapes visibles, sources citées ; boucle testée avec un faux modèle.
- ⏳ Mesure p95 : en attente d'une clé d'API Anthropic sur le Hub.
- ⏳ Authentification OIDC : reportée au premier poste distant (D-020).
- ⏳ Microsoft Graph (mail et agenda) et API du logiciel comptable : avec le logiciel du pilote.

## Phase 2 — Agents visibles & autonomie (semaines 6–9)

- Vertical **gérance** : agent **tri des demandes locataires** (qualification, urgence, routage) et agent **relances de loyers** (validation humaine obligatoire).
- **Voir les agents travailler** : fil en direct, document en cours, apps qui s'allument dans le dock, « Pourquoi ? », rejouer une tâche, reprendre la main.
- **Autonomie au choix** : trois niveaux par agent, délai d'annulation de 2 min, corbeille, plafond de paiement, proposition de monter d'un niveau quand la confiance est acquise.
- Espace Entreprise branché sur les vraies données : ce qui s'est passé · en ce moment · en attente · ce que ça a fait gagner ; pause/reprise d'un agent.
- Suivi interne du coût par poste, choix automatique du modèle selon la tâche.
- Scénario de bout en bout rejouable par agent.

**Mesure :** 2 semaines de relevé du temps administratif **avant** déploiement chez le pilote, puis 30 jours **après** (même grille, saisie hebdomadaire de 2 minutes). Coût API lu dans le journal. `scripts/rapport-pilote <data> <mise en service> <postes>`.

**État (21 octobre 2026) :**
- ✓ Agents réels : skills de gérance (tri des demandes, relances, comptabilité), tri par Haiku, travail par Sonnet, déclencheurs (nouveau mail, tournée quotidienne, « Lancer maintenant »).
- ✓ Actions proposées par l'agent, décidées par le moteur sur l'aperçu du connecteur ; plafond de paiement indépendant du nom de l'outil (D-024).
- ✓ Le document s'écrit sous les yeux, reprise en main, rejouer, « Pourquoi ? » rempli par l'agent (règle et sources).
- ✓ Scénarios rejouables avec un faux modèle : fuite d'eau de bout en bout, plafond en autonome, reprise en main.
- ✓ Relevé hebdomadaire, page des coûts (dirigeant), rapport du pilote.
- ⏳ Premier travail réel des agents : en attente d'une clé d'API Anthropic.
- ⏳ Mesure avant/après : en attente du pilote.
**Seuil de réussite proposé :** ≥ 4 h économisées par semaine pour un coût < 60 CHF par poste et par mois.

## Phase 3 — Export & flotte (semaines 10–11)

- `EXPORT-SPEC.md` v1 (format `data/`, versionné, rétrocompatible).
- `nova export` / `nova import`, vérification par empreintes (chaque fichier, chaque table).
- Flotte, dans l'espace Entreprise : version de chaque poste, mise à jour, rollback, révocation d'accès.

**Mesure :** `scripts/bench-export` — exporter la boîte pilote anonymisée, importer sur une VM vierge, comparer les empreintes. Cible : 0 différence, < 30 min.

**État (21 octobre 2026) :**
- ✓ `EXPORT-SPEC.md` v1 ; `nova export`, `nova verifier`, `nova import` ; archive reproductible au bit près, vérifiable sans Nova (`sha256sum -c`).
- ✓ Sauvegarde : un export complet chaque nuit, les 7 derniers gardés.
- ✓ Test VM `portabilite` : export sur une machine, import sur une machine neuve, 0 différence, durée chronométrée (cible < 30 min).
- ✓ Flotte du Hub : version du système, retour à la version précédente, révocation et rétablissement d'accès (persistants), dans l'espace Entreprise.
- ✓ Correctif : les employés ne lisent plus `data/` directement (D-026).
- ⏳ Postes distants : identité des machines et des personnes à trancher (Q-3), puis « 3 postes gérés depuis l'espace Entreprise ».

## Semaine 12 — Marge

Imprévus et mise en route chez le pilote.

---

## Après le MVP (non engagé)

Onboarding d'un employé en 10 min par clé USB ou lien · verticaux fiduciaire, agence, cabinet · VM Windows encapsulée · mémoire d'entreprise enrichie par les agents.
