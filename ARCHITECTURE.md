# Architecture — Nova OS

> Statut : v0.1 (Phase 0, cadrage). Les choix tranchés sont référencés `D-xxx` dans [`DECISIONS.md`](DECISIONS.md).

## 1. En une phrase

Nova OS est une distribution NixOS dont la configuration complète d'une entreprise tient dans **`company.nix` + `data/`** ; tout ce que l'entreprise utilise passe par un **bus MCP unique**, sur lequel travaillent des **agents Claude** encadrés, et qui remplace Windows sur le poste : **le bureau lui-même est la boîte** (son dock, ses apps, ses agents, sa vue d'ensemble).

## 2. Les deux rôles de machine

Une entreprise Nova a deux types de machines, construites depuis le même code (D-003) :

| Rôle | Ce qu'il fait | Combien |
|---|---|---|
| **Hub** | Héberge `data/`, l'identité (Authentik), le bus MCP, le runtime d'agents, le journal, la passerelle d'approbation. | 1 par entreprise |
| **Poste** | Le poste de travail d'un employé : shell épuré, apps, accès au Hub. Ne stocke rien d'irremplaçable. | 1 par employé |

En Phase 0, une seule VM joue les deux rôles (`role = "hub+poste"`).

Conséquence clé : **un poste est jetable**. Perdu, volé ou cassé, on le révoque et on en reconstruit un en moins de 15 minutes. Tout ce qui compte vit dans `data/` sur le Hub.

## 3. Les 4 couches

Règle : une couche ne parle qu'à la couche directement voisine, via une interface documentée. Aucune ne contourne le bus.

```
┌──────────────────────────────────────────────────────────────┐
│ 4. Nova Desktop        nova-shell · nova-home · nova-daemon   │
├──────────────────────────────────────────────────────────────┤
│ 3. Runtime d'agents    Claude Agent SDK · skills · budgets    │
├──────────────────────────────────────────────────────────────┤
│ 2. Bus d'API           nova-gateway → serveurs MCP (1/source) │
├──────────────────────────────────────────────────────────────┤
│ 1. Base                NixOS · company.nix · data/ · sops     │
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Couche 1 — Base (NixOS)

- **Une flake `nova`** (ce dépôt) expose des modules NixOS : `nova.base`, `nova.hub`, `nova.poste`, `nova.shell`, `nova.connectors`, `nova.agents`.
- **`company.nix`** est un module NixOS *déclaratif et sans code* : il ne fait que donner des valeurs aux options `nova.*` (nom, couleur d'accent, employés, connecteurs, agents, budgets). Tout ce qui n'y figure pas a une valeur par défaut décidée par Nova.
- **`data/`** contient toutes les données vivantes, en formats ouverts (voir §5).
- **Version épinglée** : `company.nix` déclare `nova.version` ; le `flake.lock` de l'entreprise fige nixpkgs et Nova. Même dossier → même machine, bit pour bit.
- **Mises à jour atomiques** : chaque mise à jour est une nouvelle génération NixOS ; rollback = génération précédente, depuis l'espace Entreprise ou le menu de démarrage.
- **Installation** : une image d'installation (ISO/clé USB) contient `disko` + le dossier de l'entreprise ; elle partitionne, chiffre (LUKS2), installe et redémarre sans question (D-006).
- **Cache binaire** obligatoire (Attic auto-hébergé) : sans lui, l'installation compile pendant des heures (D-007).
- **Secrets** : `sops-nix` + clés `age`. Les secrets sont chiffrés *dans* `data/secrets/`, donc exportés avec le reste, illisibles sans la clé de l'entreprise (D-008).

### 3.2 Couche 2 — Bus d'API (MCP)

- **Un serveur MCP par source** : `mcp-mail` (IMAP/SMTP, Graph), `mcp-calendar` (CalDAV, Graph), `mcp-files` (`data/files/`), `mcp-compta` (export CSV / API du logiciel client), `mcp-phone` (journal d'appels). Chacun est un service systemd isolé (utilisateur dédié, `ProtectSystem=strict`, accès réseau limité à sa source).
- **`nova-gateway`** est le seul point d'entrée du bus. Il :
  1. authentifie l'appelant (agent ou humain, jeton OIDC Authentik) ;
  2. applique les **permissions** déclarées dans `company.nix` (quel agent a accès à quels outils de quels connecteurs) ;
  3. **applique le niveau d'autonomie choisi par le dirigeant** (§3.5) : selon ce niveau, une action sensible (envoi, paiement, suppression, repérée par l'annotation MCP `destructiveHint` ou listée dans Nova) part avec un délai d'annulation, ou devient une **demande de validation** dans l'espace Entreprise ;
  4. **diffuse en direct** chaque étape de chaque agent vers les postes autorisés (§3.6) ;
  5. **journalise** chaque appel (§6).
- Ajouter un logiciel = ajouter un serveur MCP et une ligne dans `company.nix`. Jamais d'intégration sur mesure dans le shell ou dans un agent.
- Transport : MCP « Streamable HTTP » sur socket Unix locale au Hub, exposé aux postes via le gateway en HTTPS + OIDC.

### 3.3 Couche 3 — Runtime d'agents

- **Claude Agent SDK (TypeScript)** et **Claude Code** préinstallés sur le Hub (agents) et les postes (usage interactif) (D-004).
- Un agent est **déclaré**, jamais bricolé :

```nix
nova.agents.relances-loyers = {
  description = "Prépare les relances de loyers en retard";
  skills      = [ "gerance/relances" ];
  connectors  = { compta = [ "read" ]; mail = [ "draft" "send" ]; };
  schedule    = "Mon..Fri 08:00";
  autonomy    = "je-valide-tout"; # défaut ; le dirigeant peut le changer depuis l'espace Entreprise (§3.5)
};
```

- Chaque agent tourne dans son propre service systemd, avec son propre utilisateur, et ne voit le monde **que** via `nova-gateway`. Pas d'accès direct au disque ni au réseau.
- **Usage illimité pour le client, coût maîtrisé pour Nova** (D-016) : le client paie un forfait par poste, sans compteur. Le gateway compte les jetons de chaque appel et choisit le modèle adapté à chaque tâche (petit modèle pour trier, grand modèle pour rédiger ou raisonner), avec cache de prompts. Le coût réel par poste est suivi par l'opérateur Nova ; un usage anormal déclenche une alerte, jamais un blocage silencieux.
- **Skills métier** : dossiers Markdown versionnés (`verticals/<métier>/skills/`). Un vertical = des skills + une liste de connecteurs.
- **Mémoire d'entreprise** : `data/memory/` (Markdown : vocabulaire, contacts, règles). Lecture par tous les agents autorisés ; écriture uniquement via un outil MCP `memory.propose`, validée par un humain.
- **Scénarios rejouables** : chaque agent a un scénario de bout en bout (entrées enregistrées → sorties attendues) exécuté en CI contre des connecteurs simulés.

### 3.4 Couche 4 — Nova Desktop (le poste de travail)

**Nova OS remplace Windows sur le poste.** L'employé allume sa machine et se retrouve sur un bureau complet, aussi fluide qu'un Mac : fenêtres, apps, fichiers, navigateur, impression. La différence : **le bureau est la boîte**.

```
┌────────────────────────────────────────────────────────────────────┐
│ Régie Dupont SA        Rechercher ou demander… (/)    2 à valider  │ ← barre du haut
│                                                                    │
│                     (fenêtres des apps ouvertes)                   │
│                                                                    │
│   ╭──────────────────────────────────────────────────────────╮     │
│   │ ◉ Entreprise   Mail Agenda Fichiers Compta Gérance   ·   │     │ ← dock
│   │                Compta● Locataires● Relances②             │     │
│   ╰──────────────────────────────────────────────────────────╯     │
└────────────────────────────────────────────────────────────────────┘
```

- **Le dock = la boîte.** Il n'est pas réglé par l'utilisateur : il est généré depuis `company.nix`. Trois groupes, séparés par l'espace :
  1. **Entreprise** : toujours en premier, ouvre la vue d'ensemble.
  2. **Les apps de la boîte** : mail, agenda, fichiers, logiciel de compta, logiciel métier. Natives Linux, web (en fenêtre d'app) ou Windows encapsulées : pour l'employé, elles se comportent toutes de la même façon.
  3. **Les agents** : un par métier (Compta, Locataires, Relances…), avec une pastille d'état : actif, en pause, ou nombre d'actions en attente de validation.
- **L'espace Entreprise** (plein écran, comme Mission Control sur Mac) : **toute la boîte en une vision**.
  - *Ce qui s'est passé* · *ce qui se passe en ce moment* · *ce qui attend une validation* · *ce que ça a fait gagner*.
  - **Agents** : pour chacun, ce qu'il fait en ce moment, ses dernières actions, son niveau d'autonomie, et les commandes `Mettre en pause` / `Reprendre`.
  - **Flotte** (dirigeant, Phase 3) : postes, versions, mise à jour, rollback, révocation.
- **Chaque agent a sa page** (clic dans le dock) : on le **regarde travailler en direct** (§3.6), ses validations en attente, les règles qu'il suit (tirées de `data/memory/`), son niveau d'autonomie.
- **Barre du haut** : nom de l'entreprise, recherche et questions en langage naturel (`/`), compteur de validations, état du poste. Rien d'autre.
- **Ce que chacun voit dépend de son rôle** (dans `company.nix`) : un employé voit ses apps et ses agents ; le dirigeant voit tout et contrôle tout.
- **Tout est contrôlable, rien n'est réglable** : on peut mettre un agent en pause, valider, refuser, révoquer, revenir en arrière ; on ne règle aucun paramètre technique.

**Comment c'est construit (D-013)**
- **Moteur** : GNOME Shell / Mutter (Wayland), invisible pour l'utilisateur. On garde ce qu'il fait de mieux (fenêtres, multi-écrans, accessibilité Orca, clavier, impression, compatibilité des apps) et on remplace tout ce qui se voit.
- **`nova-shell`** : extension GNOME Shell qui remplace la barre du haut et le dock, et dessine l'espace Entreprise. Elle lit le dock et les rôles depuis la configuration générée par `company.nix`.
- **`nova-home`** : l'interface de l'espace Entreprise et des pages d'agents (React + TypeScript, build statique), affichée par le shell en plein écran, sans chrome de navigateur.
- **`nova-daemon`** : l'API locale du poste, seule source de données du shell et de `nova-home`. Parle au Hub via le gateway. Aucune logique métier dans l'interface.
- **Logiciels Windows-only** : encapsulés, jamais émulés globalement. Version web si elle existe, sinon une VM Windows isolée (libvirt) dont la seule fenêtre apparaît dans le dock comme une app normale.
- **Bureautique** : la suite de la boîte (Microsoft 365 web, OnlyOffice ou LibreOffice) est fixée dans `company.nix`.

### 3.5 Autonomie choisie par le dirigeant (D-014)

C'est le dirigeant qui décide, agent par agent et type d'action par type d'action, ce qui part seul et ce qui attend sa validation. Trois niveaux, réglés d'un clic dans l'espace Entreprise :

| Niveau | Ce qui se passe | Pour qui |
|---|---|---|
| **Je valide tout** (défaut) | Chaque action sensible attend une validation. | Les premiers jours, ou les actions à fort enjeu |
| **Je valide l'important** | Les actions sous les seuils (montant, nombre de destinataires, destinataire connu) partent seules ; les autres attendent. | Le régime normal |
| **Autonome** | Tout part seul ; un résumé arrive chaque soir. | Les tâches routinières, une fois la confiance acquise |

**Garde-fous toujours actifs, quel que soit le niveau :**
- **Délai d'annulation** : tout envoi part après 2 minutes, annulable d'un clic (« Envoi dans 1:42 · Annuler »).
- **Rien n'est vraiment effacé** : une suppression va dans une corbeille de 30 jours.
- **Plafond de paiement** : au-dessus du montant fixé par le dirigeant, un paiement est toujours validé par un humain.
- **Tout est journalisé et rejouable** (§3.6, §6).

**La confiance se gagne** : Nova propose de monter d'un niveau quand c'est mérité (« Relances : 40 validations d'affilée sans correction. Passer en *Je valide l'important* ? »). Le dirigeant peut redescendre à tout moment.

### 3.6 Voir les agents travailler (D-015)

Principe : **on ne fait pas confiance à ce qu'on ne voit pas.** Tout ce qu'un agent fait est visible, en direct, en langage humain.

- **Dans le dock** : l'icône d'un agent qui travaille s'anime doucement ; les apps qu'il utilise s'allument à côté de lui (« Relances utilise Compta et Mail »).
- **Sur la page de l'agent, en direct** : ses étapes apparaissent une à une, en phrases (« Je lis le mail de Mme Rossi… Elle signale une fuite au 3e étage. C'est urgent. Je cherche le concierge de l'immeuble… J'ai préparé un message pour lui. »). À côté, **le document qu'il lit ou le brouillon qu'il écrit**, qui se remplit sous les yeux de l'utilisateur.
- **Logiciels encapsulés** : quand un agent manipule un logiciel Windows dans sa VM, on voit son écran en direct, comme si on regardait par-dessus son épaule.
- **« Pourquoi ? » sur chaque action** : un clic montre la règle suivie, les informations utilisées et les sources.
- **Rejouer** : n'importe quelle tâche passée se rejoue étape par étape, comme une vidéo.
- **Reprendre la main** : à tout moment, `Arrêter` ou `Je m'en occupe` interrompt l'agent et laisse le travail en l'état.

Mise en œuvre : chaque étape d'agent est un événement émis par le gateway (même format que le journal, §6) et diffusé aux postes autorisés ; l'interface ne fait qu'afficher ce flux. Rien de ce qui est affiché n'existe ailleurs que dans le journal.

## 4. Les flux principaux

**a. Question en langage naturel (Phase 1)**
Employé → barre du haut (`/`) → nova-daemon → Claude (agent « assistant ») → nova-gateway → `mcp-mail` + `mcp-calendar` + `mcp-compta` → réponse en une phrase, sources citées. Cible : < 10 s.

**b. Action irréversible (Phase 2)**
Agent → `mail.send` (destructif) → nova-gateway **met en attente** → pastille ② sur l'agent Relances dans le dock + carte « Relance prête pour M. Dupont (2 loyers) » dans l'espace Entreprise → le dirigeant valide (clavier : `Entrée`) → le gateway exécute → journal.

**c. Mise à jour d'entreprise**
Modifier `company.nix` (ou un clic dans l'espace Entreprise qui le modifie) → build sur le Hub → publication dans le cache → chaque poste bascule atomiquement à la nouvelle génération → rollback possible.

**d. Export / import (Phase 3)**
`nova export` → archive de `company.nix` + `flake.lock` + `data/` (secrets restent chiffrés) → `nova import` sur une machine vierge → même entreprise, zéro perte.

## 5. Format de données (`data/`)

```
data/
  files/        Fichiers de l'entreprise, arborescence libre
  db/           SQLite par service (Postgres si > 1 Go ou concurrence élevée)
  memory/       Markdown : vocabulaire.md, contacts/, regles.md
  journal/      JSONL mensuel : 2026-10.jsonl (append-only)
  approvals/    JSONL : demandes de validation et décisions
  secrets/      YAML chiffré sops (age)
  meta.json     Version du format, date, identifiant d'entreprise
```

Règles : uniquement fichiers, Markdown, CSV, JSON/JSONL, SQLite/Postgres (dump SQL à l'export). Le format est spécifié et versionné dans `EXPORT-SPEC.md` (Phase 3), rétrocompatible : un import accepte toutes les versions antérieures.

## 6. Observabilité

Une ligne JSONL par action, lisible par un humain :

```json
{"ts":"2026-10-21T08:02:11Z","qui":"agent:relances-loyers","quoi":"mail.send","pourquoi":"Loyer d'octobre impayé (J+10), règle regles.md#relances","statut":"en_attente_validation","tokens":{"in":3120,"out":412},"coutCHF":0.021,"resultat":null}
```

L'espace Entreprise lit ces fichiers ; aucune donnée d'observabilité n'existe ailleurs. Les coûts (par agent, par poste, par mois) sont des agrégats de ce journal.

## 7. Sécurité par défaut

| Mesure | Mécanisme |
|---|---|
| Disque chiffré | LUKS2 via disko, déverrouillage TPM2 sur poste + phrase de secours |
| Secrets | sops-nix + age ; jamais en clair dans le store Nix |
| Mises à jour signées | Cache binaire signé ; les postes refusent toute clé inconnue |
| Identité | Authentik (OIDC/LDAP) sur le Hub ; révocation = un clic |
| Moindre privilège | Un utilisateur système et une liste d'outils MCP par agent |
| Actions sensibles | Niveau d'autonomie choisi par le dirigeant, garde-fous permanents (délai d'annulation, corbeille, plafond de paiement), appliqués par le gateway, jamais par l'agent |

## 8. Organisation du dépôt (cible)

```
flake.nix                  Point d'entrée : modules, paquets, images
modules/                   Modules NixOS nova.* (base, hub, poste, shell, agents, connectors)
packages/
  nova-daemon/             API locale (TypeScript)
  nova-gateway/            Passerelle MCP : permissions, approbations, journal
  nova-shell/              Extension GNOME Shell : barre du haut, dock, espace Entreprise
  nova-home/               Espace Entreprise et pages d'agents (React + TypeScript)
  connectors/mcp-*/        Un serveur MCP par source + son test de contrat
design/tokens.json         Source unique du système de design
verticals/gerance/         Skills + connecteurs du premier vertical
companies/demo/            company.nix + data/ de démonstration
scripts/                   Un script par opération (install, bench, export)
```
