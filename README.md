# Nova OS

Système d'exploitation d'entreprise basé sur Linux (NixOS), nativement intelligent.
Une entreprise = un fichier `company.nix` + un dossier `data/`. Zéro lock-in.

## Les 4 couches

1. **Base** — NixOS immuable et déclaratif.
2. **Bus d'API** — un serveur MCP par source (mail, calendrier, fichiers, compta, téléphonie…).
3. **Runtime d'agents** — Claude Code et Claude Agent SDK, branchés sur le bus MCP.
4. **Nova Desktop** — remplace Windows : un bureau dont le dock est la boîte (apps, agents, vue d'ensemble).

## Documents

| Document | Contenu |
|---|---|
| [`MISSION.md`](MISSION.md) | Le brief d'origine |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Les 4 couches, les flux, le format `data/` |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | Tokens, composants, règles d'écriture |
| [`ROADMAP.md`](ROADMAP.md) | Les 4 phases du MVP et leurs métriques |
| [`DECISIONS.md`](DECISIONS.md) | Les choix tranchés et les questions ouvertes |

## Statut

Phase 0 — Fondations (cadrage en cours).
