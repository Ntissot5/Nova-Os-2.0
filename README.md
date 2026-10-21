# Nova OS

Le système d'exploitation de l'entreprise. Il remplace Windows sur le poste : un bureau complet dont le dock **est** la boîte (Entreprise · apps · agents), des agents IA qu'on regarde travailler en direct, et une autonomie que le dirigeant choisit lui-même.

Une entreprise = un fichier `company.nix` + un dossier `data/`. Zéro lock-in.

![Espace Entreprise](docs/captures/entreprise.png)

| Un agent au travail, en direct | Mode sombre | Mobile |
|---|---|---|
| ![Agent en direct](docs/captures/agent-en-direct.png) | ![Mode sombre](docs/captures/entreprise-sombre.png) | ![Mobile](docs/captures/mobile.png) |

## Les 4 couches

1. **Base** : NixOS immuable et déclaratif, disque chiffré, mises à jour atomiques.
2. **Bus d'API** : un serveur MCP par source (mail, calendrier, fichiers, compta, téléphonie…). *Phase 1.*
3. **Agents** : Claude, encadrés par des règles d'autonomie appliquées hors de l'agent.
4. **Nova Desktop** : le bureau GNOME habillé par Nova (dock de la boîte, barre du haut, verre) et Nova Home (espace Entreprise, pages d'agents).

## Démarrer

Prérequis : [Nix](https://nixos.org/download) (avec flakes) et Node.js 22.

```sh
npm install
scripts/dev            # Nova Home en démonstration → http://127.0.0.1:5173
```

| Opération | Commande |
|---|---|
| Tests unitaires (règles d'autonomie) | `npm test` |
| Interface de bout en bout + accessibilité | `npm run build && npm run test:ui` |
| Construire le système de l'entreprise de démo | `nix build .#nixosConfigurations.demo.config.system.build.toplevel` |
| Test de la VM complète (KVM nécessaire) | `nix build .#checks.x86_64-linux.vm-demo -L` |
| Image d'installation (clé USB, sans question) | `nix build .#installer-demo` |
| Vérifier une couleur d'accent | `node design/build.mjs check '#0A6CFF'` |
| Exporter toute l'entreprise | `sudo -u nova-gateway nova export` |
| Vérifier ou importer une archive | `nova verifier <archive> [--data <dossier>]` · `nova import <archive> --data <dossier>` |
| Rapport du pilote | `scripts/rapport-pilote <data> <mise en service> <postes>` |
| Mesurer les questions (clé d'API) | `scripts/bench-question` |

## Le dépôt

```
flake.nix                Point d'entrée : machines, paquets, image d'installation, tests
companies/demo/          Une entreprise : company.nix + data/
modules/                 Modules NixOS nova.* : base, disque, hub, poste (bureau)
packages/nova-daemon/    API locale du poste : moteur d'agents, autonomie, journal
packages/nova-home/      Interface : espace Entreprise, pages d'agents
packages/nova-shell/     Extension GNOME : la barre du haut Nova
packages/installer.nix   Image d'installation automatique
design/                  Tokens du système de design (source unique)
tests/                   Test VM de bout en bout, test de l'interface
```

## Documents

| Document | Contenu |
|---|---|
| [`MISSION.md`](MISSION.md) | Le brief d'origine |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Les 4 couches, l'autonomie, les agents visibles, le format `data/` |
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | Tokens, matière verre, composants, règles d'écriture |
| [`ROADMAP.md`](ROADMAP.md) | Les phases du MVP et leurs métriques |
| [`DECISIONS.md`](DECISIONS.md) | Les choix tranchés et les questions ouvertes |
| [`EXPORT-SPEC.md`](EXPORT-SPEC.md) | Le format d'export : toute l'entreprise, lisible sans Nova |

## Statut

Phase 0 — Fondations. Les agents de la démonstration jouent des scénarios réalistes sur le vrai moteur (autonomie, validations, délais d'annulation, journal) ; ils se brancheront sur les vrais connecteurs en Phase 1.
