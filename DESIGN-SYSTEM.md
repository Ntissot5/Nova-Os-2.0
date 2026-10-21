# Système de design — Nova OS

> Statut : v0.1. Source unique des valeurs : `design/tokens.json` (Phase 0). Ce document en est la lecture humaine.

## 1. Principes

1. **Soustraction.** Avant d'ajouter, enlever. Si un élément peut disparaître sans perte de sens, il disparaît.
2. **Un écran = une intention.** Un écran répond à une seule question.
3. **Hiérarchie par l'espace.** Pas de bordures, pas de séparateurs, pas d'icônes décoratives. L'espace et la graisse suffisent.
4. **Le texte est l'interface.** Des phrases complètes et humaines plutôt que des tableaux bruts.
5. **Zéro paramètre exposé.** Tout se décide dans `company.nix`. L'utilisateur final ne règle rien.
6. **Accessible d'abord.** Contraste AA minimum, clavier complet, lecteur d'écran, mouvement réduit respecté.
7. **Rien d'invisible.** Tout ce qu'un agent fait se voit, en direct, en phrases ; chaque action répond à « Pourquoi ? ».

## 2. Tokens

### 2.1 Espacement — grille de 8 px

| Token | Valeur | Usage |
|---|---|---|
| `space-0.5` | 4 px | Seule exception à la grille : icône ↔ texte |
| `space-1` | 8 px | Éléments liés |
| `space-2` | 16 px | Intérieur des composants |
| `space-3` | 24 px | Entre éléments d'un même bloc |
| `space-4` | 32 px | Marge de page (mobile) |
| `space-6` | 48 px | Entre blocs |
| `space-8` | 64 px | Marge de page (bureau), haut d'écran |

Largeur de lecture maximale : 720 px. Tout s'aligne à gauche.

### 2.2 Typographie — Inter

| Token | Taille / interligne | Graisse | Usage |
|---|---|---|---|
| `text-display` | 40 / 48 | 600 | Une fois par écran : le salut ou le titre |
| `text-title` | 22 / 32 | 600 | Titre de bloc |
| `text-body` | 17 / 24 | 400 | Phrases, contenu |
| `text-body-strong` | 17 / 24 | 600 | Le chiffre ou le nom dans une phrase |
| `text-caption` | 13 / 16 | 500 | Horodatage, source, coût unitaire |

Chiffres tabulaires (`font-variant-numeric: tabular-nums`) pour tout montant ou durée. Interdits : majuscules forcées, italique, plus de 3 tailles par écran.

### 2.3 Formes et profondeur

| Token | Valeur |
|---|---|
| `radius` | 12 px (unique ; `radius-full` réservé aux avatars) |
| `shadow-1` | `0 1px 2px rgb(0 0 0 / .06), 0 4px 12px rgb(0 0 0 / .06)` — surfaces posées |
| `shadow-2` | `0 8px 32px rgb(0 0 0 / .12)` — dialogues uniquement |

En mode sombre, les ombres sont remplacées par une surface légèrement plus claire.

### 2.4 Couleur

Neutres fixes, **une seule couleur d'accent par entreprise** (`nova.brand.accent` dans `company.nix`).

| Token | Clair | Sombre |
|---|---|---|
| `bg` | `#FFFFFF` | `#111113` |
| `surface` | `#F5F5F7` | `#1C1C1F` |
| `text` | `#1D1D1F` | `#F5F5F7` |
| `text-muted` | `#6E6E73` | `#A1A1A6` |
| `accent` | défini par l'entreprise | variante éclaircie calculée |
| `positive` | `#1A7F37` | `#3FB950` |
| `attention` | `#B35900` | `#F0883E` |
| `critical` | `#C62828` | `#FF6B6B` |

- **L'accent sert à une seule chose : l'action principale.** Jamais pour décorer.
- Les couleurs d'état sont toujours doublées d'un mot (« en retard », « validé »), jamais seules.
- **Garde-fou au build** : si l'accent choisi n'atteint pas un contraste de 4,5:1 sur `bg` (clair et sombre), la construction de la machine échoue avec un message clair et une proposition de teinte corrigée.

### 2.5 Mouvement

| Token | Valeur | Usage |
|---|---|---|
| `motion-fast` | 120 ms | Survol, focus, appui |
| `motion-base` | 200 ms (maximum absolu) | Apparition, disparition, changement d'état |
| `ease` | `cubic-bezier(.2, 0, 0, 1)` | Toutes les transitions |

