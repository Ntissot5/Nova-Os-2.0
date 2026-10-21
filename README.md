# Nova OS

Système d'exploitation d'entreprise basé sur Linux (NixOS), nativement intelligent.
Une entreprise = un fichier `company.nix` + un dossier `data/`. Zéro lock-in.

## Les 4 couches

1. **Base** — NixOS immuable et déclaratif.
2. **Bus d'API** — un serveur MCP par source (mail, calendrier, fichiers, compta, téléphonie…).
3. **Runtime d'agents** — Claude Code et Claude Agent SDK, branchés sur le bus MCP.
4. **Shell & Dashboard** — un seul écran pour le dirigeant : flux, validations, coûts.

Le brief complet est dans [`MISSION.md`](MISSION.md).

## Statut

Phase 0 — Fondations (cadrage en cours).
