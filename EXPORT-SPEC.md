# Format d'export Nova — version 1

> Toute l'entreprise tient dans un dossier. Ce document dit exactement ce que contient ce dossier, pour que n'importe qui puisse le relire **sans Nova**. C'est l'argument « zéro lock-in » écrit noir sur blanc.
>
> Statut : stable. Règles d'évolution au §6.

## 1. L'archive

Une seule archive `tar` compressée en `gzip`, lisible sur n'importe quel système :

```
nova-export-<entreprise>-<AAAAMMJJ-HHMM>.tar.gz
└── nova-export/
    ├── LISEZMOI.txt          Ce qu'est cette archive, en clair, et comment la vérifier
    ├── MANIFEST.json         Version du format, entreprise, liste des fichiers avec taille et empreinte
    ├── SHA256SUMS            Les mêmes empreintes, vérifiables sans Nova : sha256sum -c SHA256SUMS
    ├── entreprise/
    │   ├── company.nix       La configuration complète de l'entreprise
    │   └── flake.lock        Les versions exactes de Nova et de NixOS utilisées
    └── data/                 Toutes les données de l'entreprise (§3)
```

L'archive est **reproductible** : mêmes données, même archive (fichiers triés par nom, propriétaire et dates fixés).

## 2. `MANIFEST.json`

```json
{
  "format": "nova-export",
  "version": 1,
  "cree": "2026-10-21T19:30:00.000Z",
  "entreprise": { "nom": "Régie Démo SA" },
  "nova": { "version": "0.1" },
  "fichiers": [
    { "chemin": "data/compta/loyers.csv", "taille": 1032, "sha256": "…" }
  ],
  "empreinte": "…"
}
```

- `fichiers` : chaque fichier de l'archive hors `MANIFEST.json`, `SHA256SUMS` et `LISEZMOI.txt`, trié par chemin.
- `empreinte` : SHA-256 du contenu de `SHA256SUMS`. Une seule valeur résume toute l'entreprise : deux exports identiques ont la même empreinte.

## 3. `data/`

Uniquement des formats ouverts, chacun lisible avec un outil courant.

| Dossier | Contenu | Format |
|---|---|---|
| `files/` | Documents de l'entreprise | Fichiers tels quels |
| `mail/` | Boîte de démonstration ou copie locale | Maildir (`cur/`, `new/`, `.Envoyes/`, `.Brouillons/`), un fichier `.eml` (RFC 5322) par message |
| `agenda/` | Rendez-vous | iCalendar (`.ics`, RFC 5545) |
| `compta/` | Exports du logiciel comptable, ordres de paiement | CSV `;`, UTF-8, en-tête en première ligne (colonnes : voir `packages/nova-server/src/connectors/compta.ts`) |
| `telephonie/` | Journal d'appels | CSV `date;sens;numero;contact;duree;note` |
| `memory/` | Mémoire de l'entreprise : règles, vocabulaire, contacts | Markdown |
| `journal/` | Chaque action d'humain ou d'agent | JSON Lines, un fichier par mois (`AAAA-MM.jsonl`) ; champs : `ts`, `qui`, `quoi`, `pourquoi`, `resultat`, et selon l'action `decision`, `tokens`, `coutUSD`, `modele`, `ms`, `tache` |
| `agents/` | État des déclencheurs (mails déjà traités, dernière tournée) | JSON |
| `mesures/` | Relevés hebdomadaires des heures | CSV `semaine;heures;saisiPar;date` |
| `connecteurs/` | Services branchés depuis l'écran Connecteurs (sans leurs jetons) | JSON `ajoutes.json` : `id`, `nom`, `url`, `agents`, `acces`, `toujoursValider`, `ajouteLe`, `ajoutePar` |
| `secrets/` | Mots de passe et clés des services | YAML chiffré par [sops](https://github.com/getsops/sops) avec [age](https://age-encryption.org) |
| `.corbeille/` | Fichiers supprimés (30 jours) | Fichiers tels quels, rangés par date |

**Exclus de l'archive** : le marqueur interne `.initialise`, et tout ce qui n'est pas dans `data/` (le système se reconstruit à partir de `company.nix` et de `flake.lock`).

## 4. Ce qui n'est **pas** dans l'archive, volontairement

- **La clé `age` de l'entreprise** : sans elle, `data/secrets/` reste illisible. Elle se garde à part (papier, coffre, clé USB). Une archive volée ne livre donc aucun mot de passe.
- **Les clés de secours des disques** : elles sont propres à chaque machine, pas à l'entreprise.
- **Les jetons des connecteurs ajoutés** depuis l'écran Connecteurs : ils vivent dans `/var/lib/nova/secrets/` sur le Hub. La liste des connecteurs, elle, voyage (`data/connecteurs/ajoutes.json` : nom, adresse, agents, réglages). Après un import, chaque connecteur ajouté s'affiche « ne répond pas » jusqu'à ce que le dirigeant redonne son jeton dans *Régler*.

## 5. Vérifier et réimporter

```sh
# Sans Nova
tar -xzf nova-export-*.tar.gz && cd nova-export && sha256sum -c SHA256SUMS

# Avec Nova
nova verifier nova-export-….tar.gz                 # l'archive est-elle intacte ?
nova import nova-export-….tar.gz --data /var/lib/nova/data
nova verifier nova-export-….tar.gz --data /var/lib/nova/data   # les données en place = l'archive ?
```

`nova import` refuse une archive dont une seule empreinte ne correspond pas, ou qui contient un fichier absent du manifeste. Il refuse aussi d'écrire dans un `data/` non vide, sauf avec `--remplacer` : l'ancien dossier est alors gardé à côté, sous `data.avant-import-<date>`.

## 6. Évolution du format

- `version` est un entier. Un lecteur de version *n* lit **toutes** les versions de 1 à *n*.
- Dans une même version, on peut seulement **ajouter** : un champ facultatif dans `MANIFEST.json`, un dossier dans `data/`. Un lecteur ignore ce qu'il ne connaît pas.
- Changer la forme d'un fichier existant (colonnes, champs, structure) demande une nouvelle version **et** un convertisseur dans `nova import` depuis toutes les versions précédentes.
- Ce document est mis à jour dans le même changement que le code qui modifie le format.