Une animation explique un changement d'état, sinon elle n'existe pas. `prefers-reduced-motion` → 0 ms.

### 2.6 Focus et clavier

- Anneau de focus : 2 px `accent`, décalé de 2 px, toujours visible au clavier.
- Toute action a un raccourci : `Entrée` valide, `Échap` ferme, `J`/`K` naviguent dans une liste, `/` ouvre la recherche en langage naturel.
- Ordre de tabulation = ordre de lecture. Aucun piège à focus hors dialogue.

## 3. Composants

Treize composants pour le MVP : trois pour le bureau, dix pour les contenus. Un besoin non couvert se résout d'abord en composant ceux-là.

| Composant | Rôle | Variantes |
|---|---|---|
| **Barre du haut** | Nom de l'entreprise, champ `/`, compteur de validations, état du poste | — |
| **Dock** | La boîte : Entreprise · apps · agents, groupes séparés par l'espace ; surface translucide, `radius`, `shadow-1` | — |
| **Pastille d'agent** | État d'un agent sur son icône : point (actif), creux (en pause), chiffre (validations en attente) | positive, muted, accent |
| **Phrase** | Une information = une phrase humaine, avec un élément en `text-body-strong` | normale, état (positive/attention/critical) |
| **Bloc** | Groupe de phrases sous un `text-title` ; espacé par `space-6`, sans cadre | — |
| **Bouton** | Une action | `principal` (accent, une seule par écran), `secondaire` (surface), `discret` (texte) |
| **Validation** | Demande d'approbation : phrase + aperçu + `Valider` / `Refuser` | — |
| **Chiffre** | Montant ou durée mis en avant, avec sa phrase de contexte | — |
| **Champ** | Saisie, dont la recherche en langage naturel | — |
| **Fil en direct** | Les étapes d'un agent qui apparaissent une à une, en phrases, à côté du document en cours | en cours, terminé, rejoué |
| **Autonomie** | Le choix du niveau d'un agent en trois positions (*Je valide tout* · *l'important* · *Autonome*), avec la phrase qui explique ce qui change | — |
| **Annulation** | Compte à rebours d'un envoi : « Envoi dans 1:42 · Annuler » | — |
| **Dialogue** | Confirmation ou détail ; seul composant avec `shadow-2` | — |

Exclus volontairement : onglets, tableaux de données, graphiques décoratifs, badges de compteur, menus hamburger, toasts.

## 4. Écriture

- Phrases complètes, voix active, tutoiement ou vouvoiement fixé par `company.nix`.
- Le chiffre d'abord : « **3 locataires** en retard, relance prête. »
- Toujours dire ce qui va se passer : « Valider envoie 3 e-mails. »
- Pas de jargon technique visible : jamais « MCP » ni « token ». Les agents portent le nom de leur métier (« Compta », « Relances »).
- Montants en CHF, format suisse : `1'240.50 CHF`. Dates relatives quand elles ont moins de 7 jours (« hier, 16 h 05 »).

## 5. Exemple — espace Entreprise, vue dirigeant (cible Phase 2, gabarit dès Phase 0)

```
Bonjour Noa.                                                  ← text-display

Ce qui s'est passé                                            ← text-title
  12 demandes de locataires triées, 2 transmises au concierge.
  Les loyers d'octobre sont rapprochés : 3 retards.

En ce moment                                                  ← text-title
  Locataires lit le mail de Mme Rossi (fuite, 3e étage)…      ← Fil en direct
  [ Regarder ]

En attente de toi                                             ← text-title
  Relance prête pour 3 locataires (4'860 CHF au total).
  [ Valider ]  [ Voir ]                                       ← Validation

Ce que ça t'a fait gagner                                     ← text-title
  6 h de travail administratif cette semaine.
```

Quatre blocs, aucune bordure, une seule couleur d'accent (le bouton « Valider »).

## 6. Mise en œuvre

- `design/tokens.json` (format W3C Design Tokens) → génère au build Nix les variables CSS de `nova-home` et la feuille de style de `nova-shell` (barre, dock, pastilles).
- Une page `nova-home/#/design` affiche tous les tokens et composants en clair et en sombre : c'est la référence vivante et la base des tests visuels.
